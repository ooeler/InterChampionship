-- Trainingsserie (🔥) nur für Mitglieder: public_league() gibt kein stk mehr aus.
-- Sonst unverändert wie 20261108_36_oeffentlich_nur_summen:
--   pro Training nur Datum, Beginn und Anzahl Anwesende (n)
--   pro Monat anw (Anwesenheit pro Spieler wie an() in der App), kp (Torhüter wie gkOf()), gs (Gäste nur mit Name, Schlüssel, Team, Torhüter)
--   keine Namenslisten pro Training und keine Restaurants
-- Rechte unverändert: ohne Login und mit Login ausführbar. Idempotent.
create or replace function public.public_league() returns jsonb
language sql stable security definer set search_path = public as $$
  with s as (
    select data as d, to_char((now() at time zone 'Europe/Zurich')::date, 'YYYY-MM-DD') as heute
    from public.league_state where id = 'main'
  ),
  -- Spieler der Teams (wie allP() in der App)
  sp as (
    select distinct e #>> '{}' as p
    from s,
      jsonb_array_elements(case when jsonb_typeof(s.d->'t') = 'array' then s.d->'t' else '[]'::jsonb end) t,
      jsonb_array_elements(case when jsonb_typeof(t->'p') = 'array' then t->'p' else '[]'::jsonb end) e
    where jsonb_typeof(e) = 'string'
  ),
  mo as (
    select b.m, b.i
    from s, jsonb_array_elements(case when jsonb_typeof(s.d->'m') = 'array' then s.d->'m' else '[]'::jsonb end) with ordinality b(m, i)
  ),
  -- Gültige Trainings (wie isTr() in der App) mit der Anzahl Anwesender
  tr as (
    select mo.i, a.j, a.x, a.x->>'d' as d,
      (select count(*) from jsonb_array_elements(case when jsonb_typeof(a.x->'p') = 'array' then a.x->'p' else '[]'::jsonb end) e
        where jsonb_typeof(e) = 'string') as n
    from mo, jsonb_array_elements(case when jsonb_typeof(mo.m->'tr') = 'array' then mo.m->'tr' else '[]'::jsonb end) with ordinality a(x, j)
    where jsonb_typeof(a.x) = 'object' and jsonb_typeof(a.x->'d') = 'string' and (a.x->>'d') ~ '^\d{4}-\d{2}-\d{2}$'
  )
  select jsonb_build_object(
    'v', s.d->'v', 'sn', s.d->'sn', 't', s.d->'t', 'logo', s.d->'logo', 'sp', s.d->'sp', 'info', s.d->'info',
    'evt', case when jsonb_typeof(s.d->'evt') = 'object' then jsonb_only(s.d->'evt', array['d', 't']) end,
    'm', (select coalesce(jsonb_agg(
            jsonb_only(mo.m, array['res', 'pre', 'g', 'a', 'base', 'ff']) || jsonb_build_object(
              'gs', (select coalesce(jsonb_agg(jsonb_only(g, array['n', 'k', 't', 'gk']) order by o), '[]'::jsonb)
                     from jsonb_array_elements(case when jsonb_typeof(mo.m->'gs') = 'array' then mo.m->'gs' else '[]'::jsonb end) with ordinality q(g, o)
                     where jsonb_typeof(g) = 'object'),
              'kp', (select jsonb_agg((
                       case when jsonb_typeof(mo.m->'kp') = 'array' and jsonb_typeof(mo.m->'kp'->tt) is distinct from 'null' and (mo.m->'kp'->tt) is not null
                       then (select coalesce(jsonb_agg(e order by o), '[]'::jsonb)
                             from jsonb_array_elements(case when jsonb_typeof(mo.m->'kp'->tt) = 'array' then mo.m->'kp'->tt else '[]'::jsonb end) with ordinality q(e, o)
                             where jsonb_typeof(e) = 'string')
                       else (
                         with g as (
                           select e #>> '{}' as p, o
                           from jsonb_array_elements(case when jsonb_typeof(s.d->'t'->tt->'gk') = 'array' then s.d->'t'->tt->'gk' else '[]'::jsonb end) with ordinality q(e, o)
                           where jsonb_typeof(e) = 'string'
                           union all
                           select e->>'k', 100000 + o
                           from jsonb_array_elements(case when jsonb_typeof(mo.m->'gs') = 'array' then mo.m->'gs' else '[]'::jsonb end) with ordinality q(e, o)
                           where jsonb_typeof(e) = 'object' and jsonb_typeof(e->'n') = 'string' and jsonb_typeof(e->'k') = 'string'
                             and e->'t' = to_jsonb(tt) and coalesce(e->'gk' not in ('false'::jsonb, '0'::jsonb, '""'::jsonb, 'null'::jsonb), false)
                         ),
                         md as (select tr.x from tr where tr.i = mo.i order by tr.j desc limit 1),
                         da as (select g.p, g.o from g, md where jsonb_typeof(md.x->'p') = 'array' and md.x->'p' ? g.p)
                         select case
                           when (select count(*) from g) < 2 then (select coalesce(jsonb_agg(to_jsonb(g.p) order by g.o), '[]'::jsonb) from g)
                           when (select count(*) from da) = 1 then (select jsonb_agg(to_jsonb(da.p)) from da)
                           else '[]'::jsonb end)
                       end) order by tt)
                     from generate_series(0, 1) tt),
              'tr', (select coalesce(jsonb_agg(jsonb_only(tr.x, array['d', 't']) || jsonb_build_object('n', tr.n) order by tr.j), '[]'::jsonb)
                     from tr where tr.i = mo.i),
              'anw', (select coalesce(jsonb_object_agg(sp.p,
                        (case jsonb_typeof(mo.m->'base'->sp.p)
                           when 'number' then (mo.m->'base'->>sp.p)::numeric
                           when 'string' then case when btrim(mo.m->'base'->>sp.p) ~ '^-?\d+(\.\d+)?$' then btrim(mo.m->'base'->>sp.p)::numeric else 0 end
                           else 0 end)
                        + (select count(*) from tr where tr.i = mo.i and tr.d collate "C" <= s.heute
                             and jsonb_typeof(tr.x->'p') = 'array' and tr.x->'p' ? sp.p)), '{}'::jsonb)
                      from sp))
            order by mo.i), '[]'::jsonb)
          from mo))
  from s
$$;
revoke execute on function public.public_league() from public;
grant execute on function public.public_league() to anon, authenticated;
