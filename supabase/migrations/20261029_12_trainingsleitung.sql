-- Einmalig: Trainingsleitungen aus "Trainingsübersicht 26-27.pdf" übernehmen (Spalte "Übungen", ohne Match Days/Events).
-- Setzt pro Datum die Leitung; alles andere bleibt. Vorheriger Stand wird gesichert.
do $import$
declare
  s jsonb;
  r record;
  i int;
  j int;
begin
  select data into s from public.league_state where id = 'main';
  if s is null then return; end if;
  insert into public.league_state_history (state_id, data, updated_by, reason)
    select id, data, updated_by, 'vor Import Trainingsleitung' from public.league_state where id = 'main';
  for r in select * from (values
    ('2026-08-12', 'Othmar Oeler'), ('2026-08-19', 'Michael Süess'), ('2026-08-26', 'Stefan Keller'),
    ('2026-09-09', 'Pascal Hilpertshauser'), ('2026-09-16', 'Julien Stadler'), ('2026-09-23', 'Silvan Frehner'),
    ('2026-09-30', 'Andreas Scherrer'), ('2026-10-07', 'Manuel Ammann'), ('2026-10-21', 'Thomas Allemann'),
    ('2026-10-28', 'Raphael Germann'), ('2026-11-11', 'Cornel Eberle'), ('2026-11-18', 'Michael Vetter'),
    ('2026-11-25', 'Pascal Fröhlich'), ('2026-12-16', 'Silvan Frey')
  ) v(d, lead) loop
    for i in 0 .. jsonb_array_length(s -> 'm') - 1 loop
      for j in 0 .. jsonb_array_length(s -> 'm' -> i -> 'tr') - 1 loop
        if s -> 'm' -> i -> 'tr' -> j ->> 'd' = r.d then
          s := jsonb_set(s, array['m', i::text, 'tr', j::text, 'lead'], to_jsonb(r.lead));
        end if;
      end loop;
    end loop;
  end loop;
  update public.league_state set data = s, client = 'import-pdf', updated_at = now() where id = 'main';
end $import$;
