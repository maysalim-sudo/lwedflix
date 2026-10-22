-- ============================================================
-- 0014: Direct messages
--
-- One-to-one only. Group chat would need a members table and a
-- different unread model, and nothing in the app asks for it yet.
--
-- Threads are keyed on the *ordered* user pair rather than an
-- arbitrary id, so "open my thread with X" is a lookup instead of a
-- search, and a pair physically cannot end up with two threads.
-- ============================================================

create table if not exists public.dm_threads (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz not null default now(),
  -- Canonical ordering. Without it (a,b) and (b,a) are different rows
  -- and the unique constraint below buys nothing.
  constraint dm_pair_ordered check (user_a < user_b),
  constraint dm_pair_unique unique (user_a, user_b)
);

create index if not exists dm_threads_user_a_idx on public.dm_threads (user_a, last_message_at desc);
create index if not exists dm_threads_user_b_idx on public.dm_threads (user_b, last_message_at desc);

create table if not exists public.dm_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (length(body) between 1 and 4000),
  created_at timestamptz not null default now()
);

-- Composite: the thread view pages on (created_at, id) for the same
-- reason the feed does — two messages can share a timestamp.
create index if not exists dm_messages_thread_idx
  on public.dm_messages (thread_id, created_at desc, id desc);

-- Read state per person per thread. A single timestamp rather than a
-- per-message read flag: unread count is then one indexed count, and
-- there's no row to write for every message you scroll past.
create table if not exists public.dm_reads (
  thread_id uuid not null references public.dm_threads(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (thread_id, user_id)
);


-- ============================================================
-- Membership helper
-- ============================================================

-- SECURITY DEFINER so evaluating a message's policy doesn't re-run
-- dm_threads' own policy for every row.
create or replace function public.is_dm_member(target_thread uuid)
returns boolean
language sql security definer stable set search_path = public
as $$
  select exists (
    select 1 from public.dm_threads t
    where t.id = target_thread and auth.uid() in (t.user_a, t.user_b)
  );
$$;

revoke execute on function public.is_dm_member(uuid) from public;
grant execute on function public.is_dm_member(uuid) to authenticated;


-- ============================================================
-- RLS
-- ============================================================

alter table public.dm_threads enable row level security;
alter table public.dm_messages enable row level security;
alter table public.dm_reads enable row level security;

drop policy if exists "dm_threads_select" on public.dm_threads;
create policy "dm_threads_select" on public.dm_threads for select to authenticated
  using (auth.uid() in (user_a, user_b));

-- No insert policy: threads are created only through open_dm(), which
-- enforces the friendship rule. A client cannot conjure one directly.

drop policy if exists "dm_messages_select" on public.dm_messages;
create policy "dm_messages_select" on public.dm_messages for select to authenticated
  using (public.is_dm_member(thread_id));

drop policy if exists "dm_messages_insert" on public.dm_messages;
create policy "dm_messages_insert" on public.dm_messages for insert to authenticated
  with check (sender_id = auth.uid() and public.is_dm_member(thread_id));

-- Messages are immutable; deleting your own is allowed.
drop policy if exists "dm_messages_delete" on public.dm_messages;
create policy "dm_messages_delete" on public.dm_messages for delete to authenticated
  using (sender_id = auth.uid());

drop policy if exists "dm_reads_all" on public.dm_reads;
create policy "dm_reads_all" on public.dm_reads for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());


-- ============================================================
-- Open (or find) a thread with someone
-- ============================================================

create or replace function public.open_dm(other_id uuid)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare a uuid; b uuid; tid uuid;
begin
  if other_id is null or other_id = auth.uid() then
    raise exception 'You cannot message yourself';
  end if;

  -- Friends-only, matching every other social surface in the app. This
  -- is also the anti-spam boundary: without it any signed-in account
  -- could message any other.
  if not public.is_friend_with(other_id) then
    raise exception 'You can only message friends';
  end if;

  a := least(auth.uid(), other_id);
  b := greatest(auth.uid(), other_id);

  select id into tid from public.dm_threads where user_a = a and user_b = b;
  if tid is not null then return tid; end if;

  insert into public.dm_threads (user_a, user_b) values (a, b)
  on conflict (user_a, user_b) do nothing
  returning id into tid;

  -- DO NOTHING returns no row when someone else won the race, so re-read.
  if tid is null then
    select id into tid from public.dm_threads where user_a = a and user_b = b;
  end if;

  return tid;
end;
$$;

grant execute on function public.open_dm(uuid) to authenticated;


-- ============================================================
-- Thread list, with the other person and an unread count
-- ============================================================

drop function if exists public.get_dm_threads();
create or replace function public.get_dm_threads()
returns table (
  thread_id uuid,
  other_id uuid,
  username text,
  display_name text,
  avatar_url text,
  last_body text,
  last_sender_id uuid,
  last_message_at timestamptz,
  unread_count bigint
)
language sql security definer stable set search_path = public
as $$
  select
    t.id,
    o.id,
    o.username,
    o.display_name,
    o.avatar_url,
    m.body,
    m.sender_id,
    t.last_message_at,
    coalesce(u.n, 0)
  from public.dm_threads t
  join public.profiles_public o
    on o.id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
  left join lateral (
    select body, sender_id from public.dm_messages
    where thread_id = t.id order by created_at desc, id desc limit 1
  ) m on true
  left join lateral (
    select count(*) as n from public.dm_messages msg
    where msg.thread_id = t.id
      and msg.sender_id <> auth.uid()
      and msg.created_at > coalesce(
        (select last_read_at from public.dm_reads r
          where r.thread_id = t.id and r.user_id = auth.uid()),
        '-infinity'::timestamptz
      )
  ) u on true
  where auth.uid() in (t.user_a, t.user_b)
  order by t.last_message_at desc;
$$;

grant execute on function public.get_dm_threads() to authenticated;


-- ============================================================
-- Messages in one thread, newest-first with a composite cursor
-- ============================================================

drop function if exists public.get_dm_messages(uuid, timestamptz, uuid, int);
create or replace function public.get_dm_messages(
  target_thread uuid,
  before_created timestamptz default null,
  before_id uuid default null,
  page_size int default 40
)
returns table (
  id uuid,
  sender_id uuid,
  body text,
  created_at timestamptz
)
language sql security definer stable set search_path = public
as $$
  select m.id, m.sender_id, m.body, m.created_at
  from public.dm_messages m
  where m.thread_id = target_thread
    and public.is_dm_member(target_thread)
    and (
      before_created is null
      or (m.created_at, m.id) < (before_created, before_id)
    )
  order by m.created_at desc, m.id desc
  limit least(coalesce(page_size, 40), 100);
$$;

grant execute on function public.get_dm_messages(uuid, timestamptz, uuid, int) to authenticated;


-- ============================================================
-- Mark a thread read
-- ============================================================

create or replace function public.mark_dm_read(target_thread uuid)
returns void
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_dm_member(target_thread) then
    raise exception 'Not a member of this conversation';
  end if;

  insert into public.dm_reads (thread_id, user_id, last_read_at)
  values (target_thread, auth.uid(), now())
  on conflict (thread_id, user_id) do update set last_read_at = now();

  -- Clear the conversation's notification too, so the bell and the
  -- thread list can't disagree about what's unread.
  update public.notifications
     set read_at = now()
   where user_id = auth.uid()
     and type = 'dm'
     and thread_id = target_thread
     and read_at is null;
end;
$$;

grant execute on function public.mark_dm_read(uuid) to authenticated;


-- ============================================================
-- Notifications
-- ============================================================

alter table public.notifications
  add column if not exists thread_id uuid references public.dm_threads(id) on delete cascade;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check
  check (type in ('post', 'comment', 'reaction', 'friend_request',
                  'friend_accepted', 'recommendation', 'dm'));

create or replace function public.notify_on_dm()
returns trigger
language plpgsql security definer set search_path = public
as $$
declare other uuid;
begin
  update public.dm_threads
     set last_message_at = new.created_at
   where id = new.thread_id;

  select case when user_a = new.sender_id then user_b else user_a end
    into other
  from public.dm_threads where id = new.thread_id;

  if other is null or other = new.sender_id then
    return new;
  end if;

  -- One live notification per conversation, refreshed rather than
  -- appended: a ten-message burst should read as one unread chat, not
  -- ten separate alerts.
  update public.notifications
     set created_at = new.created_at, actor_id = new.sender_id
   where user_id = other
     and type = 'dm'
     and thread_id = new.thread_id
     and read_at is null;

  if not found then
    insert into public.notifications (user_id, actor_id, type, thread_id)
    values (other, new.sender_id, 'dm', new.thread_id);
  end if;

  return new;
end;
$$;

drop trigger if exists dm_message_notify on public.dm_messages;
create trigger dm_message_notify
  after insert on public.dm_messages
  for each row execute function public.notify_on_dm();


-- ============================================================
-- Realtime
-- ============================================================

do $$
declare t text;
begin
  foreach t in array array['dm_messages', 'dm_threads'] loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = t
    ) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;
