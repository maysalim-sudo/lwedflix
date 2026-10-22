-- ============================================================
-- 0018: Watchlist status, rating, and public lists
--
-- `watch_list` predates the migration folder (it was created straight
-- in the dashboard), so this only adds to it. Existing rows become
-- 'plan', which is what an untriaged saved title actually means.
--
-- The CREATE below is a no-op on any database that already has the
-- table. It exists so this file is self-sufficient rather than failing
-- with 42P01 if it's ever run somewhere the dashboard-created table
-- isn't present. Column list matches the live shape exactly.
-- ============================================================

create table if not exists public.watch_list (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id text not null,
  type text not null default 'movie',
  title text,
  poster_path text,
  added_at timestamptz not null default now()
);

alter table public.watch_list
  add column if not exists status text not null default 'plan',
  add column if not exists rating smallint,
  add column if not exists updated_at timestamptz not null default now();

alter table public.watch_list drop constraint if exists watch_list_status_valid;
alter table public.watch_list add constraint watch_list_status_valid
  check (status in ('watching', 'on_hold', 'plan', 'dropped', 'completed'));

-- 1..10 to match TMDB's own scale, so a personal score and the public
-- score are directly comparable.
alter table public.watch_list drop constraint if exists watch_list_rating_valid;
alter table public.watch_list add constraint watch_list_rating_valid
  check (rating is null or rating between 1 and 10);

create index if not exists watch_list_user_status_idx
  on public.watch_list (user_id, status, added_at desc);


-- ============================================================
-- Public watchlists
-- ============================================================

alter table public.profiles
  add column if not exists watchlist_public boolean not null default false;

-- SECURITY DEFINER so the check can read `profiles`, whose own RLS is
-- self-only — an invoker-side lookup would always come back false for
-- somebody else's profile and the feature would silently never work.
create or replace function public.watchlist_is_public(owner uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((select watchlist_public from public.profiles where id = owner), false);
$$;

revoke execute on function public.watchlist_is_public(uuid) from public;
grant execute on function public.watchlist_is_public(uuid) to authenticated;

alter table public.watch_list enable row level security;

-- Additive: permissive policies OR together, so whatever self-access
-- policy already exists on this table keeps working untouched.
drop policy if exists "watch_list_public_read" on public.watch_list;
create policy "watch_list_public_read" on public.watch_list for select to authenticated
  using (user_id = auth.uid() or public.watchlist_is_public(user_id));


-- ============================================================
-- Someone else's list, for their profile page
-- ============================================================

drop function if exists public.get_public_watchlist(uuid, text);
create or replace function public.get_public_watchlist(
  owner uuid,
  status_filter text default null
)
returns table (
  id uuid,
  movie_id text,
  type text,
  title text,
  poster_path text,
  status text,
  rating smallint,
  added_at timestamptz
)
language sql security definer stable set search_path = public
as $$
  select w.id, w.movie_id::text, w.type, w.title, w.poster_path,
         w.status, w.rating, w.added_at
  from public.watch_list w
  where w.user_id = owner
    -- Own list always readable; someone else's only when they've opened it.
    and (owner = auth.uid() or public.watchlist_is_public(owner))
    and (status_filter is null or w.status = status_filter)
  order by w.added_at desc;
$$;

grant execute on function public.get_public_watchlist(uuid, text) to authenticated;
