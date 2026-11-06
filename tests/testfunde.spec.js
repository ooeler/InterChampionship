const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };

test.describe("Funde aus den erweiterten Tests", () => {
  test("Teams-Reiter öffnet auch ohne Spieler (neue Saison)", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await login(page, ADMIN);
    await page.evaluate(() => { S.t.forEach((t) => { t.p = [] }); render() });
    await page.click("nav [data-tab=team]");
    await expect(page.locator("nav [data-tab=team]")).toHaveClass(/on/);
    await expect(page.locator("h3[data-acc=lst]")).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("Akkordeons per Tastatur bedienbar, Fokus bleibt nach dem Neuzeichnen", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const h = page.locator("h3[data-acc=lst]");
    await expect(h).toHaveAttribute("role", "button");
    await expect(h).toHaveAttribute("tabindex", "0");
    const open = await h.getAttribute("aria-expanded");
    await h.focus();
    await page.keyboard.press("Enter");
    await expect(h).toHaveAttribute("aria-expanded", open == "true" ? "false" : "true");
    expect(await page.evaluate(() => document.activeElement.matches("h3[data-acc=lst]"))).toBe(true);
    await page.keyboard.press(" ");
    await expect(h).toHaveAttribute("aria-expanded", open);
    // Fokus bleibt auch auf Knöpfen, z. B. Spielbericht freigeben
    await page.click("nav [data-tab=spiel]");
    await page.focus("[data-sped]");
    await page.keyboard.press("Enter");
    await expect(page.locator("[data-sped]")).toHaveText("✓ Fertig bearbeitet");
    expect(await page.evaluate(() => document.activeElement.matches("[data-sped]"))).toBe(true);
  });

  test("Speichern ohne Verbindung: Hinweis statt stillem Fehler", async ({ page }) => {
    await login(page);
    await page.evaluate(() => {
      const f = sb.from.bind(sb);
      sb.from = (t) => t == "league_state" ? { select: () => ({ eq: () => ({ maybeSingle: () => Promise.resolve({ data: null, error: { message: "Failed to fetch" } }) }) }) } : f(t);
      return push();
    });
    await expect(page.locator("#toast")).toContainText("Nicht gespeichert");
  });

  test("lange Teamnamen ohne Leerzeichen: kein seitliches Scrollen", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 800 });
    await login(page);
    await page.evaluate(() => { S.t[0].n = "X".repeat(60); S.t[1].n = "Y".repeat(60); render() });
    for (const t of ["spiel", "rang"]) {
      await page.click(`nav [data-tab=${t}]`);
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375);
    }
  });
});

test("Abmeldefrist läuft während der Eingabe ab: Grund wird nicht gespeichert", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) })); localStorage.setItem("__mock_player", "Silvan Frey") });
  await login(page, { email: "spieler@flyingpenguins.test", password: "spieler123" });
  await page.click("nav [data-tab=train]");
  const mine = page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
  await mine.locator(".row").first().locator("[data-abw]").click();
  await mine.locator("[data-stt$='|off']").click();
  const f = mine.locator("form#abf");
  await f.locator("input[name=g]").fill("Ferien");
  const k = await f.getAttribute("data-abk");
  const frist = await page.evaluate((k) => tms(trAt(k).x) - 23 * 36e5, k);
  await page.clock.setFixedTime(new Date(frist + 60000));
  const msg = page.waitForEvent("dialog");
  await f.locator("button").first().click();
  expect((await msg).message()).toContain("nur bis 23 Stunden");
  await expect(f).toHaveCount(0);
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_abs") || "[]"))).toEqual([]);
  expect(await page.evaluate((k) => isOff(trAt(k).x, "Silvan Frey"), k)).toBe(false);
});
