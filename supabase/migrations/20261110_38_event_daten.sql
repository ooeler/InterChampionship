-- Event-Daten der Spielleitung: Winter Event (wev) und Sommer Event (sev) als Datum „YYYY-MM-DD“ in der Saison-Zeile.
-- Fehlt das Feld, gilt das berechnete Datum (2. Mittwoch im Dezember bzw. 1. Freitag im Mai).
--   league_problem: wev/sev fehlen, sind null oder ein Datum (sonst „Ungültige Daten: Event-Datum“); sonst unverändert wie 20261031_23
--   guard_league_state: wev/sev ändern nur Spielleitung und Captains, Änderungen anderer werden still verworfen (wie info); sonst unverändert wie 20261031_23
--   public_league: gibt zusätzlich wev und sev aus (Besucher sehen das gewählte Event-Datum); sonst unverändert wie 20261109_37, Rechte unverändert
-- Idempotent.

create or replace function public.league_problem(d jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare t jsonb; m jsonb; x jsonb; p text;
begin
  if jsonb_typeof(d) is distinct from 'object' then return 'Saison'; end if;
  if octet_length(d::text) > 3000000 then return 'Saison zu gross'; end if;
  if not is_none(d->'v') and not (is_count(d->'v', league_version()) and (d->>'v')::int >= 1) then return 'Formatversion'; end if;
  if not is_none(d->'sn') and jsonb_typeof(d->'sn') <> 'string' then return 'Saisonname'; end if;
  if jsonb_typeof(d->'t') is distinct from 'array' or jsonb_array_length(d->'t') <> 2 then return 'Teams'; end if;
  for t in select * from jsonb_array_elements(d->'t') loop
    if jsonb_typeof(t) <> 'object' or jsonb_typeof(t->'n') is distinct from 'string' or not coalesce(is_str_list(t->'p'), false) then return 'Teams'; end if;
    if not is_none(t->'c') and jsonb_typeof(t->'c') <> 'string' then return 'Captain'; end if;
    if not is_none(t->'gk') and not coalesce(is_str_list(t->'gk'), false) then return 'Torhüter'; end if;
  end loop;
  if jsonb_typeof(d->'m') is distinct from 'array' or jsonb_array_length(d->'m') <> 8 then return 'Spieltage'; end if;
  for m in select * from jsonb_array_elements(d->'m') loop
    if jsonb_typeof(m) <> 'object' then return 'Spieltag'; end if;
    if jsonb_typeof(m->'res') is distinct from 'array' or jsonb_array_length(m->'res') <> 2
       or exists (select 1 from jsonb_array_elements(m->'res') e where jsonb_typeof(e) <> 'null' and not is_count(e, 999)) then return 'Resultat'; end if;
    if jsonb_typeof(m->'pre') is distinct from 'array' or jsonb_array_length(m->'pre') <> 2
       or exists (select 1 from jsonb_array_elements(m->'pre') e where not is_count(e, 3)) then return 'Pre-Game-Siege'; end if;
    if not is_none(m->'g') and not coalesce(is_count_map(m->'g'), false) then return 'Tore'; end if;
    if not is_none(m->'a') and not coalesce(is_count_map(m->'a'), false) then return 'Assists'; end if;
    if not is_none(m->'base') and not coalesce(is_count_map(m->'base'), false) then return 'Grundwerte'; end if;
    if not is_none(m->'ref') and jsonb_typeof(m->'ref') <> 'string' then return 'Schiedsrichter'; end if;
    if not is_none(m->'ff') and m->'ff' not in ('0'::jsonb, '1'::jsonb) then return 'Forfait'; end if;
    if not is_none(m->'kp') and (jsonb_typeof(m->'kp') <> 'array'
       or exists (select 1 from jsonb_array_elements(m->'kp') e where not is_none(e) and not coalesce(is_str_list(e), false))) then return 'Torhüter'; end if;
    if not is_none(m->'gs') and (jsonb_typeof(m->'gs') <> 'array'
       or exists (select 1 from jsonb_array_elements(m->'gs') g where jsonb_typeof(g) <> 'object'
         or jsonb_typeof(g->'n') is distinct from 'string' or jsonb_typeof(g->'k') is distinct from 'string' or coalesce(g->'t', 'null'::jsonb) not in ('0'::jsonb, '1'::jsonb))) then return 'Gäste'; end if;
    if jsonb_typeof(m->'tr') is distinct from 'array' then return 'Trainings'; end if;
    for x in select * from jsonb_array_elements(m->'tr') loop
      p := training_problem(x);
      if p is not null then return p; end if;
    end loop;
  end loop;
  -- Event-Daten der Spielleitung (Winter Event, Sommer Event): fehlt/null oder ein Datum
  if not is_none(d->'wev') and coalesce(d->>'wev', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Event-Datum'; end if;
  if not is_none(d->'sev') and coalesce(d->>'sev', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Event-Datum'; end if;
  if not is_none(d->'evt') then
    p := training_problem(d->'evt');
    if p is not null then return p; end if;
  end if;
  return null;
end $$;
revoke execute on function public.league_problem(jsonb) from public, anon, authenticated;

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

create or replace function public.public_league() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (
    select data as d, to_char((now() at time zone 'Europe/Zurich')::date, 'YYYY-MM-DD') as heute
    from public.league_state where id = 'main'
  ),
  -- Spieler der Teams (wie allP() in der App)
  sp as (
    select distinct e #>> '{}' as p
    from s,
      jsonb_array_elements(case when jsonb_typeof(s.d->'t') = 'array' then s.d->'t' else '[]'::jsonb end) t,
      jsonb_array_elements(case when jsonb_typeof(t->'p') = 'array' then t->'p' else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'string'
  ),
  mo as (
    select b.m, b.i
    from s, jsonb_array_elements(case when jsonb_typeof(s.d->'m') = 'array' then s.d->'m' else '[]'::jsonb end) with ordinality b(m, i)
  ),
  -- Gültige Trainings (wie isTr() in der App) mit der Anzahl Anwesender
  tr as (
    select mo.i, a.j, a.x, a.x->>'d' as d,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(a.x->'p') = 'array' then a.x->'p' else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'string') as n
    from mo, jsonb_array_elements(case when jsonb_typeof(mo.m->'tr') = 'array' then mo.m->'tr' else '[]'::jsonb end) with ordinality a(x, j)
    where jsonb_typeof(a.x) = 'object' and jsonb_typeof(a.x->'d') = 'string' and (a.x->>'d') ~ '^\d{4}-\d{2}-\d{2}$'
  )
  select jsonb_build_object(
    'v', s.d->'v', 'sn', s.d->'sn', 't', s.d->'t', 'logo', s.d->'logo', 'sp', s.d->'sp', 'info', s.d->'info', 'wev', s.d->'wev', 'sev', s.d->'sev',
    'evt', case when jsonb_typeof(s.d->'evt') = 'object' then jsonb_only(s.d->'evt', array['d', 't']) end,
    'm', (select coalesce(jsonb_agg(
            jsonb_only(mo.m, array['res', 'pre', 'g', 'a', 'base', 'ff']) || jsonb_build_object(
              'gs', (select coalesce(jsonb_agg(jsonb_only(g, array['n', 'k', 't', 'gk']) order by o), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(mo.m->'gs') = 'array' then mo.m->'gs' else '[]'::jsonb end) with ordinality q(g, o)
                     where jsonb_typeof(g) = 'object'),
              'kp', (select jsonb_agg((
                       case when jsonb_typeof(mo.m->'kp') = 'array' and jsonb_typeof(mo.m->'kp'->tt) is distinct from 'null' and (mo.m->'kp'->tt) is not null
                       then (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                             from jsonb_array_elements(case when jsonb_typeof(mo.m->'kp'->tt) = 'array' then mo.m->'kp'->tt else '[]'::jsonb end) with ordinality q(e, o)
                             where jsonb_typeof(e) = 'string')
                       else (
                         with g as (
                           select e #>> '{}' as p, o
                           from jsonb_array_elements(case when jsonb_typeof(s.d->'t'->tt->'gk') = 'array' then s.d->'t'->tt->'gk' else '[]'::jsonb end) with ordinality q(e, o)
                           where jsonb_typeof(e) = 'string'
                           union all
                           select e->>'k', 100000 + o
                           from jsonb_array_elements(case when jsonb_typeof(mo.m->'gs') = 'array' then mo.m->'gs' else '[]'::jsonb end) with ordinality q(e, o)
                           where jsonb_typeof(e) = 'object' and jsonb_typeof(e->'n') = 'string' and jsonb_typeof(e->'k') = 'string'
                             and e->'t' = to_jsonb(tt) and coalesce(e->'gk' not in ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false)
                         ),
                         md as (select tr.x from tr where tr.i = mo.i order by tr.j desc limit 1),
                         da as (select g.p, g.o from g, md where jsonb_typeof(md.x->'p') = 'array' and md.x->'p' ? g.p)
                         select case
                           when (select count(*) from g) < 2 then (select coalesce(jsonb_agg(to_jsonb(g.p) order by g.o), '[]'::jsonb) from g)
                           when (select count(*) from da) = 1 then (select jsonb_agg(to_jsonb(da.p)) from da)
                           else '[]'::jsonb end)
                       end) order by tt)
                     from generate_series(0, 1) tt),
              'tr', (select coalesce(jsonb_agg(jsonb_only(tr.x, array['d', 't']) || jsonb_build_object('n', tr.n) order by tr.j), '[]'::jsonb)
                     from tr where tr.i = mo.i),
              'anw', (select coalesce(jsonb_object_agg(sp.p,
                        (case jsonb_typeof(mo.m->'base'->sp.p)
                           when 'number' then (mo.m->'base'->>sp.p)::numeric
                           when 'string' then case when btrim(mo.m->'base'->>sp.p) ~ '^-?\d+(\.\d+)?$' then btrim(mo.m->'base'->>sp.p)::numeric else 0 end
                           else 0 end)
                        + (select count(*) from tr where tr.i = mo.i and tr.d collate "C" <= s.heute
                             and jsonb_typeof(tr.x->'p') = 'array' and tr.x->'p' ? sp.p)), '{}'::jsonb)
                      from sp))
            order by mo.i), '[]'::jsonb)
          from mo))
  from s
$$;
revoke execute on function public.public_league() from public;
grant execute on function public.public_league() to anon, authenticated;
