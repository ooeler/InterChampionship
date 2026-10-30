const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const katalog = (page) => page.locator(".card", { has: page.locator("h3", { hasText: /^Strafenkatalog$/ }) });
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
const cat = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_cat") || "[]"));
const pens = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_pen") || "[]"));

async function seed(page, list = []) {
  await page.goto("/");
  await page.evaluate((list) => localStorage.setItem("__mock_cat", JSON.stringify(list.map((c, i) => ({ id: i + 1, ...c })))), list);
}

async function addEntry(page, reason, amount) {
  const f = katalog(page).locator("form#catf");
  await f.locator("input[name=g]").fill(reason);
  await f.locator("input[name=b]").fill(String(amount));
  await f.locator("button.add").click();
}

test.describe("Strafenkatalog", () => {
  test("Spielleitung erstellt, ändert und löscht Einträge im Teams-Tab", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await expect(katalog(page)).toContainText("Noch keine Einträge.");
    await addEntry(page, "zu spät", 5);
    await addEntry(page, "Handy im Training", 10);
    await expect(katalog(page).locator(".catr")).toHaveCount(2);
    await expect(katalog(page).locator(".catr").first()).toContainText("Handy im Training"); // alphabetisch
    // bearbeiten: Grund und Betrag
    await katalog(page).locator(".catr", { hasText: "zu spät" }).locator("[data-catedit]").click();
    const ef = katalog(page).locator("form#cate");
    await expect(ef.locator("input[name=g]")).toBeFocused();
    await ef.locator("input[name=g]").fill("zu spät gekommen");
    await ef.locator("input[name=b]").fill("7.5");
    await ef.locator("button.add", { hasText: "Speichern" }).click();
    await expect(ef).toHaveCount(0);
    await expect(katalog(page).locator(".catr", { hasText: "zu spät gekommen" })).toContainText("CHF 7.5");
    expect((await cat(page)).find((c) => c.id == 1)).toMatchObject({ reason: "zu spät gekommen", amount: 7.5, item: null });
    // in Sachstrafe umwandeln, dann abbrechen ändert nichts
    await katalog(page).locator(".catr", { hasText: "Handy" }).locator("[data-catedit]").click();
    await ef.locator("input[name=i]").fill("Kiste Bier");
    await ef.locator("button.add", { hasText: "Speichern" }).click();
    await expect(katalog(page).locator(".catr", { hasText: "Handy" })).toContainText("Kiste Bier");
    expect((await cat(page)).find((c) => c.id == 2)).toMatchObject({ amount: 0, item: "Kiste Bier" });
    await katalog(page).locator(".catr", { hasText: "Handy" }).locator("[data-catedit]").click();
    await ef.locator("input[name=g]").fill("anders");
    await ef.locator("[data-catedit='']").click();
    await expect(katalog(page).locator(".catr", { hasText: "Handy" })).toBeVisible();
    expect((await cat(page)).map((c) => c.reason).sort()).toEqual(["Handy im Training", "zu spät gekommen"]);
    // doppelt geht nicht
    await addEntry(page, "zu spät gekommen", 1);
    expect((await cat(page)).length).toBe(2);
    // löschen
    await katalog(page).locator(".catr", { hasText: "Handy" }).locator("[data-catdel]").click();
    await expect(katalog(page).locator(".catr")).toHaveCount(1);
    expect((await cat(page)).map((c) => c.reason)).toEqual(["zu spät gekommen"]);
  });

  test("Strafenchef sieht im Teams-Tab Katalog und Statistiken und darf den Katalog pflegen", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_strafen", "1"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main .card > h3")).toHaveText(["Strafenkatalog", "Trainingsleitung", "Restaurant-Besuche"]);
    await addEntry(page, "Material vergessen", 3);
    await expect.poll(async () => (await cat(page)).map((c) => c.reason)).toEqual(["Material vergessen"]);
  });

  test("Captains wählen aus dem Katalog, pflegen ihn aber nicht", async ({ page }) => {
    await seed(page, [{ reason: "zu spät", amount: 5 }, { reason: "Handy im Training", amount: 10 }]);
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(katalog(page)).toHaveCount(0);
    // Server: Captain darf den Katalog nicht ändern
    const r = await page.evaluate(() => sb.from("penalty_catalog").insert({ reason: "x", amount: 1 }));
    expect(r.error.message).toContain("row-level security");

    await page.click("nav [data-tab=train]");
    const f = overview(page).locator("form#pen");
    await f.locator("select[name=p]").selectOption("Silvan Frey");
    await f.locator("select[name=k]").selectOption({ label: "Handy im Training · CHF 10.00" });
    await expect(f.locator("input[name=g]")).toHaveValue("Handy im Training");
    await expect(f.locator("input[name=b]")).toHaveValue("10");
    await f.locator("button.add").click();
    await expect.poll(async () => (await pens(page)).map((p) => [p.player, p.reason, p.amount])).toEqual([["Silvan Frey", "Handy im Training", 10]]);
  });

  test("Spieler ohne Zusatzrolle: kein Katalog im Teams-Tab, nicht änderbar", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(katalog(page)).toHaveCount(0);
    const r = await page.evaluate(() => sb.from("penalty_catalog").insert({ reason: "x", amount: 1 }));
    expect(r.error.message).toContain("row-level security");
  });
});

test.describe("Sachstrafen (z. B. Kiste Bier)", () => {
  test("im Katalog erfassen und beim Eintragen auswählen; zählt nicht ins CHF-Total", async ({ page }) => {
    await seed(page, [{ reason: "zu spät", amount: 5 }]);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const f = katalog(page).locator("form#catf");
    await f.locator("input[name=g]").fill("Shutout vom Goali (Hauptmatch)");
    await f.locator("input[name=i]").fill("Kiste Bier");
    await f.locator("button.add").click();
    await expect(katalog(page).locator(".catr", { hasText: "Shutout" })).toContainText("Kiste Bier");
    expect((await cat(page)).find((c) => c.item)).toMatchObject({ reason: "Shutout vom Goali (Hauptmatch)", amount: 0, item: "Kiste Bier" });

    await page.click("nav [data-tab=train]");
    const p = overview(page).locator("form#pen");
    await p.locator("select[name=p]").selectOption("Tobias Keller");
    await p.locator("select[name=k]").selectOption({ label: "Shutout vom Goali (Hauptmatch) · Kiste Bier" });
    await expect(p.locator(".pitem")).toHaveText("Kiste Bier");
    await p.locator("button.add").click();
    await expect.poll(async () => (await pens(page)).map((x) => [x.player, x.reason, x.amount, x.item])).toEqual([["Tobias Keller", "Shutout vom Goali (Hauptmatch)", 0, "Kiste Bier"]]);
    await expect(overview(page).locator(".pnr")).toContainText("Kiste Bier");
    const board = page.locator(".card", { has: page.locator("h3", { hasText: /^Strafen$/ }) });
    await expect(board).toContainText("Total CHF 0.00 · offen CHF 0.00 + 1× Kiste Bier");
    await expect(board.locator(".row", { hasText: "Tobias Keller" })).toContainText("1× Kiste Bier");
  });

  test("Katalog der Herren Inter wird per Migration übernommen", () => {
    const sql = require("fs").readFileSync(require("path").join(__dirname, "..", "supabase", "migrations", "20261029_14_sachstrafen_katalog.sql"), "utf8");
    const rows = [...sql.matchAll(/\('([^']+)', (\d+), (null|'([^']+)')\)/g)].map((m) => [m[1], +m[2], m[4] || null]);
    expect(rows).toEqual([
      ["Training nicht vorbereitet", 20, null],
      ["Shutout vom Goali (Hauptmatch)", 0, "Kiste Bier"],
      ["10tes Goal (Total)", 0, "Kiste Bier"],
      ["2min Strafe", 2, null],
      ["Nicht abgemeldet", 20, null],
      ["Nach 18:40 Uhr in Halle", 5, null],
    ]);
  });
});
