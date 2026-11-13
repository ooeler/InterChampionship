-- Datensicherung länger aufbewahren: eine Sicherung bleibt, solange sie zu den 14 neuesten gehört
-- oder höchstens 14 Tage alt ist (bisher 10 bzw. 7 Tage, siehe 20261104_30). Idempotent.
create or replace function public.trim_league_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.league_state_history where saved_at < now() - interval '14 days' and id not in (
    select id from public.league_state_history order by saved_at desc, id desc limit 14);
  return null;
end $$;
revoke execute on function public.trim_league_history() from public, anon, authenticated;
