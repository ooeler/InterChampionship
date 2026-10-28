-- Verbesserungsvorschläge: werden in der App gespeichert und von GitHub Actions als Issues angelegt
-- (kein persönliches GitHub-Token nötig). Idempotent.
create table if not exists public.feedback (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  title        text not null,
  body         text not null,
  labels       text[] not null default '{}',
  status       text not null default 'neu' check (status in ('neu', 'erfasst', 'fehler')),
  issue_number int,
  issue_url    text,
  error        text,
  created_at   timestamptz not null default now()
);
create index if not exists feedback_status on public.feedback (status, created_at);
alter table public.feedback enable row level security;

-- Jede Person sieht den Status ihrer eigenen Vorschläge; geschrieben wird nur serverseitig
drop policy if exists "Eigene Vorschläge lesen" on public.feedback;
create policy "Eigene Vorschläge lesen" on public.feedback
  for select to authenticated using (user_id = auth.uid());
