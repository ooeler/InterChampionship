const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };

test.describe("Trainingsleitung per WhatsApp anfragen", () => {
  test("Knopf listet die Trainings ohne Leitung und verlinkt auf Meine Trainings", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=lst]");
    const wa = page.locator("a[data-wa]");
    await expect(wa).toBeVisible();
    await expect(wa).toHaveAttribute("target", "_blank");
    const href = await wa.getAttribute("href");
    expect(href.startsWith("https://wa.me/?text=")).toBe(true);
    const t = decodeURIComponent(href.slice("https://wa.me/?text=".length));
    expect(t).toContain("Wer leitet ein Training?");
    expect(t).toContain("„Ich leite“ unter Meine Trainings");
    expect(t).toMatch(/\/#trainings$/);
    const open = await page.evaluate(() => allTr().filter((r) => !noLead(r) && !started(r.x) && !r.x.lead).map((r) => r.x.d).sort());
    const lines = t.split("\n").filter((l) => l.startsWith("• "));
    expect(lines.length).toBe(Math.min(3, open.length));
    expect(open.length).toBeGreaterThan(0);
    expect(lines[0]).toContain(await page.evaluate((d) => wd(d), open[0]));
  });

  test("Knopf auch ohne offene Trainings, dann mit Dank", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { allTr().forEach((r) => { if (!noLead(r)) r.x.lead = "Othmar Oeler" }); render() });
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=lst]");
    const t = decodeURIComponent((await page.locator("a[data-wa]").getAttribute("href")).slice("https://wa.me/?text=".length));
    expect(t).toContain("Alle kommenden Trainings haben eine Leitung");
    expect(t).toMatch(/\/#trainings$/);
  });

  test("Link #trainings öffnet nach dem Anmelden Meine Trainings", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => { localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) })); localStorage.setItem("__mock_player", "Silvan Frey") });
    await page.goto("/#trainings");
    await page.reload(); // Link frisch geöffnet
    await page.click("#li");
    await page.fill("#auth input[name=email]", SPIELER.email);
    await page.fill("#auth input[name=pw]", SPIELER.password);
    await page.click("#auth form .btn");
    await expect(page.locator("nav [data-tab=train]")).toHaveClass(/on/);
    await expect(page.locator(".card:not(.cl) > h3[data-acc=mytr]")).toBeInViewport();
    expect(await page.evaluate(() => location.hash)).toBe("");
  });
});

test("Spielleitung: Einteilen und Statistik hintereinander, beide zu, WhatsApp beim Einteilen", async ({ page }) => {
  await login(page, { email: "admin@flyingpenguins.test", password: "admin123" });
  await page.click("nav [data-tab=team]");
  const ids = await page.locator("main .card > h3[data-acc]").evaluateAll((h) => h.map((x) => x.dataset.acc));
  expect(ids.indexOf("lst")).toBe(ids.indexOf("tl") + 1);
  await expect(page.locator("h3[data-acc=tl]")).toHaveText(/^Trainingsleitung · Einteilen/);
  await expect(page.locator("h3[data-acc=lst]")).toHaveText(/^Trainingsleitung · Statistik/);
  for (const k of ["tl", "lst"]) await expect(page.locator(`h3[data-acc=${k}]`)).toHaveAttribute("aria-expanded", "false");
  const tl = page.locator(".card", { has: page.locator("h3[data-acc=tl]") });
  const lst = page.locator(".card", { has: page.locator("h3[data-acc=lst]") });
  await expect(tl.locator("a[data-wa]")).toHaveCount(1);
  await expect(lst.locator("a[data-wa]")).toHaveCount(0);
  await page.click("h3[data-acc=tl]");
  await expect(tl.locator("a[data-wa]")).toBeVisible();
});
