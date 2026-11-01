-- Hall of INTER Fame: Fotos sind öffentlich wie die Gewinner. Pflegen dürfen weiterhin Spielleitung und Captains;
-- created_by bleibt für Besucher verborgen. Idempotent.
grant select (id, season, caption, data, kind, created_at) on table public.hall_photos to anon;

drop policy if exists "Hall-Fotos lesen" on public.hall_photos;
create policy "Hall-Fotos lesen" on public.hall_photos for select to anon, authenticated using (true);
