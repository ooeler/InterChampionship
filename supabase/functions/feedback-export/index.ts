// Supabase Edge Function "feedback-export": Schnittstelle für GitHub Actions (feedback-issues.yml).
// Header: Authorization: Bearer <CRON_SECRET>   (GitHub-Secret SUPABASE_CRON_SECRET)
//   { action: "pending" }                          – bis zu 20 neue Vorschläge
//   { action: "done", id, number, url }            – als Issue erfasst
//   { action: "failed", id, error }                – Anlegen fehlgeschlagen (wird beim nächsten Lauf nicht erneut versucht)
//   { action: "open" }                             – erfasste Vorschläge, deren Issue noch offen sein könnte
//   { action: "closed", id, completed, notify }    – Issue geschlossen; bei completed + notify bekommt die Person eine Mail
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { safeEqual } from "../_shared/sicherheit.mjs";

const APP_URL = Deno.env.get("APP_URL") || "https://ooeler.github.io/InterChampionship/";

async function mail(to: string, subject: string, text: string) {
  const apiKey = Deno.env.get("BREVO_API_KEY"), from = Deno.env.get("MAIL_FROM");
  if (!apiKey || !from) return "BREVO_API_KEY oder MAIL_FROM fehlt";
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": apiKey, "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify({ sender: { email: from, name: "Herren Inter" }, to: [{ email: to }], subject, textContent: text }),
  });
  return r.ok ? null : `Brevo ${r.status}`;
}

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  if (!safeEqual(token, Deno.env.get("CRON_SECRET"))) return json({ error: "forbidden" }, 403);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));

  if (body.action === "pending") {
    const { data, error } = await db.from("feedback").select("id, title, body, labels")
      .eq("status", "neu").order("created_at").limit(20);
    return error ? json({ error: error.message }, 500) : json({ items: data });
  }
  if (body.action === "done") {
    const { error } = await db.from("feedback")
      .update({ status: "erfasst", issue_number: body.number, issue_url: body.url, error: null }).eq("id", body.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }
  if (body.action === "failed") {
    const { error } = await db.from("feedback")
      .update({ status: "fehler", error: String(body.error || "").slice(0, 500) }).eq("id", body.id);
    return error ? json({ error: error.message }, 500) : json({ ok: true });
  }
  if (body.action === "open") {
    const { data, error } = await db.from("feedback").select("id, issue_number")
      .eq("status", "erfasst").not("issue_number", "is", null).limit(100);
    return error ? json({ error: error.message }, 500) : json({ items: data });
  }
  if (body.action === "closed") {
    const done = !!(body.completed && body.notify);
    // nur erfasste Zeilen: so geht pro Vorschlag höchstens eine Mail raus, auch wenn ein Lauf wiederholt wird
    const { data, error } = await db.from("feedback").update({ status: done ? "umgesetzt" : "geschlossen" })
      .eq("id", body.id).eq("status", "erfasst").select("user_id, title").maybeSingle();
    if (error) return json({ error: error.message }, 500);
    if (!done || !data) return json({ ok: true, mailed: false });
    const m = await db.from("members").select("email, player").eq("user_id", data.user_id).maybeSingle();
    if (!m.data?.email) return json({ ok: true, mailed: false });
    const name = (m.data.player || "").split(" ")[0];
    const thanks = data.title.startsWith("🐞") ? "deinen Hinweis" : "deine coole Idee";
    const err = await mail(m.data.email, `Danke für ${thanks}! 🎉`, [
      name ? `Hallo ${name}` : "Hallo",
      "",
      `Vielen Dank für ${thanks}! „${data.title}“ ist jetzt in der App Herren Inter umgesetzt. Schön, dass du mithilfst, die App besser zu machen.`,
      "",
      APP_URL,
      "",
      "Let's fly!",
    ].join("\n"));
    return json({ ok: true, mailed: !err, error: err });
  }
  return json({ error: "unknown action" }, 400);
});
