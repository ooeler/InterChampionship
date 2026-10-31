-- Hall of INTER Fame: Pflege auch durch Captains, dazu je ein Bild pro Saison für Sommermeister, Anwesenheit und Topskorer. Idempotent.
-- Die Bilder liegen bei den Siegesfotos, es gelten dieselben Regeln: lesen nur Mitglieder.
alter table public.hall_photos add column if not exists kind text check (kind in ('sommer', 'attendance', 'scorer'));
create unique index if not exists hall_photos_kind on public.hall_photos (season, kind) where kind is not null;

-- Die Hall pflegen Spielleitung und Captains
drop policy if exists "Hall eintragen" on public.hall_seasons;
drop policy if exists "Hall ändern" on public.hall_seasons;
drop policy if exists "Hall löschen" on public.hall_seasons;
create policy "Hall eintragen" on public.hall_seasons for insert to authenticated with check (public.my_role() in ('admin', 'captain'));
create policy "Hall ändern" on public.hall_seasons for update to authenticated using (public.my_role() in ('admin', 'captain')) with check (public.my_role() in ('admin', 'captain'));
create policy "Hall löschen" on public.hall_seasons for delete to authenticated using (public.my_role() in ('admin', 'captain'));

drop policy if exists "Hall-Fotos eintragen" on public.hall_photos;
drop policy if exists "Hall-Fotos löschen" on public.hall_photos;
create policy "Hall-Fotos eintragen" on public.hall_photos for insert to authenticated with check (public.my_role() in ('admin', 'captain'));
create policy "Hall-Fotos löschen" on public.hall_photos for delete to authenticated using (public.my_role() in ('admin', 'captain'));
