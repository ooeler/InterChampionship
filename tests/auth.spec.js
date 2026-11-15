const { test, expect, setup, login, openLogin, USER } = require("./fixtures");

test.describe("Login", () => {
  test("Ohne Login nur die öffentliche Rangliste und die Infos", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("main")).toContainText("Meisterschaft");
    expect(await page.locator("nav button").allTextContents()).toEqual(["🏆Rangliste", "ℹ️Infos", "🏛️Hall"]);
    await page.click("nav [data-tab=info]");
    await expect(page.locator("main")).toContainText("Die interne Flying Penguins Meisterschaft.");
    await expect(page.locator("main")).not.toContainText("Verbesserungsvorschlag"); // braucht ein Konto
    await expect(page.locator("#regeln")).toHaveCount(0); // Abmelde- und Push-Regeln nur für Mitglieder
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
    await expect(page.locator("#auth .alogo")).toBeVisible();
    expect(await page.locator("#auth .alogo").evaluate((i) => i.naturalWidth)).toBeGreaterThan(0); // Club-Logo geladen
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

  // „Passwort vergessen“ läuft über die Edge Function "passwort" (eigener Mailversand wie die Test-Mail), nicht über Supabase Auth
  const pwCalls = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]"));
  async function forgot(page, email) {
    await page.click("text=Passwort vergessen?");
    await page.fill("#auth input[name=email]", email);
    await page.click("#auth form .btn");
  }

  test("Passwort vergessen: Edge Function verschickt die Mail, gleiche Meldung wie bisher", async ({ page }) => {
    await openLogin(page);
    await forgot(page, "  " + USER.email.toUpperCase() + " ");
    await expect(page.locator("#auth .err")).toHaveText("Falls diese Adresse eingeladen ist, kommt gleich eine Mail mit einem Link.");
    await expect(page.locator("#auth form .btn")).toBeEnabled();
    const log = await pwCalls(page);
    const call = log.filter((l) => l.op == "invoke" && l.name == "passwort");
    expect(call).toHaveLength(1);
    expect(call[0].body).toEqual({ email: USER.email.toUpperCase() }); // nur die Adresse: kein Ziel-Link vom Gerät
    expect(log.some((l) => l.op == "reset")).toBe(false); // nicht mehr über den Mailversand von Supabase Auth
    expect(log).toContainEqual({ op: "mail", to: USER.email, kind: "recovery" });
  });

  test("Passwort vergessen: unbekannte Adresse bekommt dieselbe Antwort", async ({ page }) => {
    await openLogin(page);
    await forgot(page, "niemand@flyingpenguins.test");
    await expect(page.locator("#auth .err")).toHaveText("Falls diese Adresse eingeladen ist, kommt gleich eine Mail mit einem Link.");
    const log = await pwCalls(page);
    expect(log.filter((l) => l.op == "invoke" && l.name == "passwort")).toHaveLength(1);
    expect(log.some((l) => l.op == "mail")).toBe(false);
  });

  test("Passwort vergessen: Fehler und zu viele Anfragen werden verständlich angezeigt", async ({ page }) => {
    await openLogin(page);
    await page.evaluate(() => localStorage.setItem("__mock_reset_err", "Die Mail zum Zurücksetzen konnte nicht verschickt werden. Bitte später nochmals versuchen oder die Spielleitung informieren."));
    await forgot(page, USER.email);
    await expect(page.locator("#auth .err")).toHaveText("Die Mail zum Zurücksetzen konnte nicht verschickt werden. Bitte später nochmals versuchen oder die Spielleitung informieren.");
    await expect(page.locator("#auth form .btn")).toBeEnabled();
    await page.evaluate(() => localStorage.setItem("__mock_reset_err", "Zu viele Anfragen. Bitte warte ein paar Minuten und versuche es dann nochmals."));
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toContainText("Zu viele Anfragen");
    await page.evaluate(() => localStorage.removeItem("__mock_reset_err"));
    await page.fill("#auth input[name=email]", "keine-adresse");
    await page.evaluate(() => { const f = document.querySelector("#auth form"); f.noValidate = true });
    await page.click("#auth form .btn");
    await expect(page.locator("#auth .err")).toHaveText("Bitte eine gültige Mail-Adresse eingeben.");
  });

  test("Passwort vergessen: ohne Antwort der Function eine allgemeine Meldung", async ({ page }) => {
    await openLogin(page);
    await page.evaluate(() => { sb.functions.invoke = () => Promise.resolve({ data: null, error: { message: "Failed to send a request to the Edge Function" } }) });
    await forgot(page, USER.email);
    await expect(page.locator("#auth .err")).toHaveText("Die Mail zum Zurücksetzen konnte nicht verschickt werden. Bitte später nochmals versuchen oder die Spielleitung informieren.");
    await expect(page.locator("#auth form .btn")).toBeEnabled();
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
    await page.click("#lo"); // Benutzermenü
    await page.click("[data-lo]");
    await expect(page.locator("#li")).toBeVisible(); // zurück in der öffentlichen Rangliste
    await expect(page.locator("nav button")).toHaveCount(3); // Rangliste, Hall, Infos
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
