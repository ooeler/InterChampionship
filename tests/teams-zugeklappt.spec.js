const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };

// Reiter Teams: alle Karten starten zugeklappt, Antippen des Titels klappt auf und wieder zu
for (const [wer, user] of [["Spielleitung", ADMIN], ["Captain", undefined], ["Spieler", SPIELER]]) {
  test(`Teams: alle Karten starten zugeklappt (${wer})`, async ({ page }) => {
    await login(page, user);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("h3[data-acc=tm0]")).toBeVisible();
    await page.waitForTimeout(300); // nachgeladene Karten (Benutzer, Einladungen) abwarten
    const cards = page.locator("main > .card");
    const n = await cards.count();
    expect(n).toBeGreaterThan(2);
    for (let i = 0; i < n; i++) {
      const c = cards.nth(i);
      await expect(c.locator("> h3[data-acc]"), await c.locator("h3").first().textContent()).toHaveCount(1);
      await expect(c).toHaveClass(/(^| )cl( |$)/);
    }
  });
}

test("Teams: Karte auf- und wieder zuklappen", async ({ page }) => {
  await login(page);
  await page.click("nav [data-tab=team]");
  const h = page.locator("h3[data-acc=tm0]"), c = page.locator(".card", { has: h });
  await expect(c.locator("[data-prof]").first()).toBeHidden();
  await h.click();
  await expect(c).not.toHaveClass(/(^| )cl( |$)/);
  await expect(c.locator("[data-prof]").first()).toBeVisible();
  await h.click();
  await expect(c).toHaveClass(/(^| )cl( |$)/);
});
