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

  test("Restaurant-Chef trägt das Restaurant direkt bei Meine Trainings ein", async ({ page }) => {
    await seed(page, `d.m[2].tr[0].r = "Rössli";`);
    await page.evaluate(() => { localStorage.setItem("__mock_resto", "1"); localStorage.setItem("__mock_player", "Silvan Frey"); });
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    const mine = page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
    const inp = mine.locator("input[data-restok]").first();
    await expect(inp).toHaveAttribute("list", "restos");
    const key = await inp.getAttribute("data-restok");
    await inp.fill("Pizzeria Roma");
    await inp.blur();
    await expect.poll(async () => { const [m, t] = key.split(",").map(Number); return (await db(page)).m[m].tr[t].r }).toBe("Pizzeria Roma");
    await expect(mine.locator(`input[data-restok='${key}']`)).toHaveValue("Pizzeria Roma");
  });

  test("Ohne Zusatzrolle kein Restaurant-Feld bei Meine Trainings", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_player", "Silvan Frey"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await expect(page.locator(".card", { hasText: "Meine Trainings" }).locator("[data-abw]").first()).toBeVisible();
    await expect(page.locator("input[data-restok]")).toHaveCount(0);
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
    await page.click("h3[data-acc=us]"); // standardmässig zugeklappt
    const box = page.locator("input[data-mresto='u-spieler@flyingpenguins.test']");
    await expect(box).not.toBeChecked();
    await box.check();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "set_resto"));
    expect(log[0].args).toEqual({ uid: "u-spieler@flyingpenguins.test", on_resto: true });
    // Spielleitung darf selbst immer eintragen
    await page.click("nav [data-tab=train]");
    await expect(overview(page).locator("input[data-resto]")).toBeVisible();
  });

  test("Statistik der besuchten Restaurants in der Rangliste (nur Mitglieder)", async ({ page }) => {
    await seed(page, `["Rössli","Rössli","Rössli","Roma","Roma","Bären","Krone","Löwen","Adler"].forEach((r, i) => { const all = d.m.flatMap((m) => m.tr); all[i].r = r; });`);
    await login(page);
    await page.click("nav [data-tab=rang]");
    const card = page.locator(".card", { has: page.locator("h3", { hasText: /^Restaurants$/ }) });
    await expect(card.locator(".row")).toHaveCount(5);
    await expect(card.locator(".row").first()).toContainText("Rössli");
    await expect(card.locator(".row").first().locator("b")).toHaveText("3×");
    await card.locator("[data-more]").click();
    await expect(card.locator(".row")).toHaveCount(6);
  });
});

test.describe("Restaurant-Besuche im Teams-Tab", () => {
  test("zeigt, wie oft wir im Restaurant waren, und die letzten 5 Besuche", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-12-20T10:00:00"));
    await seed(page, `const L = ["Rössli", "Sonne", "Rössli", "Pizzeria", "Sonne", "Rössli", "Krone"];
      [[2, 0], [2, 1], [2, 2], [3, 0], [3, 2], [3, 3], [4, 1]].forEach(([m, t], i) => d.m[m].tr[t].r = L[i]);
      d.m[4].tr[3].r = "Zukunft";`);
    await login(page);
    await page.click("nav [data-tab=team]");
    const card = page.locator(".card", { has: page.locator("h3", { hasText: /^Restaurant-Besuche$/ }) });
    await expect(card.locator("[data-rtot]")).toHaveText("7×");
    await expect(card.locator("[data-rv]")).toHaveCount(5);
    await expect(card.locator("[data-rv]").first()).toContainText("Krone");
    await expect(card.locator("[data-rv]").first()).toContainText("16.12.2026");
    await expect(card).not.toContainText("Zukunft");
  });

  test("ohne Einträge ein Hinweis", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator(".card", { has: page.locator("h3", { hasText: /^Restaurant-Besuche$/ }) })).toContainText("Noch kein Restaurant eingetragen");
  });
});

test("Restaurant-Statistik nur für Mitglieder, nicht in der öffentlichen Rangliste", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { const d = fix(def()); d.m[2].tr[0].r = "Rössli"; localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d })); });
  await page.reload();
  await expect(page.locator("main")).toContainText("Anwesenheit Saison");
  await expect(page.locator("main")).not.toContainText("Rössli");
  await login(page);
  await page.click("nav [data-tab=rang]");
  await expect(page.locator(".card", { has: page.locator("h3", { hasText: /^Restaurants$/ }) })).toContainText("Rössli");
});
