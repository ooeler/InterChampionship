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

test("am Match Day gibt es eine Prognose, der Match Day zählt zur Anwesenheit", async ({ page }) => {
  await login(page);
  // Uhr auf den Match Day des laufenden Blocks stellen, noch ohne eingetragene Anwesenheit
  const md = await page.evaluate(() => { const m = S.m.find((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD), x = m.tr[m.tr.length - 1]; m.tr.forEach((y) => { if (y !== x && !y.p.length) y.p = S.t[0].p.concat(S.t[1].p) }); x.p = []; TD = x.d; render(); return { d: wd(x.d), n0: S.t[0].p.length }; });
  await page.click("nav [data-tab=train]");
  const prog = page.locator(".card.duel .dprog");
  await expect(prog).toContainText("Prognose nach dem Match Day vom " + md.d);
  await expect(prog).toContainText(`${md.n0} : `);
  // nach dem Eintragen der Anwesenheit zählt der Match Day mit, die Prognose entfällt
  const r = await page.evaluate(() => { const m = S.m.find((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD), x = m.tr[m.tr.length - 1], a = pct(m, 0); x.p = S.t[0].p.slice(); render(); return { vor: a, nach: pct(m, 0), b: pct(m, 1) }; });
  expect(r.nach).toBeGreaterThanOrEqual(r.vor);
  await expect(prog).toHaveCount(0);
});
