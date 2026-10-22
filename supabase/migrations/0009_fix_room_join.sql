-- ============================================================
-- FIX: joining a watch room fails with HTTP 403.
--
-- Run after 0008. One small paste.
--
-- Cause: watch_room_members_select was
--     using (public.is_room_member(room_id))
-- which is circular at exactly the moment it matters. Joining upserts
-- your membership row, and ON CONFLICT DO UPDATE requires SELECT on the
-- conflicting row — but is_room_member() is STABLE, so it evaluates
-- against the snapshot from the start of the statement and cannot see
-- the row being written. You are not yet a member, so the policy denies
-- reading the very row that would make you one.
--
-- Fix: you can always see your OWN membership row. Seeing everyone
-- else's still requires membership, so nothing is widened beyond the
-- row the caller already owns.
-- ============================================================

drop policy if exists "watch_room_members_select" on public.watch_room_members;
create policy "watch_room_members_select" on public.watch_room_members
  for select to authenticated
  using (user_id = auth.uid() or public.is_room_member(room_id));
