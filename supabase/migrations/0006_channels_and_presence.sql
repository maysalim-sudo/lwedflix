-- ============================================================
-- Channels (subreddit-style) + live "watching now" presence.
--
-- Run after 0005. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Channels
-- ============================================================

create table if not exists public.channels (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9_]{2,24}$'),
  name text not null check (char_length(btrim(name)) between 1 and 40),
  description text check (description is null or char_length(description) <= 300),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create index if not exists channels_created_idx on public.channels (created_at desc);

alter table public.channels enable row level security;

-- Channels are a public square, not a friends-only space: any signed-in
-- user can browse and join. `to authenticated` still keeps them out of
-- reach of the anon key, which ships in the browser bundle.
drop policy if exists "channels_select" on public.channels;
create policy "channels_select" on public.channels for select to authenticated using (true);

drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert to authenticated with check (created_by = auth.uid());

drop policy if exists "channels_update_own" on public.channels;
create policy "channels_update_own" on public.channels
  for update to authenticated using (created_by = auth.uid()) with check (created_by = auth.uid());

drop policy if exists "channels_delete_own" on public.channels;
create policy "channels_delete_own" on public.channels
  for delete to authenticated using (created_by = auth.uid());

create table if not exists public.channel_members (
  channel_id uuid not null references public.channels(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);

create index if not exists channel_members_user_idx on public.channel_members (user_id);

alter table public.channel_members enable row level security;

drop policy if exists "channel_members_select" on public.channel_members;
create policy "channel_members_select" on public.channel_members
  for select to authenticated using (true);

drop policy if exists "channel_members_join" on public.channel_members;
create policy "channel_members_join" on public.channel_members
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "channel_members_leave" on public.channel_members;
create policy "channel_members_leave" on public.channel_members
  for delete to authenticated using (user_id = auth.uid());


-- ============================================================
-- 2. Posts belong to a channel, optionally
--
-- Note what is NOT here: no new RLS policy on posts. A channel post is
-- forced to visibility='public' by the constraint below, so the existing
-- posts_select policy already makes it visible to every signed-in user.
-- Adding a channel term to that policy would have been a second way to
-- express the same rule, and two rules that must agree eventually don't.
-- ============================================================

alter table public.posts
  add column if not exists channel_id uuid references public.channels(id) on delete cascade;

create index if not exists posts_channel_created_idx
  on public.posts (channel_id, created_at desc, id desc) where channel_id is not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'channel_posts_are_public') then
    alter table public.posts add constraint channel_posts_are_public
      check (channel_id is null or visibility = 'public') not valid;
  end if;
end;
$$;


-- ============================================================
-- 3. get_posts gains a channel filter
--
-- Dropped and recreated rather than `create or replace`: the signature
-- changes, and leaving both versions would make PostgREST's overload
-- resolution ambiguous.
-- ============================================================

drop function if exists public.get_posts(uuid, timestamptz, uuid, int);

create or replace function public.get_posts(
  target_user uuid default null,
  before_created timestamptz default null,
  before_id uuid default null,
  page_size int default 20,
  target_channel uuid default null
)
returns table (
  id uuid, user_id uuid, body text, image_url text, visibility text,
  media_type text, media_id text, media_title text, poster_path text,
  season int, episode int, created_at timestamptz, channel_id uuid,
  channel_slug text, channel_name text,
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
          when target_channel is not null then p.channel_id = target_channel
          when target_user is not null then p.user_id = target_user
          -- The home feed deliberately excludes channel posts: they have
          -- their own surface, and letting a busy channel flood the
          -- friends feed is exactly what people dislike about mixed feeds.
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
         v.season, v.episode, v.created_at, v.channel_id,
         ch.slug, ch.name,
         pr.username, pr.display_name, pr.avatar_url,
         coalesce(c.n, 0),
         coalesce(r.counts, '{}'::jsonb),
         mine.reaction
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

grant execute on function public.get_posts(uuid, timestamptz, uuid, int, uuid) to authenticated;

-- Channel list with membership and post counts, so the browse page is
-- one round trip instead of N+1.
create or replace function public.get_channels()
returns table (
  id uuid, slug text, name text, description text,
  created_by uuid, created_at timestamptz,
  member_count bigint, post_count bigint, is_member boolean
)
language sql stable security invoker set search_path = public
as $$
  select c.id, c.slug, c.name, c.description, c.created_by, c.created_at,
         coalesce(m.n, 0), coalesce(p.n, 0),
         exists (
           select 1 from public.channel_members me
           where me.channel_id = c.id and me.user_id = auth.uid()
         )
  from public.channels c
  left join lateral (
    select count(*) as n from public.channel_members x where x.channel_id = c.id
  ) m on true
  left join lateral (
    select count(*) as n from public.posts x where x.channel_id = c.id
  ) p on true
  order by coalesce(m.n, 0) desc, c.created_at desc;
$$;

grant execute on function public.get_channels() to authenticated;


-- ============================================================
-- 4. Presence: publish now_watching
--
-- The table was created in 0002 but nothing ever wrote to it and it was
-- never published, so the feature has been dead code until now.
-- ============================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'now_watching'
  ) then
    alter publication supabase_realtime add table public.now_watching;
  end if;
end;
$$;

-- Friends' current activity, with profiles joined. Stale rows are left
-- to the caller to filter: there is no cron here to expire them, and a
-- client-side cutoff is honest about that rather than pretending a row
-- means "definitely still watching".
create or replace function public.get_friends_watching()
returns table (
  user_id uuid, media_type text, media_id text, title text,
  poster_path text, season int, episode int, updated_at timestamptz,
  username text, display_name text, avatar_url text
)
language sql stable security invoker set search_path = public
as $$
  select w.user_id, w.media_type, w.media_id, w.title,
         w.poster_path, w.season, w.episode, w.updated_at,
         pr.username, pr.display_name, pr.avatar_url
  from public.now_watching w
  join public.profiles_public pr on pr.id = w.user_id
  where w.user_id <> auth.uid()
    and w.user_id in (select public.friend_ids())
  order by w.updated_at desc;
$$;

grant execute on function public.get_friends_watching() to authenticated;
