// Trainingsleitung einteilen nur durch die Spielleitung (App, Mock-Guard, Migration 39)
// und „Verspätet“ bis 30 Minuten vor Beginn, am Trainingstag mit Push an Trainingsleitung und Spielleitung.
const fs = require("fs");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const CAPTAIN = { email: "captain@flyingpenguins.test", password: "geheim123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]"));
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });
const mine = (page) => card(page, "Meine Trainings");
const overview = (page) => card(page, "Übersicht pro Training");
const first = (page) => mine(page).locator(".row").first();

// Saison mit Leitung am 28.10. (m[2].tr[1]); optional eigener Spieler und weitere Änderungen
async function seed(page, { player = "Silvan Frey", patch = "" } = {}) {
  await page.goto("/");
  await page.evaluate(({ player, patch }) => {
    const d = fix(def());
    d.m[2].tr[1].lead = "Beat Rentsch";
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
  }, { player, patch });
}
async function open(page, user) {
  await login(page, user);
  await page.click("nav [data-tab=train]");
}
// Speichert direkt über den Client (wie ein manipulierter Client): Leitung am 28.10. (m[2].tr[1]) und am 21.10. (m[2].tr[0])
const sendLeads = (page, a, b) => page.evaluate(async ([a, b]) => {
  const cur = JSON.parse(localStorage.getItem("__mock_db")).data;
  const set = (x, v) => { if (v) x.lead = v; else delete x.lead };
  set(cur.m[2].tr[1], a);
  set(cur.m[2].tr[0], b);
  return (await sb.from("league_state").upsert({ id: "main", data: cur })).error;
}, [a, b]);

test.describe("Trainingsleitung einteilen nur die Spielleitung", () => {
  test("Übersicht pro Training: Spielleitung wählt, Captain und Spieler sehen nur, wer leitet", async ({ page }) => {
    await seed(page);
    await open(page, ADMIN);
    const sel = overview(page).locator("select[data-lead='2,1']");
    await expect(sel).toHaveValue("Beat Rentsch");
    await sel.selectOption("Tobias Keller");
    await expect.poll(async () => (await db(page)).m[2].tr[1].lead).toBe("Tobias Keller");

    for (const u of [CAPTAIN, SPIELER]) {
      await page.evaluate(() => localStorage.removeItem("__mock_session")); // abmelden
      await open(page, u);
      await expect(overview(page).locator("select[data-lead]")).toHaveCount(0);
      await expect(overview(page).locator(".tlro")).toHaveText(/^Leitung: Tobias Keller · Einteilen kann die Spielleitung/);
    }
  });

  test("Ohne Leitung: „– Leitung offen –“; Teams-Karte „Trainingsleitung · Einteilen“ nur für die Spielleitung", async ({ page }) => {
    await seed(page, { patch: "delete d.m[2].tr[1].lead" });
    await open(page, CAPTAIN);
    await expect(overview(page).locator(".tlro")).toContainText("– Leitung offen –");
    await page.click("nav [data-tab=team]");
    await expect(page.locator("h3[data-acc=tl]")).toHaveCount(0);
    await expect(page.locator("main select[data-lead]")).toHaveCount(0);
  });

  test("Spielleitung in der Ansicht „Spieler“: ebenfalls nur lesen", async ({ page }) => {
    await seed(page);
    await open(page, ADMIN);
    await expect(overview(page).locator("select[data-lead]")).toHaveCount(1);
    await page.evaluate(() => { VIEW = "player"; applyRole(); render() });
    await expect(overview(page).locator("select[data-lead]")).toHaveCount(0);
    await expect(overview(page).locator(".tlro")).toContainText("Leitung: Beat Rentsch");
  });

  test("Spieler: Übernehmen und Abgeben unter Meine Trainings gehen weiterhin", async ({ page }) => {
    await seed(page);
    await open(page, SPIELER);
    await expect(first(page)).toContainText("Leitung: Beat Rentsch");
    await first(page).locator("[data-leadme]").click(); // Übernehmen (Bestätigung wird angenommen)
    await expect(first(page)).toContainText("Du leitest das Training");
    await expect.poll(async () => (await db(page)).m[2].tr[1].lead).toBe("Silvan Frey");
    await first(page).locator("[data-leadme]").click(); // Abgeben
    await expect(first(page).locator("[data-leadme]")).toHaveText("Ich leite");
    await expect.poll(async () => (await db(page)).m[2].tr[1].lead).toBeUndefined();
    await first(page).locator("[data-leadme]").click(); // Ich leite
    await expect.poll(async () => (await db(page)).m[2].tr[1].lead).toBe("Silvan Frey");
  });

  test("Server (Mock-Guard): Spieler und Captain können nur sich selbst ein- oder austragen", async ({ page }) => {
    // m[2].tr[0] = 21.10., m[2].tr[1] = 28.10. (Leitung Beat Rentsch)
    await seed(page);
    await open(page, SPIELER);
    // jemand anderen einteilen bzw. fremde Leitung entfernen: still verworfen
    expect(await sendLeads(page, null, "Tobias Keller")).toBeNull();
    let s = await db(page);
    expect([s.m[2].tr[1].lead, s.m[2].tr[0].lead]).toEqual(["Beat Rentsch", undefined]);
    // sich selbst eintragen (auch anstelle einer anderen Leitung): gilt
    expect(await sendLeads(page, "Silvan Frey", "Silvan Frey")).toBeNull();
    s = await db(page);
    expect([s.m[2].tr[1].lead, s.m[2].tr[0].lead]).toEqual(["Silvan Frey", "Silvan Frey"]);
    // die eigene Leitung an jemand anderen weitergeben: verworfen; austragen: gilt
    expect(await sendLeads(page, "Tobias Keller", null)).toBeNull();
    s = await db(page);
    expect([s.m[2].tr[1].lead, s.m[2].tr[0].lead]).toEqual(["Silvan Frey", undefined]);

    await page.evaluate(() => localStorage.removeItem("__mock_session")); // abmelden
    await page.evaluate(() => localStorage.setItem("__mock_player", "Andreas Scherrer"));
    await open(page, CAPTAIN);
    expect(await sendLeads(page, "Beat Rentsch", "Tobias Keller")).toBeNull();
    s = await db(page);
    expect([s.m[2].tr[1].lead, s.m[2].tr[0].lead]).toEqual(["Silvan Frey", undefined]);

    await page.evaluate(() => localStorage.removeItem("__mock_session")); // abmelden
    await open(page, ADMIN);
    expect(await sendLeads(page, "Beat Rentsch", "Tobias Keller")).toBeNull();
    s = await db(page);
    expect([s.m[2].tr[1].lead, s.m[2].tr[0].lead]).toEqual(["Beat Rentsch", "Tobias Keller"]);
  });

  test("Captain benennt einen Spieler um: die Leitung zieht mit", async ({ page }) => {
    await seed(page, { player: null, patch: `d.m[2].tr[0].lead = "Andreas Scherrer"` });
    await open(page, CAPTAIN);
    await page.click("nav [data-tab=team]");
    await page.click("[data-ted='0']"); // Team bearbeiten
    const inp = page.locator("input[data-pn='0']").first(); // Andreas Scherrer
    await inp.fill("Andi Scherrer");
    await inp.blur();
    await expect.poll(async () => (await db(page)).m[2].tr[0].lead).toBe("Andi Scherrer"); // gespeichert, nicht verworfen
    expect((await db(page)).m[2].tr[1].lead).toBe("Beat Rentsch");
  });
});

test.describe("Verspätet bis 30 Minuten vor Beginn", () => {
  test("18:10 bei Beginn 18:45: verspätet melden geht, am Trainingstag mit Push", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-28T18:10:00"));
    await seed(page);
    await open(page, SPIELER);
    await expect(first(page)).toContainText("28.10.2026");
    await first(page).locator("[data-abw]").click();
    await expect(mine(page).locator(".stl")).toHaveCount(0);
    await mine(page).locator("[data-stt$='|v']").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("⏰ verspätet");
    // zuerst gespeichert, dann die Push angefordert (der Server prüft den gespeicherten Status)
    await expect.poll(async () => (await log(page)).findIndex((l) => l.op == "invoke" && l.body.type == "late")).toBeGreaterThan(-1);
    const L = await log(page), i = L.findIndex((l) => l.op == "invoke" && l.body.type == "late");
    expect(L[i].body).toEqual({ type: "late", d: "2026-10-28", player: "Silvan Frey" });
    expect(L.slice(0, i).some((l) => l.op == "upsert" && l.table == "league_state")).toBe(true);
    expect((await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "v" });
    // wieder „Dabei“ geht auch noch, ohne weitere Push
    await first(page).locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|on']").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("✓ angemeldet");
    expect((await log(page)).filter((l) => l.op == "invoke" && l.body.type == "late")).toHaveLength(1);
  });

  test("18:20 bei Beginn 18:45: verspätet nicht mehr wählbar, mit Hinweis", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-28T18:20:00"));
    await seed(page);
    await open(page, SPIELER);
    await first(page).locator("[data-abw]").click();
    await expect(mine(page).locator("[data-stt$='|v']")).toBeDisabled();
    await expect(mine(page).locator("[data-stt$='|u']")).toBeEnabled(); // Unsicher bis Beginn (wie bisher)
    await expect(mine(page).locator(".stl")).toHaveText("Verspätet melden oder zurücknehmen geht bis 30 Minuten vor Trainingsbeginn.");
    await expect(mine(page).locator("[data-stt$='|off']")).toHaveCount(0); // Abmelden: weiterhin 23 h
    // auch ohne Knopf (z. B. per Skript) nicht gespeichert
    await page.evaluate(() => setSt("2,1", PLAYER, "v"));
    expect((await db(page)).m[2].tr[1].st).toBeUndefined();
    expect((await log(page)).some((l) => l.op == "invoke" && l.body.type == "late")).toBe(false);
  });

  test("Schon verspätet: nach der Frist nicht mehr zurücknehmen", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-28T18:20:00"));
    await seed(page, { patch: `d.m[2].tr[1].st = { "Silvan Frey": "v" }` });
    await open(page, SPIELER);
    await first(page).locator("[data-abw]").click();
    await expect(mine(page).locator("[data-stt$='|on']")).toBeDisabled();
    await expect(mine(page).locator("[data-stt$='|u']")).toBeDisabled();
    await expect(mine(page).locator("[data-stt$='|v']")).toBeEnabled();
  });

  test("Nicht am Trainingstag: verspätet ohne Push", async ({ page }) => {
    await seed(page); // 27.10. 10:00, Training 28.10.
    await open(page, SPIELER);
    await first(page).locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|v']").click();
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "v" });
    await page.waitForTimeout(300);
    expect((await log(page)).some((l) => l.op == "invoke" && l.body.type == "late")).toBe(false);
  });
});

test.describe("Push „kommt später“ (Edge Function notify, type late)", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/notify/logic.mjs") });
  const state = () => ({
    t: [{ n: "A", p: ["Silvan Frey", "Beat Rentsch"] }, { n: "B", p: ["Tobias Keller"] }],
    m: [{ tr: [{ d: "2026-10-28", lead: "Beat Rentsch", st: { "Silvan Frey": "v", "Tobias Keller": "u" } }, { d: "2026-11-04", t: "19:30", st: { "Silvan Frey": "v" } }] }],
  });
  const at = (iso) => Date.parse(iso);

  test("Nachricht nur mit gespeichertem „verspätet“, heute (Zürich) und vor Beginn", () => {
    const st = state();
    const m = L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-28" }, at("2026-10-28T17:10:00Z")); // 18:10 in Zürich
    expect(m).toEqual({ key: "late:2026-10-28:Silvan Frey", tag: "late-2026-10-28", lead: "Beat Rentsch", title: "⏰ Silvan Frey kommt später", body: "Training heute, 18:45 Uhr: Silvan Frey hat sich als verspätet gemeldet." });
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-28" }, at("2026-10-28T17:40:00Z")).key).toBe(m.key); // gleicher Schlüssel: eine Push pro Spieler und Training
    expect(L.lateMessage(st, { player: "Tobias Keller", d: "2026-10-28" }, at("2026-10-28T17:10:00Z"))).toBeNull(); // unsicher, nicht verspätet
    expect(L.lateMessage(st, { player: "Beat Rentsch", d: "2026-10-28" }, at("2026-10-28T17:10:00Z"))).toBeNull(); // kein Status gespeichert
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-28" }, at("2026-10-27T17:10:00Z"))).toBeNull(); // nicht am Trainingstag
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-28" }, at("2026-10-28T17:45:00Z"))).toBeNull(); // Training hat begonnen
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-29" }, at("2026-10-29T10:00:00Z"))).toBeNull(); // kein Training
    expect(L.lateMessage(st, { player: "Gratis unter evil.example", d: "2026-10-28" }, at("2026-10-28T17:10:00Z"))).toBeNull();
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "x" }, at("2026-10-28T17:10:00Z"))).toBeNull();
    // abgemeldet zählt nicht
    st.m[0].tr[0].ab = ["Silvan Frey"];
    expect(L.lateMessage(st, { player: "Silvan Frey", d: "2026-10-28" }, at("2026-10-28T17:10:00Z"))).toBeNull();
    // eigene Startzeit aus den Daten, ohne Leitung
    const n = L.lateMessage(st, { player: "Silvan Frey", d: "2026-11-04", t: "06:00 evil" }, at("2026-11-04T18:00:00Z"));
    expect(n).toMatchObject({ lead: null, body: "Training heute, 19:30 Uhr: Silvan Frey hat sich als verspätet gemeldet." });
  });

  test("Empfänger: Konten der Trainingsleitung und Spielleitung, nie die verspätete Person", () => {
    const mem = [
      { user_id: "a1", role: "admin", player: "Othmar Oeler" }, { user_id: "a2", role: "admin", player: "Silvan Frey" },
      { user_id: "l1", role: "player", player: "Beat Rentsch" }, { user_id: "l2", role: "captain", player: "Beat Rentsch" },
      { user_id: "c", role: "captain", player: "Andreas Scherrer" }, { user_id: "p", role: "player", player: "Tobias Keller" },
      { user_id: "s", role: "player", player: "Silvan Frey" },
    ];
    expect(L.lateRecipients(mem, "Beat Rentsch", "Silvan Frey", "s")).toEqual(["a1", "l1", "l2"]);
    expect(L.lateRecipients(mem, null, "Silvan Frey", "s")).toEqual(["a1"]); // ohne Leitung nur die Spielleitung
    expect(L.lateRecipients(mem, "Silvan Frey", "Silvan Frey", "s")).toEqual(["a1"]); // leitet selbst: nicht an sich
    expect(L.lateRecipients(mem, "Beat Rentsch", "Tobias Keller", "a1")).toEqual(["a2", "l1", "l2"]); // meldende Person nicht
  });

  test("notify: Typ late prüft Mitglied, Spieler, gespeicherten Stand und schickt nur an die Empfänger", () => {
    const src = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/notify/index.ts"), "utf8");
    const b = src.slice(src.indexOf('body.type === "late"'), src.indexOf('body.type === "matchday"'));
    expect(b).toContain("if (!member || !mayNotifyFor(member, body.player)) return json({ error: \"forbidden\" }, 403);");
    expect(b).toContain("const m = lateMessage(row.data, body, Date.now());"); // gespeicherter Stand (league_state), nicht der Client
    expect(b).toContain("onlyUsers = lateRecipients(mem ?? [], m.lead, body.player, user.id);");
    expect(b).toContain("const { lead: _l, ...msg } = m;");
    expect(b.indexOf("lateMessage(")).toBeLessThan(b.indexOf("lateRecipients("));
  });
});

test("Migration 39: guard_league_state ruft keep_leads für alle ausser der Spielleitung", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const all = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const last = (re) => all.flatMap((s) => [...s.matchAll(re)].map((m) => m[0])).pop();
  const sql = fs.readFileSync(path.join(dir, "20261112_39_leitung_nur_spielleitung.sql"), "utf8");
  const g = last(/create or replace function public\.guard_league_state\s*\(\)[\s\S]*?\nend \$\$;/gi);
  const k = last(/create or replace function public\.keep_leads\s*\([\s\S]*?\nend \$\$;/gi);
  expect(sql).toContain(g);
  expect(sql).toContain(k);
  const n = (s) => s.replace(/\s+/g, " ");
  // nur die Spielleitung ist ausgenommen, Captains nicht
  expect(n(g)).toContain("if tg_op = 'UPDATE' and auth.uid() is not null and public.my_role() is distinct from 'admin' then new.data := public.keep_leads(old.data, new.data, public.my_player(), coalesce(public.my_role() = 'captain', false)); end if;");
  // Regeln: unverändert, selbst eintragen, sich selbst austragen, Captain beim Umbenennen/Entfernen; sonst bisherige Leitung
  const regel = "n is not distinct from a or (ich is not null and n = ich) or (ich is not null and a = ich and n is null) or (cap and a is not null and not (sp ? a) and (n is null or (sp ? n)))";
  expect(n(k)).toContain("if " + regel + " then continue; end if;");
  expect(n(k)).toContain("if not coalesce(" + regel + ", false) then");
  expect(n(k)).toContain("neu := case when a is null then neu #- (pfad || 'lead'::text) else jsonb_set(neu, pfad || 'lead'::text, to_jsonb(a)) end;");
  // bisherige Leitung über das Datum, sonst die gleiche Stelle
  expect(n(k)).toContain("where jsonb_typeof(t) = 'object' and t->>'d' = d limit 1; if not coalesce(da, false) then a := alt#>>(pfad || 'lead'::text); end if;");
  // die übrigen Regeln aus 38 bleiben
  for (const s of ["foreach k in array array['wev', 'sev'] loop", "new.data := public.keep_restaurants(old.data, new.data);", "raise exception 'Nur Admins und Captains dürfen Trainingsdaten ändern';"]) expect(n(g)).toContain(s);
  expect(sql).toMatch(/revoke execute on function public\.keep_leads\(jsonb, jsonb, text, boolean\) from public, anon, authenticated;/);
  expect(sql).not.toMatch(/^\s*(create table|create function|alter table|drop )/im);
});
