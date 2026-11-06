-- Spielerprofil (Vorschlag #103): Position, Stockseite und Trikotnummer pflegt jede Person selbst;
-- dazu ein Archiv der Saisonstatistik pro Spieler, das die Spielleitung am Saisonende füllt. Idempotent.

create table if not exists public.player_profiles (
  player     text primary key check (length(player) between 1 and 80),
  pos        text check (pos in ('f', 'g')),            -- f = Feldspieler, g = Torhüter
  stick      text check (stick in ('l', 'r')),          -- Stockseite, nur Feldspieler
  nr         int  check (nr between 0 and 99),          -- Trikotnummer
  updated_at timestamptz not null default now(),
  constraint player_profiles_gk_no_stick check (pos is distinct from 'g' or stick is null)
);
alter table public.player_profiles enable row level security;
revoke all on public.player_profiles from public, anon;
grant select, insert, update on public.player_profiles to authenticated;

drop policy if exists "profile_read" on public.player_profiles;
create policy "profile_read" on public.player_profiles for select to authenticated
  using (public.my_role() is not null);
drop policy if exists "profile_own_insert" on public.player_profiles;
create policy "profile_own_insert" on public.player_profiles for insert to authenticated
  with check (player = public.my_player());
drop policy if exists "profile_own_update" on public.player_profiles;
create policy "profile_own_update" on public.player_profiles for update to authenticated
  using (player = public.my_player()) with check (player = public.my_player());

create table if not exists public.player_seasons (
  season          text not null check (length(season) between 1 and 20),
  player          text not null check (length(player) between 1 and 80),
  team            text check (length(team) <= 80),
  goals           int  not null default 0 check (goals between 0 and 9999),
  assists         int  not null default 0 check (assists between 0 and 9999),
  trainings       int  not null default 0 check (trainings between 0 and 9999),
  potm            int  not null default 0 check (potm between 0 and 12),
  rank_goals      int  check (rank_goals > 0),
  rank_assists    int  check (rank_assists > 0),
  rank_trainings  int  check (rank_trainings > 0),
  saved_at        timestamptz not null default now(),
  primary key (season, player)
);
alter table public.player_seasons enable row level security;
revoke all on public.player_seasons from public, anon;
grant select, insert, update, delete on public.player_seasons to authenticated;

drop policy if exists "seasons_read" on public.player_seasons;
create policy "seasons_read" on public.player_seasons for select to authenticated
  using (public.my_role() is not null);
drop policy if exists "seasons_admin_write" on public.player_seasons;
create policy "seasons_admin_write" on public.player_seasons for all to authenticated
  using (public.my_role() = 'admin') with check (public.my_role() = 'admin');

-- Umbenennen nimmt Profil und Archiv mit; ohne Rolle (z. B. gelöschtes Konto) passiert nichts
create or replace function public.rename_player(old_name text, new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') not in ('admin', 'captain') then return; end if;
  update public.members set player = new_name where player = old_name;
  update public.absence_reasons set player = new_name where player = old_name;
  update public.app_activity set player = new_name where player = old_name;
  if not exists (select 1 from public.player_profiles where player = new_name) then
    update public.player_profiles set player = new_name where player = old_name;
  end if;
  update public.player_seasons s set player = new_name where player = old_name
    and not exists (select 1 from public.player_seasons z where z.season = s.season and z.player = new_name);
end $$;
