const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")));

// Saison-Daten wie sie eine ältere App-Version gespeichert hat (ohne Versionsfeld)
async function seedOld(page, patch) {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    delete d.v;
    d.t[0].n = "Alte Daten";
    d.m[2].res = [4, 2];
    Object.assign(d, patch || {});
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}

test.describe("Datenmigration bei Updates", () => {
  test("Daten einer älteren Version bleiben erhalten und werden migriert", async ({ page }) => {
    await seedOld(page);
    await login(page);
    await expect(page.locator("#sub")).toHaveText("Alte Daten vs SpVgg Nieder");
    expect(await page.evaluate(() => [S.v, S.m[2].res])).toEqual([2, [4, 2]]);
    // nächste Änderung speichert im neuen Format, ohne Inhalte zu verlieren
    await page.evaluate(() => { S.m[3].res = [1, 0]; save() });
    await expect.poll(async () => (await db(page)).data.v).toBe(2);
    const d = (await db(page)).data;
    expect(d.t[0].n).toBe("Alte Daten");
    expect(d.m[2].res).toEqual([4, 2]);
  });

  test("Neuere Daten werden von einer alten App nie überschrieben", async ({ page }) => {
    await seedOld(page, { v: 99, zukunft: "neues Feld" });
    await login(page);
    const card = page.locator(".card.upd");
    await expect(card).toContainText("Neue Version verfügbar");
    await expect(card.locator("[data-reload]")).toBeVisible();
    await page.evaluate(() => { S.t[0].n = "Überschrieben?"; save() });
    await page.waitForTimeout(700);
    const d = (await db(page)).data;
    expect(d.t[0].n).toBe("Alte Daten");
    expect(d.zukunft).toBe("neues Feld");
  });
});

test.describe("Datensicherung & Rollback", () => {
  test("Spielleitung sichert und stellt eine Version wieder her", async ({ page }) => {
    await seedOld(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const card = page.locator(".card", { hasText: "Datensicherung" });
    await card.locator("[data-snap]").click();
    await expect(card.locator(".row").first()).toContainText("manuell");

    // Änderung → automatische Sicherung des vorherigen Stands
    await page.fill("input[data-tn='0']", "Neuer Name");
    await page.locator("input[data-tn='0']").blur();
    await expect.poll(async () => (await db(page)).data.t[0].n).toBe("Neuer Name");
    await page.evaluate(() => { HIST = null; render() });
    await expect(card.locator(".row").first()).toContainText("Änderung");

    // Zurück zur manuellen Sicherung
    await card.locator(".row", { hasText: "manuell" }).locator("[data-restore]").click();
    await expect(page.locator("#sub")).toHaveText("Alte Daten vs SpVgg Nieder");
    expect((await db(page)).data.t[0].n).toBe("Alte Daten");
    await expect(card.locator(".row").first()).toContainText("vor Wiederherstellung");
  });

  test("Captains und Spieler sehen die Datensicherung nicht", async ({ page }) => {
    await seedOld(page);
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator(".card", { hasText: "Datensicherung" })).toHaveCount(0);
  });
});
