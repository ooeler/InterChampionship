-- Einladungslinks statt Mail: einmalig verwendbar, 7 Tage gültig. Gespeichert wird nur der Hash des Tokens.
-- Nur die Edge Function "invite" (Service Role) liest und schreibt hier. Idempotent.
create table if not exists public.invites (
  id          bigint generated always as identity primary key,
  token_hash  text not null unique,
  role        text not null default 'player' check (role in ('admin', 'captain', 'player')),
  player      text,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  used_at     timestamptz,
  used_by     uuid references auth.users(id) on delete set null
);
alter table public.invites enable row level security;
revoke all on table public.invites from anon, authenticated;
