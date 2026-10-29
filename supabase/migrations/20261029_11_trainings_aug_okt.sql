-- Einmalig: Trainings August bis Oktober aus dem PDF "Herren Inter 26-27" ergänzen (Spieltage September und Oktober).
-- Bisher war die Anwesenheit dieser Monate nur als Summe gespeichert (base). Jetzt einzeln pro Training,
-- abgelesen aus den Anwesenheits-Tabellen im PDF (Summen pro Spieler stimmen mit dem PDF überein).
-- Letztes Training eines Spieltags = Match Day (2.9. und 14.10.). Ändert nur diese beiden Monate.
do $import$
begin
  if exists (select 1 from public.league_state where id = 'main' and jsonb_array_length(coalesce(data #> '{m,0,tr}', '[]')) = 0) then
    insert into public.league_state_history (state_id, data, updated_by, reason)
      select id, data, updated_by, 'vor Import Trainings Aug–Okt' from public.league_state where id = 'main';
    update public.league_state set
      data = jsonb_set(jsonb_set(jsonb_set(jsonb_set(data,
        '{m,0,tr}', $json$[{"d":"2026-08-12","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Stefan Keller","Othmar Oeler","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Beat Rentsch","Tobias Keller"]},{"d":"2026-08-19","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Othmar Oeler","Manuel Ammann","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Beat Rentsch","Tobias Keller"]},{"d":"2026-08-26","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Stefan Keller","Manuel Ammann","Pascal Hilpertshauser","Pascal Fröhlich","Beat Rentsch","Tobias Keller"]},{"d":"2026-09-02","p":["Andreas Scherrer","Julien Stadler","Stefan Keller","Othmar Oeler","Manuel Ammann","Silvan Frey","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Tobias Keller"]}]$json$::jsonb),
        '{m,0,base}', '{}'::jsonb),
        '{m,1,tr}', $json$[{"d":"2026-09-09","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Stefan Keller","Thomas Allemann","Silvan Frey","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Beat Rentsch","Tobias Keller"]},{"d":"2026-09-16","p":["Julien Stadler","Michael Süess","Michael Vetter","Stefan Keller","Othmar Oeler","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Tobias Keller"]},{"d":"2026-09-23","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Stefan Keller","Othmar Oeler","Manuel Ammann","Silvan Frey","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Tobias Keller"]},{"d":"2026-09-30","p":["Andreas Scherrer","Raphael Germann","Stefan Keller","Thomas Allemann","Othmar Oeler","Manuel Ammann","Pascal Hilpertshauser"]},{"d":"2026-10-07","p":["Andreas Scherrer","Julien Stadler","Raphael Germann","Thomas Allemann","Manuel Ammann","Pascal Hilpertshauser","Silvan Frehner","Cornel Eberle","Beat Rentsch"]},{"d":"2026-10-14","p":["Andreas Scherrer","Julien Stadler","Michael Süess","Raphael Germann","Michael Vetter","Stefan Keller","Thomas Allemann","Othmar Oeler","Silvan Frey","Pascal Hilpertshauser","Pascal Fröhlich","Silvan Frehner","Cornel Eberle","Beat Rentsch","Tobias Keller"]}]$json$::jsonb),
        '{m,1,base}', '{}'::jsonb),
      client = 'import-pdf', updated_at = now()
    where id = 'main';
  end if;
end $import$;
