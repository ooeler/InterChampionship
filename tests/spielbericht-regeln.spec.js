const { test, expect, login } = require("./fixtures");

// BB-1: Ein Textfeld speichert beim Verlassen ("change"). Der erste Klick auf einen Knopf danach darf nicht verloren gehen.
test.describe("Team bearbeiten: erster Klick nach einer Eingabe zählt", () => {
  async function edit(page) {
    await login(page);
    await page.click("nav [data-tab=team]");
    await page.click("[data-ted='0']"); // Team bearbeiten
    await expect(page.locator("input[data-tn='0']")).toBeVisible();
  }

  test("+ Spieler hinzufügen direkt nach dem Teamnamen", async ({ page }) => {
    await edit(page);
    const rows = page.locator("input[data-pn='0']"), n = await rows.count();
    await page.fill("input[data-tn='0']", "Pinguine"); // Cursor bleibt im Feld
    await expect(page.locator("input[data-tn='0']")).toBeFocused();
    await page.locator("[data-add='0']").click(); // ein einziger Klick
    await expect(rows).toHaveCount(n + 1);
    await expect(page.locator("#sub")).toHaveText("Pinguine vs SpVgg Nieder");
    expect(await page.evaluate(() => S.t[0].n)).toBe("Pinguine");
  });

  test("✓ Fertig bearbeitet direkt nach einem Spielernamen", async ({ page }) => {
    await edit(page);
    await page.locator("input[data-pn='0']").nth(1).fill("Neuer Name");
    await page.locator("[data-ted='-1']").click(); // ein einziger Klick
    await expect(page.locator("input[data-tn]")).toHaveCount(0);
    expect(await page.evaluate(() => S.t[0].p.includes("Neuer Name"))).toBe(true);
  });

  test("Captain-Knopf in der eben umbenannten Zeile meint den neuen Namen", async ({ page }) => {
    await edit(page);
    const row = page.locator("#app .row", { has: page.locator("input[data-pn='0']") }).nth(1);
    await row.locator("input[data-pn]").fill("Zora Neu"); // wird alphabetisch ans Ende sortiert
    await row.locator("[data-cap]").click();
    await expect.poll(() => page.evaluate(() => S.t[0].c)).toBe("Zora Neu");
    await expect(page.locator("[data-cap='0'][data-p='Zora Neu']")).toHaveAttribute("aria-pressed", "true");
  });

  test("Antippen auf Touch-Geräten", async ({ page }, info) => {
    test.skip(!info.project.use.hasTouch, "nur Touch-Geräte");
    await edit(page);
    const rows = page.locator("input[data-pn='0']"), n = await rows.count();
    await page.fill("input[data-tn='0']", "Pinguine");
    await page.locator("[data-add='0']").tap();
    await expect(rows).toHaveCount(n + 1);
    await page.locator("[data-ted='-1']").tap();
    await expect(page.locator("input[data-tn]")).toHaveCount(0);
  });
});

// Pre-Games: jedes Team höchstens 3 Punkte; Unentschieden gibt beiden einen Punkt, darum ist z. B. 3 : 3 möglich
test("Pre-Game-Punkte: höchstens 3 pro Team, zusammen auch mehr", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    d.m[2].pre = [0, 0];
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  });
  await login(page);
  await page.click("nav [data-tab=spiel]");
  await page.click("[data-c='2']");
  await page.click("[data-sped]");
  const btn = (t, d) => page.locator(`[data-k=pre][data-t="${t}"][data-d="${d}"]`);
  for (let i = 0; i < 3; i++) await btn(0, 1).click();
  await expect(btn(0, 1)).toBeDisabled();
  await expect(btn(1, 1)).toBeEnabled();
  await btn(0, 1).evaluate((b) => { b.disabled = false; b.click() }); // auch ohne disabled bleibt es bei 3
  for (let i = 0; i < 3; i++) await btn(1, 1).click();
  expect(await page.evaluate(() => S.m[2].pre)).toEqual([3, 3]);
  await expect(btn(1, 1)).toBeDisabled();
  await btn(0, -1).click();
  await expect(btn(0, 1)).toBeEnabled();
  expect(await page.evaluate(() => S.m[2].pre)).toEqual([2, 3]);
  await expect(page.locator(".sk", { hasText: "Pre-Game-Punkte" })).toContainText("max. 3 pro Team");
});
