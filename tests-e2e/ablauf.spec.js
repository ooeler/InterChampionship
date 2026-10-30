// End-to-End gegen eine echte, lokale Supabase: Migrationen, Row Level Security, Trigger und Edge Functions.
// Ein durchgehender Ablauf – die Schritte bauen aufeinander auf (Spielleitung → Einladung → Spieler → Rechte).
const { test, expect } = require("@playwright/test");
const crypto = require("crypto");

const URL = process.env.E2E_SUPABASE_URL, ANON = process.env.E2E_ANON_KEY, SERVICE = process.env.E2E_SERVICE_KEY;
const pw = () => crypto.randomBytes(12).toString("base64url"); // Test-Passwörter nur für diese lokale Datenbank
const ADMIN = { email: "spielleitung@e2e.test", password: pw() };
const PLAYER = { email: "silvan@e2e.test", password: pw() };

// Direkter Zugriff auf die lokale Test-Datenbank (Service-Key = an RLS vorbei, nur zum Vorbereiten und Nachprüfen)
async function rest(path, { key = SERVICE, method = "GET", body } = {}) {
  const r = await fetch(URL + path, {
    method,
    headers: { apikey: key, Authorization: "Bearer " + key, "Content-Type": "application/json", Prefer: "return=representation" },
    body: body && JSON.stringify(body),
  });
  const text = await r.text();
  return { status: r.status, data: text ? JSON.parse(text) : null };
}
const state = async () => (await rest("/rest/v1/league_state?id=eq.main&select=data")).data[0].data;

async function login(page, user) {
  await page.goto("/");
  await page.click("#li");
  await page.fill("#auth input[name=email]", user.email);
  await page.fill("#auth input[name=pw]", user.password);
  await page.click("#auth form .btn");
  await expect(page.locator("#lo")).toBeVisible();
}

test.describe.configure({ mode: "serial" });

let admin, player, link, playerId;

test.beforeAll(async ({ browser }) => {
  expect(URL, "E2E_SUPABASE_URL fehlt").toMatch(/^http:\/\/(127\.0\.0\.1|localhost)/);
  // Spielleitung anlegen: Konto über die Admin-API, Rolle direkt in der Datenbank (wie im README beschrieben)
  const u = await rest("/auth/v1/admin/users", { method: "POST", body: { email: ADMIN.email, password: ADMIN.password, email_confirm: true } });
  expect(u.status).toBe(200);
  const m = await rest("/rest/v1/members?user_id=eq." + u.data.id, { method: "PATCH", body: { role: "admin", player: "Othmar Oeler" } });
  expect(m.data).toHaveLength(1); // Trigger hat das Mitglied beim Anlegen erstellt
  admin = await (await browser.newContext()).newPage();
  player = await (await browser.newContext()).newPage();
});

test("Öffentliche Rangliste zeigt den echten Saisonstand ohne Login", async ({ page }) => {
  await page.goto("/");
  const sp = page.locator(".card", { has: page.locator("h3", { hasText: /^Spieltage$/ }) });
  await expect(sp.locator(".row", { hasText: "September" })).toContainText("3 : 11");
  await expect(sp.locator(".row", { hasText: "Oktober" })).toContainText("9 : 5");
  const anw = page.locator(".card", { has: page.locator("h3", { hasText: "Anwesenheit Saison" }) });
  await expect(anw.locator(".row").first()).toContainText("Pascal Hilpertshauser");
});

test("Ohne Login: keine geschützten Daten, keine Änderungen (RLS)", async () => {
  expect((await rest("/rest/v1/members?select=email", { key: ANON })).data).toEqual([]);
  expect((await rest("/rest/v1/penalties?select=id", { key: ANON })).status).not.toBe(200);
  expect((await rest("/rest/v1/invites?select=id", { key: ANON })).status).not.toBe(200);
  expect((await rest("/rest/v1/rpc/snapshot_league", { key: ANON, method: "POST", body: { reason: "x" } })).status).not.toBe(200);
  const before = await state();
  await rest("/rest/v1/league_state?id=eq.main", { key: ANON, method: "PATCH", body: { data: {} } });
  expect(await state()).toEqual(before);
});

test("Spielleitung meldet sich an und sieht die Verwaltung", async () => {
  await login(admin, ADMIN);
  await expect(admin.locator("nav [data-tab=team]")).toBeVisible();
  await admin.click("nav [data-tab=team]");
  await admin.click("h3[data-acc=us]");
  await expect(admin.locator(".card", { hasText: "Benutzer & Rollen" })).toContainText(ADMIN.email);
});

test("Einladungslink: neues Mitglied erstellt sein Konto und ist dem Spieler zugeordnet", async () => {
  const c = admin.locator(".card", { has: admin.locator("h3", { hasText: "Mitglied einladen" }) });
  await c.locator("select[name=player]").selectOption("Silvan Frey");
  await c.locator("select[name=role]").selectOption("player");
  await c.locator("form#inv button.add").click();
  link = await c.locator(".invk input").inputValue();
  expect(link).toMatch(/#einladung=[A-Za-z0-9_-]{43}$/);

  await player.goto(link);
  const a = player.locator("#auth");
  await expect(a.locator(".jw")).toContainText("Silvan Frey");
  await a.locator("input[name=email]").fill(PLAYER.email);
  await a.locator("input[name=p1]").fill(PLAYER.password);
  await a.locator("input[name=p2]").fill(PLAYER.password);
  await a.locator("form button.btn").click();
  await expect(player.locator("#lo")).toBeVisible();
  await expect(player.locator("#hi")).toContainText("Silvan");
  await expect(player.locator("nav [data-tab=team]")).toHaveCount(0);

  const m = (await rest("/rest/v1/members?email=eq." + PLAYER.email + "&select=user_id,role,player")).data[0];
  expect(m).toMatchObject({ role: "player", player: "Silvan Frey" });
  playerId = m.user_id;
});

test("Ein Einladungslink funktioniert nur einmal", async ({ page }) => {
  await page.goto(link);
  await expect(page.locator("#auth .jw")).toContainText("ungültig, abgelaufen oder wurde schon verwendet");
});

test("Spieler meldet sich vom nächsten Training ab – gespeichert in der Datenbank", async () => {
  await player.click("nav [data-tab=train]");
  const btn = player.locator(".card", { hasText: "Meine Trainings" }).locator("[data-abw]:not(.dis)").first();
  await btn.click();
  await expect(btn).toContainText("abgemeldet");
  await expect.poll(async () => (await state()).m.flatMap((m) => m.tr).some((x) => (x.ab || []).includes("Silvan Frey"))).toBe(true);
});

test("Spieler darf Teams, Rollen und Strafen nicht ändern (serverseitig)", async () => {
  const r = await player.evaluate(async () => {
    const pen = await sb.from("penalties").insert({ d: "2026-10-28", player: "Tobias Keller", reason: "x", amount: 1 });
    const role = await sb.rpc("set_strafen", { uid: me.id, on_strafen: true });
    const cur = (await sb.from("league_state").select("data").eq("id", "main").single()).data.data;
    cur.t[0].n = "Gehackt";
    const team = await sb.from("league_state").update({ data: cur }).eq("id", "main");
    return [pen.error && pen.error.message, role.error && role.error.message, team.error && team.error.message];
  });
  expect(r[0]).toContain("row-level security");
  expect(r[1]).toContain("Nur die Spielleitung");
  expect(r[2]).toContain("Nur Admins und Captains");
  expect((await state()).t[0].n).toBe("Lochball Legenden");
});

test("Spielleitung macht den Spieler zum Strafenchef – danach darf er Strafen eintragen", async () => {
  await admin.reload();
  await admin.click("nav [data-tab=team]");
  await admin.click("h3[data-acc=us]");
  await admin.locator(`input[data-mstraf='${playerId}']`).check();
  await expect.poll(async () => (await rest("/rest/v1/members?user_id=eq." + playerId + "&select=strafen")).data[0].strafen).toBe(true);

  await player.reload();
  await player.click("nav [data-tab=train]");
  const f = player.locator("form#pen");
  await f.locator("select[name=p]").selectOption("Tobias Keller");
  await f.locator("input[name=g]").fill("zu spät");
  await f.locator("input[name=b]").fill("5");
  await f.locator("button.add").click();
  await expect.poll(async () => (await rest("/rest/v1/penalties?select=player,reason,amount")).data).toEqual([{ player: "Tobias Keller", reason: "zu spät", amount: 5 }]);
});

test("Strafenchef pflegt den Strafenkatalog im Teams-Tab, Spieler ohne Rolle nicht", async () => {
  await player.click("nav [data-tab=team]");
  const f = player.locator("form#catf");
  await f.locator("input[name=g]").fill("Handy im Training");
  await f.locator("input[name=b]").fill("10");
  await f.locator("button.add").click();
  await expect.poll(async () => (await rest("/rest/v1/penalty_catalog?reason=eq.Handy%20im%20Training&select=reason,amount,item")).data).toEqual([{ reason: "Handy im Training", amount: 10, item: null }]);
  // Katalog der Herren Inter aus der Migration, inkl. Sachstrafen
  const all = (await rest("/rest/v1/penalty_catalog?select=reason,amount,item&order=reason")).data;
  expect(all).toHaveLength(7);
  expect(all).toContainEqual({ reason: "Shutout vom Goali (Hauptmatch)", amount: 0, item: "Kiste Bier" });
  // bearbeiten (Grund + Betrag)
  await player.locator(".catr", { hasText: "Handy im Training" }).locator("[data-catedit]").click();
  await player.locator("form#cate input[name=g]").fill("Handy in der Garderobe");
  await player.locator("form#cate input[name=b]").fill("15");
  await player.locator("form#cate button.add", { hasText: "Speichern" }).click();
  await expect.poll(async () => (await rest("/rest/v1/penalty_catalog?reason=like.Handy*&select=reason,amount")).data).toEqual([{ reason: "Handy in der Garderobe", amount: 15 }]);
  // ohne Login: nicht lesbar
  expect((await rest("/rest/v1/penalty_catalog?select=id", { key: ANON })).status).not.toBe(200);
});

test("Resultat der Spielleitung erscheint sofort in der öffentlichen Rangliste", async ({ page }) => {
  await admin.click("nav [data-tab=spiel]");
  await admin.click("[data-c='2']"); // November
  const plus = (t) => admin.locator(`button[data-k=res][data-t='${t}'][data-d='1']`).first();
  await plus(0).click();
  await plus(0).click();
  await plus(1).click();
  await expect.poll(async () => (await state()).m[2].res).toEqual([2, 1]);

  await page.goto("/");
  const sp = page.locator(".card", { has: page.locator("h3", { hasText: /^Spieltage$/ }) });
  await expect(sp.locator(".row", { hasText: "November" })).toContainText("2 : 1");
});

test("Jede Änderung wird automatisch gesichert (Datensicherung)", async () => {
  const h = (await rest("/rest/v1/league_state_history?select=reason")).data.map((x) => x.reason);
  expect(h).toContain("Änderung");
});

test("Spielleitung löscht einen Benutzer – Konto weg, Spieler und Daten bleiben", async () => {
  // der Spieler hat zuletzt gespeichert (updated_by) – das darf das Löschen nicht blockieren
  await rest("/rest/v1/league_state?id=eq.main", { method: "PATCH", body: { updated_by: playerId } });
  const r = await player.evaluate(async (uid) => (await sb.rpc("delete_member", { uid })).error.message, playerId);
  expect(r).toContain("Nur die Spielleitung");
  await admin.reload();
  await admin.click("nav [data-tab=team]");
  await admin.click("h3[data-acc=us]");
  admin.once("dialog", (d) => d.accept());
  await admin.locator(`[data-mdel='${playerId}']`).click();
  await expect.poll(async () => (await rest("/rest/v1/members?user_id=eq." + playerId + "&select=user_id")).data).toEqual([]);
  expect((await rest("/auth/v1/admin/users/" + playerId)).status).toBe(404);
  expect(JSON.stringify((await state()).t)).toContain("Silvan Frey");
  expect((await rest("/rest/v1/league_state?id=eq.main&select=updated_by")).data[0].updated_by).toBeNull();
  await expect(admin.locator(".card", { hasText: "Benutzer & Rollen" })).not.toContainText(PLAYER.email);
});

test("Wartungsstatus: öffentlich lesbar, aber nur vom Release änderbar", async ({ page }) => {
  expect((await rest("/rest/v1/app_status?select=maintenance", { key: ANON })).data).toEqual([{ maintenance: false }]);
  await rest("/rest/v1/app_status?id=eq.main", { key: ANON, method: "PATCH", body: { maintenance: true } });
  const r = await admin.evaluate(async () => (await sb.from("app_status").update({ maintenance: true }).eq("id", "main").select()).error.message);
  expect(r).toContain("permission denied"); // auch die Spielleitung nicht – nur der Release-Workflow
  expect((await rest("/rest/v1/app_status?select=maintenance")).data).toEqual([{ maintenance: false }]);
  // eingeschaltet (wie im Release-Workflow) → Wartungsseite, ausgeschaltet → App lädt neu
  await rest("/rest/v1/app_status?id=eq.main", { method: "PATCH", body: { maintenance: true } });
  await page.goto("/");
  await expect(page.locator("#wart")).toBeVisible();
  await rest("/rest/v1/app_status?id=eq.main", { method: "PATCH", body: { maintenance: false } });
  await page.evaluate(() => maint());
  await expect(page.locator("#wart")).toBeHidden();
});
