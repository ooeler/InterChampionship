-- Abmeldegründe: Pflichtangabe beim eigenen Abmelden. Idempotent.
-- Eigene Tabelle statt Saison-Daten, weil die Saison-Daten für die Rangliste öffentlich lesbar sind
-- und Gründe heikel sein können (z. B. Krankheit). Lesen dürfen alle Mitglieder, öffentlich niemand;
-- ändern dürfen die Person selbst, Captains und Spielleitung.

create or replace function public.my_player() returns text
language sql stable security definer set search_path = public as $$
  select player from public.members where user_id = auth.uid()
$$;
revoke execute on function public.my_player() from public, anon;
grant execute on function public.my_player() to authenticated;

create table if not exists public.absence_reasons (
  d          date not null,
  player     text not null,
  reason     text not null check (length(trim(reason)) between 3 and 200),
  user_id    uuid default auth.uid() references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (d, player)
);
alter table public.absence_reasons enable row level security;
revoke all on table public.absence_reasons from anon;

drop policy if exists "Abmeldegrund lesen" on public.absence_reasons;
drop policy if exists "Abmeldegrund eintragen" on public.absence_reasons;
drop policy if exists "Abmeldegrund ändern" on public.absence_reasons;
drop policy if exists "Abmeldegrund löschen" on public.absence_reasons;
create policy "Abmeldegrund lesen" on public.absence_reasons for select to authenticated
  using (public.my_role() is not null);
create policy "Abmeldegrund eintragen" on public.absence_reasons for insert to authenticated
  with check (player = public.my_player() or public.my_role() in ('admin', 'captain'));
create policy "Abmeldegrund ändern" on public.absence_reasons for update to authenticated
  using (player = public.my_player() or public.my_role() in ('admin', 'captain'))
  with check (player = public.my_player() or public.my_role() in ('admin', 'captain'));
create policy "Abmeldegrund löschen" on public.absence_reasons for delete to authenticated
  using (player = public.my_player() or public.my_role() in ('admin', 'captain'));

-- Beim Umbenennen eines Spielers bleiben auch die Gründe zugeordnet
create or replace function public.rename_player(old_name text, new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'captain') then return; end if;
  update public.members set player = new_name where player = old_name;
  update public.absence_reasons set player = new_name where player = old_name;
end $$;
