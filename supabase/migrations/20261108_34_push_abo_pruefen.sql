-- Push-Abos: die Adresse im gespeicherten Abo (sub.endpoint) muss der Spalte endpoint entsprechen
-- und zu einem bekannten Push-Dienst gehören (gleiche Liste wie pushEndpointOk in supabase/functions/_shared/sicherheit.mjs).
-- Idempotent: kann mehrfach laufen.
--
-- Bestehende Zeilen, die die Regel verletzen, werden vorher gelöscht: An sie wird ohnehin nichts mehr geschickt,
-- und die App speichert das Abo eines echten Geräts bei jedem Start neu (saveSub in app/js/spieltag.js).
-- So gilt die Regel danach für alle Zeilen (validiert), nicht nur für neue (wie mit "not valid").

alter table public.push_subscriptions drop constraint if exists push_subscriptions_endpoint_pruefen;

delete from public.push_subscriptions
where not coalesce(
  sub->>'endpoint' = endpoint
  and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)(/|$)',
  false);

alter table public.push_subscriptions add constraint push_subscriptions_endpoint_pruefen check (coalesce(
  sub->>'endpoint' = endpoint
  and endpoint ~ '^https://(fcm\.googleapis\.com|updates\.push\.services\.mozilla\.com|([a-z0-9-]+\.)*push\.apple\.com|([a-z0-9-]+\.)+notify\.windows\.com)(/|$)',
  false));
