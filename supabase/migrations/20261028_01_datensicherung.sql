-- Datensicherung & Rollback für die Saison-Daten.
-- Idempotent: kann mehrfach ausgeführt werden.
--   * Jede Änderung sichert den vorherigen Stand (max. eine Version pro 10 Minuten, die letzten 500)
--   * snapshot_league(reason): manuelles / tägliches / Release-Backup
--   * restore_league_state(hid): Spielleitung stellt eine Version wieder her (aktueller Stand wird vorher gesichert)

create table if not exists public.league_state_history (
  id         bigint generated always as identity primary key,
  state_id   text not null,
  data       jsonb not null,
  updated_by uuid,
  reason     text not null default 'Änderung',
  saved_at   timestamptz not null default now()
);
create index if not exists league_state_history_saved_at on public.league_state_history (saved_at desc);
alter table public.league_state_history enable row level security;

drop policy if exists "Verlauf: nur Spielleitung" on public.league_state_history;
create policy "Verlauf: nur Spielleitung" on public.league_state_history
  for select to authenticated using (public.my_role() = 'admin');

-- Vor jeder Änderung den alten Stand sichern (gedrosselt, damit +/- Klicks den Verlauf nicht fluten)
create or replace function public.keep_league_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not exists (
    select 1 from public.league_state_history
    where state_id = old.id and reason = 'Änderung' and saved_at > now() - interval '10 minutes'
  ) then
    insert into public.league_state_history (state_id, data, updated_by, reason)
    values (old.id, old.data, old.updated_by, 'Änderung');
    delete from public.league_state_history where id in (
      select id from public.league_state_history where reason = 'Änderung'
      order by saved_at desc offset 500);
  end if;
  return new;
end $$;
drop trigger if exists keep_league_history on public.league_state;
create trigger keep_league_history before update on public.league_state
  for each row when (old.data is distinct from new.data) execute function public.keep_league_history();

-- Backup anlegen. Erlaubt für die Spielleitung und serverseitig (Cron, Release über die Edge Function "ops").
create or replace function public.snapshot_league(reason text default 'manuell') returns bigint
language plpgsql security definer set search_path = public as $$
declare hid bigint;
begin
  if auth.uid() is not null and public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Backups anlegen';
  end if;
  insert into public.league_state_history (state_id, data, updated_by, reason)
  select id, data, updated_by, coalesce(nullif(trim(reason), ''), 'manuell') from public.league_state where id = 'main'
  returning id into hid;
  delete from public.league_state_history where reason = 'täglich' and saved_at < now() - interval '90 days';
  return hid;
end $$;
revoke execute on function public.snapshot_league(text) from anon;

-- Version wiederherstellen (nur Spielleitung)
create or replace function public.restore_league_state(hid bigint) returns void
language plpgsql security definer set search_path = public as $$
declare d jsonb;
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Daten wiederherstellen';
  end if;
  select data into d from public.league_state_history where id = hid;
  if d is null then raise exception 'Version % nicht gefunden', hid; end if;
  perform public.snapshot_league('vor Wiederherstellung');
  update public.league_state set data = d, client = 'restore', updated_by = auth.uid(), updated_at = now() where id = 'main';
end $$;
revoke execute on function public.restore_league_state(bigint) from anon;

-- Tägliches Backup um 02:30 UTC
create extension if not exists pg_cron;
select cron.unschedule('daily-backup') where exists (select 1 from cron.job where jobname = 'daily-backup');
select cron.schedule('daily-backup', '30 2 * * *', $$ select public.snapshot_league('täglich') $$);
