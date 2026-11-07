// Team-Duell: Prognose fürs nächste Training aus An- und Abmeldungen
const { test, expect, login } = require("./fixtures");

test("Prognose zeigt, was eine Abmeldung am nächsten Training bewirkt", async ({ page }) => {
  await login(page);
  await page.click("nav [data-tab=train]");
  const duel = page.locator(".card.duel");
  await expect(duel).toBeVisible();
  const info = await page.evaluate(() => { const m = S.m.find((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD), P = duelNext(m); return P && { d: wd(P.x.d), p: P.p, c: P.c, n: S.t[0].p.length }; });
  test.skip(!info, "kein offenes Training im Block");
  const prog = duel.locator(".dprog");
  await expect(prog).toContainText("Prognose nach dem Training vom " + info.d);
  await expect(prog).toContainText(`${info.c[0]} : ${info.c[1]} angemeldet`);
  await expect(prog.locator(".kv b").first()).toContainText(`${info.p[0]} %`);
  // zwei Spieler von Team 1 melden sich ab → Prognose von Team 1 sinkt, die andere bleibt
  const after = await page.evaluate(() => { const m = S.m.find((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD), x = duelNext(m).x; x.ab = (x.ab || []).concat(S.t[0].p.slice(0, 2)); render(); return duelNext(m); });
  expect(after.p[0]).toBeLessThan(info.p[0]);
  expect(after.p[1]).toBe(info.p[1]);
  expect(after.c[0]).toBe(info.c[0] - 2);
  await expect(prog).toContainText(`${after.c[0]} : ${after.c[1]} angemeldet`);
  await expect(prog.locator(".kv b").first()).toContainText(`${after.p[0]} %`);
});
