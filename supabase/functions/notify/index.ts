// Supabase Edge Function "notify": verschickt Web-Push an alle abonnierten Geräte.
//   { type: "matchday" }           – täglich per Cron (Header: Authorization: Bearer <CRON_SECRET>)
//   { type: "result", month: 0-7 } – aus der App, nur für eingeloggte Mitglieder
// Jede Nachricht wird nur einmal verschickt (Tabelle push_log).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { matchdayMessages, resultMessage, zurichDate } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

webpush.setVapidDetails(
  Deno.env.get("VAPID_SUBJECT")!,
  Deno.env.get("VAPID_PUBLIC_KEY")!,
  Deno.env.get("VAPID_PRIVATE_KEY")!,
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");

  const { data: row } = await db.from("league_state").select("data").eq("id", "main").maybeSingle();
  if (!row) return json({ sent: 0 });

  let msgs: { key: string; tag: string; title: string; body: string }[] = [];
  if (body.type === "matchday") {
    if (!token || token !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    msgs = matchdayMessages(row.data, zurichDate(new Date()));
  } else if (body.type === "result") {
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: member } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);
    const m = resultMessage(row.data, Number(body.month));
    if (m) msgs = [m];
  } else {
    return json({ error: "unknown type" }, 400);
  }

  let sent = 0;
  for (const msg of msgs) {
    const { error } = await db.from("push_log").insert({ key: msg.key });
    if (error) continue; // bereits verschickt
    const { data: subs } = await db.from("push_subscriptions").select("endpoint, sub");
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ ...msg, url: "./" }));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  return json({ sent });
});
