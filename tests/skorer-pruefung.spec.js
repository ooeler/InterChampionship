const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ban = (page) => page.locator(".skban");

// November (Monat 2): ohne Anwesenheit und Pre-Game ist der Vorsprung 0, das Endresultat zählt direkt
async function seed(page, patch) {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    d.m.forEach((m) => { m.res = [null, null]; m.g = {}; m.a = {} });
    const m = d.m[2];
    m.base = {}; m.pre = [0, 0]; m.tr.forEach((x) => { x.p = [] });
    new Function("d", "m", patch)(d, m);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
  await login(page, SPIELER);
  await page.click("nav [data-tab=spiel]");
  await page.click("[data-c='2']");
}

test.describe("Skorerliste prüfen", () => {
  test("stimmt: kein Banner", async ({ page }) => {
    await seed(page, `m.res = [2, 1]; m.g = { [d.t[0].p[0]]: 2, [d.t[1].p[0]]: 1 }; m.a = { [d.t[0].p[1]]: 2 };`);
    await expect(page.locator(".score")).toBeVisible();
    await expect(ban(page)).toHaveCount(0);
  });

  test("zu viele Tore, zu wenig Tore und zu viele Assists – mit Team", async ({ page }) => {
    await seed(page, `m.res = [2, 3]; m.g = { [d.t[0].p[0]]: 3, [d.t[1].p[0]]: 1 }; m.a = { [d.t[0].p[1]]: 2, [d.t[1].p[1]]: 4 };`);
    const t = await page.evaluate(() => S.t.map((x) => x.n));
    const b = ban(page);
    await expect(b).toHaveAttribute("role", "alert");
    await expect(b.locator(".skbi")).toHaveText([
      `${t[0]}: 1 Tor zu viel (3 erfasst, laut Endresultat minus Vorsprung 2).`,
      `${t[1]}: 2 Tore zu wenig (1 erfasst, laut Endresultat minus Vorsprung 3).`,
      `${t[1]}: 1 Assist zu viel (4 erfasst, höchstens 3 möglich – 1 pro Tor).`,
    ]);
    const [bc, hc] = await b.evaluate((e) => [getComputedStyle(e).borderTopColor, getComputedStyle(e.querySelector("h3")).color]);
    expect(bc).toBe(hc);
  });

  test("Gäste zählen mit, offenes Resultat wird nicht geprüft, Forfait nur auf Assists", async ({ page }) => {
    await seed(page, `m.res = [1, 0]; m.gs = [{ k: "★Gast", n: "Gast", t: 0 }]; m.g = { "★Gast": 1 };`);
    await expect(page.locator(".score")).toBeVisible();
    await expect(ban(page)).toHaveCount(0);
    await page.evaluate(() => { S.m[2].g = {}; render() });
    await expect(ban(page)).toContainText("1 Tor zu wenig");
    await page.evaluate(() => { S.m[2].ff = 1; render() });
    await expect(ban(page)).toHaveCount(0); // Tore gegen das gesetzte Forfait-Resultat werden nicht verglichen
    // Forfait: Assists höchstens so viele wie erfasste Tore des Teams
    const t = await page.evaluate(() => S.t.map((x) => x.n));
    await page.evaluate(() => { const m = S.m[2]; m.g = { [S.t[0].p[0]]: 1 }; m.a = { [S.t[0].p[1]]: 1, [S.t[1].p[0]]: 4 }; render() });
    await expect(ban(page).locator(".skbi")).toHaveText([`${t[1]}: 4 Assists zu viel (4 erfasst, höchstens 0 möglich – 1 pro Tor).`]);
    await page.evaluate(() => { S.m[2].a = {}; render() });
    await expect(ban(page)).toHaveCount(0);
    await page.evaluate(() => { S.m[2].ff = null; S.m[2].res = [null, null]; render() });
    await expect(ban(page)).toHaveCount(0);
  });

  test("Server rechnet gleich wie die App und schickt die Push nur am Morgen nach dem Match Day", async ({ page }) => {
    await seed(page, `m.res = [4, 2]; m.pre = [1, 0]; m.tr[0].p = d.t[0].p.slice(0, 3); m.g = { [d.t[0].p[0]]: 1 }; m.a = { [d.t[1].p[0]]: 5 };`);
    const L = await import("../supabase/functions/notify/logic.mjs");
    const r = await page.evaluate(() => ({ state: JSON.parse(JSON.stringify(S)), app: skIssues(S.m[2]), txt: skIssues(S.m[2]).map(skMsg), lead: lead(S.m[2]), TD }));
    expect(L.leadOf(r.state, r.state.m[2], r.TD)).toEqual(r.lead);
    expect(L.statsIssues(r.state, 2, r.TD)).toEqual(r.app);
    expect(r.app.length).toBeGreaterThan(1);
    expect(L.statsIssues(r.state, 2, r.TD).map((q) => L.statsText(r.state, q))).toEqual(r.txt);

    const md = r.state.m[2].tr[r.state.m[2].tr.length - 1].d, next = L.addDays(md, 1);
    const at = (d, t) => L.zurichToUtc(d, t);
    expect(L.statsMessages(r.state, at(md, "08:10"))).toEqual([]); // am Match Day selbst nicht
    expect(L.statsMessages(r.state, at(next, "07:50"))).toEqual([]);
    const M = L.statsMessages(r.state, at(next, "08:10"));
    expect(M).toHaveLength(1);
    expect(M[0]).toMatchObject({ key: "stats:2", title: "⚠️ Skorerliste November prüfen", teams: [0, 1] });
    expect(M[0].body).toBe(r.txt.join(" "));
    expect(L.statsMessages(r.state, at(L.addDays(md, 15), "08:10"))).toEqual([]); // nach 14 Tagen Ruhe
    // Empfänger: Spielleitung + Captains der betroffenen Teams, keine Spieler
    const mem = [{ user_id: "a", role: "admin", player: null }, { user_id: "c0", role: "captain", player: r.state.t[0].p[0] }, { user_id: "c1", role: "captain", player: r.state.t[1].p[0] }, { user_id: "p", role: "player", player: r.state.t[0].p[1] }];
    expect(L.statsRecipients(r.state, [0], mem)).toEqual(["a", "c0"]);
    expect(L.statsRecipients(r.state, [0, 1], mem)).toEqual(["a", "c0", "c1"]);
    // Forfait: nur noch Assists gegen erfasste Tore (Team 1: 0 Tore, 5 Assists); Push zum selben Zeitpunkt
    r.state.m[2].ff = 0;
    expect(L.statsIssues(r.state, 2, r.TD)).toEqual([{ t: 1, k: "a", v: 5, w: 0 }]);
    expect(L.statsMessages(r.state, at(md, "08:10"))).toEqual([]);
    expect(L.statsMessages(r.state, at(next, "08:10"))).toMatchObject([{ key: "stats:2", teams: [1] }]);
    r.state.m[2].a = {};
    expect(L.statsMessages(r.state, at(next, "08:10"))).toEqual([]);
  });

  test("Forfait: App und Server melden dieselben Assists", async ({ page }) => {
    await seed(page, `m.ff = 1; m.res = [5, 0]; m.gs = [{ k: "★Gast", n: "Gast", t: 1 }]; m.g = { [d.t[0].p[0]]: 2, "★Gast": 1 }; m.a = { [d.t[0].p[1]]: 3, [d.t[1].p[0]]: 1, "★Gast": 1 };`);
    const L = await import("../supabase/functions/notify/logic.mjs");
    const r = await page.evaluate(() => ({ state: JSON.parse(JSON.stringify(S)), app: skIssues(S.m[2]), txt: skIssues(S.m[2]).map(skMsg), TD }));
    expect(r.app).toEqual([{ t: 0, k: "a", v: 3, w: 2 }, { t: 1, k: "a", v: 2, w: 1 }]);
    expect(L.statsIssues(r.state, 2, r.TD)).toEqual(r.app);
    expect(L.statsIssues(r.state, 2, r.TD).map((q) => L.statsText(r.state, q))).toEqual(r.txt);
    await expect(ban(page).locator(".skbi")).toHaveText(r.txt);
  });

  // Der Fehler vor b8caf27: Der Empfängerfilter wurde erst nach "await q" gesetzt und wirkte nicht.
  // Die Attrappe führt die Abfrage beim await mit den bis dahin gesetzten Filtern aus – wie der Supabase-Client.
  test("Push-Empfänger: alle Filter stehen vor der Abfrage (nur Spielleitung und Captains bekommen die Skorer-Meldung)", async () => {
    const L = await import("../supabase/functions/notify/logic.mjs");
    const tabellen = {
      members: [{ user_id: "a", role: "admin", player: null }, { user_id: "c0", role: "captain", player: "A1" }, { user_id: "c1", role: "captain", player: "B1" },
        { user_id: "p", role: "player", player: "A2" }, { user_id: "p2", role: "player", player: "A2" }],
      push_subscriptions: ["a", "c0", "c1", "p", "p2", "x"].map((u) => ({ user_id: u, endpoint: "https://fcm.googleapis.com/fcm/send/" + u, sub: {} })),
    };
    const abfragen = [];
    const db = {
      from(t) {
        const filter = [], b = {
          select: () => b,
          eq: (c, v) => (filter.push((r) => r[c] === v), b),
          in: (c, L) => (filter.push((r) => L.includes(r[c])), b),
          then: (ok, err) => {
            abfragen.push(t);
            return Promise.resolve({ data: tabellen[t].filter((r) => filter.every((f) => f(r))), error: null }).then(ok, err);
          },
        };
        return b;
      },
    };
    const state = { t: [{ p: ["A1", "A2"] }, { p: ["B1"] }] };
    const an = async (msg, only = null) => (await L.pushSubsFor(db, state, msg, only)).map((s) => s.endpoint.split("/").pop());
    expect(await an({ key: "stats:2", teams: [0] })).toEqual(["a", "c0"]);
    expect(await an({ key: "stats:2", teams: [0, 1] })).toEqual(["a", "c0", "c1"]);
    expect(await an({ key: "stats:2", teams: [1] }, ["c0", "c1", "p"])).toEqual(["c1"]);
    expect(await an({ key: "lead", player: "A2" })).toEqual(["p", "p2"]);
    expect(await an({ key: "signup" }, ["p", "x"])).toEqual(["p", "x"]);
    expect(await an({ key: "result" })).toEqual(["a", "c0", "c1", "p", "p2", "x"]);
    expect(abfragen.filter((t) => t == "push_subscriptions")).toHaveLength(6); // pro Nachricht genau eine Geräte-Abfrage
    // notify nutzt genau diesen Helfer (die Geräte werden nicht nochmals selbst abgefragt)
    const fs = require("fs"), path = require("path");
    const src = fs.readFileSync(path.join(__dirname, "..", "supabase/functions/notify/index.ts"), "utf8");
    expect(src).toMatch(/const subs = await pushSubsFor\(db, row\.data, msg, onlyUsers\);/);
    expect(src.match(/from\("push_subscriptions"\)\.select\(/g)).toHaveLength(1); // nur noch die Test-Push an die eigenen Geräte
  });
});
