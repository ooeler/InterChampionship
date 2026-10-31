-- Clients senden den ganzen Saisonstand. Für alle eingeloggten Konten prüft der Server jetzt dessen Form,
-- setzt updated_by selbst und begrenzt die Grösse. Skripte und Migrationen ohne auth.uid() bleiben ausgenommen. Idempotent.

-- Höchste Formatversion. Muss zu SV in app/index.html passen (geprüft in tests/sicherheit.spec.js).
create or replace function public.league_version() returns int language sql immutable as $$ select 2 $$;

create or replace function public.is_str_list(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'array' and not exists (select 1 from jsonb_array_elements(j) e where jsonb_typeof(e) <> 'string')
$$;

create or replace function public.is_count(j jsonb, hoechstens int) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'number' and j::text ~ '^[0-9]+$' and j::text::numeric <= hoechstens
$$;

create or replace function public.is_count_map(j jsonb) returns boolean
language sql immutable as $$
  select jsonb_typeof(j) = 'object' and not exists (select 1 from jsonb_each(j) e where not public.is_count(e.value, 999))
$$;

-- Fehlt oder ist null: gilt als leer
create or replace function public.is_none(j jsonb) returns boolean
language sql immutable as $$ select j is null or jsonb_typeof(j) = 'null' $$;

create or replace function public.training_problem(x jsonb) returns text
language plpgsql immutable set search_path = public as $$
declare e record;
begin
  if jsonb_typeof(x) is distinct from 'object' then return 'Training'; end if;
  if coalesce(x->>'d', '') !~ '^\d{4}-\d{2}-\d{2}$' then return 'Trainingsdatum'; end if;
  if not is_none(x->'t') and coalesce(x->>'t', '') !~ '^\d{2}:\d{2}$' then return 'Trainingszeit'; end if;
  if not coalesce(is_str_list(x->'p'), false) then return 'Anwesenheit'; end if;
  if not is_none(x->'ab') and not coalesce(is_str_list(x->'ab'), false) then return 'Abmeldungen'; end if;
  if not is_none(x->'lead') and jsonb_typeof(x->'lead') <> 'string' then return 'Trainingsleitung'; end if;
  if not is_none(x->'r') and jsonb_typeof(x->'r') <> 'string' then return 'Restaurant'; end if;
  if not is_none(x->'st') then
    if jsonb_typeof(x->'st') <> 'object' then return 'Status'; end if;
    for e in select * from jsonb_each(x->'st') loop
      if e.value not in ('"u"'::jsonb, '"v"'::jsonb, '""'::jsonb) then return 'Status'; end if;
    end loop;
  end if;
  if not is_none(x->'gs') then
    if jsonb_typeof(x->'gs') <> 'array' then return 'Gastspieler'; end if;
    if exists (select 1 from jsonb_array_elements(x->'gs') g where jsonb_typeof(g) <> 'object' or jsonb_typeof(g->'n') is distinct from 'string') then return 'Gastspieler'; end if;
  end if;
  return null;
end $$;

-- Gibt das erste ungültige Feld zurück, sonst null
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
  if not is_none(d->'evt') then
    p := training_problem(d->'evt');
    if p is not null then return p; end if;
  end if;
  return null;
end $$;
revoke execute on function public.league_version() from public, anon, authenticated;
revoke execute on function public.is_str_list(jsonb), public.is_count(jsonb, int), public.is_count_map(jsonb),
  public.is_none(jsonb), public.training_problem(jsonb), public.league_problem(jsonb) from public, anon, authenticated;

create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
declare p text;
begin
  if auth.uid() is not null then
    if new.id <> 'main' or (tg_op = 'UPDATE' and new.id <> old.id) then raise exception 'Ungültige Daten: Zeile'; end if;
    p := public.league_problem(new.data);
    if p is not null then raise exception 'Ungültige Daten: %', p; end if;
    -- nicht vom Client übernehmen; null bleibt, delete_member löst so die Verknüpfung zum gelöschten Konto
    if new.updated_by is not null then new.updated_by := auth.uid(); end if;
    new.client := left(new.client, 40);
  end if;
  if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin'
     and new.data->'info' is distinct from old.data->'info' then
    new.data := case when old.data ? 'info' then jsonb_set(new.data, '{info}', old.data->'info') else new.data - 'info' end;
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
