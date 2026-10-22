-- ============================================================
-- 0019: Shared watchlists for more than two people
--
-- The existing shared list is keyed on an ordered user PAIR
-- (user_low/user_high), which caps it at two people by construction.
-- This adds a real group model beside it.
--
-- Nothing is dropped. The old pair tables stay exactly as they are —
-- the backfill at the bottom COPIES them into groups, so if anything
-- here is wrong the original data is still sitting untouched.
-- ============================================================

create table if not exists public.watchlist_groups (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 60),
  owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists public.watchlist_group_members (
  group_id uuid not null references public.watchlist_groups(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create index if not exists wl_group_members_user_idx
  on public.watchlist_group_members (user_id);

create table if not exists public.watchlist_group_items (
  id uuid primary key default gen_random_uuid(),
  group_id uuid not null references public.watchlist_groups(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  media_type text not null check (media_type in ('movie', 'tv')),
  media_id text not null,
  title text not null,
  poster_path text,
  status text not null default 'pending' check (status in ('pending', 'watched')),
  added_at timestamptz not null default now(),
  watched_at timestamptz,
  constraint unique_group_item unique (group_id, media_type, media_id)
);

create index if not exists wl_group_items_group_idx
  on public.watchlist_group_items (group_id, status, added_at desc);

create table if not exists public.watchlist_group_votes (
  item_id uuid not null references public.watchlist_group_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  primary key (item_id, user_id)
);


-- ============================================================
-- Membership helper
-- ============================================================

-- SECURITY DEFINER so a member check doesn't recurse back through the
-- members table's own policy.
create or replace function public.is_group_member(target_group uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.watchlist_group_members m
    where m.group_id = target_group and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.is_group_member(uuid) from public;
grant execute on function public.is_group_member(uuid) to authenticated;

create or replace function public.can_see_group_item(target_item uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1
    from public.watchlist_group_items i
    join public.watchlist_group_members m on m.group_id = i.group_id
    where i.id = target_item and m.user_id = auth.uid()
  );
$$;

revoke execute on function public.can_see_group_item(uuid) from public;
grant execute on function public.can_see_group_item(uuid) to authenticated;


-- ============================================================
-- RLS
-- ============================================================

alter table public.watchlist_groups enable row level security;
alter table public.watchlist_group_members enable row level security;
alter table public.watchlist_group_items enable row level security;
alter table public.watchlist_group_votes enable row level security;

drop policy if exists "wl_groups_select" on public.watchlist_groups;
create policy "wl_groups_select" on public.watchlist_groups for select to authenticated
  using (public.is_group_member(id) or owner_id = auth.uid());

drop policy if exists "wl_groups_insert" on public.watchlist_groups;
create policy "wl_groups_insert" on public.watchlist_groups for insert to authenticated
  with check (owner_id = auth.uid());

drop policy if exists "wl_groups_update" on public.watchlist_groups;
create policy "wl_groups_update" on public.watchlist_groups for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists "wl_groups_delete" on public.watchlist_groups;
create policy "wl_groups_delete" on public.watchlist_groups for delete to authenticated
  using (owner_id = auth.uid());

drop policy if exists "wl_members_select" on public.watchlist_group_members;
create policy "wl_members_select" on public.watchlist_group_members for select to authenticated
  using (user_id = auth.uid() or public.is_group_member(group_id));

-- `user_id = auth.uid() or ...` first, deliberately: is_group_member is
-- STABLE and cannot see the row being inserted, so a membership-only
-- check would reject the very first insert into a new group. This is the
-- same trap the watch-room join hit in 0009.
drop policy if exists "wl_members_insert" on public.watchlist_group_members;
create policy "wl_members_insert" on public.watchlist_group_members for insert to authenticated
  with check (user_id = auth.uid() or public.is_group_member(group_id));

drop policy if exists "wl_members_delete" on public.watchlist_group_members;
create policy "wl_members_delete" on public.watchlist_group_members for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from public.watchlist_groups g
                where g.id = group_id and g.owner_id = auth.uid())
  );

drop policy if exists "wl_items_all" on public.watchlist_group_items;
create policy "wl_items_all" on public.watchlist_group_items for all to authenticated
  using (public.is_group_member(group_id))
  with check (public.is_group_member(group_id) and added_by = auth.uid());

drop policy if exists "wl_votes_select" on public.watchlist_group_votes;
create policy "wl_votes_select" on public.watchlist_group_votes for select to authenticated
  using (public.can_see_group_item(item_id));

drop policy if exists "wl_votes_write" on public.watchlist_group_votes;
create policy "wl_votes_write" on public.watchlist_group_votes for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_group_item(item_id));

drop policy if exists "wl_votes_delete" on public.watchlist_group_votes;
create policy "wl_votes_delete" on public.watchlist_group_votes for delete to authenticated
  using (user_id = auth.uid());


-- ============================================================
-- Create a group
-- ============================================================

create or replace function public.create_watchlist_group(
  group_name text,
  member_ids uuid[] default '{}'
)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare gid uuid; m uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;

  insert into public.watchlist_groups (name, owner_id)
  values (coalesce(nullif(btrim(group_name), ''), 'Shared list'), auth.uid())
  returning id into gid;

  insert into public.watchlist_group_members (group_id, user_id)
  values (gid, auth.uid());

  foreach m in array coalesce(member_ids, '{}') loop
    -- Friends only, so a group can't be used to attach yourself to
    -- someone who hasn't accepted you.
    if m <> auth.uid() and public.is_friend_with(m) then
      insert into public.watchlist_group_members (group_id, user_id)
      values (gid, m)
      on conflict do nothing;
    end if;
  end loop;

  return gid;
end;
$$;

grant execute on function public.create_watchlist_group(text, uuid[]) to authenticated;


create or replace function public.add_watchlist_group_members(
  target_group uuid,
  member_ids uuid[]
)
returns void
language plpgsql security definer set search_path = public
as $$
declare m uuid;
begin
  if not public.is_group_member(target_group) then
    raise exception 'Not a member of this group';
  end if;

  foreach m in array coalesce(member_ids, '{}') loop
    if m <> auth.uid() and public.is_friend_with(m) then
      insert into public.watchlist_group_members (group_id, user_id)
      values (target_group, m)
      on conflict do nothing;
    end if;
  end loop;
end;
$$;

grant execute on function public.add_watchlist_group_members(uuid, uuid[]) to authenticated;


-- ============================================================
-- Reads
-- ============================================================

drop function if exists public.get_my_watchlist_groups();
create or replace function public.get_my_watchlist_groups()
returns table (
  id uuid,
  name text,
  owner_id uuid,
  member_count bigint,
  pending_count bigint,
  member_usernames text[],
  created_at timestamptz
)
language sql security definer stable set search_path = public
as $$
  select g.id, g.name, g.owner_id,
         coalesce(mc.n, 0), coalesce(pc.n, 0),
         coalesce(mu.names, '{}'),
         g.created_at
  from public.watchlist_groups g
  join public.watchlist_group_members me
    on me.group_id = g.id and me.user_id = auth.uid()
  left join lateral (
    select count(*) as n from public.watchlist_group_members x where x.group_id = g.id
  ) mc on true
  left join lateral (
    select count(*) as n from public.watchlist_group_items i
    where i.group_id = g.id and i.status = 'pending'
  ) pc on true
  left join lateral (
    -- Base table, not profiles_public: this function is SECURITY DEFINER,
    -- so it bypasses RLS anyway and the view buys nothing here. It also
    -- keeps this migration from depending on 0002 having been applied.
    select array_agg(p.username order by p.username) as names
    from public.watchlist_group_members x
    join public.profiles p on p.id = x.user_id
    where x.group_id = g.id and x.user_id <> auth.uid()
  ) mu on true
  order by g.created_at desc;
$$;

grant execute on function public.get_my_watchlist_groups() to authenticated;


drop function if exists public.get_watchlist_group_items(uuid);
create or replace function public.get_watchlist_group_items(target_group uuid)
returns table (
  id uuid,
  media_type text,
  media_id text,
  title text,
  poster_path text,
  status text,
  added_by uuid,
  added_by_username text,
  added_by_display_name text,
  vote_count bigint,
  i_voted boolean,
  added_at timestamptz
)
language sql security definer stable set search_path = public
as $$
  select i.id, i.media_type, i.media_id, i.title, i.poster_path, i.status,
         i.added_by, p.username, p.display_name,
         coalesce(v.n, 0), coalesce(mine.yes, false), i.added_at
  from public.watchlist_group_items i
  -- Base table for the same reason as above: SECURITY DEFINER already
  -- bypasses RLS, so the view adds a dependency without adding safety.
  join public.profiles p on p.id = i.added_by
  left join lateral (
    select count(*) as n from public.watchlist_group_votes x where x.item_id = i.id
  ) v on true
  left join lateral (
    select true as yes from public.watchlist_group_votes x
    where x.item_id = i.id and x.user_id = auth.uid()
  ) mine on true
  where i.group_id = target_group
    and public.is_group_member(target_group)
  -- Most-wanted first among the unwatched; watched drops to the bottom.
  order by i.status, coalesce(v.n, 0) desc, i.added_at desc;
$$;

grant execute on function public.get_watchlist_group_items(uuid) to authenticated;


-- ============================================================
-- Backfill: every existing pair list becomes a two-person group
-- ============================================================

do $$
declare r record; gid uuid; gname text;
begin
  -- Guarded: the pair table is the one thing here from an older schema,
  -- and there's nothing to migrate if it was never created.
  if to_regclass('public.shared_watchlist_items') is null then
    raise notice 'shared_watchlist_items not present - skipping backfill';
    return;
  end if;

  for r in
    select distinct user_low, user_high from public.shared_watchlist_items
  loop
    -- Skip pairs already migrated, so this file stays re-runnable.
    if exists (
      select 1 from public.watchlist_groups g
      join public.watchlist_group_members a on a.group_id = g.id and a.user_id = r.user_low
      join public.watchlist_group_members b on b.group_id = g.id and b.user_id = r.user_high
      where g.name like 'Shared with %'
    ) then
      continue;
    end if;

    select 'Shared with ' || coalesce(
             (select string_agg(username, ' & ' order by username)
                from public.profiles where id in (r.user_low, r.user_high)),
             'a friend')
      into gname;

    insert into public.watchlist_groups (name, owner_id)
    values (left(gname, 60), r.user_low)
    returning id into gid;

    insert into public.watchlist_group_members (group_id, user_id)
    values (gid, r.user_low), (gid, r.user_high)
    on conflict do nothing;

    insert into public.watchlist_group_items
      (group_id, added_by, media_type, media_id, title, poster_path, status, added_at, watched_at)
    select gid, s.added_by, s.media_type, s.media_id, s.title, s.poster_path,
           s.status, s.added_at, s.watched_at
    from public.shared_watchlist_items s
    where s.user_low = r.user_low and s.user_high = r.user_high
    on conflict do nothing;
  end loop;
end;
$$;
