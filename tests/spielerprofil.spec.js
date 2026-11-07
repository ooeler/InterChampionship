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
    await expect(page.locator("main [data-prof]")).toHaveCount(await page.evaluate(() => allP().length));
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
    await page.click("#lo");
    await page.click("[data-myprof]");
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

  test("Benutzermenü: Mein Profil als Overlay, Abmelden als Unterpunkt, Escape schliesst", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await expect(page.locator("#lo")).toHaveText("👤");
    await expect(page.locator("#um")).toBeHidden();
    await page.click("#lo");
    await expect(page.locator("#lo")).toHaveAttribute("aria-expanded", "true");
    await expect(page.locator("#um [role=menuitem]")).toHaveText(["👤 Mein Profil", "↩️ Abmelden"]);
    await expect(page.locator("#ume")).toHaveText(SPIELER.email);
    await page.click("main"); // Klick daneben schliesst das Menü
    await expect(page.locator("#um")).toBeHidden();
    await page.click("#lo");
    await page.click("[data-myprof]");
    await expect(page.locator("#ovl")).toBeVisible();
    await expect(page.locator("#ovl [role=dialog]")).toHaveAttribute("aria-modal", "true");
    await expect(prof(page)).toContainText("Silvan Frey");
    await expect(prof(page)).toContainText(SPIELER.email);
    await expect(page.locator("#proff")).toBeVisible();
    await expect(page.locator("#pwf")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.locator("#ovl")).toBeHidden();
  });

  test("Passwort im Profil ändern", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("#lo");
    await page.click("[data-myprof]");
    const f = page.locator("#pwf");
    await f.locator("[name=p1]").fill("neuesPasswort1");
    await f.locator("[name=p2]").fill("anderes");
    let msg = "";
    page.on("dialog", (d) => { msg = d.message(); }); // die Fixture bestätigt Dialoge selbst
    await f.locator("button").click();
    await expect.poll(() => msg).toContain("stimmen nicht");
    await f.locator("[name=p2]").fill("neuesPasswort1");
    await f.locator("button").click();
    await expect(page.locator("#toast")).toContainText("Passwort geändert");
    await expect(f.locator("[name=p1]")).toHaveValue("");
  });

  test("Teams zeigen auch das eigene Profil nur lesend, mit Skorerpunkten statt Assists", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await page.click("[data-prof='Silvan Frey']");
    await expect(page.locator("#ovl")).toBeVisible();
    await expect(prof(page).locator("form")).toHaveCount(0);
    await expect(prof(page)).toContainText("Skorerpunkte");
    await expect(prof(page)).not.toContainText("Assists");
    await page.click("#ovl .ovb", { position: { x: 5, y: 5 } }); // Klick auf den Hintergrund schliesst
    await expect(page.locator("#ovl")).toBeHidden();
  });

  test("durch die Profile blättern: Knöpfe, Pfeiltasten und Wischen", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    const L = await page.evaluate(() => profList());
    await page.click(`main [data-prof='${L[0]}']`);
    await expect(prof(page).locator("h3")).toContainText(L[0]);
    await expect(prof(page).locator(".pnav")).toContainText(`1 / ${L.length}`);
    await page.click("#ovc [data-pstep='1']");
    await expect(prof(page).locator("h3")).toContainText(L[1]);
    await expect(page.locator("#ovc [data-pstep='1']")).toBeFocused();
    await page.click("#ovc [data-pstep='-1']");
    await page.click("#ovc [data-pstep='-1']"); // vom ersten zum letzten
    await expect(prof(page).locator("h3")).toContainText(L[L.length - 1]);
    await page.keyboard.press("ArrowRight");
    await expect(prof(page).locator("h3")).toContainText(L[0]);
    // Wischen nach links = nächstes Profil
    await page.evaluate(() => {
      const el = document.querySelector("#ovc h3"), ev = (type, k, x) => { const e = new Event(type, { bubbles: true }); Object.defineProperty(e, k, { value: [{ clientX: x, clientY: 300 }] }); el.dispatchEvent(e); };
      ev("touchstart", "touches", 300);
      ev("touchend", "changedTouches", 150);
    });
    await expect(prof(page).locator("h3")).toContainText(L[1]);
    // „Mein Profil“ blättert nicht
    await page.keyboard.press("Escape");
    await page.click("#lo");
    await page.click("[data-myprof]");
    await expect(prof(page).locator(".pnav")).toHaveCount(0);
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
    await seed(page, () => localStorage.setItem("__mock_pse", JSON.stringify([{ season: "25/26", player: "Silvan Frey", team: "Alte Füchse", goals: 9, assists: 4, trainings: 30, potm: 2, rank_goals: 3, rank_points: 5, rank_trainings: 1 }])));
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

  test("Spielleitung importiert frühere Saisons aus einer Datei", async ({ page }) => {
    await seed(page, () => localStorage.setItem("__mock_pse", JSON.stringify([{ season: "23/24", player: "Silvan Frey", team: "Alt", goals: 1, assists: 1, trainings: 1, potm: 0 }])));
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const msg = [];
    page.on("dialog", (d) => msg.push(d.message()));
    const up = (o) => page.setInputFiles("[data-pimp]", { name: "archiv.json", mimeType: "application/json", buffer: Buffer.from(typeof o == "string" ? o : JSON.stringify(o)) });
    const rows = () => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_pse")));

    await up("kein json");
    await expect.poll(() => msg.at(-1)).toContain("kein gültiges JSON");
    await up([{ season: "22/23", player: "Silvan Frey", goals: -1 }]);
    await expect.poll(() => msg.at(-1)).toContain("Eintrag 1: goals ist ungültig");
    await up([{ season: "22/23", player: "Silvan Frey" }, { season: "22/23", player: "Silvan Frey" }]);
    await expect.poll(() => msg.at(-1)).toContain("doppelt");
    expect(await rows()).toHaveLength(1);

    await up([
      { season: "23/24", player: "Silvan Frey", team: "Blue Dolphins", goals: 12, assists: 3, trainings: 27, rank_goals: 1, rank_points: 2, rank_trainings: 4 },
      { season: "22/23", player: "Silvan Frey", team: "The Patellis", goals: 5, assists: 2, trainings: 20, potm: 0 },
      { season: "22/23", player: "Beat Rentsch", team: "The Patellis", goals: 0, assists: 0, trainings: 9 },
    ]);
    await expect(page.locator("#toast")).toContainText("3 Einträge im Spielerarchiv (22/23, 23/24)");
    expect(msg.some((m) => m.startsWith("3 Einträge für die Saisons 22/23, 23/24"))).toBe(true);
    const R = await rows();
    expect(R).toHaveLength(3);
    expect(R.find((r) => r.season == "23/24")).toMatchObject({ team: "Blue Dolphins", goals: 12, potm: 0, rank_goals: 1 }); // ersetzt
    expect(R.find((r) => r.player == "Beat Rentsch").rank_goals).toBeNull();
    await page.click("main [data-prof='Silvan Frey']");
    await expect(prof(page)).toContainText("22/23");
    await expect(prof(page)).toContainText("Blue Dolphins");
  });

  test("Spieler können nicht archivieren und kein fremdes Profil speichern", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("[data-arch]")).toHaveCount(0);
    await expect(page.locator("[data-pimp]")).toHaveCount(0);
    const r = await page.evaluate(async () => [(await sb.from("player_profiles").upsert({ player: "Beat Rentsch", pos: "g" })).error, (await sb.from("player_seasons").upsert([{ season: "x", player: "Silvan Frey" }])).error]);
    expect(r[0]).not.toBeNull();
    expect(r[1]).not.toBeNull();
  });
});
