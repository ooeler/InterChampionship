const { test, expect, login } = require("./fixtures");

const card = (page) => page.locator(".card.inst");

test.describe("App installieren (Infos)", () => {
  test("Anleitung passend zum Gerät", async ({ page, browserName }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    await expect(page.locator("main .card > h3").first()).toHaveText("📲 App installieren");
    if (browserName === "webkit") await expect(card(page)).toContainText("Zum Home-Bildschirm");
    else await expect(card(page)).toContainText("App installieren bzw. Zum Startbildschirm hinzufügen");
  });

  test("Android/Chrome: Knopf öffnet den Installations-Dialog", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    await page.evaluate(() => {
      const e = new Event("beforeinstallprompt", { cancelable: true });
      e.prompt = () => { window.__prompted = true };
      e.userChoice = Promise.resolve({ outcome: "accepted" });
      window.dispatchEvent(e);
    });
    await card(page).locator("[data-inst]").click();
    expect(await page.evaluate(() => window.__prompted)).toBe(true);
    await expect(card(page).locator("[data-inst]")).toHaveCount(0);
  });

  test("schon installiert: keine Karte", async ({ page }) => {
    await page.addInitScript(() => { const mm = window.matchMedia; window.matchMedia = (q) => q.includes("standalone") ? { matches: true, addEventListener() {}, removeEventListener() {} } : mm.call(window, q) });
    await login(page);
    await page.click("nav [data-tab=info]");
    await expect(card(page)).toHaveCount(0);
  });
});
