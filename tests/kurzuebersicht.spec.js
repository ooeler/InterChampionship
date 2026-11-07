const { test, expect, login } = require("./fixtures");

test("Meine Trainings: Datum antippen zeigt, wie viele kommen (#102)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
  await login(page, { email: "spieler@flyingpenguins.test", password: "spieler123" });
  await page.click("nav [data-tab=train]");
  const mine = page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
  const b = mine.locator("[data-tsum]").first();
  const k = await b.getAttribute("data-tsum");
  // Erwartung direkt aus den Daten: eine Abmeldung, ein Verspäteter, ein Gast-Torhüter
  const exp = await page.evaluate((k) => {
    const x = trAt(k).x, P = allP(), off = S.t[1].p[0], late = S.t[0].p[1];
    x.ab = [off]; x.st = { [late]: "v" }; x.gs = [{ n: "Gast G", gk: true }]; render();
    const gk = P.filter(isGK), on = (L) => P.filter((p) => L.includes(p) && p != off).length;
    return { gk: [on(gk) + 1, gk.length + 1], t0: [on(S.t[0].p), S.t[0].p.length], t1: [on(S.t[1].p), S.t[1].p.length], late };
  }, k);
  await b.click();
  await expect(b).toHaveAttribute("aria-expanded", "true");
  const s = mine.locator(".tsum");
  await expect(s.locator("tr", { hasText: "Torhüter" })).toContainText(`${exp.gk[0]} / ${exp.gk[1]}`);
  await expect(s.locator("tr.ta")).toContainText(`${exp.t0[0]} / ${exp.t0[1]}`);
  await expect(s.locator("tr.tb")).toContainText(`${exp.t1[0]} / ${exp.t1[1]}`);
  await expect(s).toContainText("inkl. 1 Gast");
  await expect(s).toContainText("Verspätet");
  await expect(s).toContainText(exp.late);
  await b.click();
  await expect(mine.locator(".tsum")).toHaveCount(0);
});

test("Kurzübersicht: Unsicher und Verspätet gleich gross wie die übrigen Zeilen, Symbol nicht grösser", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
  await login(page, { email: "spieler@flyingpenguins.test", password: "spieler123" });
  await page.click("nav [data-tab=train]");
  const mine = page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
  const b = mine.locator("[data-tsum]").first();
  const k = await b.getAttribute("data-tsum");
  await page.evaluate((k) => { const x = trAt(k).x; x.st = { [S.t[0].p[1]]: "u", [S.t[0].p[2]]: "v" }; render(); }, k);
  await b.click();
  const s = mine.locator(".tsum");
  const st = await s.evaluate((el) => {
    const f = (q) => { const e = el.querySelector(q), c = getComputedStyle(e); return [c.fontSize, c.fontWeight]; };
    return { th: f("tr.ta th"), td: f("tr.ta td"), uth: f("tr.tsn th"), utd: f("tr.tsn td"), uthLast: f("tr.tsn:last-child th") };
  });
  expect(st.uth).toEqual(st.th); // „❔ Unsicher“ wie die anderen Bezeichnungen (Symbol inklusive)
  expect(st.uthLast).toEqual(st.th);
  expect(st.utd[0]).toBe(st.td[0]); // Namen gleich gross wie die Zahlen
  expect(Number(st.utd[1])).toBeLessThanOrEqual(400); // Namen nicht fett
  await expect(s.locator("tr.tsn", { hasText: "Unsicher" })).toContainText(await page.evaluate(() => S.t[0].p[1]));
  // das Symbol ist nicht höher als die Zeile von „Torhüter“
  const h = await s.evaluate((el) => [el.querySelector("tr.tsn th").getBoundingClientRect().height, el.querySelector("tr.ta th").getBoundingClientRect().height]);
  expect(h[0]).toBeLessThanOrEqual(h[1] + 1);
});
