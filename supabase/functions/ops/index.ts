// Supabase Edge Function "ops": Betriebsaufgaben für GitHub Actions.
// Header: Authorization: Bearer <CRON_SECRET>   (GitHub-Secret SUPABASE_CRON_SECRET)
//   { action: "health" }                    – prüft den Datenbankzugriff
//   { action: "snapshot", reason: "…" }     – Backup der Saison-Daten (z. B. vor jedem Release)
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { safeEqual } from "../_shared/sicherheit.mjs";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!safeEqual(token, Deno.env.get("CRON_SECRET"))) return json({ error: "forbidden" }, 403);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  if (body.action === "health") {
    const { error } = await db.from("league_state").select("id", { head: true, count: "exact" });
    return error ? json({ ok: false, error: error.message }, 500) : json({ ok: true });
  }
  if (body.action === "snapshot") {
    const { data, error } = await db.rpc("snapshot_league", { reason: String(body.reason || "Release").slice(0, 80) });
    return error ? json({ error: error.message }, 500) : json({ ok: true, backup_id: data });
  }
  return json({ error: "unknown action" }, 400);
});
