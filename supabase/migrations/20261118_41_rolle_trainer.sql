-- Zusatzrolle Trainer: bekommt die Mail an die Trainingsleitung beim Abmeldeschluss in Kopie (CC),
-- statt wie bisher die Spielleitung. Mehrere Trainer möglich, vergeben nur durch die Spielleitung. Idempotent.

alter table public.members add column if not exists trainer boolean not null default false;

-- lead_mail_cc (Migration 32) bezog sich auf die Kopie der Spielleitung; neu gilt der Schalter nur noch für Trainer.
comment on column public.members.lead_mail_cc is
  'Trainer: Kopie (CC) der Mail an die Trainingsleitung erhalten (Standard: ja). Ohne Rolle Trainer ohne Wirkung.';
-- alte Abwahl aus der Zeit der Spielleitungs-Kopie zurücksetzen: wer später Trainer wird, beginnt mit "Kopie ein"
update public.members set lead_mail_cc = true where not trainer and not lead_mail_cc;

-- Spielleitung vergibt/entzieht die Zusatzrolle Trainer (beim Vergeben ist die Kopie eingeschaltet)
create or replace function public.set_trainer(uid uuid, on_trainer boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() is distinct from 'admin' then
    raise exception 'Nur die Spielleitung darf Rollen vergeben';
  end if;
  update public.members
     set trainer = coalesce(on_trainer, false),
         lead_mail_cc = case when coalesce(on_trainer, false) and not trainer then true else lead_mail_cc end
   where user_id = uid;
end $$;
revoke execute on function public.set_trainer(uuid, boolean) from public, anon;
grant execute on function public.set_trainer(uuid, boolean) to authenticated, service_role;

-- Kopie ein-/ausschalten: nur Trainer, nur für sich selbst
create or replace function public.set_lead_cc(on_cc boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not coalesce((select trainer from public.members where user_id = auth.uid()), false) then
    raise exception 'Nur für Trainer';
  end if;
  update public.members set lead_mail_cc = coalesce(on_cc, true) where user_id = auth.uid();
end $$;
revoke execute on function public.set_lead_cc(boolean) from public, anon;
grant execute on function public.set_lead_cc(boolean) to authenticated, service_role;

-- me() liefert zusätzlich die Zusatzrolle Trainer
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen,
                           'notify_changes', r.notify_changes, 'resto', r.resto, 'strafen', r.strafen,
                           'trainer', r.trainer, 'lead_cc', r.lead_mail_cc);
end $$;
revoke execute on function public.me() from public, anon;
grant execute on function public.me() to authenticated, service_role;
