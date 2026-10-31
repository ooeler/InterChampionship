const { test, expect } = require("./fixtures");

const am = async (page, d) => { await page.clock.setFixedTime(new Date(d + "T10:00:00")); await page.goto("/"); };

test.describe("Saison-Effekte", () => {
  test("Halloween: Geist oder Kürbis huscht durchs Bild und stört nicht", async ({ page }) => {
    await am(page, "2026-10-31");
    const s = page.locator("#spook span");
    await expect(s).toBeVisible();
    await expect(s).toHaveText(/👻|🎃/);
    expect(await page.locator("#spook").evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.click("nav [data-tab=info]"); // lässt sich trotzdem bedienen
    await expect(page.locator("#spook")).toHaveCount(0, { timeout: 10000 }); // räumt sich weg
  });

  test("Nur an Halloween", async ({ page }) => {
    await am(page, "2026-10-30");
    await page.waitForTimeout(3000);
    await expect(page.locator("#spook")).toHaveCount(0);
  });

  test("Advent: Mütze ab dem 1. Advent bis Heiligabend", async ({ page }) => {
    const hat = () => page.locator("header .tag.xm");
    await am(page, "2026-11-28");
    await expect(hat()).toHaveCount(0);
    await am(page, "2026-11-29"); // 1. Advent 2026
    await expect(hat()).toHaveCount(1);
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("header .tag"), "::before").backgroundImage)).toContain("svg");
    await am(page, "2026-12-24");
    await expect(hat()).toHaveCount(1);
    await am(page, "2026-12-25");
    await expect(hat()).toHaveCount(0);
    expect(await page.evaluate(() => [isAdvent("2027-11-27"), isAdvent("2027-11-28"), isAdvent("2028-12-02"), isAdvent("2028-12-03"), isAdvent("2027-07-01")])).toEqual([false, true, false, true, false]);
  });

  test("Schnee: nur im Winter und nur an manchen Tagen", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(() => {
      const tage = (a, b) => { const L = []; for (let d = new Date(a + "T12:00:00Z"); d <= new Date(b + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + 1)) L.push(d.toISOString().slice(0, 10)); return L; };
      const w = tage("2026-12-01", "2027-02-28"), s = tage("2027-03-01", "2027-11-30");
      return { anteil: w.filter(isSnow).length / w.length, sonst: s.filter(isSnow).length, ein: w.find(isSnow), aus: w.find((d) => !isSnow(d)) };
    });
    expect(r.anteil).toBeGreaterThan(0.15);
    expect(r.anteil).toBeLessThan(0.6);
    expect(r.sonst).toBe(0);

    await am(page, r.aus);
    await page.waitForTimeout(2500);
    await expect(page.locator("#snow")).toHaveCount(0);
    await am(page, r.ein);
    await expect(page.locator("#snow i")).toHaveCount(40);
    expect(await page.locator("#snow").evaluate((e) => getComputedStyle(e).pointerEvents)).toBe("none");
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });

  test("Reduzierte Bewegung: keine Animationen, die Mütze bleibt", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await am(page, "2026-10-31");
    await page.waitForTimeout(3000);
    await expect(page.locator("#spook")).toHaveCount(0);
    await am(page, "2026-12-01");
    await expect(page.locator("header .tag.xm")).toHaveCount(1);
  });
});
