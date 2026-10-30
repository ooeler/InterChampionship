-- Wartungsmodus: Während ein Release eingespielt wird, zeigt die App eine Wartungsseite. Idempotent.
-- Ein- und ausgeschaltet wird nur vom Release-Workflow (direkt per SQL); lesen dürfen alle, auch ohne Login.
create table if not exists public.app_status (
  id          text primary key default 'main' check (id = 'main'),
  maintenance boolean not null default false,
  since       timestamptz
);
alter table public.app_status enable row level security;
revoke all on table public.app_status from anon, authenticated;
grant select on table public.app_status to anon, authenticated;
drop policy if exists "Status lesen" on public.app_status;
create policy "Status lesen" on public.app_status for select to anon, authenticated using (true);
insert into public.app_status (id) values ('main') on conflict (id) do nothing;

-- Live-Updates, damit offene Apps die Wartungsseite sofort zeigen und danach neu laden
do $$ begin
  alter publication supabase_realtime add table public.app_status;
exception when duplicate_object then null; when undefined_object then null; end $$;
