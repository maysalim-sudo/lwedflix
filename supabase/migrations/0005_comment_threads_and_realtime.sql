-- ============================================================
-- Comment replies, comment reactions, and realtime for the feed.
--
-- Run after 0004. Single paste, safe to re-run.
-- ============================================================


-- ============================================================
-- 1. Replies
--
-- One level only: a reply points at a top-level comment, and replies to
-- replies re-target the same parent. Arbitrary nesting needs recursive
-- queries and indentation rules for a thread nobody asked to be deep.
-- ============================================================

alter table public.post_comments
  add column if not exists parent_id uuid references public.post_comments(id) on delete cascade;

create index if not exists post_comments_parent_idx
  on public.post_comments (parent_id, created_at) where parent_id is not null;


-- ============================================================
-- 2. Comment reactions
-- ============================================================

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.post_comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  reaction text not null check (reaction in ('like', 'love', 'laugh', 'wow', 'sad')),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);

create index if not exists comment_reactions_user_idx on public.comment_reactions (user_id);

alter table public.comment_reactions enable row level security;

-- Visibility is inherited from the comment's post, so a reaction can
-- never be more visible than the thing it's attached to.
create or replace function public.can_see_comment(target_comment uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.post_comments c
    where c.id = target_comment and public.can_see_post(c.post_id)
  );
$$;

grant execute on function public.can_see_comment(uuid) to authenticated;

drop policy if exists "comment_reactions_select" on public.comment_reactions;
create policy "comment_reactions_select" on public.comment_reactions
  for select to authenticated using (public.can_see_comment(comment_id));

drop policy if exists "comment_reactions_insert" on public.comment_reactions;
create policy "comment_reactions_insert" on public.comment_reactions
  for insert to authenticated
  with check (user_id = auth.uid() and public.can_see_comment(comment_id));

-- Same reasoning as post_reactions: .upsert() emits ON CONFLICT DO UPDATE,
-- which needs this policy's USING to pass. Without it, setting a reaction
-- works but SWITCHING it fails.
drop policy if exists "comment_reactions_update" on public.comment_reactions;
create policy "comment_reactions_update" on public.comment_reactions
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid() and public.can_see_comment(comment_id));

drop policy if exists "comment_reactions_delete" on public.comment_reactions;
create policy "comment_reactions_delete" on public.comment_reactions
  for delete to authenticated using (user_id = auth.uid());

-- Notify the comment's author when someone reacts to it.
create or replace function public.notify_on_comment_reaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare
  comment_author uuid;
  parent_post uuid;
  existing_id uuid;
begin
  select user_id, post_id into comment_author, parent_post
  from public.post_comments where id = new.comment_id;

  if comment_author is null or comment_author = new.user_id then
    return new;
  end if;

  -- Switching a reaction updates the existing notification rather than
  -- stacking a new one, matching the post-reaction behaviour.
  select id into existing_id from public.notifications
   where user_id = comment_author and actor_id = new.user_id
     and type = 'reaction' and comment_id = new.comment_id
   limit 1;

  if existing_id is not null then
    update public.notifications
       set reaction = new.reaction, created_at = now(), read_at = null
     where id = existing_id;
  else
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id, reaction)
    values (comment_author, new.user_id, 'reaction', parent_post, new.comment_id, new.reaction);
  end if;

  return new;
end;
$$;

drop trigger if exists comment_reactions_notify on public.comment_reactions;
create trigger comment_reactions_notify
  after insert or update on public.comment_reactions
  for each row execute function public.notify_on_comment_reaction();

-- A reply should notify the comment author, not just the post owner
-- (0002's notify_on_comment already covers the post owner).
create or replace function public.notify_on_reply()
returns trigger language plpgsql security definer set search_path = public
as $$
declare parent_author uuid;
begin
  if new.parent_id is null then
    return new;
  end if;

  select user_id into parent_author from public.post_comments where id = new.parent_id;

  if parent_author is not null and parent_author <> new.user_id then
    insert into public.notifications (user_id, actor_id, type, post_id, comment_id)
    values (parent_author, new.user_id, 'comment', new.post_id, new.id);
  end if;

  return new;
end;
$$;

drop trigger if exists post_comments_notify_reply on public.post_comments;
create trigger post_comments_notify_reply
  after insert on public.post_comments
  for each row execute function public.notify_on_reply();


-- ============================================================
-- 3. Realtime for the feed
--
-- 0002 only published `notifications`. Without these, a postgres_changes
-- subscription on posts/comments/reactions silently receives nothing —
-- the single most common realtime failure.
--
-- RLS still applies to the stream, so a subscriber is only ever sent
-- rows they could have selected anyway.
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['posts', 'post_comments', 'post_reactions', 'comment_reactions'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
