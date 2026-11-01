const { test, expect } = require("./fixtures");

const PIXEL = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

test.describe("Club-Logo", () => {
  test("Ohne Upload bleiben die festen Bilder", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("#splash img")).toHaveAttribute("src", "logo.png");
    expect(await page.locator("link[rel=icon]").getAttribute("href")).toBe("icon-192.png");
  });

  test("Hochgeladenes Logo erscheint in Kopf, Browser-Symbol, Ladebildschirm und Anmeldung", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((u) => {
      const d = fix(def());
      d.logo = u;
      localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    }, PIXEL);
    await page.reload();
    await expect(page.locator("#clogo")).toHaveAttribute("src", PIXEL);
    await expect(page.locator("link[rel=icon]")).toHaveAttribute("href", PIXEL);
    await expect(page.locator("link[rel=apple-touch-icon]")).toHaveAttribute("href", PIXEL);
    expect(await page.evaluate(() => localStorage.getItem("ic_logo"))).toBe(PIXEL);

    await page.reload();
    expect(await page.evaluate(() => document.querySelector("#splash img")?.src ?? "weg")).toMatch(/^(data:image|weg)/);
    await page.click("#li");
    await expect(page.locator("#auth .alogo")).toHaveAttribute("src", PIXEL);
  });

  test("Ein unsicherer gemerkter Wert wird nicht verwendet", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("ic_logo", 'x" onerror="alert(1)'));
    await page.reload();
    await page.click("#li");
    await expect(page.locator("#auth .alogo")).toHaveAttribute("src", "logo.png");
  });
});
