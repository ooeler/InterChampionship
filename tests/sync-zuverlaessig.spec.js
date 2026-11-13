const { test, expect, login } = require("./fixtures");

// Zuverlässigkeit: Speicherkonflikte nachholen, Tagesdatum bei offener App, Abmelden mit offener Änderung
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const dirty = (page) => page.evaluate(() => localStorage.getItem("ic_dirty"));

async function seed(page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", updated_at: "2026-10-27T08:00:00.000Z", data: fix(def()) }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
}
// Jemand anderes speichert, dieses Gerät bekommt nichts davon mit
const fremd = (page, code) => page.evaluate((code) => {
  const r = JSON.parse(localStorage.getItem("__mock_db"));
  new Function("d", code)(r.data);
  r.client = "anderes-geraet";
  r.updated_at = new Date(Date.now() + 1000 + Math.random() * 1e6).toISOString();
  localStorage.setItem("__mock_db", JSON.stringify(r));
}, code);
// Solange window.__stau gesetzt ist, speichert vor jedem eigenen Update jemand anderes (jedes Update kollidiert)
const stau = (page) => page.evaluate(() => {
  window.__stau = true;
  const f = sb.from.bind(sb);
  sb.from = function (t) {
    const q = f(t);
    if (t == "league_state") {
      const u = q.update;
      q.update = function (p) {
        if (window.__stau) {
          const r = JSON.parse(localStorage.getItem("__mock_db"));
          r.updated_at = new Date(Date.now() + Math.random() * 1e6).toISOString();
          localStorage.setItem("__mock_db", JSON.stringify(r));
        }
        return u.call(q, p);
      };
    }
    return q;
  };
});
// Ohne Verbindung: Lesen von league_state schlägt fehl
const offline = (page) => page.evaluate(() => {
  const f = sb.from.bind(sb);
  sb.from = (t) => t == "league_state" && window.__offline !== false
    ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) }) }) }
    : f(t);
});

test.describe("Sync-Stau nach Speicherkonflikt", () => {
  test("wiederholter Konflikt: Hinweis, Änderung bleibt offen und wird automatisch nachgeholt", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await stau(page);
    const r = await page.evaluate(() => { S.m[2].tr[1].r = "Rössli"; save(); clearTimeout(tm); return push().then((r) => ({ err: !!(r && r.error) })) });
    expect(r.err).toBe(true); // nicht mehr still
    expect(await dirty(page)).toBe("1");
    await expect(page.locator("#toast")).toContainText("gleichzeitig gespeichert");
    await expect(page.locator("#sync")).toBeVisible();
    expect((await db(page)).m[2].tr[1].r).toBeUndefined();

    // Der Andrang ist vorbei: ohne weiteres Zutun wird zusammengeführt und gespeichert
    await fremd(page, `d.m[2].tr[0].lead = "Beat Rentsch"`);
    await page.evaluate(() => { window.__stau = false });
    await expect.poll(async () => (await db(page)).m[2].tr[1].r, { timeout: 10000 }).toBe("Rössli");
    expect((await db(page)).m[2].tr[0].lead).toBe("Beat Rentsch"); // fremde Änderung bleibt
    await expect.poll(() => dirty(page)).toBeNull();
    await expect(page.locator("#sync")).toBeHidden();
    await expect.poll(() => page.evaluate(() => S.m[2].tr[0].lead)).toBe("Beat Rentsch");
  });

  test("offene Änderung: fremdes Update wird nicht ignoriert, sondern zusammengeführt", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    // Eigene Änderung ist offen (z. B. nach gescheitertem Speichern)
    await page.evaluate(() => { S.m[2].tr[1].st = { "Silvan Frey": "v" }; store(); localStorage.setItem("ic_dirty", "1") });
    await fremd(page, `d.m[2].tr[0].r = "Rössli"`);
    // Realtime-Meldung über den neuen Stand (der Mock meldet Änderungen über das storage-Ereignis)
    await page.evaluate(() => dispatchEvent(new StorageEvent("storage", { key: "__mock_db", newValue: localStorage.getItem("__mock_db") })));
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "v" });
    expect((await db(page)).m[2].tr[0].r).toBe("Rössli");
    await expect.poll(() => page.evaluate(() => S.m[2].tr[0].r)).toBe("Rössli");
    await expect.poll(() => dirty(page)).toBeNull();
  });

  test("offene Änderung: Zurück in der App holt sie nach und übernimmt fremde Änderungen", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await page.evaluate(() => { S.m[2].tr[1].st = { "Silvan Frey": "u" }; store(); localStorage.setItem("ic_dirty", "1") });
    await fremd(page, `d.m[2].tr[0].r = "Sternen"`);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "u" });
    expect((await db(page)).m[2].tr[0].r).toBe("Sternen");
    await expect.poll(() => page.evaluate(() => S.m[2].tr[0].r)).toBe("Sternen");
    await expect.poll(() => dirty(page)).toBeNull();
  });
});

test.describe("Tagesdatum bei offener App", () => {
  test("Zurück in der App am nächsten Tag: Datum und Begrüssung neu", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    expect(await page.evaluate(() => TD)).toBe("2026-10-27");
    await page.clock.setFixedTime(new Date("2026-10-28T19:30:00"));
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    expect(await page.evaluate(() => TD)).toBe("2026-10-28");
    await expect(page.locator("#hi")).toHaveText(await page.evaluate(() => hello()));
    await expect(page.locator("#hi")).not.toHaveText("Hallo Silvan!");
  });

  test("Fokus nach Monatsende: aktueller Monat wechselt", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    expect(await page.evaluate(() => cur)).toBe(2);
    await page.clock.setFixedTime(new Date("2026-11-05T09:00:00"));
    await page.evaluate(() => dispatchEvent(new Event("focus")));
    expect(await page.evaluate(() => [TD, cur])).toEqual(["2026-11-05", 3]);
  });

  test("um Mitternacht wechselt das Datum von selbst", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T23:59:58"));
    await page.goto("/");
    expect(await page.evaluate(() => TD)).toBe("2026-10-27");
    await page.clock.setFixedTime(new Date("2026-10-28T00:00:05"));
    await expect.poll(() => page.evaluate(() => TD), { timeout: 10000 }).toBe("2026-10-28");
  });
});

test.describe("Abmelden mit ungespeicherter Änderung", () => {
  test("ohne Verbindung: Rückfrage, Abbrechen behält die Änderung", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await offline(page);
    await page.evaluate(() => {
      window.__fragen = [];
      window.__antwort = false;
      window.confirm = (t) => { window.__fragen.push(t); return /^Abmelden\?$/.test(t) ? true : window.__antwort };
      S.m[2].tr[1].r = "Offline-Eintrag"; save();
    });
    await expect.poll(() => dirty(page)).toBe("1");
    await page.click("#lo");
    await page.click("[data-lo]");
    await expect.poll(() => page.evaluate(() => window.__fragen.length)).toBe(2);
    expect((await page.evaluate(() => window.__fragen))[1]).toContain("ungespeicherte Änderungen");
    // Abgebrochen: weiterhin angemeldet, Änderung bleibt lokal erhalten
    await expect(page.locator("#li")).toBeHidden();
    expect(await dirty(page)).toBe("1");
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("ic_state")).m[2].tr[1].r)).toBe("Offline-Eintrag");

    // Trotzdem abmelden
    await page.evaluate(() => { window.__antwort = true });
    await page.click("#lo");
    await page.click("[data-lo]");
    await expect(page.locator("#li")).toBeVisible();
    expect(await dirty(page)).toBeNull();
  });

  test("mit Verbindung: offene Änderung wird vor dem Abmelden gespeichert", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await page.evaluate(() => {
      window.__fragen = [];
      window.confirm = (t) => { window.__fragen.push(t); return true };
      S.m[2].tr[1].r = "Gespeichert vor Logout"; store(); localStorage.setItem("ic_dirty", "1");
    });
    await page.click("#lo");
    await page.click("[data-lo]");
    await expect(page.locator("#li")).toBeVisible();
    expect((await db(page)).m[2].tr[1].r).toBe("Gespeichert vor Logout");
    expect(await page.evaluate(() => window.__fragen)).toEqual(["Abmelden?"]);
  });
});
