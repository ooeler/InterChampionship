const { test, expect, login } = require("./fixtures");

const noHScroll = (page) => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);

test.describe("Responsive", () => {
  for (const vp of [{ w: 360, h: 740 }, { w: 768, h: 1024 }, { w: 1440, h: 900 }]) {
    test(`kein horizontales Scrollen bei ${vp.w}px`, async ({ page }) => {
      await page.setViewportSize({ width: vp.w, height: vp.h });
      await page.goto("/");
      expect(await noHScroll(page)).toBe(true);
      await login(page);
      for (const tab of ["rang", "spiel", "team"]) {
        await page.click(`nav [data-tab=${tab}]`);
        expect(await noHScroll(page), tab).toBe(true);
      }
    });
  }

  test("Desktop zeigt zwei Spalten, Handy eine", async ({ page }) => {
    await login(page);
    const cols = () => page.evaluate(() => getComputedStyle(document.querySelector("main")).gridTemplateColumns.split(" ").length);
    await page.setViewportSize({ width: 1440, height: 900 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("main")).display)).toBe("grid");
    expect(await cols()).toBe(2);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => getComputedStyle(document.querySelector("main")).display)).toBe("block");
  });

  test("Bedienknöpfe sind gross genug für Finger", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const box = await page.locator(".big .st button").first().boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
  });
});

test.describe("Ladebildschirm", () => {
  test("Fliegendes Logo erscheint und verschwindet wieder", async ({ page }) => {
    await page.goto("/");
    const s = page.locator("#splash");
    await expect(s).toBeVisible();
    await expect(s.locator("img")).toHaveAttribute("src", "logo.png");
    expect(await s.locator("img").evaluate((i) => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect(s).toHaveCount(0, { timeout: 5000 });
    await expect(page.locator("#auth form")).toBeVisible();
  });

  test("Bewegung reduzieren: keine Animation", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const anim = await page.locator("#splash .fly").evaluate((e) => getComputedStyle(e).animationName);
    expect(anim).toBe("none");
  });
});

test.describe("PWA", () => {
  test("Manifest und Icons sind gültig", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.getAttribute("link[rel=manifest]", "href");
    const m = await (await request.get("/" + href)).json();
    expect(m.name).toBe("InterChampionship");
    expect(m.display).toBe("standalone");
    expect(m.icons.map((i) => i.sizes)).toEqual(expect.arrayContaining(["192x192", "512x512"]));
    expect(m.icons.some((i) => i.purpose === "maskable")).toBe(true);
    for (const i of m.icons) expect((await request.get("/" + i.src)).status()).toBe(200);
    expect((await request.get("/apple-touch-icon.png")).status()).toBe(200);
  });

  test("Service Worker registriert sich und cacht die App", async ({ browser, browserName }) => {
    test.skip(browserName !== "chromium", "Service-Worker-Inspektion nur in Chromium");
    const ctx = await browser.newContext({ serviceWorkers: "allow" });
    const page = await ctx.newPage();
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto("/");
    expect(await page.evaluate(() => navigator.serviceWorker.ready.then((r) => !!r.active))).toBe(true);
    const cached = await page.evaluate(async () => {
      const [name] = await caches.keys();
      return (await (await caches.open(name)).keys()).map((r) => new URL(r.url).pathname);
    });
    expect(cached).toEqual(expect.arrayContaining(["/", "/index.html", "/config.js", "/vendor/supabase.js", "/manifest.webmanifest"]));
    await ctx.close();
  });
});
