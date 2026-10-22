-- ============================================================
-- CineMinimal social features
--
-- Run this in the Supabase SQL editor (or via the Supabase MCP/CLI).
-- Written in four phase-sized sections; safe to run all at once, or
-- paste one section at a time as each phase is built.
--
-- Design notes worth knowing before editing:
--   * Friendship is NOT a separate table. It is a `friend_requests` row
--     with status='accepted'. Avoids a dual-write that has to stay in
--     sync on every accept/unfriend.
--   * A client can never create an accepted friendship directly: the
--     INSERT policy only permits status='pending'. The single path to
--     an accepted row from one side is accept_invite(), below.
-- ============================================================


-- ============================================================
-- PHASE 1: profiles, friend graph, invite links
-- ============================================================

create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text not null unique check (username ~ '^[a-z0-9_]{3,20}$'),
  display_name text,
  avatar_url text,
  invite_code text not null unique,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "profiles_select_own" on public.profiles
  for select using (id = auth.uid());
create policy "profiles_update_own" on public.profiles
  for update using (id = auth.uid()) with check (id = auth.uid());
-- No INSERT policy for authenticated: rows are only ever created by the
-- trigger below (security definer, so it bypasses RLS/grants).

-- Public, column-limited view for friend search / display.
--
-- Deliberately a security-definer view (runs as the view owner, not the
-- caller) so it can expose every row's PUBLIC columns to every signed-in
-- user, while the base table's own RLS stays strictly self-only. Note
-- what is absent here: invite_code. That is the whole point — the code
-- is a bearer token, so it must never be readable off someone else's
-- profile.
--
-- Supabase's dashboard security linter WILL flag this as a
-- "Security Definer View" warning. That is expected and correct here.
-- Do not "fix" it by adding `with (security_invoker = true)` — that
-- would make user search silently return nothing for everyone but
-- yourself.
create view public.profiles_public as
  select id, username, display_name, avatar_url, created_at
  from public.profiles;

grant select on public.profiles_public to authenticated;

-- Narrow, boolean-only RPC so the signup form can check availability
-- before a session exists (anon role), without exposing the whole user
-- directory to logged-out visitors the way granting profiles_public to
-- anon would.
create or replace function public.is_username_available(candidate text)
returns boolean
language sql security definer stable set search_path = public
as $$
  select not exists (select 1 from public.profiles where username = lower(candidate));
$$;

grant execute on function public.is_username_available(text) to anon, authenticated;

-- Owner-only read of your own invite code. Kept out of profiles_public
-- entirely (see the view comment above).
create or replace function public.get_my_invite_code()
returns text
language sql security definer stable set search_path = public
as $$
  select invite_code from public.profiles where id = auth.uid();
$$;

grant execute on function public.get_my_invite_code() to authenticated;

-- Auto-create a profile row on signup.
--
-- A trigger rather than a client-side insert after login, so it does not
-- matter whether "Confirm email" is enabled: the auth.users row (and so
-- this trigger) fires at signUp() time either way, meaning a profile and
-- invite code always exist from the moment of signup.
--
-- Robust to a missing/blank username (falls back to the email
-- local-part) and to a collision race (loops to a numbered suffix)
-- rather than failing signup outright.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare
  candidate text;
  final_username text;
  suffix int := 0;
begin
  candidate := lower(coalesce(new.raw_user_meta_data->>'username', split_part(new.email, '@', 1)));
  candidate := regexp_replace(candidate, '[^a-z0-9_]', '', 'g');
  if candidate = '' or length(candidate) < 3 then
    candidate := 'user';
  end if;
  candidate := left(candidate, 20);

  final_username := candidate;
  while exists (select 1 from public.profiles where username = final_username) loop
    suffix := suffix + 1;
    final_username := left(candidate, 20 - length(suffix::text) - 1) || '_' || suffix;
  end loop;

  insert into public.profiles (id, username, display_name, invite_code)
  values (
    new.id,
    final_username,
    coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
    encode(gen_random_bytes(6), 'hex')
  );

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create table public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  constraint no_self_request check (requester_id <> addressee_id)
);

-- One live (pending or accepted) relationship per pair, regardless of
-- who sent the request — least()/greatest() canonicalize the direction.
-- Declined rows are excluded so a re-request after a decline is allowed.
-- Doubles as the ON CONFLICT target for accept_invite() below.
create unique index unique_friend_pair on public.friend_requests
  (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  where status in ('pending', 'accepted');

alter table public.friend_requests enable row level security;

create policy "friend_requests_select" on public.friend_requests
  for select using (requester_id = auth.uid() or addressee_id = auth.uid());

-- status='pending' is enforced here, not just in the app. Without this
-- clause anyone could insert an accepted row against a stranger from
-- devtools and gain read access to their presence, notes and shared list.
create policy "friend_requests_insert" on public.friend_requests
  for insert with check (requester_id = auth.uid() and status = 'pending');

create policy "friend_requests_addressee_responds" on public.friend_requests
  for update using (addressee_id = auth.uid() and status = 'pending')
  with check (addressee_id = auth.uid() and status in ('accepted', 'declined'));

create policy "friend_requests_requester_cancels" on public.friend_requests
  for delete using (status = 'pending' and requester_id = auth.uid());

create policy "friend_requests_unfriend" on public.friend_requests
  for delete using (status = 'accepted' and (requester_id = auth.uid() or addressee_id = auth.uid()));

-- Reused verbatim by RLS on now_watching / shared_watchlist_items /
-- notes. Centralized so the friendship check cannot drift between them.
create or replace function public.is_friend_with(other_user uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.friend_requests
    where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = other_user)
        or (requester_id = other_user and addressee_id = auth.uid()))
  );
$$;

grant execute on function public.is_friend_with(uuid) to authenticated;

-- The ONLY path to a status='accepted' row created unilaterally.
-- Possessing the invite code IS the authorization check, so it has to be
-- verified somewhere the caller cannot tamper with — here, not in client
-- navigation logic.
create or replace function public.accept_invite(invite_code_input text)
returns table (friend_id uuid, friend_username text, friend_display_name text)
language plpgsql security definer set search_path = public
as $$
declare
  target_id uuid;
begin
  select id into target_id from public.profiles where invite_code = invite_code_input;

  if target_id is null then
    raise exception 'Invalid invite code';
  end if;
  if target_id = auth.uid() then
    raise exception 'Cannot invite yourself';
  end if;

  insert into public.friend_requests (requester_id, addressee_id, status, responded_at)
  values (auth.uid(), target_id, 'accepted', now())
  on conflict (least(requester_id, addressee_id), greatest(requester_id, addressee_id))
  do update set status = 'accepted', responded_at = now();

  return query
    select p.id, p.username, p.display_name
    from public.profiles p
    where p.id = target_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;


-- ============================================================
-- PHASE 2: realtime presence ("currently watching")
-- ============================================================

create table public.now_watching (
  user_id uuid primary key references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  media_id text not null,
  title text not null,
  poster_path text,
  season int,
  episode int,
  updated_at timestamptz not null default now()
);

alter table public.now_watching enable row level security;

create policy "now_watching_select" on public.now_watching
  for select using (user_id = auth.uid() or public.is_friend_with(user_id));
create policy "now_watching_write" on public.now_watching
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- REQUIRED for postgres_changes to fire at all. Forgetting this is the
-- single most common reason a realtime subscription silently receives
-- nothing. Confirm afterwards under Database > Publications.
alter publication supabase_realtime add table public.now_watching;


-- ============================================================
-- PHASE 3: shared watchlist (one list per friend pair)
-- ============================================================

create table public.shared_watchlist_items (
  id uuid primary key default gen_random_uuid(),
  user_low uuid not null references auth.users(id) on delete cascade,
  user_high uuid not null references auth.users(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  media_id text not null,
  title text not null,
  poster_path text,
  status text not null default 'pending' check (status in ('pending', 'watched')),
  added_at timestamptz not null default now(),
  watched_at timestamptz,
  -- Canonical pair ordering, so one list per pair is queryable without
  -- caring who added what. uuids compare fine.
  constraint user_order check (user_low < user_high),
  constraint unique_pair_item unique (user_low, user_high, media_type, media_id)
);

create index shared_watchlist_pair_idx on public.shared_watchlist_items (user_low, user_high);

alter table public.shared_watchlist_items enable row level security;

create policy "shared_watchlist_select" on public.shared_watchlist_items
  for select using (auth.uid() = user_low or auth.uid() = user_high);

create policy "shared_watchlist_insert" on public.shared_watchlist_items
  for insert with check (
    added_by = auth.uid()
    and (auth.uid() = user_low or auth.uid() = user_high)
    and public.is_friend_with(case when auth.uid() = user_low then user_high else user_low end)
  );

create policy "shared_watchlist_update" on public.shared_watchlist_items
  for update using (auth.uid() = user_low or auth.uid() = user_high);

create policy "shared_watchlist_delete" on public.shared_watchlist_items
  for delete using (auth.uid() = user_low or auth.uid() = user_high);


-- ============================================================
-- PHASE 4: notes (friends-visible)
-- ============================================================

create table public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  media_id text not null,
  title text not null,
  poster_path text,
  body text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index notes_media_idx on public.notes (media_type, media_id);
create index notes_user_idx on public.notes (user_id);

alter table public.notes enable row level security;

create policy "notes_select" on public.notes
  for select using (user_id = auth.uid() or public.is_friend_with(user_id));
create policy "notes_write" on public.notes
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());
