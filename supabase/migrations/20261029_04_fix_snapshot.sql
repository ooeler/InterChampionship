-- Fix: snapshot_league brach mit "column reference reason is ambiguous" ab, weil der Parameter
-- "reason" gleich heisst wie die Spalte league_state_history.reason (betraf tägliches Backup,
-- "Jetzt sichern" und das Backup vor Releases). Signatur bleibt gleich, Aufrufer müssen nichts ändern.
create or replace function public.snapshot_league(reason text default 'manuell') returns bigint
language plpgsql security definer set search_path = public as $$
#variable_conflict use_column
declare hid bigint; why text := coalesce(nullif(trim(snapshot_league.reason), ''), 'manuell');
begin
  if auth.uid() is not null and public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Backups anlegen';
  end if;
  insert into public.league_state_history (state_id, data, updated_by, reason)
  select s.id, s.data, s.updated_by, why from public.league_state s where s.id = 'main'
  returning id into hid;
  delete from public.league_state_history h where h.reason = 'täglich' and h.saved_at < now() - interval '90 days';
  return hid;
end $$;
revoke execute on function public.snapshot_league(text) from anon;
