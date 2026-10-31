const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db") || "{}").data);

const sektion = (page, t) => page.locator("main .card.md", { has: page.locator("h3", { hasText: t }) });

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

  test("Spielleitung bearbeitet einen Abschnitt mit Vorschau, die anderen bleiben unverändert", async ({ page }) => {
    await infos(page);
    const karten = page.locator("main .card.md");
    await expect(page.locator("[data-infoe]").first()).toHaveText("✎ Bearbeiten");
    await sektion(page, "Hauptmatch").locator("[data-infoe]").click();
    await expect(page.locator("#infoti")).toHaveValue("Hauptmatch");
    const ta = page.locator("#infot");
    await expect(ta).toHaveValue(/^- 1 Bonustor/);
    await expect(page.locator("[data-infoe='0']")).toHaveCount(0); // nur ein Abschnitt aufs Mal

    await page.locator("#infoti").fill("Hauptspiel");
    await ta.fill("**fett** und *kursiv*\n\n- eins\n- zwei\n\n1. erst\n\n### Klein\n\n[Seite](https://example.com)\n\n<b>roh</b> {winter-event}");
    const p = page.locator("#infop");
    await expect(p.locator("h3")).toHaveText("Hauptspiel");
    await expect(p.locator("b")).toHaveText("fett");
    await expect(p.locator("i")).toHaveText("kursiv");
    await expect(p.locator("ul li")).toHaveCount(2);
    await expect(p.locator("ol li")).toHaveCount(1);
    await expect(p.locator("h4")).toHaveText("Klein");
    await expect(p.locator("a")).toHaveAttribute("href", "https://example.com");
    await expect(p).toContainText("<b>roh</b> 09.12.2026"); // HTML wird nicht ausgeführt

    const n = await karten.count();
    await page.click("[data-infos]");
    await expect(page.locator("#infot")).toHaveCount(0);
    await expect(page.locator("#toast")).toContainText("Infos gespeichert.");
    await expect(karten).toHaveCount(n);
    const c = sektion(page, "Hauptspiel");
    await expect(c).toContainText("fett und kursiv");
    await expect(page.locator("main")).not.toContainText("Forfait 0 : 5");
    await expect(sektion(page, "Ziele")).toContainText("Interne Meisterschaft");
    await expect.poll(async () => ((await db(page)) || {}).info).toContain("## Hauptspiel\n**fett**");
    expect((await db(page)).info).toContain("## Sonstiges Training");
    await page.reload();
    await page.click("nav [data-tab=info]");
    await expect(sektion(page, "Hauptspiel")).toContainText("fett und kursiv");
  });

  test("Neuer Abschnitt, verschieben, löschen", async ({ page }) => {
    await infos(page);
    await page.click("[data-infoe='new']");
    await expect(page.locator("[data-infox]")).toHaveCount(0);
    await page.locator("#infot").fill("Text ohne Titel");
    const msg = page.waitForEvent("dialog");
    await page.click("[data-infos]");
    expect((await msg).message()).toContain("Titel");
    await page.locator("#infoti").fill("Kasse");
    await page.click("[data-infos]");
    await expect(page.locator("main .card.md h3").last()).toHaveText("Kasse");

    // ganz unten: nur nach oben möglich, bearbeitete Texte bleiben beim Verschieben im Formular
    await sektion(page, "Kasse").locator("[data-infoe]").click();
    await expect(page.locator("[data-infom='1']")).toHaveCount(0);
    await page.locator("#infot").fill("Geänderter Text");
    await page.click("[data-infom='-1']");
    await expect(page.locator("#infot")).toHaveValue("Geänderter Text");
    await expect(page.locator("[data-infom='1']")).toBeVisible();
    await page.click("[data-infos]");
    const T = page.locator("main .card.md h3");
    await expect(T.last()).toHaveText("Captains & Spielleitung");
    await expect(T.nth((await T.count()) - 2)).toHaveText("Kasse");
    await expect(sektion(page, "Kasse")).toContainText("Geänderter Text");

    await sektion(page, "Kasse").locator("[data-infoe]").click();
    await page.click("[data-infox]"); // Rückfrage wird bestätigt
    await expect(page.locator("#toast")).toContainText("Abschnitt gelöscht.");
    await expect(sektion(page, "Kasse")).toHaveCount(0);
    await expect.poll(async () => ((await db(page)) || {}).info).toBeUndefined(); // wieder der Standardtext
    await expect(page.locator("[data-infor]")).toHaveCount(0);
  });

  test("Keine gefährlichen Links, Abbrechen ändert nichts, Standard wiederherstellen", async ({ page }) => {
    await infos(page);
    await sektion(page, "Hauptmatch").locator("[data-infoe]").click();
    await page.locator("#infot").fill("[klick](javascript:alert(1)) und [x](data:text/html,y)");
    await expect(page.locator("#infop a")).toHaveCount(0);
    await page.click("#infof [data-infoe='']");
    await expect(page.locator("main")).toContainText("Forfait 0 : 5");

    await sektion(page, "Hauptmatch").locator("[data-infoe]").click();
    await page.locator("#infot").fill("Kurz");
    await page.click("[data-infos]");
    await expect(page.locator("main")).not.toContainText("Forfait 0 : 5");
    await page.click("[data-infor]"); // Rückfrage wird bestätigt
    await expect(page.locator("main")).toContainText("Forfait 0 : 5");
    await expect.poll(async () => ((await db(page)) || {}).info).toBeUndefined();
  });

  test("Leerer Abschnitt wird nicht gespeichert, der letzte nicht gelöscht", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { const d = fix(def()); d.info = "Nur Text ohne Titel"; localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d })) });
    await infos(page);
    await page.click("[data-infoe='0']");
    await page.locator("#infot").fill("   ");
    let msg = page.waitForEvent("dialog");
    await page.click("[data-infos]");
    expect((await msg).message()).toContain("nicht leer");
    await expect(page.locator("#infot")).toHaveCount(1);
    msg = page.waitForEvent("dialog");
    await page.click("[data-infox]");
    expect((await msg).message()).toContain("nicht leer");
    await page.locator("#infot").fill("Text bleibt ohne Titel");
    await page.click("[data-infos]"); // Abschnitt ohne Titel vor dem ersten Titel bleibt erlaubt
    await expect(page.locator("main .card.md")).toContainText("Text bleibt ohne Titel");
  });

  test("Bearbeiten übersteht das Verlassen eines Felds", async ({ page }) => {
    await infos(page);
    await sektion(page, "Ziele").locator("[data-infoe]").click();
    await page.locator("#infoti").fill("Unsere Ziele");
    await page.locator("#infot").click();
    await page.locator("#infot").fill("Neu");
    await page.locator("#infoti").click();
    await expect(page.locator("#infot")).toHaveValue("Neu");
    await page.click("[data-infos]");
    await expect(sektion(page, "Unsere Ziele")).toContainText("Neu");
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
