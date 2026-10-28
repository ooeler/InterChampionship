-- Training: Benachrichtigung bei An-/Abmeldungen, Erinnerung 26 h vor jedem Training.
-- Das Cron-Secret liegt im Supabase Vault (vom Release-Ablauf gesetzt) statt im Klartext im Cron-Job.
-- Idempotent.

alter table public.members add column if not exists notify_changes boolean not null default false;

-- Eigene Einstellung "Bei An- und Abmeldungen informieren"
create or replace function public.set_notify(on_changes boolean) returns void
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null then raise exception 'Nicht angemeldet'; end if;
  update public.members set notify_changes = on_changes where user_id = auth.uid();
end $$;
revoke execute on function public.set_notify(boolean) from anon;

-- me() liefert zusätzlich die Benachrichtigungs-Einstellung
create or replace function public.me() returns json
language plpgsql security definer set search_path = public as $$
declare r public.members;
begin
  select * into r from public.members where user_id = auth.uid();
  if not found then return null; end if;
  update public.members set last_seen = now() where user_id = auth.uid();
  return json_build_object('role', r.role, 'player', r.player, 'prev_seen', r.last_seen, 'notify_changes', r.notify_changes);
end $$;
revoke execute on function public.me() from anon;

-- Cron-Aufrufe der Edge Function notify, Secret aus dem Vault
create extension if not exists pg_net;
create or replace function public.call_notify(kind text) returns void
language plpgsql security definer set search_path = public as $$
declare sec text;
begin
  select decrypted_secret into sec from vault.decrypted_secrets where name = 'cron_secret';
  if sec is null then raise warning 'Vault-Secret cron_secret fehlt'; return; end if;
  perform net.http_post(
    url := 'https://bxzywtpddgtfgghyiduf.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || sec),
    body := jsonb_build_object('type', kind));
end $$;
revoke execute on function public.call_notify(text) from anon, authenticated;

select cron.unschedule('matchday-reminder') where exists (select 1 from cron.job where jobname = 'matchday-reminder');
select cron.schedule('matchday-reminder', '0 8 * * *', $$ select public.call_notify('matchday') $$);
select cron.unschedule('training-reminder') where exists (select 1 from cron.job where jobname = 'training-reminder');
select cron.schedule('training-reminder', '*/15 * * * *', $$ select public.call_notify('training') $$);
