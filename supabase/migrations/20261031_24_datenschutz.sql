-- Besucher ohne Login bekommen nur noch, was die öffentliche Rangliste braucht: keine Abmeldungen, Status, Trainings-Gäste,
-- Trainingsleitung, Restaurants oder Schiedsrichter. Abmeldegründe sehen nur die Person selbst, Captains und Spielleitung;
-- 30 Tage nach dem Training werden sie gelöscht. Idempotent.
create or replace function public.jsonb_only(j jsonb, felder text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(j) e where e.key = any(felder)
$$;
revoke execute on function public.jsonb_only(jsonb, text[]) from public, anon, authenticated;

create or replace function public.public_league() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'v', d->'v', 'sn', d->'sn', 't', d->'t', 'logo', d->'logo', 'sp', d->'sp', 'info', d->'info',
    'evt', case when jsonb_typeof(d->'evt') = 'object' then jsonb_only(d->'evt', array['d', 't']) end,
    'm', (select coalesce(jsonb_agg(
            jsonb_only(m, array['res', 'pre', 'g', 'a', 'base', 'gs', 'ff']) || jsonb_build_object('tr', (
              select coalesce(jsonb_agg(jsonb_only(x, array['d', 't', 'p']) order by j), '[]'::jsonb)
              from jsonb_array_elements(m->'tr') with ordinality a(x, j)))
            order by i), '[]'::jsonb)
          from jsonb_array_elements(d->'m') with ordinality b(m, i)))
  from (select data as d from public.league_state where id = 'main') s
$$;
revoke execute on function public.public_league() from public;
grant execute on function public.public_league() to anon, authenticated;

drop policy if exists "Saison öffentlich lesen" on public.league_state;

drop policy if exists "Abmeldegrund lesen" on public.absence_reasons;
create policy "Abmeldegrund lesen" on public.absence_reasons for select to authenticated
  using (player = public.my_player() or public.my_role() in ('admin', 'captain'));

create or replace function public.purge_absence_reasons() returns int
language plpgsql security definer set search_path = public as $$
declare n int;
begin
  delete from public.absence_reasons where d < (now() at time zone 'Europe/Zurich')::date - 30;
  get diagnostics n = row_count;
  return n;
end $$;
revoke execute on function public.purge_absence_reasons() from public, anon, authenticated;

select cron.unschedule('absence-reasons-purge') where exists (select 1 from cron.job where jobname = 'absence-reasons-purge');
select cron.schedule('absence-reasons-purge', '15 3 * * *', $$ select public.purge_absence_reasons() $$);
select public.purge_absence_reasons();
