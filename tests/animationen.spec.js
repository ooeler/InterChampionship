const { test, expect, login } = require("./fixtures");

test.describe("Animationen", () => {
  test("Tab-Wechsel blendet den Inhalt fein ein", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("#app")).toHaveClass(/\bfx\b/);
    const anim = await page.locator("#app").evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe("tabin");
  });

  test("Aufklappen einer Karte animiert den Inhalt", async ({ page }) => {
    await page.goto("/");
    const h = page.locator(".card h3", { hasText: "Spieltage" });
    await h.click(); // zu
    await expect(page.locator(".card.cl")).toHaveCount(1);
    await h.click(); // auf
    await expect(page.locator(".card", { hasText: "Spieltage" })).toHaveClass(/\bop\b/);
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
