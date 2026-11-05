const { test, expect, login } = require("./fixtures");

const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

test.describe("Spielbericht kompakt", () => {
  test("Start-Vorsprung steht im Spielbericht, ohne Ø Anwesenheit und eigene Karte", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='0']");
    const exp = await page.evaluate(() => ({ b: bonus(S.m[0]), l: lead(S.m[0]) }));
    const sv = card(page, "Spielbericht").locator(".svp");
    await expect(sv.locator(".kv", { hasText: "Bonus Anwesenheit" })).toHaveText(`${exp.b[0]}Bonus Anwesenheit${exp.b[1]}`);
    await expect(sv.locator(".kv", { hasText: "Vorsprung (Bonus + Pre-Game)" })).toHaveText(`${exp.l[0]}Vorsprung (Bonus + Pre-Game)${exp.l[1]}`);
    await expect(page.locator("h3", { hasText: "Start-Vorsprung" })).toHaveCount(0);
    await expect(page.locator("main")).not.toContainText("Ø Anwesenheit");
  });

  test("Gesperrte Skorerliste: eine Zeile pro Spieler, erst ✏️ zeigt die Zähler", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.evaluate(() => { const m = S.m[cur], p = S.t[0].p[0]; m.res = [4, 2]; m.g[p] = 2; m.a[p] = 0; save() });
    await page.click("nav [data-tab=rang]");
    await page.click("nav [data-tab=spiel]");
    const sk0 = page.locator(".card", { has: page.locator("h3[data-acc=sk0]") });
    const p = await page.evaluate(() => S.t[0].p[0]);
    await expect(sk0.locator("table.skt tr", { hasText: p }).locator("td")).toHaveText([new RegExp(p), "2", "–"]);
    await expect(sk0.locator("[data-k=g]")).toHaveCount(0);
    await card(page, "Spielbericht").locator("[data-sped]").click();
    await expect(sk0.locator("table.skt")).toHaveCount(0);
    await expect(sk0.locator("[data-k=g]").first()).toBeEnabled();
  });
});

test("Aktive Chips im Dunkelmodus mit genügend Kontrast", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await login(page);
  await page.click("nav [data-tab=spiel]");
  const bg = await page.locator(".chip.on").first().evaluate((e) => getComputedStyle(e).backgroundColor);
  expect(bg).toBe("rgb(214, 31, 51)");
});

test("Ab 960 px zwei Spalten, Akkordeons ohne volle Breite", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await page.goto("/");
  await page.evaluate(() => { localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) })); localStorage.setItem("__mock_player", "Silvan Frey") });
  await login(page, { email: "spieler@flyingpenguins.test", password: "spieler123" });
  await page.click("nav [data-tab=train]");
  expect(await page.evaluate(() => getComputedStyle(document.querySelector("main")).gridTemplateColumns.split(" ").length)).toBe(2);
  const w = await page.evaluate(() => [document.querySelector("main").clientWidth, document.querySelector("h3[data-acc=mytr]").parentElement.getBoundingClientRect().width]);
  expect(w[1]).toBeLessThan(w[0] / 2 + 10);
});
