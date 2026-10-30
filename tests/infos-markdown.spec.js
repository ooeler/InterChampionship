const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db") || "{}").data);

async function infos(page, user = ADMIN) {
  await login(page, user);
  await page.click("nav [data-tab=info]");
}

test.describe("Infos im Markdown-Format", () => {
  test("Standardtext enthält die Ergänzung zur Sommermeisterschaft und die Platzhalter", async ({ page }) => {
    await page.goto("/");
    await page.click("nav [data-tab=info]");
    const c = page.locator(".card", { has: page.locator("h3", { hasText: "Sommermeisterschaft" }) });
    await expect(c).toContainText("Sommermeister = Jahres-Intermeister");
    await expect(c).toContainText("werden auf den Pokal graviert");
    await expect(c).toContainText("(07.05.2027)");
    await expect(page.locator("main")).not.toContainText("{");
    await expect(page.locator("[data-infoe]")).toHaveCount(0);
  });

  test("Spielleitung bearbeitet mit Vorschau und speichert", async ({ page }) => {
    await infos(page);
    await page.click("[data-infoe='1']");
    const ta = page.locator("#infot");
    await expect(ta).toHaveValue(/^## Herren Inter/);
    await ta.fill("## Neu\n**fett** und *kursiv*\n\n- eins\n- zwei\n\n1. erst\n\n[Seite](https://example.com)\n\n<b>roh</b> {winter-event}");
    const p = page.locator("#infop");
    await expect(p.locator("h3")).toHaveText("Neu");
    await expect(p.locator("b")).toHaveText("fett");
    await expect(p.locator("i")).toHaveText("kursiv");
    await expect(p.locator("ul li")).toHaveCount(2);
    await expect(p.locator("ol li")).toHaveCount(1);
    await expect(p.locator("a")).toHaveAttribute("href", "https://example.com");
    await expect(p).toContainText("<b>roh</b> 09.12.2026"); // HTML wird nicht ausgeführt
    await page.click("[data-infos]");
    await expect(page.locator("#infot")).toHaveCount(0);
    await expect(page.locator("main")).toContainText("fett und kursiv");
    await expect(page.locator("main")).not.toContainText("Forfait 0 : 5");
    await expect.poll(async () => ((await db(page)) || {}).info).toContain("## Neu");
    // bleibt nach dem Neuladen
    await page.reload();
    await page.click("nav [data-tab=info]");
    await expect(page.locator("main")).toContainText("fett und kursiv");
  });

  test("Keine gefährlichen Links, Abbrechen ändert nichts, Standard wiederherstellen", async ({ page }) => {
    await infos(page);
    await page.click("[data-infoe='1']");
    await page.locator("#infot").fill("[klick](javascript:alert(1)) und [x](data:text/html,y)");
    await expect(page.locator("#infop a")).toHaveCount(0);
    await page.click("[data-infoe='0']");
    await expect(page.locator("main")).toContainText("Forfait 0 : 5");

    await page.click("[data-infoe='1']");
    await page.locator("#infot").fill("## Kurz");
    await page.click("[data-infos]");
    await expect(page.locator("main")).not.toContainText("Forfait 0 : 5");
    await page.click("[data-infoe='1']");
    await page.click("[data-infor]"); // Rückfrage wird bestätigt
    await expect(page.locator("main")).toContainText("Forfait 0 : 5");
    await expect.poll(async () => ((await db(page)) || {}).info).toBeUndefined();
  });

  test("Leerer Text wird nicht gespeichert", async ({ page }) => {
    await infos(page);
    await page.click("[data-infoe='1']");
    await page.locator("#infot").fill("   ");
    const msg = page.waitForEvent("dialog");
    await page.click("[data-infos]");
    expect((await msg).message()).toContain("nicht leer");
    await expect(page.locator("#infot")).toHaveCount(1);
  });

  test("Spieler und Captains können nicht bearbeiten", async ({ page }) => {
    await infos(page, SPIELER);
    await expect(page.locator("[data-infoe]")).toHaveCount(0);
  });
});

test("Umgesetzter Vorschlag: einmaliger Hinweis und Status in der Liste", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("__mock_feedback", JSON.stringify([
    { id: 7, title: "💡 Status <unsicher>", status: "umgesetzt", created_at: "2026-10-30T10:00:00Z" },
    { id: 8, title: "🐞 Alt", status: "geschlossen", created_at: "2026-10-01T10:00:00Z" },
  ])));
  await login(page, SPIELER);
  await expect(page.locator("#toast")).toContainText("💡 Status <unsicher>");
  await expect(page.locator("#toast")).toContainText("Danke für deine coole Idee!");
  await expect(page.locator("#toast")).toContainText("umgesetzt");
  await page.click("nav [data-tab=info]");
  const fb = page.locator(".card", { has: page.locator("h3", { hasText: "Verbesserungsvorschlag" }) });
  await expect(fb.locator(".row", { hasText: "Status" })).toContainText("✓ umgesetzt");
  await expect(fb.locator(".row", { hasText: "Alt" })).toContainText("erledigt");
  await page.locator("#toast").click();
  await page.reload();
  await expect(page.locator("nav [data-tab=info]")).toBeVisible();
  await page.waitForTimeout(300);
  await expect(page.locator("#toast")).toBeHidden(); // nur einmal
});
