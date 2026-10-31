-- Hall of INTER Fame: Gewinner pro Saison und Siegesfotos. Idempotent.
-- Gewinner sind öffentlich wie die Rangliste. Fotos zeigen Personen: lesen nur Mitglieder.
-- Fotos liegen verkleinert als Daten-URL in der Tabelle, wie die Logos (RLS statt Storage-Regeln).
-- Pflegen darf nur die Spielleitung.

create table if not exists public.hall_seasons (
  season     text primary key check (season ~ '^[0-9A-Za-z/ .-]{1,20}$'),
  winter     text check (length(winter) <= 120),
  sommer     text check (length(sommer) <= 120),
  attendance text check (length(attendance) <= 120),
  scorer     text check (length(scorer) <= 120),
  goals      text check (length(goals) <= 120),
  note       text check (length(note) <= 120),
  updated_at timestamptz not null default now()
);
alter table public.hall_seasons enable row level security;
revoke all on table public.hall_seasons from anon;
grant select on table public.hall_seasons to anon;

drop policy if exists "Hall lesen" on public.hall_seasons;
drop policy if exists "Hall eintragen" on public.hall_seasons;
drop policy if exists "Hall ändern" on public.hall_seasons;
drop policy if exists "Hall löschen" on public.hall_seasons;
create policy "Hall lesen" on public.hall_seasons for select to anon, authenticated using (true);
create policy "Hall eintragen" on public.hall_seasons for insert to authenticated with check (public.my_role() = 'admin');
create policy "Hall ändern" on public.hall_seasons for update to authenticated using (public.my_role() = 'admin') with check (public.my_role() = 'admin');
create policy "Hall löschen" on public.hall_seasons for delete to authenticated using (public.my_role() = 'admin');

create table if not exists public.hall_photos (
  id         bigint generated always as identity primary key,
  season     text not null references public.hall_seasons(season) on delete cascade,
  caption    text check (length(caption) <= 120),
  data       text not null check (length(data) <= 700000 and data like 'data:image/jpeg;base64,%'),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists hall_photos_season on public.hall_photos (season, created_at);
alter table public.hall_photos enable row level security;
revoke all on table public.hall_photos from anon;

drop policy if exists "Hall-Fotos lesen" on public.hall_photos;
drop policy if exists "Hall-Fotos eintragen" on public.hall_photos;
drop policy if exists "Hall-Fotos löschen" on public.hall_photos;
create policy "Hall-Fotos lesen" on public.hall_photos for select to authenticated using (public.my_role() is not null);
create policy "Hall-Fotos eintragen" on public.hall_photos for insert to authenticated with check (public.my_role() = 'admin');
create policy "Hall-Fotos löschen" on public.hall_photos for delete to authenticated using (public.my_role() = 'admin');
