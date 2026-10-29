-- Strafen: pro Training (oder Match Day) einem Spieler zugeordnet. Idempotent.
-- Eintragen dürfen Strafenchef (Zusatzrolle), Captains und Spielleitung; lesen alle Mitglieder.
-- Eigene Tabelle statt Saison-Daten, weil die Saison-Daten für die Rangliste öffentlich lesbar sind.

alter table public.members add column if not exists strafen boolean not null default false;

-- Spielleitung vergibt/entzieht die Zusatzrolle Strafenchef
create or replace function public.set_strafen(uid uuid, on_strafen boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Rollen vergeben';
  end if;
  update public.members set strafen = on_strafen where user_id = uid;
end $$;
revoke execute on function public.set_strafen(uuid, boolean) from public, anon;
grant execute on function public.set_strafen(uuid, boolean) to authenticated;

-- Darf die angemeldete Person Strafen eintragen?
create or replace function public.can_fine() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role in ('admin', 'captain') or strafen from public.members where user_id = auth.uid()), false)
$$;
revoke execute on function public.can_fine() from public, anon;
grant execute on function public.can_fine() to authenticated;

-- me() liefert zusätzlich die Zusatzrolle Strafenchef
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen,
                           'notify_changes', r.notify_changes, 'resto', r.resto, 'strafen', r.strafen);
end $$;
revoke execute on function public.me() from public, anon;

create table if not exists public.penalties (
  id         bigint generated always as identity primary key,
  d          date not null,                       -- Datum des Trainings / Match Days
  player     text not null check (length(player) between 1 and 80),
  reason     text not null check (length(reason) between 1 and 120),
  amount     numeric(7, 2) not null check (amount >= 0 and amount <= 1000),
  paid       boolean not null default false,
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists penalties_d on public.penalties (d);
alter table public.penalties enable row level security;
revoke all on table public.penalties from anon;

drop policy if exists "Strafen lesen" on public.penalties;
drop policy if exists "Strafen eintragen" on public.penalties;
drop policy if exists "Strafen ändern" on public.penalties;
drop policy if exists "Strafen löschen" on public.penalties;
create policy "Strafen lesen" on public.penalties for select to authenticated using (public.my_role() is not null);
create policy "Strafen eintragen" on public.penalties for insert to authenticated with check (public.can_fine());
create policy "Strafen ändern" on public.penalties for update to authenticated using (public.can_fine()) with check (public.can_fine());
create policy "Strafen löschen" on public.penalties for delete to authenticated using (public.can_fine());
