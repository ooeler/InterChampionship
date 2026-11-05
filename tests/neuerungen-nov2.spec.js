const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

test.describe("Neuerungen November II", () => {
  test("Gleiche Anwesenheit: beide Teams erhalten das Bonustor", async ({ page }) => {
    await login(page);
    const r = await page.evaluate(() => {
      const m = JSON.parse(JSON.stringify(S.m[0]));
      const eq = (v) => { m.base = {}; S.t.forEach((t, k) => t.p.forEach((p) => (m.base[p] = v))); return bonus(m) };
      m.tr = [];
      return [eq(2), eq(0)];
    });
    expect(r).toEqual([[1, 1], [0, 0]]);
  });

  test("Spieltag mit Resultat ist gesperrt, bis ✏️ gedrückt wird", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const ec = card(page, "Spielbericht");
    // beim Eintragen bleibt der Spieltag offen …
    await page.evaluate(() => { S.m[cur].res = [null, null]; render(); S.m[cur].res = [5, 3]; save(); render() });
    await expect(ec.locator("[data-rs]")).toBeEnabled();
    // … beim nächsten Öffnen ist er gesperrt
    await page.click("nav [data-tab=rang]");
    await page.click("nav [data-tab=spiel]");
    await expect(ec.locator("[data-rs]")).toBeDisabled();
    const sk0 = page.locator(".card", { has: page.locator("h3[data-acc=sk0]") });
    await expect(sk0.locator("[data-gs], [data-k=g]")).toHaveCount(0); // gesperrt nur als Text
    await expect(sk0.locator("table.skt tr")).toHaveCount(await page.evaluate(() => S.t[0].p.length + S.m[cur].gs.filter((g) => g.t == 0).length + 1));
    await ec.locator("[data-sped]").click();
    await expect(ec.locator("[data-rs]")).toBeEnabled();
    await expect(ec.locator("[data-sped]")).toHaveText("✓ Fertig bearbeitet");
    await ec.locator("[data-sped]").click();
    await expect(ec.locator("[data-rs]")).toBeDisabled();
    // ohne Resultat bleibt alles direkt bearbeitbar
    await page.evaluate(() => { S.m[cur].res = [null, null]; render() });
    await expect(ec.locator("[data-rs]")).toBeEnabled();
    await expect(ec.locator("[data-sped]")).toHaveCount(0);
  });

  test("Forfait steht unter „Resultat übernehmen“, Torhüter-Auswahl in derselben Zeile", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=spiel]");
    await page.evaluate(() => { S.m[cur].res = [null, null]; render() });
    const ec = card(page, "Spielbericht");
    const order = await ec.evaluate((c) => ["[data-rs]", "[data-ff]", "[data-kpa]"].map((s) => c.querySelector(s).getBoundingClientRect().top));
    expect(order[0]).toBeLessThan(order[1]);
    expect(order[1]).toBeLessThan(order[2]);
    await expect(ec.locator(".pt [data-kpa]")).toHaveCount(2);
  });

  test("Datum unter „Meine Trainings“ springt zur Übersicht pro Training", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) })); localStorage.setItem("__mock_player", "Silvan Frey") });
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    const b = card(page, "Meine Trainings").locator("[data-tjump]").last();
    const k = await b.getAttribute("data-tjump");
    await b.click();
    expect(await page.evaluate(() => TSEL)).toBe(k);
    await expect(page.locator("#tov")).toBeInViewport();
  });

  test("Anwesenheit kann ab 6 Stunden vor Beginn bestätigt werden", async ({ page }) => {
    await login(page);
    const r = await page.evaluate(() => {
      const x = allTr()[0].x, n = Date.now, o = [];
      for (const h of [7, 5, 0]) { Date.now = () => tms(x) - h * 36e5; o.push(confOpen(x)) }
      Date.now = n;
      return o;
    });
    expect(r).toEqual([false, true, true]);
  });

  test("Club-Logo oben links ohne weissen Hintergrund", async ({ page }) => {
    await login(page);
    const bg = await page.evaluate(() => getComputedStyle(document.getElementById("clogo")).backgroundColor);
    expect(bg).toBe("rgba(0, 0, 0, 0)");
  });

  test("Strafen-Statistik im Reiter Teams und Strafenkatalog für Spieler nur lesbar", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__mock_pen", JSON.stringify([
        { id: 1, d: "2026-09-02", player: "Beat Rentsch", reason: "zu spät", amount: 5, paid: true },
        { id: 2, d: "2026-09-02", player: "Cornel Eberle", reason: "zu spät", amount: 5, paid: false },
        { id: 3, d: "2026-09-09", player: "Beat Rentsch", reason: "Handy", amount: 0, item: "Kiste Bier", paid: false },
      ]));
      localStorage.setItem("__mock_cat", JSON.stringify([{ id: 1, reason: "zu spät", amount: 5 }]));
    });
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=pst]");
    const s = card(page, "Strafen-Statistik");
    await expect(s).toContainText("Trainings mit Strafen2");
    await expect(s).toContainText("1× Kiste Bier");
    await expect(s.locator(".row", { hasText: "zu spät" })).toContainText("2×");
    const k = card(page, "Strafenkatalog");
    await expect(k).toContainText("zu spät");
    await expect(k.locator("[data-catedit], [data-catdel], #catf")).toHaveCount(0);
  });

  test("Datensicherung lädt den Verlauf der letzten Sicherungen", async ({ page }) => {
    await login(page, ADMIN);
    expect(await page.evaluate(() => backups.toString())).toContain(".limit(100)");
  });
});
