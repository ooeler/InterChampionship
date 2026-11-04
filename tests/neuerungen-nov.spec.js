const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

test.describe("Neuerungen November", () => {
  test("Team-Duell zeigt die Anwesenheit in Prozent", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=train]");
    const c = card(page, "Team-Duell");
    await expect(c).toContainText("Anwesenheit");
    await expect(c).not.toContainText("Ø");
    await expect(c).toContainText(/\d+ %/);
    const p = await page.evaluate(() => { const i = S.m.findIndex((m) => m.tr.length && m.tr[m.tr.length - 1].d >= TD); return [pct(S.m[i], 0), pct(S.m[i], 1)] });
    for (const v of p) { expect(v).toBeGreaterThanOrEqual(0); expect(v).toBeLessThanOrEqual(100) }
    await expect(c.locator(".kv").nth(1).locator("b").first()).toHaveText(p[0] + " %");
  });

  test("Monatsübersicht und Übersicht pro Training wechseln gemeinsam", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=train]");
    const ov = card(page, "Übersicht pro Training"), mo = card(page, "Monatsübersicht");
    await ov.locator("[data-tsm]").first().click();
    const m1 = await ov.locator("[data-tsm].on").getAttribute("data-tsm");
    await expect(mo.locator(`[data-tmon="${m1}"]`)).toHaveClass(/\bon\b/);
    const ziel = await ov.locator("[data-tsm]").last().getAttribute("data-tsm");
    await mo.locator(`[data-tmon="${ziel}"]`).click();
    await expect(ov.locator(`[data-tsm="${ziel}"]`)).toHaveClass(/\bon\b/);
    await ov.locator("[data-tsm]").first().click();
    await expect(mo.locator(`[data-tmon="${m1}"]`)).toHaveClass(/\bon\b/);
  });

  test("Letzte 10 Vorschläge aller Mitglieder, eigene markiert", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_feedback", JSON.stringify(Array.from({ length: 12 }, (_, i) => ({ title: "Vorschlag " + i, status: "erfasst", issue_number: 90 + i, issue_url: "https://github.com/x/y/issues/" + (90 + i), created_at: "2026-11-0" + (i % 9 + 1), mine: i == 11 })))));
    await login(page, SPIELER);
    await page.click("nav [data-tab=info]");
    const c = card(page, "Verbesserungsvorschlag");
    await expect(c).toContainText("Letzte Vorschläge");
    await expect(c.locator(".row")).toHaveCount(10);
    await expect(c.locator(".row").first()).toContainText("Vorschlag 11 · von dir");
    await expect(c.locator(".row", { hasText: "Vorschlag 10" })).not.toContainText("von dir");
  });

  test("Test-Benachrichtigung für die Spielleitung", async ({ page }) => {
    const alerts = [];
    page.on("dialog", (d) => alerts.push(d.message()));
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=mt]");
    await page.click("[data-tpush]");
    await expect.poll(() => alerts.join()).toContain("Auf keinem Gerät aktiviert");
    await page.evaluate(() => localStorage.setItem("__mock_pushdevs", "2"));
    await page.click("[data-tpush]");
    await expect.poll(() => alerts.join()).toContain("an 2 von 2 Geräten verschickt");
  });

  test("Ranglisten auf dem Handy ohne Balken, damit die Symbole Platz haben", async ({ page, isMobile }) => {
    await page.goto("/");
    const b = page.locator(".row.brd .bar").first();
    await expect(page.locator(".row.brd").first()).toBeVisible();
    if (isMobile) await expect(b).toBeHidden();
    else await expect(b).toBeVisible();
  });
});
