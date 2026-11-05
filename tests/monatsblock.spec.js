const { test, expect, login } = require("./fixtures");

const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

test.describe("Monatsblock-Zeitraum", () => {
  test("Team-Duell, Übersicht und Monatsübersicht nennen den Zeitraum des Blocks", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=train]");
    const exp = await page.evaluate(() => {
      const i = S.m.findIndex((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD), T = S.m[i].tr, dm = (d) => d.slice(8) + "." + d.slice(5, 7) + ".";
      return MON[i] + "-Block: Trainings vom " + dm(T[0].d) + " bis zum Match Day am " + dm(T[T.length - 1].d);
    });
    await expect(card(page, "Team-Duell").locator(".blk")).toHaveText(exp);
    await expect(page.locator("#tov .blk")).toHaveText(/-Block: /);
    await expect(card(page, "Monatsübersicht").locator(".blk")).toHaveText(/-Block: .*Match Day am \d\d\.\d\d\./);
  });

  test("Block mit nur einem Termin nennt nur den Match Day", async ({ page }) => {
    await login(page);
    const t = await page.evaluate(() => { const m = S.m[0], o = m.tr; m.tr = [{ d: "2026-09-30", p: [] }]; const h = blkInfo(0); m.tr = o; return h });
    expect(t).toContain("September-Block: Match Day am 30.09.");
  });
});
