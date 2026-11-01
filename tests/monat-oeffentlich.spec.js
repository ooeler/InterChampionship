const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

async function seed(page, patch = "") {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    d.m.forEach((m) => { m.res = [null, null] });
    d.t[0].gk = ["Silvan Frey"];
    d.m[2].res = [5, 2];
    d.m[2].pre = [0, 0];
    d.m[2].tr.forEach((x) => { x.p = [] });
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}

test.describe("Monat öffentlich", () => {
  test("Gewichtung: jeden Monat anders, App 25 bis 30 %, Summe 100", async ({ page }) => {
    await page.goto("/");
    const W = await page.evaluate(() => S.m.map((m, i) => monW(i)));
    for (const w of W) {
      expect(w.a + w.s + w.k).toBe(100);
      expect(w.k).toBeGreaterThanOrEqual(25);
      expect(w.k).toBeLessThanOrEqual(30);
      expect(w.a).not.toBe(w.s);
    }
    expect(new Set(W.map((w) => JSON.stringify(w))).size).toBeGreaterThan(1);
    expect(await page.evaluate(() => JSON.stringify(monW(3)) == JSON.stringify(monW(3)))).toBe(true);
  });

  test("Torhüter des Siegerteams bekommt die Tordifferenz des Hauptmatchs", async ({ page }) => {
    await seed(page);
    await page.reload();
    const r = await page.evaluate(() => {
      const m = S.m[2], l = lead(m);
      return { d: (m.res[0] - l[0]) - (m.res[1] - l[1]), gk: gkWin(m, "Silvan Frey"), feld: gkWin(m, "Beat Rentsch"), ff: gkWin({ ...m, ff: 1 }, "Silvan Frey") };
    });
    expect(r.gk).toBe(r.d);
    expect(r.gk).toBeGreaterThan(0);
    expect(r.feld).toBe(0);
    expect(r.ff).toBe(0);
    await expect(card(page, "Rückblick November").locator(".rcr", { hasText: "Spieler des Monats" })).toContainText("Silvan Frey (");
  });

  test("Besucher sehen den Rückblick bis Ende des Monats vom Match Day, Mitglieder immer", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-30T12:00:00"));
    await seed(page);
    await page.reload();
    await expect(card(page, "Rückblick November")).toContainText("Spieler des Monats");

    await page.clock.setFixedTime(new Date("2026-12-01T12:00:00"));
    await page.reload();
    await expect(page.locator(".card", { hasText: "Spieltage" }).first()).toBeVisible();
    await expect(card(page, "Rückblick November")).toHaveCount(0);

    await login(page, SPIELER);
    await page.click("nav [data-tab=rang]");
    await expect(card(page, "Rückblick November")).toBeVisible();
  });

  test("Torhüter-Statistik ist ohne Anmeldung sichtbar", async ({ page }) => {
    await seed(page, "d.m[2].kp = [['Silvan Frey'], ['Beat Rentsch']];");
    await page.reload();
    await expect(card(page, "Torhüter")).toContainText("Silvan Frey");
    await expect(card(page, "Rückblick November")).toContainText("Wenigste Gegentore");
    expect(await page.evaluate(() => S.m[2].kp[0])).toEqual(["Silvan Frey"]);
  });
});
