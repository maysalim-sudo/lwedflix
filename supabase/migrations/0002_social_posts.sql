-- ============================================================
-- CineMinimal social, part 2: profiles, posts, feed, notifications
--
-- Run this AFTER 0001_social_features.sql.
--
-- RUN IT AS TWO SEPARATE PASTES:
--   1. Everything down to the "STORAGE" banner near the bottom.
--   2. The STORAGE section on its own.
-- Storage DDL needs privileges on `storage.objects` that not every
-- Supabase project grants to `postgres`. Splitting the run means a
-- permissions failure there cannot roll back the schema above it.
-- If part 2 fails, create the buckets and policies in the dashboard
-- instead (Storage > New bucket, then Storage > Policies) — the
-- resulting configuration is identical.
--
-- Safe to re-run: every statement is guarded.
-- ============================================================


-- ============================================================
-- 1. FIX: profiles for accounts that predate 0001
--
-- handle_new_user() only fires on INSERT into auth.users, so anyone
-- who signed up before 0001 ran has no profiles row — and therefore
-- no invite code, which is why /friends shows "Generating…" forever.
-- ============================================================

-- Extracted so the trigger and the backfill below share one
-- implementation instead of drifting apart.
create or replace function public.generate_unique_username(seed text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  candidate text;
  final_username text;
  suffix int := 0;
begin
  candidate := regexp_replace(lower(coalesce(seed, '')), '[^a-z0-9_]', '', 'g');
  if length(candidate) < 3 then
    candidate := 'user';
  end if;
  candidate := left(candidate, 20);

  final_username := candidate;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := left(candidate, 20 - length(suffix::text) - 1) || '_' || suffix;
  end loop;

  return final_username;
end;
$$;

-- Postgres grants EXECUTE to PUBLIC by default on new functions, and
-- this one is SECURITY DEFINER. Nothing outside the DB should call it.
revoke execute on function public.generate_unique_username(text) from public;

-- Same behaviour as 0001, with the inline loop delegated to the
-- function above. `create or replace` keeps the existing
-- on_auth_user_created trigger binding, so the trigger is not recreated.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, username, display_name, invite_code)
  values (
    new.id,
    public.generate_unique_username(
      coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
    ),
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    encode(gen_random_bytes(6), 'hex')
  );
  return new;
end;
$$;

-- Backfill. This MUST be a row-at-a-time loop, not `insert ... select`:
-- generate_unique_username reads the snapshot of the statement that
-- called it, so under a single set-based insert two users seeded from
-- the same name would both be handed the same username and the whole
-- statement would die on the unique index. One insert per iteration
-- means each call sees the previous iteration's row.
--
-- (Which is also why generate_unique_username must stay VOLATILE — the
-- plpgsql default. Marking it STABLE reintroduces exactly this bug.)
do $$
declare
  u record;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
    order by au.created_at
  loop
    -- email is nullable (phone / OAuth-only accounts); split_part(null,...)
    -- yields null, which falls through to the 'user' seed.
    insert into public.profiles (id, username, display_name, invite_code)
    values (
      u.id,
      public.generate_unique_username(
        coalesce(nullif(u.raw_user_meta_data->>'username', ''), split_part(u.email, '@', 1))
      ),
      coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1)),
      encode(gen_random_bytes(6), 'hex')
    );
  end loop;
end;
$$;


-- ============================================================
-- 2. Profile columns + public view
-- ============================================================

alter table public.profiles add column if not exists cover_url text;
alter table public.profiles add column if not exists bio text;
alter table public.profiles add column if not exists username_changed_at timestamptz;

-- NOT VALID: applies to new/updated rows without validating existing
-- ones, so the migration can't fail on a legacy display_name that was
-- seeded from a long email local-part.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'bio_len') then
    alter table public.profiles add constraint bio_len
      check (bio is null or char_length(bio) <= 300) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'display_name_len') then
    alter table public.profiles add constraint display_name_len
      check (display_name is null or char_length(display_name) between 1 and 50) not valid;
  end if;
end;
$$;

-- Recreated rather than `create or replace`, which can only append
-- columns. Nothing depends on this view, so dropping it is safe.
--
-- Still deliberately a security-definer view (see 0001): profiles' own
-- RLS is self-only, and this is what lets friend search read other
-- people's public columns. Supabase's linter re-raises the "Security
-- Definer View" warning — expected. Do NOT add security_invoker = true.
--
-- invite_code stays absent: it is a bearer token.
drop view if exists public.profiles_public;
create view public.profiles_public as
  select id, username, display_name, avatar_url, cover_url, bio, created_at
  from public.profiles;

-- Mandatory: the grant does not survive the drop above.
grant select on public.profiles_public to authenticated;


-- ============================================================
-- 3. Friendship lookup: indexes + set-returning helper
--
-- 0001's only index is unique_friend_pair on
-- (least(...), greatest(...)), which cannot serve the actual lookup
-- (status='accepted' and requester_id = X or addressee_id = X).
-- Every is_friend_with() call has been a seq scan.
-- ============================================================

create index if not exists friend_requests_requester_accepted_idx
  on public.friend_requests (requester_id) where status = 'accepted';
create index if not exists friend_requests_addressee_accepted_idx
  on public.friend_requests (addressee_id) where status = 'accepted';

-- Exists alongside is_friend_with(uuid) rather than replacing it.
-- is_friend_with takes a per-row argument, so RLS invokes it once per
-- candidate row with no memoization. This takes no argument, so
-- `user_id in (select friend_ids())` becomes a hashed SubPlan the
-- planner evaluates ONCE per query — one friendship lookup for a whole
-- feed page instead of one per post.
create or replace function public.friend_ids()
returns setof uuid
language sql security definer stable set search_path = public
as $$
  select case when requester_id = auth.uid() then addressee_id else requester_id end
  from public.friend_requests
  where status = 'accepted'
    and (requester_id = auth.uid() or addressee_id = auth.uid());
$$;

grant execute on function public.friend_ids() to authenticated;


-- ============================================================
-- 4. Posts
-- ============================================================

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null default '' check (char_length(body) <= 2000),
  image_url text,
  visibility text not null default 'friends' check (visibility in ('friends', 'public')),

  -- Attached title. All nullable — a plain text post sets none of these.
  -- Named media_title because posts.title would read as the post's own
  -- headline. poster_path stays a raw TMDB path, rendered through the
  -- existing getImageUrl(), so posters need no next.config change.
  media_type text check (media_type in ('movie', 'tv')),
  media_id text,
  media_title text,
  poster_path text,
  season int,
  episode int,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint post_not_empty check (
    char_length(btrim(body)) > 0 or image_url is not null or media_id is not null
  ),
  constraint media_pair check (
    (media_type is null and media_id is null) or (media_type is not null and media_id is not null)
  )
);

-- Serves both the profile timeline and the feed's (created_at, id) cursor.
create index if not exists posts_user_created_idx on public.posts (user_id, created_at desc, id desc);
create index if not exists posts_media_idx on public.posts (media_type, media_id) where media_id is not null;

alter table public.posts enable row level security;

-- `to authenticated` is load-bearing, not decoration.
--
-- Every 0001 policy is user_id = auth.uid()-shaped, which is implicitly
-- anon-safe because auth.uid() is null for the anon role. This is the
-- first policy with a term that is true INDEPENDENTLY of the caller
-- (visibility = 'public'). Without `to authenticated` the policy also
-- applies to anon — and the anon key ships in the browser bundle, so
-- any logged-out visitor could read every public post. The rule is
-- "public = visible to any SIGNED-IN user".
--
-- Predicate order is deliberate: two cheap comparisons first, and
-- Postgres's default cost estimate for a SubPlan puts friend_ids() last,
-- so it is only reached for rows that are neither yours nor public.
drop policy if exists "posts_select" on public.posts;
create policy "posts_select" on public.posts
  for select to authenticated
  using (
    user_id = auth.uid()
    or visibility = 'public'
    or user_id in (select public.friend_ids())
  );

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (user_id = auth.uid());


-- ============================================================
-- 5. Inherited visibility for comments and reactions
-- ============================================================

-- SECURITY DEFINER is required, not incidental: it bypasses posts RLS
-- so evaluating a comment's policy does not re-run the post policy and
-- nest friend_ids() inside a per-row call.
--
-- The friendship test is inlined rather than delegating to
-- is_friend_with() — with the partial indexes added in section 3, each
-- call is two index lookups instead of a nested function invocation.
--
-- Considered and rejected: denormalising visibility/author onto
-- comments with a sync trigger. Faster, but flipping a post
-- public -> friends would leak its comments until the trigger fired,
-- and any future write path that skipped the trigger would leak
-- permanently. This cannot go stale.
create or replace function public.can_see_post(target_post uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.posts p
    where p.id = target_post
      and (
        p.user_id = auth.uid()
        or p.visibility = 'public'
        or exists (
          select 1 from public.friend_requests fr
          where fr.status = 'accepted'
            and ((fr.requester_id = auth.uid() and fr.addressee_id = p.user_id)
              or (fr.addressee_id = auth.uid() and fr.requester_id = p.user_id))
        )
      )
  );
$$;

grant execute on function public.can_see_post(uuid) to authenticated;

create or replace function public.post_owner(target_post uuid)
returns uuid
language sql security definer stable set search_path = public
as $$ select user_id from public.posts where id = target_post; $$;

grant execute on function public.post_owner(uuid) to authenticated;

create table if not exists public.post_comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 1000),
  created_at timestamptz not null default now()
);

create index if not exists post_comments_post_idx on public.post_comments (post_id, created_at);
create index if not exists post_comments_user_idx on public.post_comments (user_id);

alter table public.post_comments enable row level security;

drop policy if exists "post_comments_select" on public.post_comments;
create policy "post_comments_select" on public.post_comments
  for select to authenticated using (public.can_see_post(post_id));

drop policy if exists "post_comments_insert" on public.post_comments;
create policy "post_comments_insert" on public.post_comments
  for insert to authenticated with check (user_id = auth.uid() and public.can_see_post(post_id));

-- Facebook semantics: your own comment, or any comment on your own post.
drop policy if exists "post_comments_delete" on public.post_comments;
create policy "post_comments_delete" on public.post_comments
  for delete to authenticated
  using (user_id = auth.uid() or public.post_owner(post_id) = auth.uid());

-- No UPDATE policy: comments are immutable. That's a decision, not an
-- oversight — edit history is a whole feature and nobody asked for it.

create table if not exists public.post_reactions (
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'love', 'laugh', 'wow', 'sad')),
  created_at timestamptz not null default now(),
  -- This composite PK IS the "one reaction per person per post" rule,
  -- and it's the conflict target an upsert uses to switch reactions.
  primary key (post_id, user_id)
);

create index if not exists post_reactions_user_idx on public.post_reactions (user_id);

alter table public.post_reactions enable row level security;

drop policy if exists "post_reactions_select" on public.post_reactions;
create policy "post_reactions_select" on public.post_reactions
  for select to authenticated using (public.can_see_post(post_id));

drop policy if exists "post_reactions_insert" on public.post_reactions;
create policy "post_reactions_insert" on public.post_reactions
  for insert to authenticated with check (user_id = auth.uid() and public.can_see_post(post_id));

-- NOT optional. PostgREST's .upsert() emits ON CONFLICT DO UPDATE,
-- which requires this policy's USING to pass for the existing row.
-- Without it the FIRST reaction succeeds and SWITCHING fails with a
-- policy error — a maddening bug to chase.
drop policy if exists "post_reactions_update" on public.post_reactions;
create policy "post_reactions_update" on public.post_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see_post(post_id));

drop policy if exists "post_reactions_delete" on public.post_reactions;
create policy "post_reactions_delete" on public.post_reactions
  for delete to authenticated using (user_id = auth.uid());


-- ============================================================
-- 6. Username changes
--
-- profiles_update_own permits updating any column, so a rename rate
-- limit cannot be expressed as an RLS policy. It needs an RPC.
-- ============================================================

create or replace function public.set_username(new_username text)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  normalized text;
  last_change timestamptz;
begin
  -- The CHECK constraint is ^[a-z0-9_]{3,20}$ — it REJECTS uppercase
  -- rather than folding it, so normalize before validating.
  normalized := lower(btrim(new_username));
  if normalized !~ '^[a-z0-9_]{3,20}$' then
    raise exception 'Username must be 3-20 characters using a-z, 0-9 or _';
  end if;

  select username_changed_at into last_change from public.profiles where id = auth.uid();

  -- Without this, a caller with no profile row silently "succeeds" on a
  -- zero-row UPDATE and the UI reports a rename that never happened.
  if not found then
    raise exception 'Profile not found';
  end if;

  if last_change is not null and last_change > now() - interval '7 days' then
    raise exception 'You can only change your username once every 7 days';
  end if;

  update public.profiles
     set username = normalized, username_changed_at = now()
   where id = auth.uid();

  return normalized;
exception when unique_violation then
  raise exception 'That username is already taken';
end;
$$;

grant execute on function public.set_username(text) to authenticated;


-- ============================================================
-- 7. Notifications
-- ============================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,   -- recipient
  actor_id uuid not null references auth.users(id) on delete cascade,  -- who did it
  type text not null check (type in ('post', 'comment', 'reaction', 'friend_request', 'friend_accepted')),
  post_id uuid references public.posts(id) on delete cascade,
  comment_id uuid references public.post_comments(id) on delete cascade,
  reaction text,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint no_self_notify check (user_id <> actor_id)
);

create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc) where read_at is null;
create index if not exists notifications_all_idx
  on public.notifications (user_id, created_at desc);

alter table public.notifications enable row level security;

drop policy if exists "notifications_select_own" on public.notifications;
create policy "notifications_select_own" on public.notifications
  for select to authenticated using (user_id = auth.uid());

-- Mark-as-read only; the client never creates or deletes.
drop policy if exists "notifications_update_own" on public.notifications;
create policy "notifications_update_own" on public.notifications
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "notifications_delete_own" on public.notifications;
create policy "notifications_delete_own" on public.notifications
  for delete to authenticated using (user_id = auth.uid());

-- Deliberately NO insert policy for authenticated: rows are created
-- only by the SECURITY DEFINER triggers below, so a client cannot forge
-- a notification from someone else.

create or replace function public.notify_on_comment()
returns trigger language plpgsql security definer set search_path = public
as $$
declare owner_id uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is not null and owner_id <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (owner_id, new.user_id, 'comment', new.post_id, new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists post_comments_notify on public.post_comments;
create trigger post_comments_notify
  after insert on public.post_comments
  for each row execute function public.notify_on_comment();

create or replace function public.notify_on_reaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  owner_id uuid;
  existing_id uuid;
begin
  select user_id into owner_id from public.posts where id = new.post_id;
  if owner_id is null or owner_id = new.user_id then
    return new;
  end if;

  -- Switching a reaction updates the existing notification instead of
  -- stacking duplicates for the same person on the same post.
  select id into existing_id from public.notifications
   where user_id = owner_id and actor_id = new.user_id
     and type = 'reaction' and post_id = new.post_id
   limit 1;

  if existing_id is not null then
    update public.notifications
       set reaction = new.reaction, created_at = now(), read_at = null
     where id = existing_id;
  else
    insert into public.notifications (user_id, actor_id, type, post_id, reaction)
    values (owner_id, new.user_id, 'reaction', new.post_id, new.reaction);
  end if;

  return new;
end;
$$;

drop trigger if exists post_reactions_notify on public.post_reactions;
create trigger post_reactions_notify
  after insert or update on public.post_reactions
  for each row execute function public.notify_on_reaction();

-- Fan-out: one row per friend when someone posts.
--
-- Correct and cheap at this app's scale (a handful of friends each),
-- but it IS an O(friends) write per post. If anyone ever accumulated
-- thousands of friends this is the first thing that would need to
-- become fan-out-on-read instead.
--
-- Uses new.user_id rather than friend_ids(): in trigger context
-- auth.uid() happens to be the poster, but depending on that is fragile.
create or replace function public.notify_on_post()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.notifications (user_id, actor_id, type, post_id)
  select
    case when fr.requester_id = new.user_id then fr.addressee_id else fr.requester_id end,
    new.user_id,
    'post',
    new.id
  from public.friend_requests fr
  where fr.status = 'accepted'
    and (fr.requester_id = new.user_id or fr.addressee_id = new.user_id);
  return new;
end;
$$;

drop trigger if exists posts_notify on public.posts;
create trigger posts_notify
  after insert on public.posts
  for each row execute function public.notify_on_post();

create or replace function public.notify_on_friend_request()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if TG_OP = 'INSERT' then
    if new.status = 'pending' then
      insert into public.notifications (user_id, actor_id, type)
      values (new.addressee_id, new.requester_id, 'friend_request');
    elsif new.status = 'accepted' then
      -- accept_invite() inserts an accepted row directly, so this is
      -- "someone joined via your invite link".
      insert into public.notifications (user_id, actor_id, type)
      values (new.addressee_id, new.requester_id, 'friend_accepted');
    end if;
  elsif TG_OP = 'UPDATE' and new.status = 'accepted' and old.status = 'pending' then
    insert into public.notifications (user_id, actor_id, type)
    values (new.requester_id, new.addressee_id, 'friend_accepted');
  end if;
  return new;
end;
$$;

drop trigger if exists friend_requests_notify on public.friend_requests;
create trigger friend_requests_notify
  after insert or update on public.friend_requests
  for each row execute function public.notify_on_friend_request();

-- Required for postgres_changes to fire. Forgetting this is the single
-- most common reason a realtime subscription silently receives nothing.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
  ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end;
$$;


-- ============================================================
-- 8. Feed / timeline query
--
-- One RPC serves both the friends feed (target_user null) and a
-- profile timeline (target_user set).
-- ============================================================

create or replace function public.get_posts(
  target_user uuid default null,
  before_created timestamptz default null,
  before_id uuid default null,
  page_size int default 20
)
returns table (
  id uuid, user_id uuid, body text, image_url text, visibility text,
  media_type text, media_id text, media_title text, poster_path text,
  season int, episode int, created_at timestamptz,
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
          when target_user is not null then p.user_id = target_user
          else p.user_id = auth.uid() or p.user_id in (select public.friend_ids())
        end
      )
      -- Composite cursor. A plain `created_at <` cursor silently skips
      -- rows when two posts share a timestamp, which is entirely likely
      -- with seeded data.
      and (
        before_created is null
        or (p.created_at, p.id) < (before_created, coalesce(before_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    order by p.created_at desc, p.id desc
    limit least(coalesce(page_size, 20), 50)
  )
  select v.id, v.user_id, v.body, v.image_url, v.visibility,
         v.media_type, v.media_id, v.media_title, v.poster_path,
         v.season, v.episode, v.created_at,
         pr.username, pr.display_name, pr.avatar_url,
         coalesce(c.n, 0),
         coalesce(r.counts, '{}'::jsonb),
         mine.reaction
  from visible v
  -- profiles_public, NOT profiles. profiles' RLS is self-only, so under
  -- security invoker an inner join to the base table would silently drop
  -- every row that isn't yours — i.e. a feed showing zero friend posts.
  join public.profiles_public pr on pr.id = v.user_id
  -- These three laterals collapse what would be ~60 round trips per page
  -- into one, with no denormalized counter columns to drift.
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

grant execute on function public.get_posts(uuid, timestamptz, uuid, int) to authenticated;


-- ============================================================
-- STORAGE  <-- RUN THIS SECTION AS A SEPARATE PASTE
--
-- If these statements fail on permissions, do it in the dashboard
-- instead: Storage > New bucket (Public ON, set the size limit and MIME
-- allowlist), then Storage > Policies for the four rules below.
-- ============================================================

-- Three buckets rather than one, because per-bucket file_size_limit is
-- the differentiator — a 2 MB avatar cap and a 5 MB cover cap cannot
-- coexist in a single bucket.
--
-- Public buckets with unguessable filenames. The honest trade-off: a
-- friends-only post's IMAGE BYTES are protected only by the
-- unguessability of a UUID filename, not by RLS. The row, its body, its
-- comments and reactions are all properly access-controlled; the image
-- is not. Signed URLs would fix that but expire (defeating browser and
-- CDN caching), need a batch call per feed load, and would force
-- next.config to accept arbitrary query strings on the image optimizer.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars',     'avatars',     true, 2097152, array['image/jpeg','image/webp','image/png']),
  ('covers',      'covers',      true, 5242880, array['image/jpeg','image/webp','image/png']),
  ('post-images', 'post-images', true, 5242880, array['image/jpeg','image/webp','image/png'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- One policy set covers all three buckets: four policies, not twelve.
--
-- storage.foldername(name) returns text[], so [1] is the first path
-- segment. Objects are named {user_id}/{uuid}.webp, which is why the
-- uid must come first — this is what stops one user writing into
-- another's folder.
drop policy if exists "social_media_read" on storage.objects;
create policy "social_media_read" on storage.objects
  for select to authenticated
  using (bucket_id in ('avatars', 'covers', 'post-images'));

drop policy if exists "social_media_insert_own_folder" on storage.objects;
create policy "social_media_insert_own_folder" on storage.objects
  for insert to authenticated
  with check (
    bucket_id in ('avatars', 'covers', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "social_media_update_own_folder" on storage.objects;
create policy "social_media_update_own_folder" on storage.objects
  for update to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "social_media_delete_own_folder" on storage.objects;
create policy "social_media_delete_own_folder" on storage.objects
  for delete to authenticated
  using (
    bucket_id in ('avatars', 'covers', 'post-images')
    and (storage.foldername(name))[1] = auth.uid()::text
  );
