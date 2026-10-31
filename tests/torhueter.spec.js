const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);

// November gespielt: 4 : 3 inklusive Vorsprung, Dezember offen
async function seed(page, patch = "") {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    d.m.forEach((m) => { m.res = [null, null] });
    d.t[0].gk = ["Silvan Frey"];
    d.t[1].gk = ["Andreas Scherrer"];
    d.m[2].res = [4, 3];
    d.m[2].pre = [1, 2];
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}
const stats = (page) => page.evaluate(() => { const l = lead(S.m[2]); return { l, gk: gkStats(S.m.map((m, i) => i)) } });

test.describe("Torhüter-Statistik", () => {
  test("Gegentore ohne Bonustore, Rangliste und Rückblick nur für Mitglieder", async ({ page }) => {
    await seed(page);
    await page.reload();
    await page.click("nav [data-tab=rang]");
    await expect(card(page, "Rückblick November")).toBeVisible();
    await expect(page.locator("main")).not.toContainText("Wenigste Gegentore");
    await expect(card(page, "Torhüter")).toHaveCount(0);

    await login(page, SPIELER);
    await page.click("nav [data-tab=rang]");
    const { l, gk } = await stats(page);
    const q = (p) => gk.find((x) => x.p == p);
    expect(q("Silvan Frey").g).toBe(3 - l[1]);
    expect(q("Andreas Scherrer").g).toBe(4 - l[0]);
    const c = card(page, "Torhüter");
    await expect(c.locator(".row")).toHaveCount(2);
    await expect(c).toContainText("1 Spiel");
    await expect(c.locator(".row", { hasText: gk[0].p }).locator("b")).toHaveText(gk[0].g.toFixed(2));
    await expect(card(page, "Rückblick November")).toContainText("Wenigste Gegentore");
  });

  test("Forfait zählt nicht, Vorsprung ergibt nie negative Gegentore", async ({ page }) => {
    await seed(page, "d.m[2].res = [0, 5]; d.m[2].ff = 0; d.m[3].res = [1, 0]; d.m[3].pre = [3, 3]; d.m[3].tr = d.m[3].tr || [];");
    await page.reload();
    const { gk } = await stats(page);
    expect(gk.every((x) => x.s == 1 && x.g == 0)).toBe(true);
  });

  test("Spielbericht: vorausgewählt, abwählen, anderer Spieler, zählt für beide", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    const zweiter = await page.evaluate(() => S.t[0].p.find((p) => p != "Silvan Frey"));
    await page.click("nav [data-tab=spiel]");
    await page.locator("[data-c='2']").click();
    const b = card(page, "Spielbericht");
    await expect(b.locator("[data-kp='0'][data-p='Silvan Frey']")).toHaveClass(/\bon\b/);
    await b.locator("[data-kpa='0']").selectOption(zweiter);
    await expect(b.locator(`[data-kp="0"][data-p="${zweiter}"]`)).toHaveClass(/\bon\b/);
    await expect.poll(async () => ((await db(page)).m[2].kp || [])[0]).toEqual(["Silvan Frey", zweiter]);
    const g = (await stats(page)).gk;
    expect(g.find((x) => x.p == zweiter).g).toBe(g.find((x) => x.p == "Silvan Frey").g);

    await b.locator("[data-kp='0'][data-p='Silvan Frey']").click();
    await expect.poll(async () => ((await db(page)).m[2].kp || [])[0]).toEqual([zweiter]);
    expect((await stats(page)).gk.some((x) => x.p == "Silvan Frey")).toBe(false);
  });

  test("Mehrere 🧤: der anwesende zählt, sonst bleibt es offen", async ({ page }) => {
    await seed(page, "d.t[0].gk = ['Silvan Frey', 'Beat Rentsch']; d.m[2].tr[d.m[2].tr.length - 1].p = ['Beat Rentsch'];");
    await page.reload();
    expect((await stats(page)).gk.map((x) => x.p)).toContain("Beat Rentsch");
    expect((await stats(page)).gk.map((x) => x.p)).not.toContain("Silvan Frey");
    await seed(page, "d.t[0].gk = ['Silvan Frey', 'Beat Rentsch']; d.m[2].tr[d.m[2].tr.length - 1].p = [];");
    await page.reload();
    expect((await stats(page)).gk.map((x) => x.p)).toEqual(["Andreas Scherrer"]);
  });

  test("Gast-Torhüter und Umbenennen", async ({ page }) => {
    await seed(page, "d.t[1].gk = []; d.m[2].gs = [{ n: 'Max', t: 1, k: '★Max', gk: true }]; d.m[2].kp = [['Silvan Frey'], null];");
    await login(page, ADMIN);
    await page.click("nav [data-tab=rang]");
    await expect(card(page, "Torhüter")).toContainText("Max (Gast)");
    await page.click("nav [data-tab=team]");
    const inp = page.locator("input[data-pn][value='Silvan Frey']");
    await inp.fill("Silvan Neu");
    await inp.blur();
    await expect.poll(async () => ((await db(page)).m[2].kp || [])[0]).toEqual(["Silvan Neu"]);
  });
});

test("Hall steht in der Navigation ganz rechts", async ({ page }) => {
  await login(page, SPIELER);
  await expect(page.locator("nav button").last()).toHaveAttribute("data-tab", "hall");
});

test("Schiedsrichter ist ein freies Textfeld", async ({ page }) => {
  await seed(page);
  await login(page, ADMIN);
  await page.click("nav [data-tab=spiel]");
  await page.locator("[data-c='2']").click();
  const r = page.locator("[data-ref]");
  await expect(r).not.toHaveAttribute("list", /.*/);
  await expect(page.locator("datalist#pl")).toHaveCount(0);
  await r.fill("Gast Schiri, Hans Muster");
  await r.blur();
  await expect.poll(async () => (await db(page)).m[2].ref).toBe("Gast Schiri, Hans Muster");
});
