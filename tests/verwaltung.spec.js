const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const card = (page, k) => page.locator(".card", { has: page.locator(`h3[data-acc=${k}]`) });
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]"));

async function teams(page) {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
}

test.describe("Verwaltung durch die Spielleitung", () => {
  test("Ansicht zwischen Spielleitung und Spieler umschalten – bleibt nach Neuladen", async ({ page }) => {
    await teams(page);
    const bar = page.locator(".vw");
    await expect(bar.locator("[data-view=admin]")).toHaveClass(/on/);
    await bar.locator("[data-view=player]").click();
    await expect(page.locator(".vw.pv")).toContainText("Du siehst die App als Spieler");
    await expect(page.locator("nav [data-tab=team]")).toHaveCount(0); // Spieler haben keinen Teams-Tab
    await page.click("nav [data-tab=train]");
    await expect(page.locator(".card", { hasText: "Übersicht pro Training" })).not.toContainText("Als Spielleitung kannst du");
    await page.reload();
    await expect(page.locator(".vw.pv")).toBeVisible();
    await expect(page.locator("nav [data-tab=team]")).toHaveCount(0);
    await page.locator("[data-view=admin]").click();
    await expect(page.locator(".vw.pv")).toHaveCount(0);
    await expect(page.locator("nav [data-tab=team]")).toBeVisible();
  });

  test("Spieler und Captains sehen keinen Ansicht-Umschalter", async ({ page }) => {
    await login(page);
    await expect(page.locator("nav [data-tab=team]")).toBeVisible();
    await expect(page.locator(".vw")).toHaveCount(0);
  });

  test("Benutzer & Rollen ist zugeklappt; einzelne Benutzer lassen sich löschen, sich selbst nicht", async ({ page }) => {
    await teams(page);
    const u = card(page, "us");
    await expect(u).toHaveClass(/\bcl\b/);
    await expect(u.locator("h3")).toContainText("· 3");
    await page.click("h3[data-acc=us]");
    await expect(u).not.toHaveClass(/\bcl\b/);
    await expect(u.locator("[data-mdel='u-admin@flyingpenguins.test']")).toHaveCount(0);
    await u.locator("[data-mdel='u-spieler@flyingpenguins.test']").click(); // Rückfrage wird bestätigt
    await expect(u).not.toContainText("spieler@flyingpenguins.test");
    await expect(u.locator("h3")).toContainText("· 2");
    expect((await log(page)).find((l) => l.fn == "delete_member").args).toEqual({ uid: "u-spieler@flyingpenguins.test" });
  });

  test("Trainingsleitung pro Training im Teams-Tab ändern", async ({ page }) => {
    await teams(page);
    const tl = card(page, "tl");
    await expect(tl).toHaveClass(/\bcl\b/);
    await page.click("h3[data-acc=tl]");
    const sel = tl.locator("select[data-lead]").first();
    const key = await sel.getAttribute("data-lead");
    await sel.selectOption("Beat Rentsch");
    const lead = () => page.evaluate((k) => { const [m, t] = k.split(",").map(Number); return S.m[m].tr[t].lead || null }, key);
    await expect.poll(lead).toBe("Beat Rentsch");
    await tl.locator(`select[data-lead='${key}']`).selectOption("");
    await expect.poll(lead).toBeNull();
    // Match Day hat keine Leitung
    const md = await page.evaluate(() => S.m.map((m, i) => i + "," + (m.tr.length - 1)));
    for (const k of md) await expect(tl.locator(`select[data-lead='${k}']`)).toHaveCount(0);
  });

  test("Akkordeon gleitet beim Öffnen und Schliessen", async ({ page }) => {
    await teams(page);
    const bk = card(page, "bk");
    const h0 = (await bk.boundingBox()).height;
    await page.click("h3[data-acc=bk]");
    const anim = () => page.evaluate(() => document.querySelector("h3[data-acc=bk]").closest(".card").getAnimations().length);
    expect(await anim()).toBeGreaterThan(0);
    await expect.poll(anim).toBe(0);
    expect((await bk.boundingBox()).height).toBeGreaterThan(h0 + 40);
    await page.click("h3[data-acc=bk]");
    expect(await anim()).toBeGreaterThan(0);
    await expect.poll(async () => (await bk.boundingBox()).height).toBeLessThan(h0 + 2);
  });
});
