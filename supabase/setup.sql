-- InterChampionship – Datenbank einrichten.
-- Im Supabase-Dashboard → SQL Editor einfügen und ausführen. Mehrfaches Ausführen ist unproblematisch.

-- ───────────── Mitglieder & Rollen ─────────────
create table if not exists public.members (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  email      text not null,
  role       text not null default 'player' check (role in ('admin', 'captain', 'player')),
  last_seen  timestamptz,
  created_at timestamptz not null default now()
);
alter table public.members add column if not exists player text; -- zugeordneter Spieler (Name wie in der App)
alter table public.members enable row level security;

create or replace function public.my_role() returns text
language sql stable security definer set search_path = public as $$
  select role from public.members where user_id = auth.uid()
$$;

drop policy if exists "Mitglieder: eigene Zeile, Admin alle" on public.members;
create policy "Mitglieder: eigene Zeile, Admin alle" on public.members
  for select to authenticated using (user_id = auth.uid() or public.my_role() = 'admin');
-- Rollen werden nur im Dashboard (Table Editor) oder per SQL gesetzt – keine Schreib-Policy für die App.

-- Jede eingeladene Person wird automatisch Mitglied mit Rolle 'player'.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.members (user_id, email) values (new.id, new.email) on conflict do nothing;
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
insert into public.members (user_id, email) select id, email from auth.users on conflict do nothing;

-- Beim App-Start: Rolle + letzter Besuch (für "Willkommen zurück") abfragen und Besuch speichern.
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen);
end $$;
revoke execute on function public.me() from anon;

-- Spielleitung (Admin) setzt Rolle und Spieler-Zuordnung in der App.
create or replace function public.set_member(uid uuid, new_role text, new_player text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Benutzer verwalten';
  end if;
  if uid = auth.uid() and new_role <> 'admin' then
    raise exception 'Du kannst dir die Admin-Rolle nicht selbst entziehen';
  end if;
  update public.members set role = new_role, player = nullif(new_player, '') where user_id = uid;
end $$;
revoke execute on function public.set_member(uuid, text, text) from anon;

-- Beim Umbenennen eines Spielers bleibt die Zuordnung erhalten.
create or replace function public.rename_player(old_name text, new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'captain') then return; end if;
  update public.members set player = new_name where player = old_name;
end $$;
revoke execute on function public.rename_player(text, text) from anon;

-- ───────────── Saison-Daten ─────────────
create table if not exists public.league_state (
  id         text primary key,
  data       jsonb not null,
  client     text,
  updated_by uuid references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.league_state enable row level security;

drop policy if exists "Saison lesen" on public.league_state;
drop policy if exists "Saison anlegen" on public.league_state;
drop policy if exists "Saison ändern" on public.league_state;
create policy "Saison lesen"  on public.league_state for select to authenticated using (public.my_role() is not null);
create policy "Saison anlegen" on public.league_state for insert to authenticated with check (public.my_role() is not null);
create policy "Saison ändern" on public.league_state for update to authenticated
  using (public.my_role() is not null) with check (public.my_role() is not null);

-- Teams, Saisonname und Bilder dürfen nur Admins und Captains ändern (serverseitig erzwungen).
create or replace function public.guard_league_state() returns trigger
language plpgsql security definer set search_path = public as $$
begin
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
  return new;
end $$;
drop trigger if exists guard_league_state on public.league_state;
create trigger guard_league_state before insert or update on public.league_state
  for each row execute function public.guard_league_state();

-- Live-Aktualisierung auf allen Geräten
do $$ begin
  alter publication supabase_realtime add table public.league_state;
exception when duplicate_object then null; end $$;

-- ───────────── Push-Nachrichten ─────────────
create table if not exists public.push_subscriptions (
  endpoint   text primary key,
  user_id    uuid not null references auth.users(id) on delete cascade,
  sub        jsonb not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists "Eigene Push-Abos" on public.push_subscriptions;
create policy "Eigene Push-Abos" on public.push_subscriptions for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Verhindert doppelte Nachrichten. Nur die Edge Function (Service Role) schreibt hier.
create table if not exists public.push_log (
  key        text primary key,
  created_at timestamptz not null default now()
);
alter table public.push_log enable row level security;

-- ───────────── Verbesserungsvorschläge → GitHub-Issues ─────────────
-- Zählt Vorschläge pro Person (Tageslimit). Nur die Edge Function "feedback" schreibt hier.
create table if not exists public.feedback_log (
  id           bigint generated always as identity primary key,
  user_id      uuid not null references auth.users(id) on delete cascade,
  issue_number int,
  created_at   timestamptz not null default now()
);
alter table public.feedback_log enable row level security;

-- ───────────── Dich selbst zum Admin machen ─────────────
-- Erst ausführen, NACHDEM du dich selbst eingeladen und angemeldet hast:
-- update public.members set role = 'admin'   where email = 'deine@adresse.ch';
-- update public.members set role = 'captain' where email = 'captain@adresse.ch';
