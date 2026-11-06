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
    const n = await page.evaluate(() => (leadStats().match(/(\d+) ohne Leitung/) || [])[1]);
    expect(t.split("\n").filter((l) => l.startsWith("• ")).length).toBe(+n);
  });

  test("ohne offene Trainings kein Knopf", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { allTr().forEach((r) => { if (!noLead(r)) r.x.lead = "Othmar Oeler" }); render() });
    await page.click("nav [data-tab=team]");
    await expect(page.locator("a[data-wa]")).toHaveCount(0);
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
