const { test, expect, login } = require("./fixtures");

test.describe("Animationen", () => {
  test("Tab-Wechsel blendet den Inhalt fein ein", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("#app")).toHaveClass(/\bfx\b/);
    const anim = await page.locator("#app").evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe("tabin");
  });

  test("Auf- und Zuklappen: dieselbe Höhen-Animation, ohne zusätzliches Einblenden", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      window.__an = [];
      const o = Element.prototype.animate;
      Element.prototype.animate = function (k, t) { window.__an.push({ von: parseInt(k[0].height), bis: parseInt(k[1].height), dauer: t.duration, kurve: t.easing }); return o.call(this, k, t) };
    });
    const h = page.locator(".card h3", { hasText: "Spieltage" });
    await h.click(); // zu
    await expect(page.locator(".card.cl")).toHaveCount(1);
    await page.waitForTimeout(400); // Zuklappen fertig: sonst startet das Aufklappen mitten in der Animation
    await h.click(); // auf
    await expect(page.locator(".card.cl")).toHaveCount(0);
    const [zu, auf, ...rest] = await page.evaluate(() => window.__an);
    expect(rest).toEqual([]);
    expect(zu.bis).toBeLessThan(zu.von);
    expect([auf.von, auf.bis, auf.dauer, auf.kurve]).toEqual([zu.bis, zu.von, zu.dauer, zu.kurve]);
    expect(await page.locator(".card", { hasText: "Spieltage" }).evaluate((c) => [...c.children].filter((e) => getComputedStyle(e).animationName != "none").length)).toBe(0);
  });

  test("Am Match Day fliegt ein Unihockey-Ball über den Bildschirm", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T17:00:00"));
    await login(page);
    const ball = page.locator(".ball");
    await expect(ball).toHaveCount(1, { timeout: 6000 });
    expect(await ball.evaluate((b) => getComputedStyle(b).pointerEvents)).toBe("none");
    await expect(ball).toHaveCount(0, { timeout: 5000 }); // fliegt durch und verschwindet
  });

  test("An normalen Tagen keine Bälle", async ({ page }) => {
    await login(page);
    await page.waitForTimeout(3500);
    await expect(page.locator(".ball")).toHaveCount(0);
  });

  test("Bewegung reduzieren: keine Bälle, keine Übergänge", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.clock.setFixedTime(new Date("2026-11-04T17:00:00"));
    await login(page);
    await page.click("nav [data-tab=spiel]");
    expect(await page.locator("#app").evaluate((e) => getComputedStyle(e).animationName)).toBe("none");
    await page.waitForTimeout(3500);
    await expect(page.locator(".ball")).toHaveCount(0);
  });
});
