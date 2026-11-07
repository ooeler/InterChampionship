// Übersicht pro Training: die Zeile „❔ Name: Grund“ ist gleich gross wie die Namen der Spieler
const { test, expect, login } = require("./fixtures");

test("Grund-Zeile bei Unsicher gleich gross wie die Spielernamen", async ({ page }) => {
  await login(page);
  await page.click("nav [data-tab=train]");
  await page.waitForTimeout(500);
  await page.evaluate(() => { const x = trAt(TSEL).x, p = S.t[0].p[1]; x.st = x.st || {}; x.st[p] = "u"; ABS = [{ d: x.d, player: p, reason: "Vielleicht Geschäftsreise" }]; render(); });
  const [a, b] = await page.evaluate(() => [getComputedStyle(document.querySelector(".abr")).fontSize, getComputedStyle(document.querySelector(".pt .pb")).fontSize]);
  expect(a).toBe(b);
});
