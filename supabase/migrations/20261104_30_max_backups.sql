-- Datensicherung: eine Sicherung bleibt, solange sie zu den 10 neuesten gehört oder höchstens 7 Tage alt ist. Idempotent.
create or replace function public.trim_league_history() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  delete from public.league_state_history where saved_at < now() - interval '7 days' and id not in (
    select id from public.league_state_history order by saved_at desc, id desc limit 10);
  return null;
end $$;
revoke execute on function public.trim_league_history() from public, anon, authenticated;
drop trigger if exists trim_league_history on public.league_state_history;
create trigger trim_league_history after insert on public.league_state_history
  for each statement execute function public.trim_league_history();
delete from public.league_state_history where saved_at < now() - interval '7 days' and id not in (
  select id from public.league_state_history order by saved_at desc, id desc limit 10);
