const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };

async function seed(page, extra = () => {}) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
  await page.evaluate(extra);
}
const prof = (page) => page.locator("#prof");

test.describe("Spielerprofil (#103)", () => {
  test("Spieler sehen beide Teams nur lesend, Antippen öffnet das Profil", async ({ page }) => {
    await seed(page, () => localStorage.setItem("__mock_prof", JSON.stringify([{ player: "Beat Rentsch", pos: "f", stick: "l", nr: 7 }])));
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("[data-prof]")).toHaveCount(await page.evaluate(() => allP().length));
    await expect(page.locator("[data-ted], input[data-pn], input[data-tn]")).toHaveCount(0);
    await page.click("[data-prof='Beat Rentsch']");
    await expect(prof(page)).toContainText("Beat Rentsch");
    await expect(prof(page)).toContainText("Feldspieler");
    await expect(prof(page)).toContainText("Links");
    await expect(prof(page).locator(".nr").first()).toHaveText("7");
    await expect(prof(page).locator("form")).toHaveCount(0); // fremdes Profil: nur lesen
    await expect(prof(page)).toContainText("Trainingsbesuche");
    await page.click("#prof [data-prof='']");
    await expect(prof(page)).toHaveCount(0);
  });

  test("eigenes Profil bearbeiten; Torhüter ohne Stockseite", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await page.click("[data-prof='Silvan Frey']");
    const f = page.locator("#proff");
    await f.locator("[name=pos]").selectOption("f");
    await expect(f.locator("[data-stick]")).toBeVisible();
    await f.locator("[name=stick]").selectOption("r");
    await f.locator("[name=nr]").fill("12");
    await f.locator("button").click();
    await expect(page.locator("#toast")).toContainText("Profil gespeichert");
    let saved = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_prof")));
    expect(saved).toMatchObject([{ player: "Silvan Frey", pos: "f", stick: "r", nr: 12 }]);
    // Torhüter: Stockseite verschwindet und wird nicht gespeichert
    await f.locator("[name=pos]").selectOption("g");
    await expect(f.locator("[data-stick]")).toBeHidden();
    await f.locator("button").click();
    await expect.poll(async () => (await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_prof"))))[0]).toMatchObject({ pos: "g", stick: null, nr: 12 });
  });

  test("Captain: Team bearbeiten öffnet die Bearbeitung, Fertig schliesst sie", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("input[data-pn]")).toHaveCount(0);
    await page.click("[data-ted='0']");
    await expect(page.locator("input[data-tn='0']")).toBeVisible();
    await expect(page.locator("input[data-pn='0']").first()).toBeVisible();
    await expect(page.locator("input[data-pn='1']")).toHaveCount(0);
    await page.click("[data-ted='-1']");
    await expect(page.locator("input[data-pn]")).toHaveCount(0);
  });

  test("Spielleitung archiviert die Saison, das Profil zeigt frühere Saisons", async ({ page }) => {
    await seed(page, () => localStorage.setItem("__mock_pse", JSON.stringify([{ season: "25/26", player: "Silvan Frey", team: "Alte Füchse", goals: 9, assists: 4, trainings: 30, potm: 2, rank_goals: 3, rank_assists: 5, rank_trainings: 1 }])));
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await page.evaluate(() => S.m.forEach((m, i) => actPts(i, m))); // Monatswertungen laden
    await expect.poll(() => page.evaluate(() => S.m.every((m, i) => m.res[0] == null || m.res[1] == null || AP[i]))).toBe(true);
    await page.click("[data-arch]");
    await expect(page.locator("#toast")).toContainText("Spielerarchiv");
    const rows = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_pse")));
    const sn = await page.evaluate(() => S.sn);
    expect(rows.filter((r) => r.season == sn).length).toBe(await page.evaluate(() => allP().length));
    await page.click("[data-prof='Silvan Frey']");
    await expect(prof(page)).toContainText("Frühere Saisons");
    await expect(prof(page)).toContainText("25/26");
    await expect(prof(page)).toContainText("Alte Füchse");
  });

  test("Spieler können nicht archivieren und kein fremdes Profil speichern", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("[data-arch]")).toHaveCount(0);
    const r = await page.evaluate(async () => [(await sb.from("player_profiles").upsert({ player: "Beat Rentsch", pos: "g" })).error, (await sb.from("player_seasons").upsert([{ season: "x", player: "Silvan Frey" }])).error]);
    expect(r[0]).not.toBeNull();
    expect(r[1]).not.toBeNull();
  });
});
