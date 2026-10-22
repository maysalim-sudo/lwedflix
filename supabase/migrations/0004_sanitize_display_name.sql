-- ============================================================
-- PRIVACY FIX: stop email addresses landing in profiles.display_name
--
-- Run after 0003. Single paste, safe to re-run.
--
-- Found while testing: an account's display_name was literally
-- "someone@gmail.com". Because profiles_public exposes display_name to
-- every authenticated user (that's the whole point of the view — friend
-- search), that turns the user directory into an email harvester.
--
-- How it got there: handle_new_user() falls back to
-- split_part(new.email, '@', 1), which is fine, BUT it prefers
-- raw_user_meta_data->>'display_name' when present — and depending on
-- how the account was created (dashboard, an older signup form, or a
-- provider that copies email into metadata) that value can be the whole
-- address. The fallback was never the problem; trusting the metadata was.
--
-- Fixed with a BEFORE INSERT OR UPDATE trigger rather than by patching
-- handle_new_user(), so it holds for EVERY write path: the signup
-- trigger, the profile editor, the 0002 backfill, and anything added
-- later. A CHECK constraint would reject the save instead of repairing
-- it, which would just surface as a confusing error to the user.
-- ============================================================

create or replace function public.sanitize_profile()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.display_name is not null then
    -- Keep only the part before any '@'. Nobody legitimately needs an
    -- address in a display name, and the harvesting risk outweighs it.
    new.display_name := left(btrim(split_part(new.display_name, '@', 1)), 50);
    if new.display_name = '' then
      new.display_name := null;
    end if;
  end if;

  if new.bio is not null then
    new.bio := left(new.bio, 300);
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_sanitize on public.profiles;
create trigger profiles_sanitize
  before insert or update on public.profiles
  for each row execute function public.sanitize_profile();

-- Repair rows written before the trigger existed.
update public.profiles
   set display_name = left(btrim(split_part(display_name, '@', 1)), 50)
 where display_name like '%@%';

-- Anything that reduced to an empty string is better off null: the UI
-- falls back to @username, which is the intended public identifier.
update public.profiles
   set display_name = null
 where display_name is not null and btrim(display_name) = '';
