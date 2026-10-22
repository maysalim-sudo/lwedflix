-- ============================================================
-- 0015: Reposts / sharing
--
-- A repost is an ordinary post with `repost_of` set, so it inherits
-- the feed, RLS, reactions, comments, moderation and editing that
-- posts already have. A plain repost carries an empty body; a quote
-- repost carries your own commentary.
-- ============================================================

alter table public.posts
  add column if not exists repost_of uuid references public.posts(id) on delete cascade;

create index if not exists posts_repost_of_idx
  on public.posts (repost_of) where repost_of is not null;

-- A plain repost has no body, no image and no media of its own, so the
-- original emptiness check would reject it.
alter table public.posts drop constraint if exists post_not_empty;
alter table public.posts add constraint post_not_empty check (
  char_length(btrim(body)) > 0
  or image_url is not null
  or media_id is not null
  or repost_of is not null
);

-- One *plain* repost per person per post, so the button can toggle.
-- Quote reposts are excluded from the index — you may quote the same
-- post more than once with different commentary.
create unique index if not exists posts_plain_repost_unique
  on public.posts (user_id, repost_of)
  where repost_of is not null and char_length(btrim(body)) = 0;

-- Reposting your own repost would build a chain nothing renders. The
-- client collapses to the original; this stops the rest.
alter table public.posts drop constraint if exists repost_not_self;
alter table public.posts add constraint repost_not_self check (repost_of is null or repost_of <> id);


-- ============================================================
-- get_posts: embed the original, and count reposts
-- ============================================================

drop function if exists public.get_posts(uuid, timestamptz, uuid, int, uuid, text, text, uuid, int, int);
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
  comment_count bigint, reaction_counts jsonb, my_reaction text,
  repost_of uuid, repost_source jsonb, repost_count bigint, i_reposted boolean
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
         coalesce(c.n, 0), coalesce(r.counts, '{}'::jsonb), mine.reaction,
         v.repost_of, rs.src, coalesce(rc.n, 0), coalesce(ir.yes, false)
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
  -- SECURITY INVOKER means posts RLS still applies inside this lateral:
  -- someone who can't see the original gets a null here rather than a
  -- privacy leak through the repost. The client renders "unavailable".
  left join lateral (
    select jsonb_build_object(
      'id', o.id, 'user_id', o.user_id, 'body', o.body, 'image_url', o.image_url,
      'media_type', o.media_type, 'media_id', o.media_id,
      'media_title', o.media_title, 'poster_path', o.poster_path,
      'season', o.season, 'episode', o.episode, 'created_at', o.created_at,
      'username', op.username, 'display_name', op.display_name,
      'avatar_url', op.avatar_url
    ) as src
    from public.posts o
    join public.profiles_public op on op.id = o.user_id
    where o.id = v.repost_of
  ) rs on true
  left join lateral (
    select count(*) as n from public.posts rp where rp.repost_of = v.id
  ) rc on true
  left join lateral (
    select true as yes from public.posts mr
    where mr.repost_of = v.id
      and mr.user_id = auth.uid()
      and char_length(btrim(mr.body)) = 0
    limit 1
  ) ir on true
  order by v.created_at desc, v.id desc;
$$;

grant execute on function public.get_posts(uuid, timestamptz, uuid, int, uuid, text, text, uuid, int, int) to authenticated;


-- ============================================================
-- Notify the original author
-- ============================================================

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('post', 'comment', 'reaction', 'friend_request',
                  'friend_accepted', 'recommendation', 'dm', 'repost'));

create or replace function public.notify_on_repost()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare original_author uuid;
begin
  if new.repost_of is null then
    return new;
  end if;

  select user_id into original_author from public.posts where id = new.repost_of;

  -- no_self_notify would reject reposting your own post, so skip it.
  if original_author is null or original_author = new.user_id then
    return new;
  end if;

  insert into public.notifications (user_id, actor_id, type, post_id)
  values (original_author, new.user_id, 'repost', new.id);

  return new;
end;
$$;

drop trigger if exists post_repost_notify on public.posts;
create trigger post_repost_notify
  after insert on public.posts
  for each row execute function public.notify_on_repost();
