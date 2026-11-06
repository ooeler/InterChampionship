-- Kopie der Mail an die Trainingsleitung: jede Spielleitung entscheidet selbst (Standard: ja). Idempotent.
alter table public.members add column if not exists lead_mail_cc boolean not null default true;

create or replace function public.set_lead_cc(on_cc boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if coalesce(public.my_role(), '') <> 'admin' then raise exception 'Nur für die Spielleitung'; end if;
  update public.members set lead_mail_cc = coalesce(on_cc, true) where user_id = auth.uid();
end $$;
revoke execute on function public.set_lead_cc(boolean) from public, anon;
grant execute on function public.set_lead_cc(boolean) to authenticated, service_role;

-- me() liefert zusätzlich die Kopie-Einstellung
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen,
                           'notify_changes', r.notify_changes, 'resto', r.resto, 'strafen', r.strafen,
                           'lead_cc', r.lead_mail_cc);
end $$;
revoke execute on function public.me() from public, anon;
grant execute on function public.me() to authenticated, service_role;
