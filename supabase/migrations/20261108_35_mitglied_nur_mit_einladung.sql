-- Mitglied wird nur, wer über einen Einladungslink kommt. Idempotent.
-- Die Function "invite" legt das Konto mit app_metadata.invited = true an (app_metadata kann nur der Server setzen).
-- Konten ohne dieses Kennzeichen (z. B. freie Registrierung oder neue Anmeldung per Google/Microsoft) bekommen
-- keine members-Zeile und sehen damit keine geschützten Daten. Bestehende Mitglieder sind nicht betroffen.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- nur beim Anlegen bzw. wenn das Kennzeichen neu dazukommt (eine entfernte Mitgliedschaft entsteht nicht bei jedem Login neu)
  if coalesce(new.raw_app_meta_data->>'invited', '') = 'true'
     and (tg_op = 'INSERT' or coalesce(old.raw_app_meta_data->>'invited', '') <> 'true') then
    insert into public.members (user_id, email) values (new.id, new.email) on conflict do nothing;
  end if;
  return new;
end $$;

-- Auch bei UPDATE: Die Auth-API kann app_metadata erst nach dem Anlegen des Kontos (in derselben Transaktion) schreiben.
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert or update of raw_app_meta_data on auth.users
  for each row execute function public.handle_new_user();
