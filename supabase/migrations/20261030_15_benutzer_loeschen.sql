-- Spielleitung löscht einzelne Benutzer (Konto + Mitgliedschaft). Idempotent.
-- Spieler, Statistik und Strafen hängen am Spielernamen und bleiben erhalten.

-- Wer zuletzt gespeichert hat, darf gelöscht werden: Verweis wird dann leer statt das Löschen zu blockieren.
-- (Ändert nur updated_by, nicht data – deshalb kein Eintrag in der Datensicherung.)
do $$ declare c text; begin
  for c in select conname from pg_constraint
           where conrelid = 'public.league_state'::regclass and contype = 'f'
             and conkey = array[(select attnum from pg_attribute where attrelid = 'public.league_state'::regclass and attname = 'updated_by')]
  loop execute format('alter table public.league_state drop constraint %I', c); end loop;
end $$;
alter table public.league_state add constraint league_state_updated_by_fkey
  foreign key (updated_by) references auth.users(id) on delete set null;

create or replace function public.delete_member(uid uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Benutzer löschen';
  end if;
  if uid = auth.uid() then
    raise exception 'Du kannst dich nicht selbst löschen';
  end if;
  if not exists (select 1 from public.members where user_id = uid) then
    raise exception 'Benutzer nicht gefunden';
  end if;
  -- members, Push-Abos und Vorschlags-Zähler werden per "on delete cascade" mitgelöscht
  delete from auth.users where id = uid;
end $$;
revoke execute on function public.delete_member(uuid) from public, anon;
grant execute on function public.delete_member(uuid) to authenticated;
