-- Rückblick und Torhüter-Statistik sind öffentlich: die öffentliche Sicht enthält dafür auch Restaurants und Torhüter.
-- App-Punkte gibt es nur als fertige Punkte (0 bis 10) und nur für gespielte Monate, nie für frei wählbare Zeiträume. Idempotent.
create or replace function public.public_league() returns jsonb
language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'v', d->'v', 'sn', d->'sn', 't', d->'t', 'logo', d->'logo', 'sp', d->'sp', 'info', d->'info',
    'evt', case when jsonb_typeof(d->'evt') = 'object' then jsonb_only(d->'evt', array['d', 't']) end,
    'm', (select coalesce(jsonb_agg(
            jsonb_only(m, array['res', 'pre', 'g', 'a', 'base', 'gs', 'ff', 'kp']) || jsonb_build_object('tr', (
              select coalesce(jsonb_agg(jsonb_only(x, array['d', 't', 'p', 'r']) order by j), '[]'::jsonb)
              from jsonb_array_elements(m->'tr') with ordinality a(x, j)))
            order by i), '[]'::jsonb)
          from jsonb_array_elements(d->'m') with ordinality b(m, i)))
  from (select data as d from public.league_state where id = 'main') s
$$;
revoke execute on function public.public_league() from public;
grant execute on function public.public_league() to anon, authenticated;

create or replace function public.public_app_points(monat int)
returns table (player text, punkte int, spielleitung boolean)
language sql stable security definer set search_path = public as $$
  with z as (
    select (m->'tr'->0->>'d')::date as von, (m->'tr'->-1->>'d')::date as bis
    from (select data->'m'->monat as m from public.league_state where id = 'main') s
    where jsonb_typeof(m->'res'->0) = 'number' and jsonb_typeof(m->'res'->1) = 'number' and jsonb_array_length(m->'tr') > 0
  )
  select u.player,
         (least(5, count(a.d) / 3) + least(5, coalesce(sum(a.actions), 0) / 3))::int,
         bool_or(u.role = 'admin')
  from z cross join public.members u
  left join public.app_activity a on a.player = u.player and a.d between z.von and z.bis
  where u.player is not null
  group by u.player
$$;
revoke execute on function public.public_app_points(int) from public;
grant execute on function public.public_app_points(int) to anon, authenticated;
