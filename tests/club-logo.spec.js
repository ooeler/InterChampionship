const { test, expect, login } = require("./fixtures");

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

  test("Neues Club-Logo erscheint nach dem Hochladen sofort oben links", async ({ page }) => {
    await login(page, { email: "admin@flyingpenguins.test", password: "admin123" });
    await page.click("nav [data-tab=team]");
    await expect(page.locator("#clogo")).toBeHidden();
    await page.locator("input[data-img=club]").setInputFiles({ name: "logo.png", mimeType: "image/png", buffer: Buffer.from(PIXEL.split(",")[1], "base64") });
    await expect(page.locator("#clogo")).toBeVisible();
    await expect(page.locator("#clogo")).toHaveAttribute("src", /^data:image/);
    const u = await page.locator("#clogo").getAttribute("src");
    expect(await page.evaluate(() => S.logo)).toBe(u);
    await expect(page.locator("link[rel=icon]")).toHaveAttribute("href", u);
  });

  test("Ein unsicherer gemerkter Wert wird nicht verwendet", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("ic_logo", 'x" onerror="alert(1)'));
    await page.reload();
    await page.click("#li");
    await expect(page.locator("#auth .alogo")).toHaveAttribute("src", "logo.png");
  });
});
