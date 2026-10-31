-- App-Aktivität für den Spieler des Monats. Idempotent.
-- Pro Spieler und Tag eine Zeile: Besuch plus Anzahl Aktionen (höchstens 3 pro Tag).
-- Niemand liest die Rohdaten: Mitglieder bekommen nur die fertigen Punkte, ohne Login gar nichts.
create table if not exists public.app_activity (
  player  text not null,
  d       date not null,
  actions int not null default 0 check (actions between 0 and 3),
  primary key (player, d)
);
alter table public.app_activity enable row level security;
revoke all on table public.app_activity from anon, authenticated;

create or replace function public.log_activity(aktion boolean default false) returns void
language plpgsql security definer set search_path = public as $$
declare p text := public.my_player();
begin
  if p is null then return; end if;
  insert into public.app_activity (player, d, actions)
  values (p, (now() at time zone 'Europe/Zurich')::date, case when aktion then 1 else 0 end)
  on conflict (player, d) do update
    set actions = least(3, public.app_activity.actions + case when aktion then 1 else 0 end);
  delete from public.app_activity where d < current_date - 400;
end $$;
revoke execute on function public.log_activity(boolean) from public, anon;
grant execute on function public.log_activity(boolean) to authenticated;

-- 1 Punkt je 3 Tage in der App (max. 5) plus 1 Punkt je 3 Aktionen (max. 5)
create or replace function public.activity_points(von date, bis date)
returns table (player text, punkte int, spielleitung boolean)
language sql stable security definer set search_path = public as $$
  select m.player,
         (least(5, count(a.d) / 3) + least(5, coalesce(sum(a.actions), 0) / 3))::int,
         bool_or(m.role = 'admin')
  from public.members m
  left join public.app_activity a on a.player = m.player and a.d between von and bis
  where m.player is not null and public.my_role() is not null
  group by m.player
$$;
revoke execute on function public.activity_points(date, date) from public, anon;
grant execute on function public.activity_points(date, date) to authenticated;

-- Beim Umbenennen bleibt auch die Aktivität zugeordnet
create or replace function public.rename_player(old_name text, new_name text) returns void
language plpgsql security definer set search_path = public as $$
begin
  if public.my_role() not in ('admin', 'captain') then return; end if;
  update public.members set player = new_name where player = old_name;
  update public.absence_reasons set player = new_name where player = old_name;
  update public.app_activity set player = new_name where player = old_name;
end $$;
