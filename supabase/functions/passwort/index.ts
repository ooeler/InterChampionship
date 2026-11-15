// Supabase Edge Function "passwort": „Passwort vergessen“ ohne Login.
//   { email } → immer { ok: true }, egal ob es zur Adresse ein Konto gibt (keine Aufzählung von Konten).
// Gibt es ein Konto, erzeugt die Function mit der Service Role einen Link zum Zurücksetzen (auth.admin.generateLink, type
// "recovery") und verschickt ihn über denselben Weg wie die Test-Mail (_shared/mailer.ts: SMTP, z. B. Mailomat, oder Brevo).
// Der Link führt über Supabase Auth zurück zur App (#…type=recovery) → „Passwort festlegen“.
// Ziel des Links nur aus dem Secret APP_URL, nie aus der Anfrage.
// Sperren (Tabelle push_log, Adresse nur als SHA-256): 1 Anfrage pro Adresse in 10 Min., 30 Anfragen pro Stunde insgesamt.
// Fehler: 400 ungültige Adresse, 429 zu viele Anfragen, 503 Mailversand nicht eingerichtet.
import { createClient } from "npm:@supabase/supabase-js@2.119.0";
import { mailReady, sendMail, MAIL_MISSING } from "../_shared/mailer.ts";
import { appUrl, checkEmail, emailHash, limitReached, rateKeys, resetMail, unknownUser, MSG_FEHLER, MSG_LIMIT } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

const APP_URL = appUrl(Deno.env.get("APP_URL"));

// Läuft nach der Antwort weiter: so dauert die Antwort gleich lang, ob es ein Konto gibt oder nicht
// deno-lint-ignore no-explicit-any
const waitUntil = (p: Promise<unknown>) => { const R = (globalThis as any).EdgeRuntime; if (R?.waitUntil) R.waitUntil(p); else return p; };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);
  const body = await req.json().catch(() => ({}));
  let email: string;
  try {
    email = checkEmail(body);
  } catch (e) {
    return json({ error: (e as Error).message }, 400);
  }
  if (!mailReady()) {
    console.log("Passwort-Mail nicht möglich:", MAIL_MISSING);
    return json({ error: MSG_FEHLER }, 503);
  }

  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const now = Date.now();
  const k = rateKeys(await emailHash(email), now);
  await db.from("push_log").delete().like("key", k.alle).lt("created_at", k.alt); // nichts länger als einen Tag aufbewahren
  // Die Sperren gelten für jede Adresse, ob mit Konto oder ohne: die Antwort verrät nichts über bestehende Konten
  const [own, all] = await Promise.all([
    db.from("push_log").select("key", { count: "exact", head: true }).like("key", k.adresse).gt("created_at", k.seitAdresse),
    db.from("push_log").select("key", { count: "exact", head: true }).like("key", k.alle).gt("created_at", k.seitStunde),
  ]);
  if (own.error || all.error) return json({ error: MSG_FEHLER }, 500);
  if (limitReached(own.count, all.count)) return json({ error: MSG_LIMIT }, 429);
  const { error: lockErr } = await db.from("push_log").insert({ key: k.key });
  if (lockErr) return json({ error: MSG_LIMIT }, 429); // gleichzeitige zweite Anfrage im selben Fenster

  const job = (async () => {
    const { data, error } = await db.auth.admin.generateLink({ type: "recovery", email, options: { redirectTo: APP_URL } });
    if (error) {
      if (!unknownUser(error)) console.log("Passwort-Link nicht erstellt:", error.message);
      return;
    }
    const link = data?.properties?.action_link;
    if (!link) return;
    const m = resetMail(link);
    const r = await sendMail({ to: [email], subject: m.subject, text: m.text });
    if (!r.ok) console.log("Passwort-Mail nicht verschickt:", r.error);
  })().catch((e) => console.log("Passwort-Mail: Fehler", String((e as Error)?.message || e).slice(0, 200)));
  await waitUntil(job);
  return json({ ok: true });
});
