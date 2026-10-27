-- Täglicher Match-Day-Check (verschickt Push 3 Tage vor dem Match Day).
-- Vor dem Ausführen ersetzen:
--   <PROJECT_REF>  → aus der Supabase-URL, z. B. abcdefgh bei https://abcdefgh.supabase.co
--   <CRON_SECRET>  → derselbe Wert wie das Secret CRON_SECRET der Edge Function
-- Diese Datei mit eingesetzten Werten NICHT ins Repository committen.

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('matchday-reminder') where exists (select 1 from cron.job where jobname = 'matchday-reminder');

-- 08:00 UTC = 09:00 (Winter) bzw. 10:00 (Sommer) Schweizer Zeit
select cron.schedule('matchday-reminder', '0 8 * * *', $$
  select net.http_post(
    url     := 'https://<PROJECT_REF>.supabase.co/functions/v1/notify',
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer <CRON_SECRET>'),
    body    := '{"type":"matchday"}'::jsonb
  )
$$);
