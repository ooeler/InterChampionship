-- Strafenkatalog: Grund + Betrag, aus dem beim Eintragen einer Strafe gewählt wird. Idempotent.
-- Pflegen dürfen Spielleitung und Strafenchef (Zusatzrolle); lesen alle Mitglieder.

create or replace function public.can_edit_catalog() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' or strafen from public.members where user_id = auth.uid()), false)
$$;
revoke execute on function public.can_edit_catalog() from public, anon;
grant execute on function public.can_edit_catalog() to authenticated;

create table if not exists public.penalty_catalog (
  id         bigint generated always as identity primary key,
  reason     text not null unique check (length(reason) between 1 and 120),
  amount     numeric(7, 2) not null check (amount >= 0 and amount <= 1000),
  created_by uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.penalty_catalog enable row level security;
revoke all on table public.penalty_catalog from anon;

drop policy if exists "Katalog lesen" on public.penalty_catalog;
drop policy if exists "Katalog eintragen" on public.penalty_catalog;
drop policy if exists "Katalog ändern" on public.penalty_catalog;
drop policy if exists "Katalog löschen" on public.penalty_catalog;
create policy "Katalog lesen" on public.penalty_catalog for select to authenticated using (public.my_role() is not null);
create policy "Katalog eintragen" on public.penalty_catalog for insert to authenticated with check (public.can_edit_catalog());
create policy "Katalog ändern" on public.penalty_catalog for update to authenticated using (public.can_edit_catalog()) with check (public.can_edit_catalog());
create policy "Katalog löschen" on public.penalty_catalog for delete to authenticated using (public.can_edit_catalog());
