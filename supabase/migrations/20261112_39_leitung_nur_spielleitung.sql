-- Trainingsleitung nur durch die Spielleitung (Entscheid Spielleitung):
--   keep_leads (neu): vergleicht tr[].lead pro Training mit dem bisherigen Stand (gleiches Datum, sonst gleiche Stelle =
--     verschobenes Training, sonst keine Leitung = neues Training). Eine Änderung bleibt nur, wenn
--       - die neue Leitung die Person selbst ist (my_player(): „Ich leite“ / „Übernehmen“), oder
--       - die bisherige Leitung die Person selbst war und die neue leer ist („Abgeben“), oder
--       - ein Captain einen Spieler umbenennt oder entfernt: die bisherige Leitung ist kein Spieler der Teams mehr und die
--         neue leer oder ein Spieler der Teams (Teams ändern dürfen nur Spielleitung und Captains).
--     Sonst gilt still wieder die bisherige Leitung (wie Restaurants und Event-Daten). Gilt auch für den Sommer Event (evt).
--   guard_league_state: ruft keep_leads für alle ausser der Spielleitung auf; sonst unverändert wie 20261110_38.
-- Die Fristen für den Status (Verspätet bis 30 Min., Abmelden bis 23 h vor Beginn) prüft wie bisher nur die App.
-- Idempotent.

create or replace function public.keep_leads(alt jsonb, neu jsonb, ich text, cap boolean) returns jsonb
language plpgsql immutable set search_path = public as $$
declare i int; j int; d text; a text; n text; da boolean; pfad text[]; sp jsonb;
begin
  ich := nullif(ich, '');
  -- Spieler der (neuen) Teams
  select coalesce(jsonb_agg(e), '[]'::jsonb) into sp
  from jsonb_array_elements(case when jsonb_typeof(neu->'t') = 'array' then neu->'t' else '[]'::jsonb end) t,
    jsonb_array_elements(case when jsonb_typeof(t->'p') = 'array' then t->'p' else '[]'::jsonb end) e
  where jsonb_typeof(e) = 'string';
  for i in 0 .. coalesce(jsonb_array_length(neu->'m'), 0) - 1 loop
    for j in 0 .. coalesce(jsonb_array_length(neu#>array['m', i::text, 'tr']), 0) - 1 loop
      pfad := array['m', i::text, 'tr', j::text];
      d := neu#>>(pfad || 'd'::text);
      n := nullif(neu#>>(pfad || 'lead'::text), '');
      -- bisherige Leitung: Training mit gleichem Datum, sonst an gleicher Stelle (verschoben), sonst keine (neu)
      da := null; a := null;
      select true, t->>'lead' into da, a
      from jsonb_array_elements(case when jsonb_typeof(alt->'m') = 'array' then alt->'m' else '[]'::jsonb end) m,
        jsonb_array_elements(case when jsonb_typeof(m->'tr') = 'array' then m->'tr' else '[]'::jsonb end) t
      where jsonb_typeof(t) = 'object' and t->>'d' = d limit 1;
      if not coalesce(da, false) then a := alt#>>(pfad || 'lead'::text); end if;
      a := nullif(a, '');
      if n is not distinct from a
         or (ich is not null and n = ich)
         or (ich is not null and a = ich and n is null)
         or (cap and a is not null and not (sp ? a) and (n is null or (sp ? n))) then continue; end if;
      neu := case when a is null then neu #- (pfad || 'lead'::text) else jsonb_set(neu, pfad || 'lead'::text, to_jsonb(a)) end;
    end loop;
  end loop;
  -- Sommer Event (evt): gleiche Regel
  if jsonb_typeof(neu->'evt') = 'object' then
    n := nullif(neu#>>'{evt,lead}', '');
    a := nullif(alt#>>'{evt,lead}', '');
    if not coalesce(n is not distinct from a
       or (ich is not null and n = ich)
       or (ich is not null and a = ich and n is null)
       or (cap and a is not null and not (sp ? a) and (n is null or (sp ? n))), false) then
      neu := case when a is null then neu #- '{evt,lead}' else jsonb_set(neu, '{evt,lead}', to_jsonb(a)) end;
    end if;
  end if;
  return neu;
end $$;
revoke execute on function public.keep_leads(jsonb, jsonb, text, boolean) from public, anon, authenticated;

create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text; k text;
begin
  if auth.uid() is not null then
    if new.id <> 'main' or (tg_op = 'UPDATE' and new.id <> old.id) then raise exception 'Ungültige Daten: Zeile'; end if;
    p := public.league_problem(new.data);
    if p is not null then raise exception 'Ungültige Daten: %', p; end if;
    -- nicht vom Client übernehmen; null bleibt: so löst "on delete set null" die Verknüpfung zum gelöschten Konto
    if new.updated_by is not null then new.updated_by := auth.uid(); end if;
    new.client := left(new.client, 40);
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin'
     and new.data->'info' is distinct from old.data->'info' then
    new.data := case when old.data ? 'info' then jsonb_set(new.data, '{info}', old.data->'info') else new.data - 'info' end;
  end if;
  -- Event-Daten (wev Winter Event, sev Sommer Event) ändern nur Spielleitung und Captains; andere Änderungen werden still verworfen (wie info)
  if tg_op = 'UPDATE' and auth.uid() is not null and coalesce(public.my_role(), '') not in ('admin', 'captain') then
    foreach k in array array['wev', 'sev'] loop
      if new.data->k is distinct from old.data->k then
        new.data := case when old.data ? k then jsonb_set(new.data, array[k], old.data->k) else new.data - k end;
      end if;
    end loop;
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin'
     and not coalesce((select resto from public.members where user_id = auth.uid()), false) then
    new.data := public.keep_restaurants(old.data, new.data);
  end if;
  -- Trainingsleitung (20261112_39): einteilen kann nur die Spielleitung. Alle anderen (auch Captains) tragen nur sich selbst ein
  -- oder wieder aus; andere Änderungen von tr[].lead werden still verworfen (wie Restaurants, pro Training über das Datum)
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin' then
    new.data := public.keep_leads(old.data, new.data, public.my_player(), coalesce(public.my_role() = 'captain', false));
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
