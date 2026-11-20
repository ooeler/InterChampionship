// Visuelle Regressionstests: fotografiert die wichtigsten Ansichten (hell und dunkel) und vergleicht sie mit Referenzbildern.
// Läuft nur mit playwright.visuell.config.js (in den normalen Läufen ausgeschlossen). Referenzbilder liegen nicht im Repo:
// der Job "visuell" in .github/workflows/ci.yml erzeugt sie bei jedem Pull Request aus dem Basis-Stand
// (VISUELL_MODUS=referenz, --update-snapshots=all) und vergleicht dann den PR-Stand damit (VISUELL_MODUS=vergleich).
// Beide Durchläufe verwenden diese Datei und den Mock aus dem PR; nur app/ wechselt.
// Lokal: npx playwright test -c playwright.visuell.config.js --update-snapshots=all, danach ohne --update-snapshots vergleichen.
const fs = require("fs");
const path = require("path");
const { test, expect, login, openLogin } = require("./fixtures");
// Gleicher Ort wie snapshotPathTemplate in playwright.visuell.config.js
const REFERENZ = path.resolve(__dirname, "..", process.env.VISUELL_REFERENZ || "visuell-referenz");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const LEITUNG = { email: "admin@flyingpenguins.test", password: "admin123" };
const ANSICHTEN = [["spiel", "spieltag"], ["train", "training"], ["rang", "rangliste"], ["team", "teams"], ["info", "infos"], ["hall", "hall"]];
// Feste Inhalte für die Hall of INTER Fame (sonst nur der Hinweis "noch leer")
const HALL = [{ season: "25/26", sommer: "SpVgg Nieder", winter: "Lochball Legenden", attendance: "Beat Rentsch", scorer: "Silvan Frey", goals: "Silvan Frey", note: null }];

// Bild aufnehmen und vergleichen. Im Vergleich ohne Referenz (Ansicht neu im PR oder im Basis-Stand nicht erreichbar)
// wird nur vermerkt, nicht verglichen – so scheitert ein neuer Test nicht am alten Stand.
async function foto(page, name) {
  const info = test.info();
  if (process.env.VISUELL_MODUS == "vergleich" && !fs.existsSync(path.join(REFERENZ, info.project.name, name + ".png"))) {
    info.annotations.push({ type: "ohne Referenz", description: name });
    return;
  }
  // Fokus und Hover aus dem letzten Klick sollen das Bild nicht verändern
  await page.mouse.move(0, 0);
  await page.evaluate(() => document.activeElement && document.activeElement.blur && document.activeElement.blur());
  // Ganze Seite: Fenster auf die Seitenhöhe vergrössern statt fullPage – sonst liegt die fixierte Navigation
  // mitten im Bild und verdeckt Inhalt. Danach zurück auf die Gerätegrösse.
  const v = page.viewportSize();
  const h = await page.evaluate(() => Math.ceil(document.documentElement.scrollHeight));
  await page.setViewportSize({ width: v.width, height: Math.max(v.height, Math.min(h, 8000)) });
  await expect.soft(page).toHaveScreenshot(name + ".png"); // weiter mit den nächsten Ansichten, alle Diffs in einem Lauf
  await page.setViewportSize(v);
}

async function bereit(page) {
  await expect(page.locator("#splash")).toHaveCount(0, { timeout: 10_000 }); // fliegendes Logo beim Start
  await page.evaluate(() => document.fonts.ready);
}

async function ansicht(page, tab) {
  await page.click(`nav [data-tab=${tab}]`);
  await expect(page.locator(`nav [data-tab=${tab}]`)).toHaveClass(/\bon\b/);
  await page.evaluate(() => scrollTo(0, 0));
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript((h) => localStorage.setItem("__mock_hall", JSON.stringify(h)), HALL);
});

for (const schema of ["light", "dark"]) {
  const s = schema == "light" ? "hell" : "dunkel";
  test.describe(s, { tag: "@visuell" }, () => {
    test.use({ colorScheme: schema, reducedMotion: "reduce" });

    test("öffentlich und Login", async ({ page }) => {
      await page.goto("/");
      await bereit(page);
      for (const [tab, name] of ANSICHTEN.filter(([t]) => ["rang", "info", "hall"].includes(t))) {
        await ansicht(page, tab);
        await foto(page, `${s}-oeffentlich-${name}`);
      }
      await openLogin(page);
      await bereit(page);
      await foto(page, `${s}-login`);
    });

    for (const [rolle, user] of [["spieler", SPIELER], ["leitung", LEITUNG]]) {
      test(`eingeloggt: ${rolle}`, async ({ page }) => {
        await login(page, user);
        await bereit(page);
        for (const [tab, name] of ANSICHTEN) {
          await ansicht(page, tab);
          if (tab == "team" && rolle == "leitung") {
            await page.click("h3[data-acc=us]"); // Benutzer & Rollen aufklappen
            await expect(page.locator(".card", { has: page.locator("h3[data-acc=us]") })).not.toHaveClass(/\bcl\b/);
          }
          await foto(page, `${s}-${rolle}-${name}`);
        }
      });
    }
  });
}
