-- ============================================================
-- Incognito watching + recommendation notifications.
--
-- Run after 0009. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Incognito
--
-- A persistent per-user preference rather than a per-session toggle, so
-- it survives navigation and doesn't silently lapse back to public.
-- ============================================================

alter table public.profiles add column if not exists watch_incognito boolean not null default false;
alter table public.now_watching add column if not exists is_incognito boolean not null default false;

-- CREATE OR REPLACE cannot change a function's return type, and this adds
-- an is_incognito column — so the old signature must be dropped first.
-- Without this the whole migration aborts and rolls back.
drop function if exists public.get_friends_watching();

-- The title is masked SERVER-SIDE, not hidden in the UI. If the row went
-- out over the wire with the real title, anyone reading the network tab
-- would see it — which would make the whole feature decorative.
create or replace function public.get_friends_watching()
returns table (
  user_id uuid, media_type text, media_id text, title text,
  poster_path text, season int, episode int, updated_at timestamptz,
  is_incognito boolean,
  username text, display_name text, avatar_url text
)
language sql stable security invoker set search_path = public
as $$
  select w.user_id,
         case when w.is_incognito then null else w.media_type end,
         case when w.is_incognito then null else w.media_id end,
         case when w.is_incognito then 'Something secret' else w.title end,
         case when w.is_incognito then null else w.poster_path end,
         case when w.is_incognito then null else w.season end,
         case when w.is_incognito then null else w.episode end,
         w.updated_at,
         w.is_incognito,
         pr.username, pr.display_name, pr.avatar_url
  from public.now_watching w
  join public.profiles_public pr on pr.id = w.user_id
  where w.user_id <> auth.uid()
    and w.user_id in (select public.friend_ids())
  order by w.updated_at desc;
$$;

grant execute on function public.get_friends_watching() to authenticated;


-- ============================================================
-- 2. Recommendation notifications
-- ============================================================

-- The type list is a CHECK constraint, so adding a value means replacing it.
alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('post', 'comment', 'reaction', 'friend_request', 'friend_accepted', 'recommendation'));

alter table public.notifications
  add column if not exists media_title text,
  add column if not exists media_type text,
  add column if not exists media_id text;

create or replace function public.notify_on_recommendation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare recipient uuid;
begin
  -- The pair columns are ordered, not roles: the recipient is whichever
  -- side of the pair didn't add the item.
  recipient := case when new.added_by = new.user_low then new.user_high else new.user_low end;

  if recipient is null or recipient = new.added_by then
    return new;
  end if;

  insert into public.notifications
    (user_id, actor_id, type, media_type, media_id, media_title)
  values (recipient, new.added_by, 'recommendation', new.media_type, new.media_id, new.title);

  return new;
end;
$$;

drop trigger if exists shared_watchlist_notify on public.shared_watchlist_items;
create trigger shared_watchlist_notify
  after insert on public.shared_watchlist_items
  for each row execute function public.notify_on_recommendation();
