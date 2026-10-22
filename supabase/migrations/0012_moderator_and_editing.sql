-- ============================================================
-- Re-grant the moderator role, and allow editing posts/comments.
--
-- Run after 0011. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Moderator grant (robust)
--
-- 0007 tried this with a plain UPDATE, which is fragile: the
-- profiles_sanitize trigger pins is_admin to its previous value whenever
-- auth.uid() is non-null. That guard exists to stop privilege escalation
-- from the browser, and it is correct — but it also means the grant
-- silently no-ops in any context that carries a JWT.
--
-- Disabling the trigger for the duration of this statement makes the
-- grant deterministic instead of depending on how the SQL was invoked.
-- ============================================================

alter table public.profiles disable trigger profiles_sanitize;

update public.profiles p
   set is_admin = true
  from auth.users u
 where u.id = p.id
   and lower(u.email) = lower('mohammed.elwed@gmail.com');

alter table public.profiles enable trigger profiles_sanitize;

-- Fails loudly rather than leaving you wondering whether it worked.
do $$
declare granted int;
begin
  select count(*) into granted
  from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = lower('mohammed.elwed@gmail.com') and p.is_admin;

  if granted = 0 then
    raise exception 'Moderator grant failed: no profile found for that address. Is the account signed up, and does a profiles row exist?';
  end if;

  raise notice 'Moderator granted (% row).', granted;
end;
$$;


-- ============================================================
-- 2. Editing posts and comments
--
-- Comments were deliberately immutable in 0002 ("edit history is a whole
-- feature nobody asked for"). That's now asked for, so they become
-- editable — but visibly so: an edit that leaves no trace lets someone
-- rewrite what others already replied to.
-- ============================================================

alter table public.posts add column if not exists edited_at timestamptz;
alter table public.post_comments add column if not exists edited_at timestamptz;

-- Stamped only when the text actually changes, so flipping a post's
-- visibility doesn't falsely mark it "edited".
create or replace function public.stamp_edited()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.body is distinct from old.body then
    new.edited_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists posts_stamp_edited on public.posts;
create trigger posts_stamp_edited
  before update on public.posts
  for each row execute function public.stamp_edited();

drop trigger if exists post_comments_stamp_edited on public.post_comments;
create trigger post_comments_stamp_edited
  before update on public.post_comments
  for each row execute function public.stamp_edited();

-- Authors only — deliberately NOT moderators. Deleting someone's post is
-- moderation; rewriting its words under their name is impersonation.
-- Moderators keep their delete rights from 0007.
drop policy if exists "post_comments_update_own" on public.post_comments;
create policy "post_comments_update_own" on public.post_comments
  for update to authenticated
  using (user_id = auth.uid() and not public.is_banned())
  with check (user_id = auth.uid());

-- Same ban check on posts, which 0002 predates.
drop policy if exists "posts_update_own" on public.posts;
create policy "posts_update_own" on public.posts
  for update to authenticated
  using (user_id = auth.uid() and not public.is_banned())
  with check (user_id = auth.uid());
