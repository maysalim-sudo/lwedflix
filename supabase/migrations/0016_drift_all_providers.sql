-- ============================================================
-- 0016: Drift for every provider
--
-- Only videasy broadcasts real playback progress. For every other
-- embed the position is *estimated* from a shared start time and a
-- local clock, which is honest but weaker — it can't see a pause, a
-- seek or a buffering stall.
--
-- The column exists so the UI can say which kind of number it is
-- rather than presenting a guess as a measurement.
-- ============================================================

alter table public.watch_room_members
  add column if not exists position_source text not null default 'estimated';

alter table public.watch_room_members drop constraint if exists position_source_valid;
alter table public.watch_room_members add constraint position_source_valid
  check (position_source in ('measured', 'estimated'));

drop function if exists public.get_room_members(uuid);
create or replace function public.get_room_members(target_room uuid)
returns table (
  user_id uuid, position_seconds numeric, duration_seconds numeric,
  position_source text, updated_at timestamptz,
  username text, display_name text, avatar_url text
)
language sql stable security invoker set search_path = public
as $$
  select m.user_id, m.position_seconds, m.duration_seconds,
         m.position_source, m.updated_at,
         pr.username, pr.display_name, pr.avatar_url
  from public.watch_room_members m
  join public.profiles_public pr on pr.id = m.user_id
  where m.room_id = target_room
  order by m.updated_at desc;
$$;

grant execute on function public.get_room_members(uuid) to authenticated;
