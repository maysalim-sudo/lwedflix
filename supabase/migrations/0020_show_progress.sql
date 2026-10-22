-- ============================================================
-- 0020: Episode progress that survives the browser
--
-- Watched marks and resume positions lived only in localStorage, so
-- they vanished on a new device, a cleared cache, or a private window.
-- This backs them with the account.
--
-- One JSONB row per (user, show) rather than a row per episode: the
-- client already reads and writes the whole per-show blob at once, so
-- this stores exactly the shape it uses and needs no per-episode
-- round trips. A 60-episode show is a couple of KB.
-- ============================================================

create table if not exists public.show_progress (
  user_id uuid not null references auth.users(id) on delete cascade,
  show_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (user_id, show_id)
);

-- Serves "continue watching" style reads, newest activity first.
create index if not exists show_progress_user_idx
  on public.show_progress (user_id, updated_at desc);

alter table public.show_progress enable row level security;

-- Progress is private. No public or friends-visible branch here: what
-- someone is part-way through is exposed deliberately elsewhere (the
-- presence dock), and that surface has its own incognito control.
drop policy if exists "show_progress_own" on public.show_progress;
create policy "show_progress_own" on public.show_progress for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
