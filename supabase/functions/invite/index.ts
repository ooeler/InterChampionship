// Supabase Edge Function "invite": Einladungslinks statt Mail – es braucht keinen Mailversand.
//   Spielleitung & Captains (angemeldet):
//     { action: "create", role?, player? } → { token }  (Link = App-Adresse + "#einladung=" + token, 7 Tage gültig, einmalig)
//     { action: "list" }                   → offene Einladungen
//     { action: "revoke", id }             → Einladung zurückziehen (Captains nur eigene)
//   Eingeladene Person (ohne Login, mit Token aus dem Link):
//     { action: "check", token }                  → { player, role }
//     { action: "join", token, email, password }  → legt das Konto an, setzt Rolle und Spieler
import { createClient } from "npm:@supabase/supabase-js@2.118.0";
import { checkInvite, checkJoin, checkToken, hashToken, INVITE_DAYS, joinError, newToken } from "./logic.mjs";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
const INVALID = "Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon verwendet.";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  if (body.action === "check" || body.action === "join") {
    let hash;
    try {
      hash = await hashToken(checkToken(body.token));
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    if (body.action === "check") {
      const { data: inv } = await db.from("invites").select("player, role")
        .eq("token_hash", hash).is("used_at", null).gt("expires_at", now).maybeSingle();
      return inv ? json({ ok: true, ...inv }) : json({ error: INVALID }, 404);
    }
    let j;
    try {
      j = checkJoin(body);
    } catch (e) {
      return json({ error: (e as Error).message }, 400);
    }
    // Link atomar reservieren: kann nur einmal eingelöst werden
    const { data: inv } = await db.from("invites").update({ used_at: now })
      .eq("token_hash", hash).is("used_at", null).gt("expires_at", now).select("id, role, player").maybeSingle();
    if (!inv) return json({ error: INVALID }, 404);
    const { data, error } = await db.auth.admin.createUser({ email: j.email, password: j.password, email_confirm: true });
    if (error) {
      await db.from("invites").update({ used_at: null }).eq("id", inv.id); // Link bleibt gültig
      return json({ error: joinError(error.message) }, 400);
    }
    // Mitglied wurde per Trigger angelegt (Rolle player) – Rolle und Spieler setzen
    await db.from("members").update({ role: inv.role, player: inv.player }).eq("user_id", data.user.id);
    await db.from("invites").update({ used_by: data.user.id }).eq("id", inv.id);
    return json({ ok: true, email: j.email });
  }

  const token = (req.headers.get("Authorization") || "").replace(/^Bearer /, "");
  const { data: { user } } = await db.auth.getUser(token);
  if (!user) return json({ error: "Nicht angemeldet" }, 401);
  const { data: caller } = await db.from("members").select("role").eq("user_id", user.id).maybeSingle();
  if (caller?.role !== "admin" && caller?.role !== "captain") return json({ error: "Nur Spielleitung und Captains dürfen einladen." }, 403);

  if (body.action === "create") {
    let inv;
    try {
      inv = checkInvite(body, caller.role);
    } catch (e) {
      return json({ error: (e as Error).message }, 403);
    }
    const t = newToken();
    const expires_at = new Date(Date.now() + INVITE_DAYS * 864e5).toISOString();
    const { error } = await db.from("invites").insert({ token_hash: await hashToken(t), ...inv, created_by: user.id, expires_at });
    return error ? json({ error: "Einladung konnte nicht erstellt werden." }, 500) : json({ ok: true, token: t, expires_at });
  }
  if (body.action === "list") {
    const { data } = await db.from("invites").select("id, player, role, created_by, created_at, expires_at")
      .is("used_at", null).gt("expires_at", now).order("created_at", { ascending: false }).limit(50);
    return json({ ok: true, items: (data ?? []).map(({ created_by, ...x }) => ({ ...x, mine: created_by === user.id })) });
  }
  if (body.action === "revoke") {
    let q = db.from("invites").delete().eq("id", Number(body.id)).is("used_at", null);
    if (caller.role !== "admin") q = q.eq("created_by", user.id);
    const { error } = await q;
    return error ? json({ error: "Zurückziehen fehlgeschlagen." }, 500) : json({ ok: true });
  }
  return json({ error: "unknown action" }, 400);
});
