const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const katalog = (page) => page.locator(".card", { has: page.locator("h3", { hasText: /^Strafenkatalog$/ }) });
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
const cat = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_cat") || "[]"));
const pens = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_pen") || "[]"));

async function seed(page, list = []) {
  await page.goto("/");
  await page.evaluate((list) => localStorage.setItem("__mock_cat", JSON.stringify(list.map((c, i) => ({ id: i + 1, ...c })))), list);
}

async function addEntry(page, reason, amount) {
  const f = katalog(page).locator("form#catf");
  await f.locator("input[name=g]").fill(reason);
  await f.locator("input[name=b]").fill(String(amount));
  await f.locator("button.add").click();
}

test.describe("Strafenkatalog", () => {
  test("Spielleitung erstellt, ändert und löscht Einträge im Teams-Tab", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await expect(katalog(page)).toContainText("Noch keine Einträge.");
    await addEntry(page, "zu spät", 5);
    await addEntry(page, "Handy im Training", 10);
    await expect(katalog(page).locator(".catr")).toHaveCount(2);
    await expect(katalog(page).locator(".catr").first()).toContainText("Handy im Training"); // alphabetisch
    // Betrag ändern
    const amt = katalog(page).locator(".catr", { hasText: "zu spät" }).locator("input[data-catamt]");
    await amt.fill("7.5");
    await amt.blur();
    await expect.poll(async () => (await cat(page)).find((c) => c.reason == "zu spät").amount).toBe(7.5);
    // doppelt geht nicht
    await addEntry(page, "zu spät", 1);
    expect((await cat(page)).length).toBe(2);
    // löschen
    await katalog(page).locator(".catr", { hasText: "Handy" }).locator("[data-catdel]").click();
    await expect(katalog(page).locator(".catr")).toHaveCount(1);
    expect((await cat(page)).map((c) => c.reason)).toEqual(["zu spät"]);
  });

  test("Strafenchef sieht im Teams-Tab nur den Katalog und darf ihn pflegen", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_strafen", "1"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main .card > h3")).toHaveText(["Strafenkatalog"]);
    await addEntry(page, "Material vergessen", 3);
    await expect.poll(async () => (await cat(page)).map((c) => c.reason)).toEqual(["Material vergessen"]);
  });

  test("Captains wählen aus dem Katalog, pflegen ihn aber nicht", async ({ page }) => {
    await seed(page, [{ reason: "zu spät", amount: 5 }, { reason: "Handy im Training", amount: 10 }]);
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(katalog(page)).toHaveCount(0);
    // Server: Captain darf den Katalog nicht ändern
    const r = await page.evaluate(() => sb.from("penalty_catalog").insert({ reason: "x", amount: 1 }));
    expect(r.error.message).toContain("row-level security");

    await page.click("nav [data-tab=train]");
    const f = overview(page).locator("form#pen");
    await f.locator("select[name=p]").selectOption("Silvan Frey");
    await f.locator("select[name=k]").selectOption({ label: "Handy im Training · CHF 10.00" });
    await expect(f.locator("input[name=g]")).toHaveValue("Handy im Training");
    await expect(f.locator("input[name=b]")).toHaveValue("10");
    await f.locator("button.add").click();
    await expect.poll(async () => (await pens(page)).map((p) => [p.player, p.reason, p.amount])).toEqual([["Silvan Frey", "Handy im Training", 10]]);
  });

  test("Spieler ohne Zusatzrolle: kein Teams-Tab, Katalog nicht änderbar", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect(page.locator("nav [data-tab=team]")).toHaveCount(0);
    const r = await page.evaluate(() => sb.from("penalty_catalog").insert({ reason: "x", amount: 1 }));
    expect(r.error.message).toContain("row-level security");
  });
});
