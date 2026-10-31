const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

async function seed(page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", updated_at: "2026-10-27T08:00:00.000Z", data: fix(def()) }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
}
// Jemand anderes speichert, dieses Gerät bekommt nichts davon mit
const fremd = (page, code) => page.evaluate((code) => {
  const r = JSON.parse(localStorage.getItem("__mock_db"));
  new Function("d", code)(r.data);
  r.updated_at = new Date(Date.now() + 1000).toISOString();
  localStorage.setItem("__mock_db", JSON.stringify(r));
}, code);

test.describe("Alter Stand überschreibt nichts", () => {
  test("Restaurant eines anderen bleibt, wenn ein Gerät mit altem Stand speichert", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await card(page, "Meine Trainings").locator("[data-abw]").first().waitFor();
    await page.waitForTimeout(200);
    await fremd(page, `d.m[2].tr[0].r = "Rössli"; d.m[2].tr[1].lead = "Beat Rentsch"`);

    await card(page, "Meine Trainings").locator("[data-abw]").first().click();
    await page.locator("[data-stt$='|v']").click();
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "v" });
    const d = await db(page);
    expect(d.m[2].tr[0].r).toBe("Rössli");
    expect(d.m[2].tr[1].lead).toBe("Beat Rentsch");
    await expect.poll(() => page.evaluate(() => S.m[2].tr[0].r)).toBe("Rössli"); // kommt auch hier an
  });

  test("Nach dem Wiedereröffnen mit offener Änderung bleibt der Eintrag", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await fremd(page, `d.m[2].tr[0].r = "Rössli"`);
    await page.evaluate(() => { S.m[2].tr[1].st = { "Silvan Frey": "v" }; store(); localStorage.setItem("ic_dirty", "1") });
    await page.reload();
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "v" });
    expect((await db(page)).m[2].tr[0].r).toBe("Rössli");
  });

  test("Zurück in der App holt den frischen Stand", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("ic_base"))).toBe(true);
    await fremd(page, `d.m[2].tr[0].r = "Rössli"`);
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
    await expect.poll(() => page.evaluate(() => S.m[2].tr[0].r)).toBe("Rössli");
  });

  test("Zusammenführen: beide Änderungen bleiben, eigenes Löschen gilt", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(() => {
      const b = { x: 1, ab: ["A"], tr: [{ d: "1", r: "alt" }, { d: "3", p: [] }], m: [{ v: 1 }, { v: 2 }] };
      const mine = { x: 1, ab: ["A", "B"], tr: [{ d: "1" }, { d: "3", p: ["M"] }], m: [{ v: 9 }, { v: 2 }] };
      const them = { x: 2, ab: ["C"], tr: [{ d: "1", r: "alt", lead: "L" }, { d: "2", p: [] }, { d: "3", p: ["T"] }], m: [{ v: 1 }, { v: 8 }] };
      return merge3(b, mine, them);
    });
    expect(r).toEqual({ x: 2, ab: ["C", "B"], tr: [{ d: "1", lead: "L" }, { d: "2", p: [] }, { d: "3", p: ["T", "M"] }], m: [{ v: 9 }, { v: 8 }] });
  });
});
