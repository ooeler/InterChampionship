-- Hall of INTER Fame: Namen und Logos der beiden Teams pro Saison. Öffentlich wie die übrigen Hall-Angaben. Idempotent.
alter table public.hall_seasons add column if not exists team_a text check (length(team_a) <= 120);
alter table public.hall_seasons add column if not exists team_b text check (length(team_b) <= 120);
alter table public.hall_seasons add column if not exists logo_a text check (length(logo_a) <= 200000 and logo_a ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$');
alter table public.hall_seasons add column if not exists logo_b text check (length(logo_b) <= 200000 and logo_b ~ '^data:image/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$');

-- Frühere Saisons vorabgefüllt: Vorhandenes bleibt, leere Felder werden ergänzt
insert into public.hall_seasons (season, team_a, team_b, sommer, attendance, scorer, note) values
  ('25/26', 'Chrüz Junaitäd', 'Greyhounds', 'Unentschieden', null, null, 'Schlussresultat 3 : 3'),
  ('24/25', 'Knallitos', 'Dragos Fritadores', 'Unentschieden', 'Tobias Keller', 'Cornel Eberle', 'Schlussresultat 3 : 3'),
  ('23/24', 'Kox Fillers', 'Fote Tüxe', 'Kox Fillers', 'Tobias Keller, Othmar Oeler', 'Michael Süess', 'Schlussresultat 3 : 2'),
  ('22/23', 'Blue Dolphins', 'The Patellis', 'The Patellis', 'Michael Süess', 'Cornel Eberle', 'Schlussresultat 1 : 4')
on conflict (season) do update set
  team_a = coalesce(public.hall_seasons.team_a, excluded.team_a),
  team_b = coalesce(public.hall_seasons.team_b, excluded.team_b),
  sommer = coalesce(public.hall_seasons.sommer, excluded.sommer),
  attendance = coalesce(public.hall_seasons.attendance, excluded.attendance),
  scorer = coalesce(public.hall_seasons.scorer, excluded.scorer),
  note = coalesce(public.hall_seasons.note, excluded.note);
