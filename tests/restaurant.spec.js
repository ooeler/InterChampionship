const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });

async function seed(page, patch = "") {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}

test.describe("Restaurant", () => {
  test("Restaurant-Chef trägt ein, mit Vorschlägen aus früheren Einträgen", async ({ page }) => {
    await seed(page, `d.m[2].tr[0].r = "Rössli"; d.m[3].tr[0].r = "Pizzeria Roma";`);
    await page.evaluate(() => localStorage.setItem("__mock_resto", "1"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    const inp = overview(page).locator("input[data-resto]");
    expect(await page.locator("#restos option").evaluateAll((o) => o.map((x) => x.value))).toEqual(["Pizzeria Roma", "Rössli"]);
    await inp.fill("Rössli");
    await inp.blur();
    await expect.poll(async () => (await db(page)).m[2].tr[1].r).toBe("Rössli");
  });

  test("Spieler ohne Zusatzrolle sehen das Restaurant nur", async ({ page }) => {
    await seed(page, `d.m[2].tr[1].r = "Rössli";`);
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await expect(overview(page).locator("input[data-resto]")).toHaveCount(0);
    await expect(overview(page)).toContainText("🍽️ RestaurantRössli");
  });

  test("Spielleitung vergibt die Zusatzrolle Restaurant-Chef", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const box = page.locator("input[data-mresto='u-spieler@flyingpenguins.test']");
    await expect(box).not.toBeChecked();
    await box.check();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "set_resto"));
    expect(log[0].args).toEqual({ uid: "u-spieler@flyingpenguins.test", on_resto: true });
    // Spielleitung darf selbst immer eintragen
    await page.click("nav [data-tab=train]");
    await expect(overview(page).locator("input[data-resto]")).toBeVisible();
  });

  test("Statistik der besuchten Restaurants in der Rangliste (öffentlich)", async ({ page }) => {
    await seed(page, `["Rössli","Rössli","Rössli","Roma","Roma","Bären","Krone","Löwen","Adler"].forEach((r, i) => { const all = d.m.flatMap((m) => m.tr); all[i].r = r; });`);
    await page.reload();
    const card = page.locator(".card", { has: page.locator("h3", { hasText: /^Restaurants$/ }) });
    await expect(card.locator(".row")).toHaveCount(5);
    await expect(card.locator(".row").first()).toContainText("Rössli");
    await expect(card.locator(".row").first().locator("b")).toHaveText("3×");
    await card.locator("[data-more]").click();
    await expect(card.locator(".row")).toHaveCount(6);
  });
});
