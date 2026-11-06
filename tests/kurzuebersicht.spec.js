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
