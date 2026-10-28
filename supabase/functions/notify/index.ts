// Supabase Edge Function "notify": verschickt Web-Push an alle abonnierten Geräte.
//   { type: "matchday" }           – täglich per Cron (Header: Authorization: Bearer <CRON_SECRET>):
//                                    Match Day in 3 Tagen (an alle) + Trainingsleitung in 2 Tagen (nur an den Leiter)
//   { type: "training" }           – alle 15 Min. per Cron: "Morgen ist Training" 26 h vorher (an alle)
//   { type: "result", month: 0-7 } – aus der App, nur für eingeloggte Mitglieder
//   { type: "signup", d, t, player, off } – aus der App: An-/Abmeldung an alle mit notify_changes (ausser der Person selbst)
// Jede Nachricht wird nur einmal verschickt (Tabelle push_log).
import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { matchdayMessages, resultMessage, signupMessage, trainingLeadMessages, trainingSoonMessages, zurichDate } from "./logic.mjs";

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

  let msgs: { key: string | null; tag: string; title: string; body: string; player?: string }[] = [];
  let onlyUsers: string[] | null = null; // null = alle Abos
  if (body.type === "training") {
    if (!token || token !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    msgs = trainingSoonMessages(row.data, Date.now());
  } else if (body.type === "signup") {
    const { data: { user } } = await db.auth.getUser(token);
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: member } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
    if (!member) return json({ error: "forbidden" }, 403);
    const m = signupMessage(body);
    if (!m) return json({ error: "ungültig" }, 400);
    const { data: fans } = await db.from("members").select("user_id").eq("notify_changes", true).neq("user_id", user.id);
    onlyUsers = (fans ?? []).map((x) => x.user_id);
    if (!onlyUsers.length) return json({ sent: 0 });
    msgs = [m];
  } else if (body.type === "matchday") {
    if (!token || token !== Deno.env.get("CRON_SECRET")) return json({ error: "forbidden" }, 403);
    const today = zurichDate(new Date());
    msgs = [...matchdayMessages(row.data, today), ...trainingLeadMessages(row.data, today)];
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
    if (msg.key) {
      const { error } = await db.from("push_log").insert({ key: msg.key });
      if (error) continue; // bereits verschickt
    }
    let q = db.from("push_subscriptions").select("endpoint, sub");
    if (onlyUsers) q = q.in("user_id", onlyUsers);
    if (msg.player) { // nur an die Geräte der Konten, die diesem Spieler zugeordnet sind
      const { data: owners } = await db.from("members").select("user_id").eq("player", msg.player);
      q = q.in("user_id", (owners ?? []).map((o) => o.user_id));
    }
    const { data: subs } = await q;
    const { player: _p, ...payload } = msg;
    for (const s of subs ?? []) {
      try {
        await webpush.sendNotification(s.sub, JSON.stringify({ ...payload, url: "./" }));
        sent++;
      } catch (e) {
        const code = (e as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) await db.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
      }
    }
  }
  return json({ sent });
});
