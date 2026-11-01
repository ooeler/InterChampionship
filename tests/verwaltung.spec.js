const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const card = (page, k) => page.locator(".card", { has: page.locator(`h3[data-acc=${k}]`) });
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]"));

async function teams(page) {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
}

test.describe("Verwaltung durch die Spielleitung", () => {
  test("Ansicht zwischen Spielleitung und Spieler umschalten – bleibt nach Neuladen", async ({ page }) => {
    await teams(page);
    const bar = page.locator(".vw");
    await expect(bar.locator("[data-view=admin]")).toHaveClass(/on/);
    await bar.locator("[data-view=player]").click();
    await expect(page.locator(".vw.pv")).toContainText("Du siehst die App als Spieler");
    await expect(page.locator("h3", { hasText: /^Team 1/ })).toHaveCount(0); // Spieler sehen im Teams-Tab nur Statistiken
    await expect(page.locator("h3[data-acc=us]")).toHaveCount(0);
    await page.click("nav [data-tab=train]");
    await expect(page.locator(".card", { hasText: "Übersicht pro Training" })).not.toContainText("Als Spielleitung kannst du");
    await page.reload();
    await expect(page.locator(".vw.pv")).toBeVisible();
    await page.click("nav [data-tab=team]");
    await expect(page.locator("h3[data-acc=us]")).toHaveCount(0);
    await page.locator("[data-view=admin]").click();
    await expect(page.locator(".vw.pv")).toHaveCount(0);
    await expect(page.locator("h3[data-acc=us]")).toBeVisible();
  });

  test("Spieler und Captains sehen keinen Ansicht-Umschalter", async ({ page }) => {
    await login(page);
    await expect(page.locator("nav [data-tab=team]")).toBeVisible();
    await expect(page.locator(".vw")).toHaveCount(0);
  });

  test("Benutzer & Rollen ist zugeklappt; einzelne Benutzer lassen sich löschen, sich selbst nicht", async ({ page }) => {
    await teams(page);
    const u = card(page, "us");
    await expect(u).toHaveClass(/\bcl\b/);
    await expect(u.locator("h3")).toContainText("· 3");
    await page.click("h3[data-acc=us]");
    await expect(u).not.toHaveClass(/\bcl\b/);
    await expect(u.locator("[data-mdel='u-admin@flyingpenguins.test']")).toHaveCount(0);
    await u.locator("[data-mdel='u-spieler@flyingpenguins.test']").click(); // Rückfrage wird bestätigt
    await expect(u).not.toContainText("spieler@flyingpenguins.test");
    await expect(u.locator("h3")).toContainText("· 2");
    expect((await log(page)).find((l) => l.fn == "delete_member").args).toEqual({ uid: "u-spieler@flyingpenguins.test" });
  });

  test("Trainingsleitung pro Training im Teams-Tab ändern", async ({ page }) => {
    await teams(page);
    const tl = card(page, "tl");
    await expect(tl).toHaveClass(/\bcl\b/);
    await page.click("h3[data-acc=tl]");
    const sel = tl.locator("select[data-lead]").first();
    const key = await sel.getAttribute("data-lead");
    await sel.selectOption("Beat Rentsch");
    const lead = () => page.evaluate((k) => { const [m, t] = k.split(",").map(Number); return S.m[m].tr[t].lead || null }, key);
    await expect.poll(lead).toBe("Beat Rentsch");
    await tl.locator(`select[data-lead='${key}']`).selectOption("");
    await expect.poll(lead).toBeNull();
    // Match Day hat keine Leitung
    const md = await page.evaluate(() => S.m.map((m, i) => i + "," + (m.tr.length - 1)));
    for (const k of md) await expect(tl.locator(`select[data-lead='${k}']`)).toHaveCount(0);
  });

  test("Akkordeon gleitet beim Öffnen und Schliessen", async ({ page }) => {
    await teams(page);
    const bk = card(page, "bk");
    const h0 = (await bk.boundingBox()).height;
    // Klick und Prüfung im selben Takt, damit die Animation auch unter Last noch läuft
    const toggle = () => page.evaluate(() => { document.querySelector("h3[data-acc=bk]").click(); return document.querySelector("h3[data-acc=bk]").closest(".card").getAnimations().length });
    const anim = () => page.evaluate(() => document.querySelector("h3[data-acc=bk]").closest(".card").getAnimations().length);
    expect(await toggle()).toBeGreaterThan(0);
    await expect.poll(anim).toBe(0);
    expect((await bk.boundingBox()).height).toBeGreaterThan(h0 + 40);
    expect(await toggle()).toBeGreaterThan(0);
    await expect.poll(async () => (await bk.boundingBox()).height).toBeLessThan(h0 + 2);
  });
});

test("Alle Löschen-Knöpfe sehen gleich aus (roter Knopf)", async ({ page }, info) => {
  await teams(page);
  await page.click("h3[data-acc=us]");
  const sel = "[data-rm],[data-catdel],[data-invdel],[data-mdel],[data-tgdel],[data-rmimg]";
  const st = await page.locator(sel).evaluateAll((L) => L.map((b) => { const c = getComputedStyle(b); return [b.tagName, c.color, c.borderTopColor, c.borderTopStyle].join("|") }));
  expect(st.length).toBeGreaterThan(5);
  expect(new Set(st).size).toBe(1);
  await page.locator(".card", { hasText: "Team 1" }).first().screenshot({ path: info.outputPath("loeschen.png") });
});

test("👑 bei allen, die die Anwesenheit anführen – in Rangliste und Listen", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    d.m[0].base = { "Andreas Scherrer": 5, "Julien Stadler": 5, "Michael Vetter": 3 };
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  });
  await login(page);
  await page.click("nav [data-tab=rang]");
  const anw = page.locator(".card", { has: page.locator("h3", { hasText: "Anwesenheit Saison" }) });
  await expect(anw.locator(".row", { hasText: "Andreas Scherrer" }).locator(".crw")).toHaveCount(1);
  await expect(anw.locator(".row", { hasText: "Julien Stadler" }).locator(".crw")).toHaveCount(1); // Gleichstand
  await expect(anw.locator(".crw")).toHaveCount(2);
  // auch in anderen Listen, z. B. Übersicht pro Training
  await page.click("nav [data-tab=train]");
  const ov = page.locator(".card", { hasText: "Übersicht pro Training" });
  await expect(ov.locator("[data-tp='Andreas Scherrer'] .crw")).toHaveCount(1);
  await expect(ov.locator("[data-tp='Michael Vetter'] .crw")).toHaveCount(0);
});

test("Spieleransicht berücksichtigt die Zusatzrollen Strafenchef und Restaurant-Chef", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => { localStorage.setItem("__mock_strafen", "1"); localStorage.setItem("__mock_resto", "1"); localStorage.setItem("ic_view", "player"); });
  await login(page, ADMIN);
  await expect(page.locator(".vw.pv")).toBeVisible();
  await page.click("nav [data-tab=team]"); // Strafenchef: Teams-Tab mit Strafenkatalog, aber keine Verwaltung
  await expect(page.locator(".card", { has: page.locator("h3", { hasText: /^Strafenkatalog$/ }) })).toBeVisible();
  await expect(page.locator("h3[data-acc=us]")).toHaveCount(0);
  await page.click("nav [data-tab=train]"); // Restaurant-Chef: Restaurant eintragen
  await expect(page.locator(".card", { hasText: "Übersicht pro Training" }).locator("input[data-resto]")).toBeVisible();
});

test.describe("Spieler ohne Konto", () => {
  test("Spielleitung sieht, wer noch kein Konto hat, und kann direkt einladen", async ({ page }) => {
    await teams(page);
    const c = card(page, "na");
    await expect(c).toContainText("Silvan Frey");
    await page.evaluate(() => { MEM[0].player = "Silvan Frey"; render() }); // Konto zugeordnet
    await expect(c).not.toContainText("Silvan Frey");
    await expect(c).toContainText("Konten sind noch keinem Spieler zugeordnet");
    const zahl = await page.evaluate(() => allP().length - new Set(MEM.map((u) => u.player).filter(Boolean)).size);
    await expect(c.locator("h3")).toContainText("· " + zahl);
    await expect(c.locator(".row")).toHaveCount(zahl);
    const name = await c.locator(".row .nm").first().innerText();
    await c.locator("[data-invp]").first().click();
    await expect(page.locator("#inv select[name=player]")).toHaveValue(name.trim());
    await page.locator("#inv button.add").click();
    const e = c.locator(".row", { hasText: name.trim() });
    await expect(e).toContainText("eingeladen, gültig bis");
    await expect(e.locator("[data-invp]")).toHaveCount(0);
    await expect(c.locator(".row").last()).toContainText(name.trim()); // Eingeladene stehen unten
    await expect(c).toContainText((zahl - 1) + " noch ohne Einladung, 1 mit offener Einladung");
  });

  test("Captains sehen die Liste nicht", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("h3[data-acc=na]")).toHaveCount(0);
  });
});
