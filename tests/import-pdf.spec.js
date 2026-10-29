// Prüft die einmalige Übernahme aus dem PDF "Herren Inter 26-27": die App zeigt dieselben Zahlen wie das PDF.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const sql = fs.readFileSync(path.join(__dirname, "..", "supabase", "migrations", "20261029_10_daten_aus_pdf.sql"), "utf8");
const data = JSON.parse(sql.match(/\$json\$([\s\S]*?)\$json\$/)[1]);
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: new RegExp("^" + t + "$") }) });

// Leaderboards aus dem PDF (Seite 1)
const ANWESENHEIT = { "Pascal Hilpertshauser": 12, "Julien Stadler": 11, "Andreas Scherrer": 11, "Stefan Keller": 10, "Silvan Frehner": 10, "Pascal Fröhlich": 10,
  "Tobias Keller": 9, "Raphael Germann": 9, "Othmar Oeler": 9, "Michael Süess": 9, "Manuel Ammann": 8, "Cornel Eberle": 8, "Beat Rentsch": 8,
  "Thomas Allemann": 6, "Silvan Frey": 6, "Michael Vetter": 4 };
const SKORER = { "Silvan Frey": 5, "Raphael Germann": 5, "Pascal Hilpertshauser": 5, "Andreas Scherrer": 5, "Pascal Fröhlich": 4, "Silvan Frehner": 2,
  "Manuel Ammann": 2, "Stefan Keller": 1, "Othmar Oeler": 1, "Julien Stadler": 1, "Cornel Eberle": 1, "Beat Rentsch": 1 };
const TORE = { "Raphael Germann": 4, "Pascal Hilpertshauser": 4, "Silvan Frey": 2, "Silvan Frehner": 2, "Manuel Ammann": 2, "Andreas Scherrer": 2,
  "Pascal Fröhlich": 1, "Othmar Oeler": 1, "Beat Rentsch": 1 };

test.describe("Übernahme aus dem PDF", () => {
  test.beforeEach(async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-29T20:00:00")); // nach dem Training vom 28.10.
    await page.route("**/config.js", (r) => r.fulfill({ path: path.join(__dirname, "mock-supabase.js"), contentType: "application/javascript" }));
    await page.route("**/vendor/supabase.js", (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
    await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
    await page.goto("/");
    await page.evaluate((d) => localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d })), data);
    await page.reload();
  });

  test("Resultate und Meisterschaftsstand wie im PDF", async ({ page }) => {
    const sp = card(page, "Spieltage");
    await expect(sp.locator(".row", { hasText: "September" })).toContainText("3 : 11");
    await expect(sp.locator(".row", { hasText: "September" })).toContainText("SpVgg Nieder");
    await expect(sp.locator(".row", { hasText: "Oktober" })).toContainText("9 : 5");
    await expect(sp.locator(".row", { hasText: "Oktober" })).toContainText("Lochball Legenden");
    await expect(card(page, "Meisterschaft").locator(".score b")).toHaveText(["1", "1"]);
  });

  for (const [title, want] of [["Anwesenheit Saison", ANWESENHEIT], ["Skorerpunkte", SKORER], ["Tore", TORE]]) {
    test(`${title} wie im PDF`, async ({ page }) => {
      const c = card(page, title);
      await c.locator("[data-more]").click();
      const rows = await c.locator(".row").evaluateAll((rs) => rs.map((r) => [r.querySelector(".nm").textContent.trim(), +r.querySelector("b").textContent]));
      const got = Object.fromEntries(rows.filter(([, v]) => v > 0));
      expect(got).toEqual(want);
    });
  }

  test("keine Abmeldungen, Leitungen, Restaurants; Pre-Games und Schiedsrichter übernommen", async () => {
    const tr = data.m.flatMap((m) => m.tr);
    expect(tr.some((x) => (x.ab || []).length || x.lead || x.r)).toBe(false);
    expect(data.m.map((m) => m.pre)).toEqual([[1, 3], [3, 1], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0], [0, 0]]);
    expect(data.m.map((m) => m.ref)).toEqual(["Tobias Keller", "", "", "", "", "Robin Thaddey", "Michael Süess", "Silvan Germann"]);
    expect(data.t.map((t) => t.c)).toEqual(["Andreas Scherrer", "Manuel Ammann"]);
  });
});
