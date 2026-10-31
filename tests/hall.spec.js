const fs = require("fs");
const os = require("os");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const CAPTAIN = { email: "captain@flyingpenguins.test", password: "geheim123" };
const PIXEL = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=";
const hallDb = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_hall") || "[]"));
const photos = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_hallph") || "[]"));

async function seed(page, seasons = [], ph = []) {
  await page.goto("/");
  await page.evaluate(({ seasons, ph }) => {
    localStorage.setItem("__mock_hall", JSON.stringify(seasons));
    localStorage.setItem("__mock_hallph", JSON.stringify(ph));
  }, { seasons, ph });
}
const S2526 = { season: "25/26", sommer: "SpVgg Nieder", winter: "Lochball Legenden", attendance: "Beat Rentsch", scorer: "Silvan Frey", goals: "Silvan Frey", note: null };
const hall = async (page, user) => {
  if (user) await login(page, user); else await page.reload();
  await page.click("nav [data-tab=hall]");
};

test.describe("Hall of INTER Fame", () => {
  test("Öffentlich: Gewinner sichtbar, keine Fotos und keine Verwaltung", async ({ page }) => {
    await seed(page, [S2526], [{ id: 1, season: "25/26", caption: "Pokal", data: PIXEL }]);
    await hall(page);
    const c = page.locator(".card", { has: page.locator("h3", { hasText: "Saison 25/26" }) });
    await expect(c).toContainText("Intermeister");
    await expect(c).toContainText("SpVgg Nieder");
    await expect(c).toContainText("Beat Rentsch");
    await expect(c).not.toContainText("Wintermeister");
    await expect(page.locator(".hph")).toHaveCount(0);
    await expect(page.locator("[data-hse]")).toHaveCount(0);
  });

  test("Leer: freundlicher Hinweis", async ({ page }) => {
    await seed(page);
    await hall(page);
    await expect(page.locator("main")).toContainText("Noch keine Saison aufgenommen.");
  });

  test("Mitglieder sehen die Fotos und können sie vergrössern, aber nichts ändern", async ({ page }) => {
    await seed(page, [S2526], [{ id: 1, season: "25/26", caption: "Pokal", data: PIXEL }]);
    await hall(page, SPIELER);
    await expect(page.locator(".hph img")).toHaveCount(1);
    await expect(page.locator(".hph figcaption")).toHaveText("Pokal");
    await expect(page.locator("[data-hse],[data-hsd],[data-hpd],[data-hup]")).toHaveCount(0);
    await page.click(".hpb");
    await expect(page.locator(".hlb img")).toBeVisible();
    await page.click(".hlb");
    await expect(page.locator(".hlb")).toHaveCount(0);
    const r = await page.evaluate(() => sb.from("hall_seasons").upsert({ season: "x" }));
    expect(r.error.message).toContain("row-level security");
  });

  test("Spielleitung nimmt eine Saison mit Vorschlag auf, bearbeitet und löscht sie", async ({ page }) => {
    await seed(page);
    await hall(page, ADMIN);
    await page.click("[data-hse='new']");
    const f = page.locator("form#hsf");
    await expect(f.locator("input[name=season]")).toHaveValue("26/27");
    await expect(f.locator("input[name=attendance]")).not.toHaveValue(""); // Vorschlag aus der Rangliste
    await expect(f.locator("input[name=winter]")).toHaveCount(0);
    await f.locator("input[name=sommer]").fill("SpVgg Nieder");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    await expect(f).toHaveCount(0);
    await expect(page.locator("#toast")).toContainText("Saison gespeichert.");
    const c = page.locator(".card", { has: page.locator("h3", { hasText: "Saison 26/27" }) });
    await expect(c).toContainText("SpVgg Nieder");

    await page.click("[data-hse='26/27']");
    await expect(f.locator("input[name=season]")).toHaveAttribute("readonly", "");
    await f.locator("input[name=sommer]").fill("Lochball Legenden");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    await expect(c).toContainText("Lochball Legenden");
    expect((await hallDb(page)).length).toBe(1);

    await page.click("[data-hse='new']");
    await f.locator("button.add", { hasText: "Speichern" }).click(); // gleiche Saison nochmals
    await expect(f).toBeVisible();
    expect((await hallDb(page)).length).toBe(1);
    await f.locator("[data-hse='']").click();

    await page.locator("[data-hsd='26/27']").dispatchEvent("click"); // Rückfrage wird bestätigt; der Hinweis kann den Knopf kurz überdecken
    await expect(c).toHaveCount(0);
    expect(await hallDb(page)).toEqual([]);
  });

  test("Captains pflegen die Hall wie die Spielleitung", async ({ page }) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hall-")), "sieger.png");
    fs.writeFileSync(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
    await seed(page);
    await hall(page, CAPTAIN);
    await page.click("[data-hse='new']");
    const f = page.locator("form#hsf");
    await f.locator("input[name=season]").fill("24/25");
    await f.locator("input[name=sommer]").fill("SpVgg Nieder");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    await expect(page.locator("#toast")).toContainText("Saison gespeichert.");
    expect((await hallDb(page)).map((x) => x.season)).toEqual(["24/25"]);

    await page.waitForFunction(() => Array.isArray(HP["24/25"]));
    await page.waitForTimeout(100);
    await page.locator("[data-hkd=sommer]").setInputFiles(file);
    await expect(page.locator(".hw img")).toHaveCount(1);
    await page.click(".hw [data-hpd]");
    await expect.poll(() => photos(page)).toEqual([]);
    await page.click("[data-hsd='24/25']");
    await expect.poll(() => hallDb(page)).toEqual([]);
  });

  test("Frühere Saison nachtragen; ungültige Bezeichnung wird abgelehnt", async ({ page }) => {
    await seed(page);
    await hall(page, ADMIN);
    await page.click("[data-hse='new']");
    const f = page.locator("form#hsf");
    await f.locator("input[name=season]").fill("<b>x</b>");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    expect(await hallDb(page)).toEqual([]);
    await f.locator("input[name=season]").fill("24/25");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    await expect(page.locator("h3", { hasText: "Saison 24/25" })).toBeVisible();
  });

  test("Spielleitung lädt ein Foto hoch und löscht es, Saison löschen nimmt Fotos mit", async ({ page }) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hall-")), "sieg.png"); // Pfad ohne Umlaute
    fs.writeFileSync(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
    await seed(page, [S2526]);
    await hall(page, ADMIN);
    // Fotos werden nachgeladen und ersetzen die Karte: erst danach bedienen
    const ruhig = () => page.waitForFunction(() => Array.isArray(HP["25/26"])).then(() => page.waitForTimeout(100));
    await ruhig();
    await page.locator("[data-hcap='25/26']").fill("Siegerfoto");
    await page.locator("[data-hup='25/26']:not([data-hkd])").setInputFiles(file);
    await expect(page.locator(".hph img")).toHaveCount(1);
    await expect(page.locator(".hph figcaption")).toHaveText("Siegerfoto");
    const p = await photos(page);
    expect(p[0].season).toBe("25/26");
    expect(p[0].data).toMatch(/^data:image\/jpeg;base64,/);
    await page.click("[data-hpd]");
    await expect(page.locator(".hph img")).toHaveCount(0);
    expect(await photos(page)).toEqual([]);

    await ruhig();
    await page.locator("[data-hup='25/26']:not([data-hkd])").setInputFiles(file);
    await expect(page.locator(".hph img")).toHaveCount(1);
    await page.click("[data-hsd='25/26']");
    await expect.poll(() => photos(page)).toEqual([]);
  });

  test("Spielleitung lädt je ein Bild für Sommermeister, Anwesenheit und Topskorer hoch", async ({ page }) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "hall-")), "sieger.png");
    fs.writeFileSync(file, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", "base64"));
    await seed(page, [S2526]);
    await hall(page, ADMIN);
    await page.waitForFunction(() => Array.isArray(HP["25/26"]));
    await page.waitForTimeout(100);
    await expect(page.locator(".hw figure")).toHaveCount(3);
    await expect(page.locator(".hw figcaption")).toHaveText([/Intermeister/, /Anwesenheit/, /Topskorer/]);
    await expect(page.locator(".hw .hwa")).toHaveCount(3);
    await page.locator("[data-hcap='25/26']").fill("Nicht für Kacheln");

    await page.locator("[data-hkd=attendance]").setInputFiles(file);
    await expect(page.locator(".hw img")).toHaveCount(1);
    await expect(page.locator(".hw .hwa")).toHaveCount(2);
    await page.locator("[data-hkd=scorer]").setInputFiles(file);
    await expect(page.locator(".hw img")).toHaveCount(2);
    await page.locator("[data-hkd=sommer]").setInputFiles(file);
    await expect(page.locator(".hw img")).toHaveCount(3);
    await expect(page.locator(".hw [data-hup]")).toHaveCount(0); // pro Titel nur ein Bild
    await expect(page.locator(".hph img")).toHaveCount(0); // nicht in der Fotogalerie
    const p = await photos(page);
    expect(p.map((x) => x.kind).sort()).toEqual(["attendance", "scorer", "sommer"]);
    expect(p.every((x) => x.season == "25/26" && x.caption == null && x.data.startsWith("data:image/jpeg;base64,"))).toBe(true);

    await page.locator(".hw figure", { hasText: "Anwesenheit" }).locator("[data-hpd]").click();
    await expect(page.locator(".hw img")).toHaveCount(2);
    await expect(page.locator(".hw figure", { hasText: "Anwesenheit" }).locator(".hwa")).toBeVisible();
    expect((await photos(page)).map((x) => x.kind).sort()).toEqual(["scorer", "sommer"]);
  });

  test("Bilder der Titel: Mitglieder sehen und vergrössern, öffentlich niemand", async ({ page }) => {
    const ph = [{ id: 1, season: "25/26", kind: "attendance", caption: null, data: PIXEL }];
    await seed(page, [S2526], ph);
    await hall(page);
    await expect(page.locator(".hw")).toHaveCount(0);

    await hall(page, SPIELER);
    await expect(page.locator(".hw figure")).toHaveCount(1);
    await expect(page.locator(".hw figcaption")).toContainText("Anwesenheit");
    await expect(page.locator(".hw [data-hup],.hw [data-hpd]")).toHaveCount(0);
    await page.click(".hw .hpb");
    await expect(page.locator(".hlb img")).toBeVisible();
    const r = await page.evaluate(() => sb.from("hall_photos").insert({ season: "25/26", kind: "scorer", data: "x" }));
    expect(r.error.message).toContain("row-level security");
  });

  test("Bild-Kacheln passen aufs Handy", async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await seed(page, [S2526]);
    await hall(page, ADMIN);
    await expect(page.locator(".hw figure")).toHaveCount(3);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    const y = await page.locator(".hw figure").evaluateAll((L) => L.map((x) => x.getBoundingClientRect().y));
    expect(new Set(y).size).toBe(1); // alle drei auf einer Zeile
  });

  test("Sechs Tabs passen aufs Handy", async ({ page, isMobile }) => {
    test.skip(!isMobile);
    await seed(page);
    await login(page, SPIELER);
    await expect(page.locator("nav button")).toHaveCount(6);
    const b = await page.locator("nav button").evaluateAll((L) => L.map((x) => x.getBoundingClientRect().right));
    const w = await page.evaluate(() => innerWidth);
    expect(Math.max(...b)).toBeLessThanOrEqual(w);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});

test("Abgemeldet ist nur grau, nicht durchgestrichen", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(() => { const b = document.createElement("button"); b.className = "pb off"; document.body.append(b); const c = getComputedStyle(b); return [c.textDecorationLine, c.backgroundColor] });
  expect(r).toEqual(["none", "rgb(75, 85, 99)"]);
});

test("Mailvorlagen: alle deutsch, mit Link oder Code", () => {
  const v = JSON.parse(fs.readFileSync("supabase/mail-vorlagen.json", "utf8"));
  const keys = Object.keys(v);
  for (const k of ["recovery", "confirmation", "invite", "magic_link", "email_change", "reauthentication"]) {
    expect(keys).toContain(`mailer_subjects_${k}`);
    expect(v[`mailer_templates_${k}_content`]).toMatch(k == "reauthentication" ? /\{\{ \.Token \}\}/ : /\{\{ \.ConfirmationURL \}\}/);
  }
  expect(Object.values(v).join(" ")).not.toMatch(/\b(your|please|confirm your|reset password|follow this link)\b/i);
  expect(fs.readFileSync(".github/workflows/release.yml", "utf8")).toContain("--data @supabase/mail-vorlagen.json");
});

test.describe("Hall: Teams, Intermeister", () => {
  const png = { name: "logo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==", "base64") };
  const admin = { email: "admin@flyingpenguins.test", password: "admin123" };

  test("Teamnamen und Logos erfassen; Vorschlag aus dem aktuellen Stand; andere Eingaben bleiben", async ({ page }) => {
    await login(page, admin);
    await page.click("nav [data-tab=hall]");
    await page.click("[data-hse=new]");
    const f = page.locator("#hsf");
    await expect(f.locator("label", { hasText: "Intermeister" })).toBeVisible();
    await expect(f).not.toContainText("Sommermeister");
    await expect(f).not.toContainText("Meiste Tore");
    await expect(f.locator("input[name=team_a]")).toHaveValue("Lochball Legenden");
    await f.locator("input[name=sommer]").fill("SpVgg Nieder");
    await f.locator("input[name=team_b]").fill("Alte Füchse");
    await f.locator("[data-hlg=b]").setInputFiles(png);
    await expect(f.locator("#hlgb")).toBeVisible();
    await expect(f.locator("input[name=team_b]")).toHaveValue("Alte Füchse");
    await f.locator("button.add", { hasText: "Speichern" }).click();
    const t = page.locator(".hte").first();
    await expect(t).toContainText("Lochball Legenden");
    await expect(t).toContainText("Alte Füchse");
    await expect(t.locator("img")).toHaveCount(1);
    const c = page.locator(".card", { hasText: "Alte Füchse" }).first();
    await expect(c).toContainText("Intermeister");
    await expect(c).not.toContainText("Sommermeister");

    await c.locator("[data-hse]").first().click();
    await page.locator("[data-hlx=b]").click();
    await expect(page.locator("#hlgb")).toBeHidden();
    await page.locator("#hsf button.add", { hasText: "Speichern" }).click();
    await expect(page.locator(".hte img")).toHaveCount(0);
  });

  test("Meiste Tore wird nicht mehr angezeigt, auch bei alten Einträgen", async ({ page }) => {
    await page.goto("/");
    await page.evaluate((s) => localStorage.setItem("__mock_hall", JSON.stringify([s])), { season: "25/26", sommer: "SpVgg Nieder", goals: "Silvan Frey", team_a: "A-Team", team_b: "B-Team" });
    await page.reload();
    await page.click("nav [data-tab=hall]");
    const c = page.locator(".card", { hasText: "Saison 25/26" });
    await expect(c).toContainText("A-Team");
    await expect(c).toContainText("Intermeister");
    await expect(c).not.toContainText("Meiste Tore");
    await expect(c).not.toContainText("Silvan Frey");
  });
});
