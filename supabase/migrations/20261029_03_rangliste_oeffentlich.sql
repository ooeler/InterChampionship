-- Rangliste ohne Login: Saison-Daten dürfen öffentlich GELESEN werden (nicht geschrieben).
-- Enthält Teams, Spielernamen, Resultate, Anwesenheit und Skorer – keine Mail-Adressen oder Konten.
-- Idempotent.
drop policy if exists "Saison öffentlich lesen" on public.league_state;
create policy "Saison öffentlich lesen" on public.league_state for select to anon using (id = 'main');
