const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const card = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Mitglied einladen" }) });
const calls = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]").filter((l) => l.name == "invite").map((l) => l.body));

// Erstellt als Spielleitung einen Link und gibt ihn zurück
async function createLink(page, player, role) {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  const c = card(page);
  if (player) await c.locator("select[name=player]").selectOption(player);
  if (role) await c.locator("select[name=role]").selectOption(role);
  await c.locator("form#inv button.add").click();
  return c.locator(".invk input").inputValue();
}

async function logout(page) {
  await page.click("#lo");
}

test.describe("Mitglieder per Einladungslink einladen", () => {
  test("Spielleitung erstellt einen Link mit Rolle und Spieler", async ({ page }) => {
    const link = await createLink(page, "Tobias Keller", "captain");
    expect(link).toMatch(/#einladung=[A-Za-z0-9_-]{43}$/);
    expect((await calls(page)).find((b) => b.action == "create")).toEqual({ action: "create", player: "Tobias Keller", role: "captain" });
    const c = card(page);
    await expect(c.locator(".invk")).toContainText("Tobias Keller · Captain");
    await expect(c.locator("[data-invcp]")).toBeVisible();
    // erscheint in den offenen Einladungen und lässt sich zurückziehen
    await expect(c.locator(".row", { hasText: "Tobias Keller" })).toBeVisible();
    await c.locator("[data-invdel]").click();
    await expect(c.locator(".row", { hasText: "Tobias Keller" })).toHaveCount(0);
    await expect(c.locator(".invk")).toHaveCount(0);
  });

  test("Captains laden nur Spieler ein", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const c = card(page);
    await expect(c.locator("select[name=role]")).toHaveCount(0);
    await expect(c).toContainText("Rolle: Spieler");
    await c.locator("form#inv button.add").click();
    await expect(c.locator(".invk input")).toHaveValue(/#einladung=/);
    expect((await calls(page)).find((b) => b.action == "create")).toEqual({ action: "create", player: null, role: "player" });
  });

  test("Eingeladene Person erstellt mit dem Link ihr Konto und ist drin", async ({ page }) => {
    const link = await createLink(page, "Tobias Keller");
    await logout(page);
    await page.goto("about:blank"); // wie ein frisch geöffneter Link
    await page.goto(link);
    const a = page.locator("#auth");
    await expect(a.locator(".jw")).toContainText("Du bist eingeladen als Tobias Keller");
    await a.locator("input[name=email]").fill("Tobias@Penguins.ch");
    await a.locator("input[name=p1]").fill("supergeheim");
    await a.locator("input[name=p2]").fill("supergeheim");
    await a.locator("form button.btn").click();
    await expect(a).toBeHidden();
    await expect(page.locator("#lo")).toBeVisible();
    expect(new URL(page.url()).hash).toBe(""); // Token verschwindet aus der Adresszeile
    expect((await calls(page)).find((b) => b.action == "join")).toMatchObject({ email: "Tobias@Penguins.ch", password: "supergeheim" });
  });

  test("Ein Link funktioniert nur einmal", async ({ page }) => {
    const link = await createLink(page);
    await logout(page);
    await page.goto("about:blank"); // wie ein frisch geöffneter Link
    await page.goto(link);
    const a = page.locator("#auth");
    await a.locator("input[name=email]").fill("eins@penguins.ch");
    await a.locator("input[name=p1]").fill("passwort1");
    await a.locator("input[name=p2]").fill("passwort1");
    await a.locator("form button.btn").click();
    await expect(page.locator("#lo")).toBeVisible();
    await logout(page);
    await page.goto("about:blank"); // wie ein frisch geöffneter Link
    await page.goto(link);
    await expect(page.locator("#auth .jw")).toContainText("ungültig, abgelaufen oder wurde schon verwendet");
    await expect(page.locator("#auth form[data-f=join]")).toBeHidden();
  });

  test("Passwörter müssen übereinstimmen", async ({ page }) => {
    const link = await createLink(page);
    await logout(page);
    await page.goto("about:blank"); // wie ein frisch geöffneter Link
    await page.goto(link);
    const a = page.locator("#auth");
    await a.locator("input[name=email]").fill("neu@penguins.ch");
    await a.locator("input[name=p1]").fill("passwort1");
    await a.locator("input[name=p2]").fill("passwort2");
    await a.locator("form button.btn").click();
    await expect(a.locator(".err")).toHaveText("Die Passwörter stimmen nicht überein.");
  });
});

test.describe("Einladungslink (Edge Function invite)", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/invite/logic.mjs") });

  test("Rollen und Rechte", () => {
    expect(L.checkInvite({ player: " Tobias Keller " }, "captain")).toEqual({ role: "player", player: "Tobias Keller" });
    expect(L.checkInvite({ role: "admin" }, "admin")).toEqual({ role: "admin", player: null });
    expect(() => L.checkInvite({ role: "captain" }, "captain")).toThrow("Nur die Spielleitung");
    expect(() => L.checkInvite({}, "player")).toThrow("Nur Spielleitung und Captains");
    expect(() => L.checkInvite({}, undefined)).toThrow("Nur Spielleitung und Captains");
    expect(() => L.checkInvite({ role: "boss" }, "admin")).toThrow("Unbekannte Rolle");
  });

  test("Token: zufällig, URL-tauglich, nur der Hash wird gespeichert", async () => {
    const a = L.newToken(), b = L.newToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(a).not.toBe(b);
    expect(L.checkToken(a)).toBe(a);
    expect(() => L.checkToken("kurz")).toThrow("ungültig");
    expect(() => L.checkToken(a + "'; drop table")).toThrow("ungültig");
    const h = await L.hashToken(a);
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).not.toContain(a);
    expect(await L.hashToken(a)).toBe(h);
  });

  test("Registrierung: Mail und Passwort", () => {
    expect(L.checkJoin({ email: " A@B.ch ", password: "12345678" })).toEqual({ email: "a@b.ch", password: "12345678" });
    expect(() => L.checkJoin({ email: "kein-mail", password: "12345678" })).toThrow("gültige Mail-Adresse");
    expect(() => L.checkJoin({ email: "a@b.ch", password: "kurz" })).toThrow("mindestens 8");
    expect(() => L.checkJoin({ email: "a@b.ch", password: "x".repeat(73) })).toThrow("höchstens 72");
    expect(L.joinError("A user with this email address has already been registered")).toContain("bereits ein Konto");
  });
});
