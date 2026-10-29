-- Sachstrafen (z. B. "Kiste Bier") statt Geldbetrag, im Katalog und bei den Strafen. Idempotent.
-- Bei einer Sachstrafe ist amount = 0 und item enthält die Sache; das CHF-Total zählt nur Geldbeträge.
alter table public.penalty_catalog add column if not exists item text;
alter table public.penalties add column if not exists item text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'penalty_catalog_item_len') then
    alter table public.penalty_catalog add constraint penalty_catalog_item_len check (item is null or length(item) between 1 and 60);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'penalties_item_len') then
    alter table public.penalties add constraint penalties_item_len check (item is null or length(item) between 1 and 60);
  end if;
end $$;

-- Strafenkatalog der Herren Inter (Stand 29.10.2026); bestehende Einträge mit gleichem Grund bleiben unverändert
insert into public.penalty_catalog (reason, amount, item) values
  ('Training nicht vorbereitet', 20, null),
  ('Shutout vom Goali (Hauptmatch)', 0, 'Kiste Bier'),
  ('10tes Goal (Total)', 0, 'Kiste Bier'),
  ('2min Strafe', 2, null),
  ('Nicht abgemeldet', 20, null),
  ('Nach 18:40 Uhr in Halle', 5, null)
on conflict (reason) do nothing;
