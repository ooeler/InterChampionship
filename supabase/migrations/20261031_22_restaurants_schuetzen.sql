-- Restaurants gingen verloren, weil Clients den ganzen Saisonstand senden: ein alter Stand löschte neuere Einträge.
-- Die App führt Änderungen jetzt zusammen. Zusätzlich hier: wer Restaurants nicht ändern darf, kann sie auch nicht
-- überschreiben (wirkt auch für noch offene alte App-Versionen), und verlorene Einträge kommen aus dem Verlauf zurück. Idempotent.
create or replace function public.keep_restaurants(alt jsonb, neu jsonb) returns jsonb
language plpgsql immutable set search_path = public as $$
declare i int; j int; d text; r text; da boolean; pfad text[];
begin
  for i in 0 .. coalesce(jsonb_array_length(neu->'m'), 0) - 1 loop
    for j in 0 .. coalesce(jsonb_array_length(neu#>array['m', i::text, 'tr']), 0) - 1 loop
      pfad := array['m', i::text, 'tr', j::text, 'r'];
      d := neu#>>array['m', i::text, 'tr', j::text, 'd'];
      select true, t->>'r' into da, r
      from jsonb_array_elements(alt->'m') m, jsonb_array_elements(m->'tr') t where t->>'d' = d limit 1;
      -- verschobene Trainings gibt es im alten Stand nicht: Eintrag bleibt wie gesendet
      if not coalesce(da, false) then da := null; continue; end if;
      neu := case when r is null then neu #- pfad else jsonb_set(neu, pfad, to_jsonb(r)) end;
      da := null;
    end loop;
  end loop;
  return neu;
end $$;
revoke execute on function public.keep_restaurants(jsonb, jsonb) from public, anon, authenticated;

create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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

-- Füllt leere Restaurants vergangener Trainings mit dem letzten Eintrag aus dem Verlauf
create or replace function public.restore_restaurants() returns int
language plpgsql security definer set search_path = public as $$
declare cur jsonb; i int; j int; d text; r text; n int := 0; heute text := ((now() at time zone 'Europe/Zurich')::date)::text;
begin
  select data into cur from public.league_state where id = 'main';
  if cur is null then return 0; end if;
  for i in 0 .. coalesce(jsonb_array_length(cur->'m'), 0) - 1 loop
    for j in 0 .. coalesce(jsonb_array_length(cur#>array['m', i::text, 'tr']), 0) - 1 loop
      d := cur#>>array['m', i::text, 'tr', j::text, 'd'];
      if d <= heute and coalesce(cur#>>array['m', i::text, 'tr', j::text, 'r'], '') = '' then
        r := null;
        select t->>'r' into r
        from public.league_state_history h, jsonb_array_elements(h.data->'m') m, jsonb_array_elements(m->'tr') t
        where h.state_id = 'main' and t->>'d' = d and coalesce(t->>'r', '') <> ''
        order by h.saved_at desc limit 1;
        if r is not null then
          cur := jsonb_set(cur, array['m', i::text, 'tr', j::text, 'r'], to_jsonb(r));
          n := n + 1;
        end if;
      end if;
    end loop;
  end loop;
  if n > 0 then
    insert into public.league_state_history (state_id, data, updated_by, reason)
      select id, data, updated_by, 'vor Restaurant-Wiederherstellung' from public.league_state where id = 'main';
    update public.league_state set data = cur, client = 'restaurants', updated_at = now() where id = 'main';
  end if;
  return n;
end $$;
revoke execute on function public.restore_restaurants() from public, anon, authenticated;
grant execute on function public.restore_restaurants() to service_role;

do $$ begin perform public.restore_restaurants(); end $$;
