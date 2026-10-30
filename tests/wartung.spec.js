const { test, expect, login } = require("./fixtures");

const maint = (page, on) => page.evaluate((on) => localStorage.setItem("__mock_maint", on ? "1" : "0"), on);

test.describe("Wartungsseite", () => {
  test("erscheint während eines Updates und lädt danach neu", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#wart")).toBeHidden();
    await maint(page, true);
    await page.reload();
    await expect(page.locator("#wart")).toBeVisible();
    await expect(page.locator("#wart")).toContainText("Update wird eingespielt");
    // Update fertig → die Seite lädt von selbst neu
    await maint(page, false);
    const reload = page.waitForEvent("load");
    await page.evaluate(() => maint());
    await reload;
    await expect(page.locator("#wart")).toBeHidden();
  });

  test("während der Wartung wird nichts gespeichert – danach schon", async ({ page }) => {
    await login(page);
    await page.evaluate(() => setMaint(true));
    await expect(page.locator("#wart")).toBeVisible();
    const before = await page.evaluate(() => localStorage.getItem("__mock_db"));
    await page.evaluate(() => { S.t[0].n = "Während Wartung"; save(); });
    await page.waitForTimeout(800);
    expect(await page.evaluate(() => localStorage.getItem("__mock_db"))).toBe(before);
    expect(await page.evaluate(() => localStorage.getItem("ic_dirty"))).toBe("1");
  });
});
