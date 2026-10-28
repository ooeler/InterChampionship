-- Restaurant-Chef: darf das Restaurant nach dem Training eintragen (zusätzlich zur Rolle). Idempotent.
alter table public.members add column if not exists resto boolean not null default false;

-- Spielleitung vergibt/entzieht die Zusatzrolle
create or replace function public.set_resto(uid uuid, on_resto boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Rollen vergeben';
  end if;
  update public.members set resto = on_resto where user_id = uid;
end $$;
revoke execute on function public.set_resto(uuid, boolean) from anon;

-- me() liefert zusätzlich die Zusatzrolle
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen,
                           'notify_changes', r.notify_changes, 'resto', r.resto);
end $$;
revoke execute on function public.me() from anon;
