-- ============================================================
-- FIX: accept_invite() fails with
--   "there is no unique or exclusion constraint matching the
--    ON CONFLICT specification"
--
-- Run this after 0001 and 0002. It is a single small paste.
--
-- Cause: 0001's accept_invite used
--     on conflict (least(requester_id, addressee_id),
--                  greatest(requester_id, addressee_id))
-- to target the unique_friend_pair index. But that index is PARTIAL:
--
--     create unique index unique_friend_pair on public.friend_requests
--       (least(...), greatest(...))
--       where status in ('pending', 'accepted');   <-- predicate
--
-- Postgres will not infer a partial index from a conflict target unless
-- the index's predicate is restated in the ON CONFLICT clause. Without
-- it, inference finds no matching constraint and the whole statement
-- fails at runtime — which is why redeeming an invite link errored.
--
-- Adding `where status in ('pending','accepted')` to the clause would
-- work, but ON CONFLICT inference against a partial index over
-- expressions is needlessly delicate to rely on. This rewrites the
-- function to look the row up explicitly instead: same behaviour,
-- obvious to read, and it still handles the race via the unique index.
-- ============================================================

create or replace function public.accept_invite(invite_code_input text)
returns table (friend_id uuid, friend_username text, friend_display_name text)
language plpgsql security definer set search_path = public
as $$
declare
  target_id uuid;
  existing_id uuid;
begin
  select id into target_id from public.profiles where invite_code = invite_code_input;

  if target_id is null then
    raise exception 'Invalid invite code';
  end if;
  if target_id = auth.uid() then
    raise exception 'Cannot invite yourself';
  end if;

  -- Any live relationship, in either direction. Declined rows are
  -- ignored on purpose: the partial index excludes them too, so a
  -- re-invite after a decline is allowed to create a fresh row.
  select fr.id into existing_id
  from public.friend_requests fr
  where fr.status in ('pending', 'accepted')
    and ((fr.requester_id = auth.uid() and fr.addressee_id = target_id)
      or (fr.requester_id = target_id and fr.addressee_id = auth.uid()))
  limit 1;

  if existing_id is not null then
    -- Covers "they already sent me a request and I redeemed their link
    -- instead of pressing Accept", and re-clicking a link when already
    -- friends (a harmless no-op write).
    update public.friend_requests
       set status = 'accepted', responded_at = now()
     where id = existing_id;
  else
    begin
      insert into public.friend_requests (requester_id, addressee_id, status, responded_at)
      values (auth.uid(), target_id, 'accepted', now());
    exception when unique_violation then
      -- Lost a race between the SELECT above and this INSERT. The row
      -- now exists, so converge on the same outcome as the branch above.
      update public.friend_requests
         set status = 'accepted', responded_at = now()
       where status in ('pending', 'accepted')
         and ((requester_id = auth.uid() and addressee_id = target_id)
           or (requester_id = target_id and addressee_id = auth.uid()));
    end;
  end if;

  return query
    select p.id, p.username, p.display_name
    from public.profiles p
    where p.id = target_id;
end;
$$;

grant execute on function public.accept_invite(text) to authenticated;
