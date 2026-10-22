-- ============================================================
-- Moderation: channel deletion, an admin role, and banning.
--
-- Run after 0006. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. The admin flag — and why it needs a trigger guard
--
-- profiles_update_own (0001) allows updating ANY column of your own row.
-- So simply adding is_admin would mean anyone could run
--     supabase.from('profiles').update({ is_admin: true })
-- from the browser console and become a moderator. The column alone is a
-- privilege-escalation hole; the guard below is what closes it.
-- ============================================================

alter table public.profiles add column if not exists is_admin boolean not null default false;
alter table public.profiles add column if not exists banned_at timestamptz;

-- SECURITY DEFINER so it bypasses profiles' own RLS. Without that, using
-- it inside a profiles policy would recurse.
create or replace function public.is_admin()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((select is_admin from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_admin() to authenticated;

create or replace function public.is_banned()
returns boolean
language sql security definer stable set search_path = public
as $$
  select coalesce((select banned_at is not null from public.profiles where id = auth.uid()), false);
$$;

grant execute on function public.is_banned() to authenticated;

-- Extends 0004's sanitizer. is_admin is pinned to its previous value on
-- any update that carries a JWT — i.e. every request from the app.
-- auth.uid() is null in the SQL editor, which is deliberately the only
-- place the flag can be granted.
create or replace function public.sanitize_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null then
    new.display_name := left(btrim(split_part(new.display_name, '@', 1)), 50);
    if new.display_name = '' then
      new.display_name := null;
    end if;
  end if;

  if new.bio is not null then
    new.bio := left(new.bio, 300);
  end if;

  -- Privilege escalation guard. Not reachable from the client at all.
  if TG_OP = 'UPDATE' and auth.uid() is not null then
    new.is_admin := old.is_admin;
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sanitize on public.profiles;
create trigger profiles_sanitize
  before insert or update on public.profiles
  for each row execute function public.sanitize_profile();

-- Grant the moderator role. Runs in the SQL editor where auth.uid() is
-- null, so the guard above lets it through.
update public.profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = 'mohammed.elwed@gmail.com';

-- Moderators need to see other people's rows (ban state, admin flag),
-- which profiles' self-only select policy otherwise forbids.
drop policy if exists "profiles_admin_select" on public.profiles;
create policy "profiles_admin_select" on public.profiles
  for select to authenticated using (public.is_admin());

drop policy if exists "profiles_admin_update" on public.profiles;
create policy "profiles_admin_update" on public.profiles
  for update to authenticated using (public.is_admin()) with check (public.is_admin());


-- ============================================================
-- 2. Moderator delete rights
--
-- Each policy keeps its original owner clause and adds is_admin() —
-- widening who may delete, never changing who may read.
-- ============================================================

drop policy if exists "posts_delete_own" on public.posts;
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (user_id = auth.uid() or public.is_admin());

drop policy if exists "post_comments_delete" on public.post_comments;
create policy "post_comments_delete" on public.post_comments
  for delete to authenticated
  using (user_id = auth.uid() or public.post_owner(post_id) = auth.uid() or public.is_admin());

-- Channel creators could already delete their own (0006); this adds
-- moderators. The FK from posts is ON DELETE CASCADE, so removing a
-- channel takes its posts with it.
drop policy if exists "channels_delete_own" on public.channels;
create policy "channels_delete_own" on public.channels
  for delete to authenticated using (created_by = auth.uid() or public.is_admin());


-- ============================================================
-- 3. Banning
--
-- A ban blocks writing, not reading: existing content stays visible so
-- moderators can still review it, and the account isn't destroyed.
-- ============================================================

drop policy if exists "posts_insert" on public.posts;
create policy "posts_insert" on public.posts
  for insert to authenticated with check (user_id = auth.uid() and not public.is_banned());

drop policy if exists "post_comments_insert" on public.post_comments;
create policy "post_comments_insert" on public.post_comments
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_post(post_id) and not public.is_banned());

drop policy if exists "channels_insert" on public.channels;
create policy "channels_insert" on public.channels
  for insert to authenticated with check (created_by = auth.uid() and not public.is_banned());

create or replace function public.admin_set_banned(target_user uuid, banned boolean)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;
  if target_user = auth.uid() then
    raise exception 'You cannot ban yourself';
  end if;
  -- Refuse to ban another moderator: demote them in SQL first. Stops a
  -- compromised admin account from locking out the rest.
  if coalesce((select is_admin from public.profiles where id = target_user), false) then
    raise exception 'Cannot ban another admin';
  end if;

  update public.profiles
     set banned_at = case when banned then now() else null end
   where id = target_user;
end;
$$;

grant execute on function public.admin_set_banned(uuid, boolean) to authenticated;

-- Removes everything a user posted, without touching their account.
--
-- Deleting the auth.users row itself is deliberately NOT here: that needs
-- the service-role key from a trusted server, and this app only ever
-- holds the anon key in the browser. Exposing account deletion through a
-- SECURITY DEFINER RPC reachable by any authenticated caller would be a
-- far bigger risk than the convenience is worth. Delete accounts from the
-- Supabase dashboard (Authentication > Users) instead.
create or replace function public.admin_purge_user_content(target_user uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    raise exception 'Not authorized';
  end if;

  delete from public.post_comments where user_id = target_user;
  delete from public.posts where user_id = target_user;
  delete from public.channels where created_by = target_user;
end;
$$;

grant execute on function public.admin_purge_user_content(uuid) to authenticated;

-- Moderator user list: profiles plus counts, in one round trip.
create or replace function public.admin_list_users()
returns table (
  id uuid, username text, display_name text, avatar_url text,
  is_admin boolean, banned_at timestamptz, created_at timestamptz,
  post_count bigint
)
language sql stable security definer set search_path = public
as $$
  select p.id, p.username, p.display_name, p.avatar_url,
         p.is_admin, p.banned_at, p.created_at,
         coalesce(c.n, 0)
  from public.profiles p
  left join lateral (
    select count(*) as n from public.posts x where x.user_id = p.id
  ) c on true
  -- Returns nothing at all for non-admins rather than erroring, so a
  -- probing client learns nothing about who exists.
  where public.is_admin()
  order by p.created_at desc;
$$;

grant execute on function public.admin_list_users() to authenticated;
