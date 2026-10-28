// Supabase Edge Function "invite": Spielleitung und Captains laden Mitglieder direkt aus der App ein.
// Verschickt die Supabase-Einladung (Mail mit Link zum Passwort-Festlegen) und setzt Rolle und Spieler-Zuordnung.
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { checkInvite, inviteError } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const APP_URL = Deno.env.get("APP_URL") || "https://ooeler.github.io/InterChampionship/";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "Nicht angemeldet" }, 401);
  const { data: caller } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();

  let inv;
  try {
    inv = checkInvite(await req.json(), caller?.role);
  } catch (e) {
    return json({ error: (e as Error).message }, 403);
  }

  const { data, error } = await db.auth.admin.inviteUserByEmail(inv.email, { redirectTo: APP_URL });
  if (error) return json({ error: inviteError(error.message) }, 400);
  // Mitglied wurde per Trigger angelegt (Rolle player) – Rolle und Spieler setzen
  await db.from("members").update({ role: inv.role, player: inv.player }).eq("user_id", data.user.id);
  return json({ ok: true, email: inv.email });
});
