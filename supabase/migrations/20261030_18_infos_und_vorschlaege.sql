-- Infos in den Saison-Daten (S.info): nur die Spielleitung darf sie ändern. Idempotent.
-- Andere Clients senden immer den ganzen Stand. Darum wird ein abweichender Text still auf den alten Stand gesetzt,
-- statt ihr Speichern abzulehnen (sonst scheitert z. B. ein Captain mit veraltetem Stand).
create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin'
     and new.data->'info' is distinct from old.data->'info' then
    new.data := case when old.data ? 'info' then jsonb_set(new.data, '{info}', old.data->'info') else new.data - 'info' end;
  end if;
  if auth.uid() is null or public.my_role() in ('admin', 'captain') then return new; end if;
  if tg_op = 'INSERT' then
    -- Die App speichert per Upsert: BEFORE INSERT feuert auch, wenn die Zeile schon existiert.
    -- Dann prüft anschliessend der UPDATE-Zweig.
    if exists (select 1 from public.league_state where id = new.id) then return new; end if;
    raise exception 'Nur Admins und Captains dürfen die Saison anlegen';
  end if;
  if new.data->'t' is distinct from old.data->'t'
     or new.data->'sn' is distinct from old.data->'sn'
     or new.data->'logo' is distinct from old.data->'logo'
     or new.data->'sp' is distinct from old.data->'sp' then
    raise exception 'Nur Admins und Captains dürfen Teams und Einstellungen ändern';
  end if;
  if jsonb_path_query_array(new.data, '$.m[*].tr[*].d') is distinct from jsonb_path_query_array(old.data, '$.m[*].tr[*].d')
     or jsonb_path_query_array(new.data, '$.m[*].tr[*].t') is distinct from jsonb_path_query_array(old.data, '$.m[*].tr[*].t') then
    raise exception 'Nur Admins und Captains dürfen Trainingsdaten ändern';
  end if;
  return new;
end $$;

-- Vorschläge: umgesetzt (Person wird informiert) oder geschlossen (ohne Nachricht)
alter table public.feedback drop constraint if exists feedback_status_check;
alter table public.feedback add constraint feedback_status_check
  check (status in ('neu', 'erfasst', 'fehler', 'umgesetzt', 'geschlossen'));
