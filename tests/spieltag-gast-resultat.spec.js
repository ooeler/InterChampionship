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
    await page.click("[data-sped]"); // Spieltag freigeben
    const f = page.locator("form.mgs[data-t='1']"); // gleiche Eingabe wie im Training, kein Popup
    await f.locator("input[name=n]").fill("Gast Goalie");
    await f.locator("input[name=gk]").check();
    await f.locator("button.add").click();
    await f.locator("input[name=n]").fill("Fritz Feld");
    await f.locator("button.add").click();
    await expect.poll(async () => (await db(page)).m[2].gs.map((g) => [g.n, g.gk])).toEqual([["Gast Goalie", true], ["Fritz Feld", false]]);
    const row = page.locator(".sk", { hasText: "Fritz Feld" }).first();
    await row.locator("[data-rgk]").click();
    await expect(row).toContainText("🧤");
    await expect.poll(async () => (await db(page)).m[2].gs[1].gk).toBe(true);
    // derselbe Gast steht auch im Training des Match Days, Torhüter-Schalter inklusive
    await expect.poll(async () => { const m = (await db(page)).m[2]; return m.tr[m.tr.length - 1].gs; }).toEqual([{ n: "Gast Goalie", gk: true }, { n: "Fritz Feld", gk: true }]);
  });

  test("Gast im Spieltag erscheint im Training des Match Days und umgekehrt, Löschen gilt für beide", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-sped]");
    const f = page.locator("form.mgs[data-t='0']");
    await f.locator("input[name=n]").fill("Spieltag Gast");
    await f.locator("button.add").click();
    // im Training des Match Days: Gast aus dem Spieltag ist da; neuer Gast braucht dort ein Team
    await page.click("nav [data-tab=train]");
    const last = await page.evaluate(() => "2," + (S.m[2].tr.length - 1));
    const ov = page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
    await ov.locator(`.tch [data-tgo='${last}']`).click();
    await expect(ov.locator(".pb", { hasText: "Spieltag Gast" })).toBeVisible();
    const tf = ov.locator("form#tgs");
    await expect(tf.locator("select[name=t]")).toBeVisible();
    await tf.locator("input[name=n]").fill("Training Gast");
    await tf.locator("input[name=gk]").check();
    await tf.locator("select[name=t]").selectOption("1");
    await tf.locator("button.add").click();
    await expect.poll(async () => (await db(page)).m[2].gs.map((g) => [g.n, g.t, g.gk, g.k])).toEqual([["Spieltag Gast", 0, false, "★Spieltag Gast"], ["Training Gast", 1, true, "★Training Gast"]]);
    // Löschen im Training entfernt ihn auch im Spieltag (samt Toren)
    await page.evaluate(() => { S.m[2].g["★Training Gast"] = 1; save() });
    await ov.locator(".pb", { hasText: "Training Gast" }).locator("[data-tgdel]").click();
    await expect.poll(async () => { const m = (await db(page)).m[2]; return [m.gs.map((g) => g.n), m.tr[m.tr.length - 1].gs.map((g) => g.n), m.g["★Training Gast"]]; }).toEqual([["Spieltag Gast"], ["Spieltag Gast"], undefined]);
    // Löschen im Spieltag entfernt ihn auch im Training
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-sped]");
    await page.locator(".sk", { hasText: "Spieltag Gast" }).first().locator("[data-rg]").click();
    await expect.poll(async () => { const m = (await db(page)).m[2]; return [m.gs.length, m.tr[m.tr.length - 1].gs.length]; }).toEqual([0, 0]);
  });

  test("an einem normalen Training gibt es keine Teamwahl und keinen Eintrag im Spieltag", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=train]");
    const ov = page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
    await ov.locator(".tch [data-tgo='2,0']").click();
    const tf = ov.locator("form#tgs");
    await expect(tf.locator("select[name=t]")).toHaveCount(0);
    await tf.locator("input[name=n]").fill("Nur Training");
    await tf.locator("button.add").click();
    await expect.poll(async () => (await db(page)).m[2].tr[0].gs).toEqual([{ n: "Nur Training", gk: false }]);
    expect((await db(page)).m[2].gs).toEqual([]);
  });
});

test.describe("Spielbericht: Resultat löschen", () => {
  test("mit Rückfrage; Tore und Pre-Games bleiben", async ({ page }) => {
    await seed(page, `d.m[2].res = [4, 2]; d.m[2].pre = [2, 1]; d.m[2].g = { "Silvan Frey": 2 };`);
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-sped]"); // Spieltag mit Resultat zuerst freigeben
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
