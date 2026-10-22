-- ============================================================
-- Permalinks, watchlist voting, weekly digest, taste match,
-- episode-scoped discussion, channel trending.
--
-- Run after 0012. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. get_posts: fetch one post, and scope by episode
--
-- Permalinks need a single-post lookup, and TV discussion needs to
-- narrow a show's posts to one episode. Both are filters on columns the
-- table already has, so this extends the existing function rather than
-- adding parallel ones.
-- ============================================================

drop function if exists public.get_posts(uuid, timestamptz, uuid, int, uuid, text, text);
drop function if exists public.get_posts(uuid, timestamptz, uuid, int, uuid);
drop function if exists public.get_posts(uuid, timestamptz, uuid, int);

create or replace function public.get_posts(
  target_user uuid default null,
  before_created timestamptz default null,
  before_id uuid default null,
  page_size int default 20,
  target_channel uuid default null,
  target_media_type text default null,
  target_media_id text default null,
  target_post uuid default null,
  target_season int default null,
  target_episode int default null
)
returns table (
  id uuid, user_id uuid, body text, image_url text, visibility text,
  media_type text, media_id text, media_title text, poster_path text,
  season int, episode int, created_at timestamptz, edited_at timestamptz,
  channel_id uuid, channel_slug text, channel_name text,
  username text, display_name text, avatar_url text,
  comment_count bigint, reaction_counts jsonb, my_reaction text
)
language sql stable security invoker set search_path = public
as $$
  with visible as (
    select p.*
    from public.posts p
    where (
        case
          when target_post is not null then p.id = target_post
          when target_media_id is not null then
            p.media_type = target_media_type
            and p.media_id = target_media_id
            -- Null season means "the whole show", so episode filtering is
            -- opt-in rather than silently hiding show-level posts.
            and (target_season is null or p.season = target_season)
            and (target_episode is null or p.episode = target_episode)
          when target_channel is not null then p.channel_id = target_channel
          when target_user is not null then p.user_id = target_user
          else (p.channel_id is null
                and (p.user_id = auth.uid() or p.user_id in (select public.friend_ids())))
        end
      )
      and (
        before_created is null
        or (p.created_at, p.id) < (before_created, coalesce(before_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by p.created_at desc, p.id desc
    limit least(coalesce(page_size, 20), 50)
  )
  select v.id, v.user_id, v.body, v.image_url, v.visibility,
         v.media_type, v.media_id, v.media_title, v.poster_path,
         v.season, v.episode, v.created_at, v.edited_at,
         v.channel_id, ch.slug, ch.name,
         pr.username, pr.display_name, pr.avatar_url,
         coalesce(c.n, 0), coalesce(r.counts, '{}'::jsonb), mine.reaction
  from visible v
  join public.profiles_public pr on pr.id = v.user_id
  left join public.channels ch on ch.id = v.channel_id
  left join lateral (
    select count(*) as n from public.post_comments pc where pc.post_id = v.id
  ) c on true
  left join lateral (
    select jsonb_object_agg(s.reaction, s.n) as counts
    from (
      select reaction, count(*) as n
      from public.post_reactions x where x.post_id = v.id group by reaction
    ) s
  ) r on true
  left join lateral (
    select m.reaction from public.post_reactions m
    where m.post_id = v.id and m.user_id = auth.uid()
  ) mine on true
  order by v.created_at desc, v.id desc;
$$;

grant execute on function public.get_posts(uuid, timestamptz, uuid, int, uuid, text, text, uuid, int, int) to authenticated;


-- ============================================================
-- 2. Shared-watchlist voting
--
-- "What should we watch next" — one vote per person per item.
-- ============================================================

create table if not exists public.shared_watchlist_votes (
  item_id uuid not null references public.shared_watchlist_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (item_id, user_id)
);

alter table public.shared_watchlist_votes enable row level security;

-- Visibility follows the list itself: you can see votes on an item only
-- if you're one of the two people sharing it.
create or replace function public.can_see_shared_item(target_item uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.shared_watchlist_items s
    where s.id = target_item and (s.user_low = auth.uid() or s.user_high = auth.uid())
  );
$$;

grant execute on function public.can_see_shared_item(uuid) to authenticated;

drop policy if exists "swv_select" on public.shared_watchlist_votes;
create policy "swv_select" on public.shared_watchlist_votes
  for select to authenticated using (public.can_see_shared_item(item_id));

drop policy if exists "swv_insert" on public.shared_watchlist_votes;
create policy "swv_insert" on public.shared_watchlist_votes
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_shared_item(item_id));

drop policy if exists "swv_delete" on public.shared_watchlist_votes;
create policy "swv_delete" on public.shared_watchlist_votes
  for delete to authenticated using (user_id = auth.uid());

-- Shared list, now ordered by votes so the top pick surfaces itself.
drop function if exists public.get_shared_watchlist(uuid);
create or replace function public.get_shared_watchlist(friend_id uuid)
returns table (
  id uuid, media_type text, media_id text, title text, poster_path text,
  status text, added_at timestamptz, watched_at timestamptz,
  added_by uuid, added_by_username text, added_by_display_name text,
  vote_count bigint, i_voted boolean
)
language sql stable security invoker set search_path = public
as $$
  select s.id, s.media_type, s.media_id, s.title, s.poster_path,
         s.status, s.added_at, s.watched_at,
         s.added_by, pr.username, pr.display_name,
         coalesce(v.n, 0),
         exists (
           select 1 from public.shared_watchlist_votes mv
           where mv.item_id = s.id and mv.user_id = auth.uid()
         )
  from public.shared_watchlist_items s
  join public.profiles_public pr on pr.id = s.added_by
  left join lateral (
    select count(*) as n from public.shared_watchlist_votes x where x.item_id = s.id
  ) v on true
  where s.user_low = least(auth.uid(), friend_id)
    and s.user_high = greatest(auth.uid(), friend_id)
  order by s.status asc, coalesce(v.n, 0) desc, s.added_at desc;
$$;

grant execute on function public.get_shared_watchlist(uuid) to authenticated;


-- ============================================================
-- 3. Weekly digest
-- ============================================================

create or replace function public.get_weekly_digest()
returns table (
  friend_count bigint, posts_this_week bigint, titles_watched bigint,
  reactions_received bigint, comments_received bigint, top_title text
)
language sql stable security definer set search_path = public
as $$
  with fids as (select public.friend_ids() as id),
  window_start as (select now() - interval '7 days' as t)
  select
    (select count(*) from fids),
    (select count(*) from public.posts p, window_start w
      where p.created_at >= w.t and p.user_id in (select id from fids)),
    -- watch_history holds one row per (user, title), so this counts
    -- distinct titles touched rather than sessions.
    (select count(*) from public.watch_history h, window_start w
      where h.watched_at >= w.t and h.user_id in (select id from fids)),
    (select count(*) from public.post_reactions r
      join public.posts p on p.id = r.post_id, window_start w
      where p.user_id = auth.uid() and r.created_at >= w.t and r.user_id <> auth.uid()),
    (select count(*) from public.post_comments c
      join public.posts p on p.id = c.post_id, window_start w
      where p.user_id = auth.uid() and c.created_at >= w.t and c.user_id <> auth.uid()),
    (select h.title from public.watch_history h, window_start w
      where h.watched_at >= w.t and h.user_id in (select id from fids)
      group by h.title order by count(*) desc, max(h.watched_at) desc limit 1);
$$;

grant execute on function public.get_weekly_digest() to authenticated;


-- ============================================================
-- 4. Taste match
--
-- NOTE: this is watch-history OVERLAP, not rating agreement. The app has
-- no per-title rating anywhere, so "you agree on 78%" would be inventing
-- a number. Overlap is something the data actually supports.
--
-- SECURITY DEFINER because watch_history is self-only: this returns
-- aggregates and shared titles, never the friend's full history.
-- ============================================================

create or replace function public.get_taste_match(friend_id uuid)
returns table (
  shared_count bigint, my_total bigint, their_total bigint,
  overlap_pct int, sample_titles text[]
)
language sql security definer stable set search_path = public
as $$
  with mine as (
    select movie_id, title from public.watch_history where user_id = auth.uid()
  ),
  theirs as (
    select movie_id, title from public.watch_history where user_id = friend_id
  ),
  shared as (
    select m.movie_id, m.title from mine m join theirs t using (movie_id)
  )
  select
    (select count(*) from shared),
    (select count(*) from mine),
    (select count(*) from theirs),
    case
      -- Jaccard: shared / union. Guards the empty case rather than
      -- dividing by zero for someone who has watched nothing.
      when (select count(*) from mine) + (select count(*) from theirs) - (select count(*) from shared) = 0 then 0
      else round(
        100.0 * (select count(*) from shared)
        / ((select count(*) from mine) + (select count(*) from theirs) - (select count(*) from shared))
      )::int
    end,
    (select coalesce(array_agg(title order by title), '{}') from (select title from shared limit 5) s)
  where public.is_friend_with(friend_id);
$$;

grant execute on function public.get_taste_match(uuid) to authenticated;


-- ============================================================
-- 5. Channel discovery: trending by recent activity
-- ============================================================

drop function if exists public.get_channels();
create or replace function public.get_channels()
returns table (
  id uuid, slug text, name text, description text,
  created_by uuid, created_at timestamptz,
  member_count bigint, post_count bigint, is_member boolean,
  recent_post_count bigint, last_activity timestamptz
)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.slug, c.name, c.description, c.created_by, c.created_at,
         coalesce(m.n, 0), coalesce(p.n, 0),
         exists (
           select 1 from public.channel_members me
           where me.channel_id = c.id and me.user_id = auth.uid()
         ),
         coalesce(rp.n, 0), rp.last_at
  from public.channels c
  left join lateral (
    select count(*) as n from public.channel_members x where x.channel_id = c.id
  ) m on true
  left join lateral (
    select count(*) as n from public.posts x where x.channel_id = c.id
  ) p on true
  left join lateral (
    select count(*) as n, max(x.created_at) as last_at
    from public.posts x
    where x.channel_id = c.id and x.created_at >= now() - interval '7 days'
  ) rp on true
  -- Trending first (activity in the last week), then size, then age.
  order by coalesce(rp.n, 0) desc, coalesce(m.n, 0) desc, c.created_at desc;
$$;

grant execute on function public.get_channels() to authenticated;
