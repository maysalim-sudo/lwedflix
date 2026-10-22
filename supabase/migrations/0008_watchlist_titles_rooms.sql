-- ============================================================
-- Shared watchlists, per-title friend comments, and watch rooms.
--
-- Run after 0007. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Per-title friend comments
--
-- DESIGN NOTE: these are `posts` carrying a media attachment, not rows
-- in the `notes` table created back in 0001.
--
-- The requirement was that a comment on a title also appears in the
-- friends feed. Notes would mean maintaining a second content system in
-- parallel — its own reactions, replies, moderation, realtime and feed
-- merging — that must behave identically to posts forever. Filtering
-- posts by media_id gets all of that for free, and posts_media_idx
-- (0002) already indexes exactly this query.
--
-- Consequence: `public.notes` is now unused. It is intentionally left in
-- place rather than dropped, since dropping a table is irreversible and
-- it holds no rows worth losing either way.
-- ============================================================

drop function if exists public.get_posts(uuid, timestamptz, uuid, int, uuid);

create or replace function public.get_posts(
  target_user uuid default null,
  before_created timestamptz default null,
  before_id uuid default null,
  page_size int default 20,
  target_channel uuid default null,
  target_media_type text default null,
  target_media_id text default null
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
          -- Title page: everything visible about this specific title,
          -- from anyone RLS lets the caller see.
          when target_media_id is not null then
            p.media_type = target_media_type and p.media_id = target_media_id
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

grant execute on function public.get_posts(uuid, timestamptz, uuid, int, uuid, text, text) to authenticated;


-- ============================================================
-- 2. Shared watchlist
--
-- The table already exists (0001) with correct RLS; it just never had
-- any app code. This adds the read side, since resolving "who is the
-- other person" per row is awkward from the client.
-- ============================================================

create or replace function public.get_shared_watchlist(friend_id uuid)
returns table (
  id uuid, media_type text, media_id text, title text, poster_path text,
  status text, added_at timestamptz, watched_at timestamptz,
  added_by uuid, added_by_username text, added_by_display_name text
)
language sql stable security invoker set search_path = public
as $$
  select s.id, s.media_type, s.media_id, s.title, s.poster_path,
         s.status, s.added_at, s.watched_at,
         s.added_by, pr.username, pr.display_name
  from public.shared_watchlist_items s
  join public.profiles_public pr on pr.id = s.added_by
  where (s.user_low = least(auth.uid(), friend_id)
     and s.user_high = greatest(auth.uid(), friend_id))
  order by s.status asc, s.added_at desc;
$$;

grant execute on function public.get_shared_watchlist(uuid) to authenticated;

-- Everything a user shares with anyone, for the profile/feed summary.
create or replace function public.get_my_shared_counts()
returns table (friend_id uuid, pending_count bigint)
language sql stable security invoker set search_path = public
as $$
  select case when s.user_low = auth.uid() then s.user_high else s.user_low end,
         count(*) filter (where s.status = 'pending')
  from public.shared_watchlist_items s
  where s.user_low = auth.uid() or s.user_high = auth.uid()
  group by 1;
$$;

grant execute on function public.get_my_shared_counts() to authenticated;

-- Recommending is just an insert into the pair's list, but doing the
-- least/greatest ordering here keeps that invariant out of the client
-- where it could drift.
create or replace function public.recommend_to_friend(
  friend_id uuid,
  p_media_type text,
  p_media_id text,
  p_title text,
  p_poster_path text default null
)
returns void
language plpgsql security invoker set search_path = public
as $$
begin
  if not public.is_friend_with(friend_id) then
    raise exception 'You can only recommend to friends';
  end if;

  insert into public.shared_watchlist_items
    (user_low, user_high, added_by, media_type, media_id, title, poster_path)
  values (
    least(auth.uid(), friend_id), greatest(auth.uid(), friend_id),
    auth.uid(), p_media_type, p_media_id, p_title, p_poster_path
  )
  -- Already on the list is a no-op, not an error: recommending something
  -- twice should feel idempotent rather than fail.
  on conflict (user_low, user_high, media_type, media_id) do nothing;
end;
$$;

grant execute on function public.recommend_to_friend(uuid, text, text, text, text) to authenticated;


-- ============================================================
-- 3. Watch rooms
--
-- IMPORTANT, so nobody is misled by the name: this does NOT control
-- anyone's player. The streams are cross-origin third-party iframes with
-- no inbound command API, so remote play/pause/seek is impossible — the
-- browser forbids reaching into them by design.
--
-- What this does is coordinate: everyone opens the same title, gets a
-- shared countdown, and reports their own playback position so the UI
-- can show drift ("you're 12s ahead"). Honest assistance, not fake sync.
-- ============================================================

create table if not exists public.watch_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  host_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  media_id text not null,
  title text not null,
  poster_path text,
  season int,
  episode int,
  -- Set by the host to schedule a synchronized start.
  starts_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists watch_rooms_code_idx on public.watch_rooms (code);

alter table public.watch_rooms enable row level security;

-- Readable by any signed-in user: the room code is the unguessable part,
-- exactly like the invite links in 0001.
drop policy if exists "watch_rooms_select" on public.watch_rooms;
create policy "watch_rooms_select" on public.watch_rooms for select to authenticated using (true);

drop policy if exists "watch_rooms_insert" on public.watch_rooms;
create policy "watch_rooms_insert" on public.watch_rooms
  for insert to authenticated with check (host_id = auth.uid() and not public.is_banned());

drop policy if exists "watch_rooms_update_host" on public.watch_rooms;
create policy "watch_rooms_update_host" on public.watch_rooms
  for update to authenticated using (host_id = auth.uid()) with check (host_id = auth.uid());

drop policy if exists "watch_rooms_delete_host" on public.watch_rooms;
create policy "watch_rooms_delete_host" on public.watch_rooms
  for delete to authenticated using (host_id = auth.uid() or public.is_admin());

create table if not exists public.watch_room_members (
  room_id uuid not null references public.watch_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  position_seconds numeric not null default 0,
  duration_seconds numeric,
  updated_at timestamptz not null default now(),
  primary key (room_id, user_id)
);

alter table public.watch_room_members enable row level security;

create or replace function public.is_room_member(target_room uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.watch_room_members
    where room_id = target_room and user_id = auth.uid()
  );
$$;

grant execute on function public.is_room_member(uuid) to authenticated;

drop policy if exists "watch_room_members_select" on public.watch_room_members;
create policy "watch_room_members_select" on public.watch_room_members
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "watch_room_members_join" on public.watch_room_members;
create policy "watch_room_members_join" on public.watch_room_members
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "watch_room_members_update_own" on public.watch_room_members;
create policy "watch_room_members_update_own" on public.watch_room_members
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "watch_room_members_leave" on public.watch_room_members;
create policy "watch_room_members_leave" on public.watch_room_members
  for delete to authenticated using (user_id = auth.uid());

create table if not exists public.watch_room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.watch_rooms(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 500),
  created_at timestamptz not null default now()
);

create index if not exists watch_room_messages_room_idx
  on public.watch_room_messages (room_id, created_at);

alter table public.watch_room_messages enable row level security;

drop policy if exists "watch_room_messages_select" on public.watch_room_messages;
create policy "watch_room_messages_select" on public.watch_room_messages
  for select to authenticated using (public.is_room_member(room_id));

drop policy if exists "watch_room_messages_insert" on public.watch_room_messages;
create policy "watch_room_messages_insert" on public.watch_room_messages
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_room_member(room_id) and not public.is_banned());

drop policy if exists "watch_room_messages_delete" on public.watch_room_messages;
create policy "watch_room_messages_delete" on public.watch_room_messages
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

-- Members with profiles attached, for the drift panel.
create or replace function public.get_room_members(target_room uuid)
returns table (
  user_id uuid, position_seconds numeric, duration_seconds numeric,
  updated_at timestamptz, username text, display_name text, avatar_url text
)
language sql stable security invoker set search_path = public
as $$
  select m.user_id, m.position_seconds, m.duration_seconds, m.updated_at,
         pr.username, pr.display_name, pr.avatar_url
  from public.watch_room_members m
  join public.profiles_public pr on pr.id = m.user_id
  where m.room_id = target_room
  order by m.updated_at desc;
$$;

grant execute on function public.get_room_members(uuid) to authenticated;

-- Realtime for the room. Without publication, postgres_changes is silent.
do $$
declare t text;
begin
  foreach t in array array['watch_rooms', 'watch_room_members', 'watch_room_messages'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
