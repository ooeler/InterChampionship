const fs = require("fs");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const SICHT = /Abmeldung|Knie|Jemand Anderes|Max Gast|Pfeifer/;

async function seed(page) {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    d.m[2].res = [4, 3];
    d.m[2].ref = "Pfeifer";
    const x = d.m[2].tr[0];
    x.p = [d.t[0].p[0], d.t[1].p[0]];
    Object.assign(x, { r: "Moosburg", lead: "Jemand Anderes", ab: [d.t[0].p[1]], st: { [d.t[0].p[2]]: "u" }, gs: [{ n: "Max Gast", gk: false }] });
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    localStorage.setItem("__mock_abs", JSON.stringify([{ d: x.d, player: d.t[0].p[1], reason: "Knie zwickt" }, { d: x.d, player: "Silvan Frey", reason: "Eigener Grund" }]));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
}

test.describe("Datenschutz", () => {
  test("Besucher bekommen nur die Daten der Rangliste", async ({ page }) => {
    await seed(page);
    await page.reload();
    await expect(page.locator("main")).toContainText("Anwesenheit Saison");
    const r = await page.evaluate(async () => ({
      direkt: (await sb.from("league_state").select("data").eq("id", "main").maybeSingle()).data,
      oeffentlich: (await sb.rpc("public_league")).data,
      res: S.m[2].res,
    }));
    expect(r.direkt).toBeNull();
    expect(r.res).toEqual([4, 3]);
    expect(JSON.stringify(r.oeffentlich)).not.toMatch(SICHT);
    expect(JSON.stringify(r.oeffentlich)).not.toMatch(/Moosburg/);
    expect(Object.keys(r.oeffentlich.m[2].tr[0]).sort()).toEqual(["d", "n"]); // nur Anzahl, keine Namen
    expect(r.oeffentlich.m[2].tr[0].n).toBe(2);
    const P = await page.evaluate(() => S.t[0].p[0]);
    expect(r.oeffentlich.m[2].anw[P]).toBe(2); // die Anwesenheitsrangliste bleibt öffentlich (als Summe)
    await expect(page.locator(".card", { hasText: "Anwesenheit Saison" })).toContainText(P);
  });

  test("Mitglieder laden weiter den ganzen Stand, Gründe anderer Spieler bleiben verborgen", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    const r = await page.evaluate(async () => ({ lead: S.m[2].tr[0].lead, abs: (await sb.from("absence_reasons").select("d,player,reason").order("d")).data.map((a) => a.reason) }));
    expect(r.lead).toBe("Jemand Anderes");
    expect(r.abs).toEqual(["Eigener Grund"]);
    await expect(page.locator("main")).not.toContainText("Knie zwickt");
  });

  test("Der Grund nennt Empfänger und Löschfrist", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await page.locator("[data-abw]").first().click();
    await page.locator("[data-stt$='|u']").first().click();
    await expect(page.locator("#abf")).toContainText("Er wird 30 Tage nach dem Training gelöscht");
  });

  test("Grund, den der Captain für jemand anderen einträgt: sehen nur diese Person, Captains und Spielleitung", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_player", "Andreas Scherrer"));
    await login(page); // Captain
    await page.click("nav [data-tab=train]");
    const ov = page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
    await ov.locator("[data-tp='Beat Rentsch']").click();
    await ov.locator("form#abf input[name=g]").fill("Geheimer Arzttermin");
    await ov.locator("form#abf button.del").click();
    await expect(ov.locator(".abr")).toContainText("Beat Rentsch: Geheimer Arzttermin");
    const sicht = () => page.evaluate(async () => (await sb.from("absence_reasons").select("d,player,reason").order("d")).data.map((a) => a.reason));
    // nicht in den Saison-Daten und nicht öffentlich
    expect(await page.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem("__mock_db")).data))).not.toContain("Geheimer Arzttermin");
    expect(JSON.stringify(await page.evaluate(async () => (await sb.rpc("public_league")).data))).not.toContain("Geheimer Arzttermin");
    // ein anderer Spieler sieht ihn nicht
    const abmelden = async () => { await page.click("#lo"); await page.click("[data-lo]"); await expect(page.locator("#li")).toBeVisible(); };
    await abmelden();
    await page.evaluate(() => localStorage.setItem("__mock_player", "Silvan Frey"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    expect(await sicht()).not.toContain("Geheimer Arzttermin");
    await expect(page.locator("main")).not.toContainText("Geheimer Arzttermin");
    // die abgemeldete Person selbst sieht ihn
    await abmelden();
    await page.evaluate(() => localStorage.setItem("__mock_player", "Beat Rentsch"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    expect(await sicht()).toContain("Geheimer Arzttermin");
  });

  test("Migration: öffentliche Lesepolitik weg, Löschauftrag eingeplant", { tag: "@logik" }, async () => {
    const sql = fs.readFileSync(path.join(__dirname, "../supabase/migrations/20261031_24_datenschutz.sql"), "utf8");
    expect(sql).toContain(`drop policy if exists "Saison öffentlich lesen"`);
    expect(sql).toMatch(/cron\.schedule\('absence-reasons-purge'/);
    expect(sql).toContain("- 30");
  });
});
