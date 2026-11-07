// Wischen in der Hauptansicht wechselt den Reiter (Reihenfolge wie unten in der Navigation)
const { test, expect, login } = require("./fixtures");

const swipe = (page, sel, from, to, y1 = 400) => page.evaluate(([sel, from, to, y1]) => {
  const el = document.querySelector(sel), ev = (type, k, x, y) => { const e = new Event(type, { bubbles: true }); Object.defineProperty(e, k, { value: [{ clientX: x, clientY: y }] }); el.dispatchEvent(e); };
  ev("touchstart", "touches", from, 400); ev("touchend", "changedTouches", to, y1);
}, [sel, from, to, y1]);

test("Wischen nach links/rechts wechselt den Reiter, nicht über das Ende hinaus", async ({ page }) => {
  await login(page);
  const order = await page.locator("#nav [data-tab]").evaluateAll((B) => B.map((b) => b.dataset.tab));
  const on = () => page.evaluate(() => tab);
  const i0 = order.indexOf(await on());
  await swipe(page, "#app .card h3", 300, 120);
  await expect.poll(on).toBe(order[i0 + 1]);
  await swipe(page, "#app .card h3", 120, 300);
  await expect.poll(on).toBe(order[i0]);
  await page.click(`#nav [data-tab='${order[0]}']`);
  await swipe(page, "#app .card h3", 120, 300); // ganz links: bleibt
  await expect.poll(on).toBe(order[0]);
  // zu kurz oder eher senkrecht: kein Wechsel
  await swipe(page, "#app .card h3", 300, 260);
  await swipe(page, "#app .card h3", 300, 200, 400 + 300);
  await expect.poll(on).toBe(order[0]);
});

test("kein Reiterwechsel beim Wischen in waagrecht scrollbaren Leisten und im Profil", async ({ page }) => {
  await login(page);
  await page.click("#nav [data-tab='train']");
  const chips = page.locator("#app .chips").first();
  if (await chips.count()) {
    await chips.evaluate((c) => { c.style.width = "80px"; });
    await swipe(page, "#app .chips button", 300, 120);
    await expect.poll(() => page.evaluate(() => tab)).toBe("train");
  }
  await page.click("#nav [data-tab='team']");
  await page.locator("main [data-prof]").first().click();
  await swipe(page, "#ovc h3", 300, 120);
  await expect.poll(() => page.evaluate(() => tab)).toBe("team");
});
