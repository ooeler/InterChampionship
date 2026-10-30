const { test, expect, setup, login, openLogin, USER } = require("./fixtures");

test.describe("Login", () => {
  test("Ohne Login nur die öffentliche Rangliste und die Infos", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toContainText("Meisterschaft");
    expect(await page.locator("nav button").allTextContents()).toEqual(["🏆Rangliste", "ℹ️Infos"]);
    await page.click("nav [data-tab=info]");
    await expect(page.locator("main")).toContainText("Die interne Flying Penguins Meisterschaft.");
    await expect(page.locator("main")).not.toContainText("Verbesserungsvorschlag"); // braucht ein Konto
    await page.click("nav [data-tab=rang]");
    await expect(page.locator("main")).toContainText("Meisterschaft");
    await expect(page.locator("#lo")).toBeHidden();
    await expect(page.locator("#hi")).toBeHidden();
    await page.evaluate(() => { tab = "team"; render() });
    await expect(page.locator("main")).not.toContainText("Team 1 ·");
  });

  test("Anmelden öffnet den Login, 'Zurück' führt zur Rangliste", async ({ page }) => {
    await openLogin(page);
    await expect(page.locator("#auth h1")).toHaveText("Herren Inter");
    await expect(page.locator("#auth")).toContainText("Nur für eingeladene Mitglieder");
    await expect(page.locator("header")).toBeHidden();
    await expect(page.locator("main")).toBeHidden();
    await expect(page.locator("nav")).toBeHidden();
    await page.click("text=Zurück zur Rangliste");
    await expect(page.locator("main")).toContainText("Meisterschaft");
    await expect(page.locator("#li")).toBeVisible();
  });

  test("Falsches Passwort zeigt Fehler", async ({ page }) => {
    await openLogin(page);
    await page.fill("#auth input[name=email]", USER.email);
    await page.fill("#auth input[name=pw]", "falsch");
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toContainText("E-Mail oder Passwort falsch");
    await expect(page.locator("header")).toBeHidden();
  });

  test("Nicht eingeladene Adresse kommt nicht rein", async ({ page }) => {
    await openLogin(page);
    await page.fill("#auth input[name=email]", "fremd@example.com");
    await page.fill("#auth input[name=pw]", "irgendwas");
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toBeVisible();
    await expect(page.locator("header")).toBeHidden();
  });

  test("Login zeigt die Rangliste und bleibt nach Neuladen erhalten", async ({ page }) => {
    await login(page);
    await expect(page.locator("#h1")).toContainText("Herren Inter 26/27");
    await expect(page.locator("main")).toContainText("Meisterschaft");
    await expect(page.locator("#auth")).toBeHidden(); // Overlay darf die App nicht verdecken
    await page.reload();
    await expect(page.locator("header")).toBeVisible();
    await expect(page.locator("#auth")).toBeHidden();
  });

  test("Einladungslink: Passwort festlegen, dann App", async ({ page }) => {
    await page.goto("/#access_token=x&type=invite&email=neu%40flyingpenguins.test");
    await expect(page.locator("#auth h1")).toHaveText("Passwort festlegen");
    await expect(page.locator("#auth")).toContainText("neu@flyingpenguins.test");

    await page.fill("input[name=p1]", "passwort123");
    await page.fill("input[name=p2]", "anders123");
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toContainText("stimmen nicht überein");

    await page.fill("input[name=p2]", "passwort123");
    await page.click("#auth form .btn");
    await expect(page.locator("header")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    expect(log).toContainEqual({ op: "updateUser", email: "neu@flyingpenguins.test" });
  });

  test("Passwort-Reset-Link führt zu 'Passwort festlegen'", async ({ page }) => {
    await page.goto("/#access_token=x&type=recovery&email=" + encodeURIComponent(USER.email));
    await expect(page.locator("#auth h1")).toHaveText("Passwort festlegen");
  });

  test("Passwort vergessen sendet Mail mit Link zurück zur App", async ({ page }) => {
    await openLogin(page);
    await page.click("text=Passwort vergessen?");
    await page.fill("#auth input[name=email]", USER.email);
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toContainText("kommt gleich eine Mail");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    expect(log[0]).toMatchObject({ op: "reset", email: USER.email });
    expect(log[0].redirectTo).toMatch(/^http:\/\/localhost:\d+\/$/);
  });

  test("OAuth: Google und Microsoft werden angeboten", async ({ page }) => {
    await openLogin(page);
    await expect(page.locator("#auth [data-oa=google]")).toHaveText("Mit Google anmelden");
    await expect(page.locator("#auth [data-oa=azure]")).toHaveText("Mit Microsoft anmelden");
  });

  test("OAuth: eingeladene Person kommt rein", async ({ page }) => {
    await openLogin(page);
    await page.click("#auth [data-oa=google]");
    await expect(page.locator("header")).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    expect(log[0]).toMatchObject({ op: "oauth", provider: "google" });
  });

  test("OAuth: nicht eingeladene Person wird abgewiesen", async ({ page }) => {
    await openLogin(page);
    await page.evaluate(() => localStorage.setItem("__mock_oauth_email", "fremd@gmail.com"));
    await page.click("#auth [data-oa=azure]");
    await expect(page.locator("#auth .err")).toHaveText("Diese Adresse ist nicht eingeladen. Bitte beim Captain melden.");
    await expect(page.locator("header")).toBeHidden();
  });

  test("Ohne konfigurierte Anbieter keine OAuth-Knöpfe", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_providers", "[]"));
    await page.reload();
    await page.click("#li");
    await expect(page.locator("#auth form")).toBeVisible();
    await expect(page.locator("#auth [data-oa]")).toHaveCount(0);
    await expect(page.locator("#auth .or")).toHaveCount(0);
  });

  test("Abmelden löscht lokale Daten", async ({ page }) => {
    await login(page);
    await page.click("#lo");
    await expect(page.locator("#li")).toBeVisible(); // zurück in der öffentlichen Rangliste
    await expect(page.locator("nav button")).toHaveCount(2); // Rangliste + Infos
    expect(await page.evaluate(() => localStorage.getItem("ic_state"))).toBeNull();
  });

  test("Ohne Konfiguration erscheint ein Hinweis", async ({ browser }) => {
    const page = await browser.newPage();
    await setup(page, { mock: false });
    await page.route("**/config.js", (r) => r.fulfill({ body: "window.IM_CONFIG={url:'',key:''}", contentType: "application/javascript" }));
    await page.goto("/");
    await expect(page.locator("#auth h1")).toHaveText("Einrichtung fehlt");
    await page.close();
  });
});
