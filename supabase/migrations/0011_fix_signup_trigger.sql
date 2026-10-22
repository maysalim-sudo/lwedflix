-- ============================================================
-- FIX: "Database error saving new user" — signup is broken.
--
-- Run this FIRST, before the corrected 0010. One paste.
--
-- Cause: handle_new_user() is declared `set search_path = public`, but
-- generated invite codes used gen_random_bytes(), which comes from
-- pgcrypto. Supabase installs pgcrypto into the `extensions` schema, not
-- `public`, so the pinned search_path can't resolve it and every INSERT
-- into auth.users aborts.
--
-- Why this went unnoticed: 0002's backfill ran the same expression from
-- a DO block, which uses the SESSION search_path (extensions included),
-- so it succeeded and gave existing accounts their profiles. Only the
-- trigger — the path new signups take — was broken.
--
-- Fixed two ways, deliberately belt-and-braces:
--   1. Drop the pgcrypto dependency. gen_random_uuid() is Postgres core
--      (13+), so it resolves regardless of search_path.
--   2. Never let a profile problem block account creation. A signup that
--      fails outright is far worse than a profile that can be backfilled,
--      so the insert is wrapped and any failure is logged as a warning
--      instead of aborting the user's registration.
-- ============================================================

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
-- extensions is included so anything pgcrypto-based added later still
-- resolves, even though the body below no longer needs it.
set search_path = public, extensions
as $$
begin
  begin
    insert into public.profiles (id, username, display_name, invite_code)
    values (
      new.id,
      public.generate_unique_username(
        coalesce(nullif(new.raw_user_meta_data->>'username', ''), split_part(new.email, '@', 1))
      ),
      coalesce(nullif(new.raw_user_meta_data->>'display_name', ''), split_part(new.email, '@', 1)),
      -- Core, not pgcrypto: 12 hex chars, same shape as the old code.
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    );
  exception when others then
    -- Surfaces in the Postgres logs without taking the signup down with it.
    raise warning 'handle_new_user failed for %: %', new.id, sqlerrm;
  end;

  return new;
end;
$$;

-- Same search_path hardening for the username helper.
create or replace function public.generate_unique_username(seed text)
returns text
language plpgsql
security definer
set search_path = public, extensions
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

revoke execute on function public.generate_unique_username(text) from public;

-- Repairs any account created while the trigger was failing, and any
-- whose profile insert is swallowed by the guard above. Row-at-a-time so
-- generate_unique_username sees each prior insert (see 0002).
do $$
declare u record;
begin
  for u in
    select au.id, au.email, au.raw_user_meta_data
    from auth.users au
    where not exists (select 1 from public.profiles p where p.id = au.id)
    order by au.created_at
  loop
    insert into public.profiles (id, username, display_name, invite_code)
    values (
      u.id,
      public.generate_unique_username(
        coalesce(nullif(u.raw_user_meta_data->>'username', ''), split_part(u.email, '@', 1))
      ),
      coalesce(nullif(u.raw_user_meta_data->>'display_name', ''), split_part(u.email, '@', 1)),
      substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
    );
  end loop;
end;
$$;
