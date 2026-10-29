const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const card = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Mitglied einladen" }) });
const invites = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]").filter((l) => l.name == "invite").map((l) => l.body));

test.describe("Mitglieder per App einladen", () => {
  test("Spielleitung lädt mit Rolle und Spieler ein", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const c = card(page);
    await c.locator("input[name=email]").fill("Neu@Penguins.ch");
    await c.locator("select[name=player]").selectOption("Tobias Keller");
    await c.locator("select[name=role]").selectOption("captain");
    await c.locator("button.add").click();
    await expect(c.locator(".invm")).toHaveText("✓ Einladung an neu@penguins.ch verschickt.");
    expect(await invites(page)).toEqual([{ email: "Neu@Penguins.ch", player: "Tobias Keller", role: "captain" }]);
    await expect(c.locator("input[name=email]")).toHaveValue("");
    // erscheint sofort in der Benutzerverwaltung
    await expect(page.locator(".card", { hasText: "Benutzer & Rollen" })).toContainText("neu@penguins.ch");
  });

  test("Captains laden nur Spieler ein", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const c = card(page);
    await expect(c.locator("select[name=role]")).toHaveCount(0);
    await expect(c).toContainText("Rolle: Spieler");
    await c.locator("input[name=email]").fill("kollege@penguins.ch");
    await c.locator("button.add").click();
    await expect(c.locator(".invm")).toContainText("✓ Einladung");
    expect((await invites(page))[0]).toEqual({ email: "kollege@penguins.ch", player: null, role: "player" });
  });

  test("bestehendes Konto gibt eine verständliche Meldung", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await card(page).locator("input[name=email]").fill("spieler@flyingpenguins.test");
    await card(page).locator("button.add").click();
    await expect(card(page).locator(".invm")).toHaveText("✗ Diese Adresse hat bereits ein Konto.");
  });
});

test.describe("Einladungs-Prüfung (Edge Function invite)", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/invite/logic.mjs") });

  test("Rollen und Rechte", () => {
    expect(L.checkInvite({ email: " A@B.ch ", player: "Tobias Keller" }, "captain")).toEqual({ email: "a@b.ch", role: "player", player: "Tobias Keller" });
    expect(L.checkInvite({ email: "a@b.ch", role: "admin" }, "admin").role).toBe("admin");
    expect(() => L.checkInvite({ email: "a@b.ch", role: "captain" }, "captain")).toThrow("Nur die Spielleitung");
    expect(() => L.checkInvite({ email: "a@b.ch" }, "player")).toThrow("Nur Spielleitung und Captains");
    expect(() => L.checkInvite({ email: "a@b.ch" }, undefined)).toThrow("Nur Spielleitung und Captains");
  });

  test("ungültige Eingaben", () => {
    expect(() => L.checkInvite({ email: "kein-mail" }, "admin")).toThrow("gültige Mail-Adresse");
    expect(() => L.checkInvite({ email: "a@b.ch", role: "boss" }, "admin")).toThrow("Unbekannte Rolle");
  });

  test("verständliche Fehlermeldungen", () => {
    expect(L.inviteError("A user with this email address has already been registered")).toBe("Diese Adresse hat bereits ein Konto.");
    expect(L.inviteError("Error sending invite email")).toContain("SMTP");
  });
});
