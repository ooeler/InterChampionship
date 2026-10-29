const { test, expect, login } = require("./fixtures");

const titles = (page) => page.locator("main .card > h3").allTextContents();
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

test.describe("Usability", () => {
  test("Teams: Einladen oben, C und ✕ erklärt, Sicherung am Ende", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const t = await titles(page);
    expect(t.slice(0, 2)).toEqual(["Allgemein", "Mitglied einladen"]);
    expect(t.at(-1)).toBe("Backup");
    await expect(card(page, "Team 1")).toContainText("C = Captain wählen · ✕ = Spieler entfernen");
    await expect(page.locator("[data-rm]").first()).toHaveAttribute("aria-label", /entfernen$/);
  });

  test("Training: Strafen nach der Anwesenheit, Löschen abgesetzt", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=train]");
    const ov = card(page, "Übersicht pro Training");
    const order = await ov.evaluate((c) => [".sk", "form#pen", "[data-tadd]", "[data-tdel]"].map((s) => [...c.querySelectorAll("*")].indexOf(c.querySelector(s))));
    expect(order.every((x) => x >= 0)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
    await expect(ov.locator("[data-tdel]")).toHaveText("🗑 Dieses Training löschen …");
  });

  test("Spieltag: Ablauf zuerst, Tore/Assists pro Team zuklappbar", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const t = await titles(page);
    expect(t[0]).toMatch(/^Ablauf Matchtag/);
    expect(t.indexOf("Spielbericht")).toBe(1);
    const sk = page.locator(".card", { has: page.locator("h3[data-acc=sk0]") });
    await expect(sk.locator("[data-k]").first()).toBeVisible();
    await page.click("h3[data-acc=sk0]");
    await expect(sk).toHaveClass(/(^| )cl( |$)/);
    await expect(sk.locator("[data-k]").first()).toBeHidden();
  });

  test("Benachrichtigungen nur im Training-Tab", async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem("__mock_vapid", "x"));
    await login(page);
    await page.click("nav [data-tab=rang]");
    await expect(card(page, "Benachrichtigungen")).toHaveCount(0);
    await page.click("nav [data-tab=train]");
    await expect(card(page, "Benachrichtigungen")).toHaveCount(1);
    await expect(card(page, "Benachrichtigungen")).toContainText("Zusätzlich bei An- und Abmeldungen informieren");
  });

  test("leere Ranglisten zeigen einen Hinweis statt Nullen", async ({ page }) => {
    await page.goto("/");
    await expect(card(page, /^Tore$/)).toContainText("Noch keine Tore.");
    await expect(card(page, /^Tore$/).locator(".row")).toHaveCount(0);
    await expect(card(page, /^Skorerpunkte$/)).toContainText("Noch keine Skorerpunkte.");
  });

  test("Infos: Titel Herren Inter, Vorschlag am Ende", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    const t = await titles(page);
    expect(t[0]).toBe("Herren Inter");
    expect(t.at(-1)).toBe("Verbesserungsvorschlag");
  });

  test("Auswahllisten und Anmelden-Knopf sind gross genug zum Tippen", async ({ page }) => {
    await page.goto("/");
    expect((await page.locator("#li").boundingBox()).height).toBeGreaterThanOrEqual(36);
    await login(page);
    await page.click("nav [data-tab=train]");
    expect((await page.locator("select[data-lead]").boundingBox()).height).toBeGreaterThanOrEqual(44);
  });
});
