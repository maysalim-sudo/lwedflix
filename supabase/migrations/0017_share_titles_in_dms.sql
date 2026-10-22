-- ============================================================
-- 0017: Share a movie or show inside a DM
--
-- Mirrors the attachment block already on `posts`, so a shared title
-- renders as a card rather than a bare link. Body becomes optional
-- when an attachment is present.
-- ============================================================

alter table public.dm_messages
  add column if not exists media_type text,
  add column if not exists media_id text,
  add column if not exists media_title text,
  add column if not exists poster_path text,
  add column if not exists season int,
  add column if not exists episode int;

alter table public.dm_messages drop constraint if exists dm_media_type_valid;
alter table public.dm_messages add constraint dm_media_type_valid
  check (media_type is null or media_type in ('movie', 'tv'));

alter table public.dm_messages drop constraint if exists dm_media_pair;
alter table public.dm_messages add constraint dm_media_pair check (
  (media_type is null and media_id is null) or (media_type is not null and media_id is not null)
);

-- The original CHECK required 1..4000 characters. A message that is only
-- a shared title has no body at all.
alter table public.dm_messages drop constraint if exists dm_messages_body_check;
alter table public.dm_messages alter column body set default '';
alter table public.dm_messages alter column body drop not null;

alter table public.dm_messages drop constraint if exists dm_message_not_empty;
alter table public.dm_messages add constraint dm_message_not_empty check (
  char_length(btrim(coalesce(body, ''))) between 1 and 4000
  or media_id is not null
);


-- ============================================================
-- get_dm_messages returns the attachment
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
  created_at timestamptz,
  media_type text,
  media_id text,
  media_title text,
  poster_path text,
  season int,
  episode int
)
language sql security definer stable set search_path = public
as $$
  select m.id, m.sender_id, coalesce(m.body, ''), m.created_at,
         m.media_type, m.media_id, m.media_title, m.poster_path,
         m.season, m.episode
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
-- Thread list preview: describe an attachment-only message
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
    -- A title-only message would otherwise preview as an empty line.
    case
      when char_length(btrim(coalesce(m.body, ''))) > 0 then m.body
      when m.media_title is not null then '🎬 ' || m.media_title
      else null
    end,
    m.sender_id,
    t.last_message_at,
    coalesce(u.n, 0)
  from public.dm_threads t
  join public.profiles_public o
    on o.id = case when t.user_a = auth.uid() then t.user_b else t.user_a end
  left join lateral (
    select body, sender_id, media_title from public.dm_messages
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
