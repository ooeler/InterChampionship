const { test, expect, login } = require("./fixtures");

const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
async function seed(page, patch = "") {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}
// Dialoge gezielt beantworten (Name, Torhüter ja/nein, Rückfrage)
const answer = (page, { prompt = "", confirm = true } = {}) => page.evaluate(({ prompt, confirm }) => { window.prompt = () => prompt; window.confirm = () => confirm }, { prompt, confirm });

test.describe("Spieltag: Gastspieler als Torhüter", () => {
  test("beim Erfassen wählen, danach umschaltbar", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await answer(page, { prompt: "Gast Goalie", confirm: true });
    await page.click("[data-gs='1']");
    await answer(page, { prompt: "Fritz Feld", confirm: false });
    await page.click("[data-gs='1']");
    await expect.poll(async () => (await db(page)).m[2].gs.map((g) => [g.n, g.gk])).toEqual([["Gast Goalie", true], ["Fritz Feld", false]]);
    const row = page.locator(".sk", { hasText: "Fritz Feld" }).first();
    await row.locator("[data-rgk]").click();
    await expect(row).toContainText("🧤");
    await expect.poll(async () => (await db(page)).m[2].gs[1].gk).toBe(true);
  });
});

test.describe("Spielbericht: Resultat löschen", () => {
  test("mit Rückfrage; Tore und Pre-Games bleiben", async ({ page }) => {
    await seed(page, `d.m[2].res = [4, 2]; d.m[2].pre = [2, 1]; d.m[2].g = { "Silvan Frey": 2 };`);
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const del = page.locator("[data-resdel]");
    await answer(page, { confirm: false }); // abgebrochen: bleibt
    await del.click();
    expect((await db(page)).m[2].res).toEqual([4, 2]);
    await answer(page, { confirm: true });
    await del.click();
    await expect.poll(async () => (await db(page)).m[2].res).toEqual([null, null]);
    const d = await db(page);
    expect(d.m[2].pre).toEqual([2, 1]);
    expect(d.m[2].g).toEqual({ "Silvan Frey": 2 });
    await expect(del).toHaveCount(0); // ohne Resultat kein Knopf
    await page.click("nav [data-tab=rang]");
    await expect(page.locator(".card", { has: page.locator("h3", { hasText: /^Spieltage$/ }) }).locator(".row", { hasText: "November" })).toContainText("offen");
  });
});
