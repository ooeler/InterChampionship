const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };

test.describe("Teams-Reiter und Rückblick kompakter", () => {
  test("Spieler: Strafen zuerst, Trainingsleitung zugeklappt", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      localStorage.setItem("__mock_pen", JSON.stringify([{ id: 1, d: "2026-09-02", player: "Beat Rentsch", reason: "zu spät", amount: 5, paid: false }]));
      localStorage.setItem("__mock_cat", JSON.stringify([{ id: 1, reason: "zu spät", amount: 5 }]));
    });
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    const h = await page.locator("main .card > h3").allTextContents();
    expect(h[0]).toBe("Strafen-Statistik");
    expect(h[1]).toBe("Strafenkatalog");
    expect(h[h.length - 1]).toMatch(/^Trainingsleitung/);
    const lst = page.locator(".card", { has: page.locator("h3[data-acc=lst]") });
    await expect(lst.locator(".row").first()).toBeHidden();
    await page.click("h3[data-acc=lst]");
    await expect(lst.locator(".row").first()).toBeVisible();
  });

  test("Rückblick: 💯 zeigt die Anzahl, Namen erst beim Antippen", async ({ page }) => {
    await login(page);
    const r = await page.evaluate(() => {
      const L = ["A", "B", "C", "D", "E"].join(", ");
      return [rcRow(["💯", "100% Anwesenheit", L]), rcRow(["💯", "100% Anwesenheit", "A, B"])];
    });
    expect(r[0]).toContain("5 Spieler");
    expect(r[0]).not.toContain("A, B, C");
    expect(r[1]).toContain("A, B");
    const rc = page.locator(".recap");
    if (await rc.locator("[data-rcf]").count()) {
      await rc.locator("[data-rcf]").click();
      await expect(rc.locator(".rcn")).toBeVisible();
      await expect(rc.locator("[data-rcf]")).toHaveAttribute("aria-expanded", "true");
    }
  });
});
