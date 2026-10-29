-- Security-Assessment Oktober 2026. Idempotent.
--
-- 1) Funktionsrechte: In Postgres darf PUBLIC (also auch "anon" = nicht angemeldet) standardmässig jede
--    Funktion ausführen. "revoke … from anon" allein reichte deshalb nicht: Ohne Login konnte man z. B.
--    call_notify aufrufen (Push-Nachrichten auslösen) oder snapshot_league (Backups ohne Ende anlegen).
revoke execute on function public.my_role()                         from public, anon;
revoke execute on function public.me()                              from public, anon;
revoke execute on function public.set_member(uuid, text, text)      from public, anon;
revoke execute on function public.rename_player(text, text)         from public, anon;
revoke execute on function public.snapshot_league(text)             from public, anon;
revoke execute on function public.restore_league_state(bigint)      from public, anon;
revoke execute on function public.set_notify(boolean)               from public, anon;
revoke execute on function public.set_resto(uuid, boolean)          from public, anon;
revoke execute on function public.call_notify(text)                 from public, anon, authenticated;
grant execute on function public.my_role(), public.me(), public.set_member(uuid, text, text),
  public.rename_player(text, text), public.snapshot_league(text), public.restore_league_state(bigint),
  public.set_notify(boolean), public.set_resto(uuid, boolean) to authenticated, service_role;

-- Neue Funktionen sind künftig nicht mehr automatisch für alle ausführbar
alter default privileges in schema public revoke execute on functions from public;
alter default privileges in schema public revoke execute on functions from anon;

-- 2) Trainingsdaten: Datum und Beginn dürfen nur Spielleitung und Captains ändern (bisher nur in der App geprüft).
create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
