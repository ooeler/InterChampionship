// Push-Nachrichten mit Ziel-Link (Antippen führt zum Training bzw. Spieltag, auch bei offener App)
// und Erinnerung an die Unsicheren vor dem Abmeldeschluss.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { test, expect } = require("./fixtures");

const ROOT = path.join(__dirname, "..");
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };

test.describe("Ziel-Link pro Push-Nachricht (Edge Function)", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/notify/logic.mjs") });

  // Oktober (Monat 1) mit Training am 28.10. und Match Day am 4.11. (letztes Training des Monats)
  const state = () => ({
    t: [{ n: "A", p: ["Silvan Frey", "Beat Rentsch"] }, { n: "B", p: ["Tobias Keller"] }],
    m: [
      { tr: [{ d: "2026-09-30", p: [] }], res: [null, null] },
      { tr: [{ d: "2026-10-28", lead: "Beat Rentsch", st: { "Tobias Keller": "v" }, p: [] }, { d: "2026-11-04", p: [] }], res: [2, 1], g: {}, a: { "Silvan Frey": 5 } },
    ],
  });

  test("Training-Nachrichten öffnen „Meine Trainings“, Spieltag-Nachrichten den Spieltag des Monats", { tag: "@logik" }, () => {
    const s = state();
    expect(L.trainingSoonMessages(s, Date.parse("2026-10-27T15:45:00Z"))[0].url).toBe("./#trainings");
    expect(L.trainingSoonMessages(s, Date.parse("2026-11-03T15:45:00Z"))[0]).toMatchObject({ title: "⚑ Morgen ist Match Day", url: "./#spieltag=1" });
    expect(L.trainingLeadMessages(s, "2026-10-26")[0].url).toBe("./#trainings");
    expect(L.leadPushMessages(s, Date.parse("2026-10-27T18:45:00Z"))[0].url).toBe("./#trainings");
    expect(L.signupMessage(s, { player: "Silvan Frey", d: "2026-10-28", off: true }, "u1", 0).url).toBe("./#trainings");
    expect(L.lateMessage(s, { player: "Tobias Keller", d: "2026-10-28" }, Date.parse("2026-10-28T10:00:00Z")).url).toBe("./#trainings");
    expect(L.matchdayMessages(s, "2026-11-01")[0].url).toBe("./#spieltag=1");
    expect(L.resultMessage(s, 1).url).toBe("./#spieltag=1");
    expect(L.statsMessages(s, Date.parse("2026-11-05T07:00:00Z"))[0].url).toBe("./#spieltag=1");
  });

  test("notify übernimmt das Ziel der Nachricht und schickt die Unsicher-Erinnerung im Cron „training“", { tag: "@logik" }, () => {
    const src = fs.readFileSync(path.join(ROOT, "supabase/functions/notify/index.ts"), "utf8");
    expect(src).toContain('JSON.stringify({ ...payload, url: payload.url || "./" })');
    expect(src).not.toContain('{ ...payload, url: "./" }');
    expect(src).toMatch(/body\.type === "training"[\s\S]{0,200}msgs = \[[^\]]*\.\.\.unsureMessages\(row\.data, Date\.now\(\)\)/);
  });
});

test.describe("Erinnerung an die Unsicheren vor dem Abmeldeschluss", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/notify/logic.mjs") });

  const state = () => ({
    t: [{ n: "A", p: ["Silvan Frey", "Beat Rentsch"] }, { n: "B", p: ["Tobias Keller", "Andi Scherrer"] }],
    m: [
      { tr: [
        // Unsicher: Silvan; verspätet zählt nicht; abgemeldet + unsicher (alter Stand) nicht; kein Spieler nicht
        { d: "2026-10-28", st: { "Silvan Frey": "u", "Tobias Keller": "v", "Andi Scherrer": "u", "Fremder": "u" }, ab: ["Andi Scherrer"], p: [] },
        { d: "2026-11-04", st: { "Beat Rentsch": "u" }, p: [] }, // Match Day
      ], res: [null, null] },
      { tr: [{ d: "2026-12-09", st: { "Tobias Keller": "u" }, p: [] }, { d: "2027-03-31", t: "19:30", st: { "Silvan Frey": "u" }, p: [] }, { d: "2027-04-07", p: [] }], res: [null, null] },
    ],
    evt: { d: "2027-06-30", t: "10:00", st: { "Andi Scherrer": "u" }, p: [] },
  });
  const at = (s, iso) => L.unsureMessages(s, Date.parse(iso));

  test("2,5 h vor dem Abmeldeschluss, eine Stunde lang, nur an unsichere Spieler", { tag: "@logik" }, () => {
    const s = state();
    // Training 28.10., 18:45 → Abmeldeschluss 27.10., 19:45 (18:45 UTC); Erinnerung ab 17:15 (16:15 UTC)
    expect(at(s, "2026-10-27T16:14:00Z")).toEqual([]);
    expect(at(s, "2026-10-27T16:15:00Z")).toEqual([{
      key: "unsure:2026-10-28:Silvan Frey",
      tag: "unsure-2026-10-28",
      player: "Silvan Frey",
      title: "❔ Bist du morgen dabei?",
      body: "Training Mi, 28.10.2026, 18:45 Uhr: Du bist noch unsicher – Abmeldeschluss heute um 19:45.",
      url: "./#trainings",
    }]);
    expect(at(s, "2026-10-27T17:00:00Z")).toHaveLength(1);
    expect(at(s, "2026-10-27T17:15:00Z")).toEqual([]); // Fenster vorbei (1,5 h vor Abmeldeschluss)
    // nicht gleichzeitig mit „Morgen ist Training“ (26 h vorher)
    expect(at(s, "2026-10-27T15:45:00Z")).toEqual([]);
    expect(L.trainingSoonMessages(s, Date.parse("2026-10-27T16:15:00Z"))).toHaveLength(1);
  });

  test("Match Day, Winter Event, Sommer Event und Sommerzeit: Unsicher ist überall wählbar, der Abmeldeschluss gilt überall", { tag: "@logik" }, () => {
    const s = state();
    expect(at(s, "2026-11-03T16:30:00Z")[0]).toMatchObject({ player: "Beat Rentsch", body: "Match Day Mi, 04.11.2026, 18:45 Uhr: Du bist noch unsicher – Abmeldeschluss heute um 19:45." });
    expect(at(s, "2026-12-08T16:30:00Z")[0]).toMatchObject({ player: "Tobias Keller", body: expect.stringMatching(/^Winter Event Mi, 09\.12\.2026/) });
    // Sommerzeit, eigene Startzeit 19:30 → Abmeldeschluss 30.3., 20:30 (18:30 UTC); Erinnerung ab 16:00 UTC
    expect(at(s, "2027-03-30T15:59:00Z")).toEqual([]);
    expect(at(s, "2027-03-30T16:00:00Z")[0]).toMatchObject({ player: "Silvan Frey", body: "Training Mi, 31.03.2027, 19:30 Uhr: Du bist noch unsicher – Abmeldeschluss heute um 20:30." });
    // Sommer Event um 10:00 → Abmeldeschluss am Vortag 11:00, Erinnerung ab 08:30 (06:30 UTC)
    expect(at(s, "2027-06-29T06:30:00Z")[0]).toMatchObject({ key: "unsure:2027-06-30:Andi Scherrer", player: "Andi Scherrer", title: "❔ Bist du morgen dabei?", body: expect.stringMatching(/^Sommer Event .* Abmeldeschluss heute um 11:00\.$/) });
  });

  test("je Spieler eine eigene Nachricht und ein eigener push_log-Schlüssel", { tag: "@logik" }, () => {
    const s = state();
    s.m[0].tr[0].st["Beat Rentsch"] = "u";
    const M = at(s, "2026-10-27T16:30:00Z");
    expect(M.map((m) => [m.key, m.player])).toEqual([["unsure:2026-10-28:Silvan Frey", "Silvan Frey"], ["unsure:2026-10-28:Beat Rentsch", "Beat Rentsch"]]);
    // gleicher Schlüssel in jedem Lauf des Fensters → push_log verhindert eine zweite Nachricht
    expect(at(s, "2026-10-27T17:00:00Z").map((m) => m.key)).toEqual(M.map((m) => m.key));
    // ohne Unsichere keine Nachricht
    delete s.m[0].tr[0].st;
    expect(at(s, "2026-10-27T16:30:00Z")).toEqual([]);
  });

  test("Empfänger: nur die Geräte der Konten des unsicheren Spielers (Filter vor der Abfrage)", { tag: "@logik" }, async () => {
    const tabellen = {
      members: [{ user_id: "s", player: "Silvan Frey" }, { user_id: "s2", player: "Silvan Frey" }, { user_id: "b", player: "Beat Rentsch" }, { user_id: "a", player: null }],
      push_subscriptions: [{ user_id: "s", endpoint: "e/s" }, { user_id: "s2", endpoint: "e/s2" }, { user_id: "b", endpoint: "e/b" }, { user_id: "a", endpoint: "e/a" }],
    };
    const db = {
      from(t) {
        const filter = [], b = {
          select: () => b,
          eq: (c, v) => (filter.push((r) => r[c] === v), b),
          in: (c, L) => (filter.push((r) => L.includes(r[c])), b),
          then: (ok, err) => Promise.resolve({ data: tabellen[t].filter((r) => filter.every((f) => f(r))), error: null }).then(ok, err),
        };
        return b;
      },
    };
    const [m] = at(state(), "2026-10-27T16:30:00Z");
    expect((await L.pushSubsFor(db, state(), m, null)).map((x) => x.endpoint)).toEqual(["e/s", "e/s2"]);
  });

  test("Infos: Regeln nennen die Erinnerung und das Ziel beim Antippen", { tag: "@logik" }, () => {
    const src = fs.readFileSync(path.join(ROOT, "app/js/infos-hall.js"), "utf8");
    const rules = new Function(src.match(/var RULES_MD=[^\n]*/)[0] + "; return RULES_MD")();
    expect(rules).toContain("- **Morgen ist Training** – 26 h vor Beginn, an alle (kurz vor dem Abmeldeschluss).\n- **Bist du dabei?** – 2,5 h vor dem Abmeldeschluss, nur an alle, die noch unsicher sind.\n");
    expect(rules).toContain("Antippen öffnet direkt deine Trainings bzw. den Spieltag.");
  });
});

test.describe("Service Worker: Antippen der Nachricht", () => {
  // sw.js in einer Attrappe ausführen und den Klick-Handler direkt aufrufen
  function sw(clients) {
    const on = {}, opened = [];
    const self = {
      addEventListener: (n, f) => { on[n] = f },
      registration: { scope: "https://app.test/InterChampionship/" },
      clients: { matchAll: async () => clients, openWindow: async (u) => { opened.push(u) }, claim: async () => {} },
    };
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, "app/sw.js"), "utf8"), { self, location: { origin: "https://app.test" }, caches: {}, URL });
    const click = async (url) => {
      let p;
      await on.notificationclick({ notification: { data: { url }, close() {} }, waitUntil: (x) => { p = x } });
      await p;
    };
    return { click, opened };
  }
  const win = () => {
    const w = { msgs: [], focused: 0, postMessage(m) { w.msgs.push(m) }, focus: async () => { w.focused++ }, navigate: async () => { throw new Error("kein Neuladen") } };
    return w;
  };

  test("App schon offen: nach vorne holen und das Ziel per Nachricht schicken (ohne Neuladen)", { tag: "@logik" }, async () => {
    const w = win(), s = sw([w]);
    await s.click("./#spieltag=2");
    expect(w.focused).toBe(1);
    expect(w.msgs).toEqual([{ type: "nav", url: "https://app.test/InterChampionship/#spieltag=2" }]);
    expect(s.opened).toEqual([]);
  });

  test("App geschlossen: Ziel öffnen; fremde Adressen führen zur Startseite", { tag: "@logik" }, async () => {
    let s = sw([]);
    await s.click("./#trainings");
    expect(s.opened).toEqual(["https://app.test/InterChampionship/#trainings"]);
    s = sw([]);
    await s.click("https://evil.example/#trainings");
    expect(s.opened).toEqual(["https://app.test/InterChampionship/"]);
    s = sw([]);
    await s.click(undefined);
    expect(s.opened).toEqual(["https://app.test/InterChampionship/"]);
  });
});

test.describe("App: Ziel bei bereits offener App", () => {
  async function open(page) {
    await page.goto("/");
    await page.evaluate(() => { localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) })); localStorage.setItem("__mock_player", "Silvan Frey") });
    await page.reload();
    await page.click("#li");
    await page.fill("#auth input[name=email]", SPIELER.email);
    await page.fill("#auth input[name=pw]", SPIELER.password);
    await page.click("#auth form .btn");
    await expect(page.locator("nav [data-tab=rang]")).toHaveClass(/on/);
  }
  const navMsg = (page, hash) => page.evaluate((hash) => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "nav", url: location.origin + location.pathname + hash } })), hash);

  test("Hash-Wechsel #trainings und #spieltag=N wechselt den Reiter, ohne neu zu laden", async ({ page }) => {
    await open(page);
    await page.evaluate(() => { window.__ohneNeuladen = 1 });
    await page.evaluate(() => { location.hash = "#trainings" });
    await expect(page.locator("nav [data-tab=train]")).toHaveClass(/on/);
    await expect(page.locator(".card:not(.cl) > h3[data-acc=mytr]")).toBeInViewport();
    await expect.poll(() => page.evaluate(() => location.hash)).toBe("");
    await page.evaluate(() => { location.hash = "#spieltag=5" });
    await expect(page.locator("nav [data-tab=spiel]")).toHaveClass(/on/);
    expect(await page.evaluate(() => [cur, MON[cur], location.hash, window.__ohneNeuladen])).toEqual([5, "Februar", "", 1]);
    // anderes oder ungültiges Ziel: nichts passiert
    await page.evaluate(() => { location.hash = "#spieltag=9" });
    await expect(page.locator("nav [data-tab=spiel]")).toHaveClass(/on/);
    expect(await page.evaluate(() => cur)).toBe(5);
  });

  test("Nachricht des Service Workers (Push angetippt) führt zum Ziel, auch zweimal hintereinander", async ({ page }) => {
    // Service Worker sind in den Tests gesperrt: Schnittstelle als Attrappe, die Nachrichten wie der echte Container empfängt
    await page.addInitScript(() => {
      const reg = { pushManager: { getSubscription: async () => null } };
      const c = Object.assign(new EventTarget(), { register: async () => reg, ready: Promise.resolve(reg) });
      Object.defineProperty(navigator, "serviceWorker", { value: c, configurable: true });
    });
    await open(page);
    await page.evaluate(() => { window.__ohneNeuladen = 1 });
    await navMsg(page, "#spieltag=2");
    await expect(page.locator("nav [data-tab=spiel]")).toHaveClass(/on/);
    expect(await page.evaluate(() => cur)).toBe(2);
    await page.click("nav [data-tab=rang]");
    await navMsg(page, "#trainings");
    await expect(page.locator("nav [data-tab=train]")).toHaveClass(/on/);
    await page.click("nav [data-tab=rang]");
    await navMsg(page, "#trainings"); // gleiches Ziel nochmals
    await expect(page.locator("nav [data-tab=train]")).toHaveClass(/on/);
    // fremde Nachrichten werden ignoriert
    await page.click("nav [data-tab=rang]");
    await page.evaluate(() => navigator.serviceWorker.dispatchEvent(new MessageEvent("message", { data: { type: "x", url: "#trainings" } })));
    await expect(page.locator("nav [data-tab=rang]")).toHaveClass(/on/);
    expect(await page.evaluate(() => window.__ohneNeuladen)).toBe(1);
  });
});
