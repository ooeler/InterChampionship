const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });
const mine = (page) => card(page, "Meine Trainings");
const overview = (page) => card(page, "Übersicht pro Training");

async function seed(page, patch = "", player = "Silvan Frey") {
  await page.goto("/");
  await page.evaluate(({ patch, player }) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
  }, { patch, player });
}
async function training(page, user = SPIELER) {
  await login(page, user);
  await page.click("nav [data-tab=train]");
}
const goTo = async (page, d) => {
  await page.evaluate((d) => { TSEL = trKey(allTr().find((r) => r.x.d == d)); render() }, d);
};

test.describe("Events", () => {
  test("Winter Event: umbenannt und ohne Trainingsleitung", async ({ page }) => {
    await seed(page, `d.m.flatMap((m) => m.tr).find((x) => x.d == "2026-12-09").lead = "Beat Rentsch";`);
    await training(page);
    await mine(page).locator("[data-tall]").click();
    const row = mine(page).locator(".row", { hasText: "09.12.2026" });
    await expect(row).toContainText("🎉 Winter Event");
    await expect(row).not.toContainText("Leitung");
    await expect(row.locator("[data-leadme]")).toHaveCount(0);
    await expect(row.locator("[data-abw]")).toHaveCount(1);
    await goTo(page, "2026-12-09");
    await expect(overview(page).locator("select[data-lead]")).toHaveCount(0);
  });

  test("Winter Event fehlt in der Trainingsleitung der Spielleitung", async ({ page }) => {
    await seed(page, "", null);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=tl]");
    const c = card(page, "Trainingsleitung").first();
    await expect(c.locator(".tlr", { hasText: "16.12.2026" })).toHaveCount(1);
    await expect(c.locator(".tlr", { hasText: "09.12.2026" })).toHaveCount(0);
  });

  test("Sommer Event: wie ein Training, ohne Leitung und ohne Anwesenheit", async ({ page }) => {
    await seed(page);
    await training(page);
    await mine(page).locator("[data-tall]").click();
    const row = mine(page).locator(".row", { hasText: "07.05.2027" });
    await expect(row).toContainText("🎉 Sommer Event");
    await expect(row.locator("[data-leadme]")).toHaveCount(0);
    await row.locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|off']").click();
    await mine(page).locator("form#abf input[name=g]").fill("Ferien");
    await mine(page).locator("form#abf button.del").click();
    await expect(row.locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await expect(page.locator("#toast")).toBeVisible();
    await expect.poll(async () => ((await db(page)).evt || {}).ab).toEqual(["Silvan Frey"]);
    expect((await db(page)).m.flatMap((m) => m.tr).some((x) => x.d == "2027-05-07")).toBe(false); // nicht Teil der Monate
    await goTo(page, "2027-05-07");
    const o = overview(page);
    await expect(o).toContainText("zählt nicht zur Anwesenheit");
    await expect(o.locator("select[data-lead]")).toHaveCount(0);
    await expect(o.locator("[data-tp='Silvan Frey']")).toContainText("✗");
    await expect(o.locator("[data-tdel]")).toHaveCount(0);
    await expect(o.locator("[data-tdt]")).toHaveCount(0);
  });

  test("Sommer Event zählt nach dem Termin nicht zur Anwesenheit und nicht als unbestätigt", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-05-20T10:00:00"));
    await seed(page, `d.m.forEach((m) => m.tr.forEach((x) => { x.p = ["Silvan Frey"] })); d.evt = { d: "2027-05-07", p: ["Beat Rentsch"] };`, null);
    await login(page);
    await page.click("nav [data-tab=train]");
    await expect(page.locator(".uc", { hasText: "noch nicht bestätigt" })).toHaveCount(0);
    expect(await page.evaluate(() => { const a = tot("att", "Beat Rentsch"); S.evt.p = []; return a - tot("att", "Beat Rentsch") })).toBe(0);
    await goTo(page, "2027-05-07");
    await expect(overview(page).locator("[data-allc]")).toHaveCount(0);
  });

  test("Edge Function: keine Leitung am Winter Event, Sommer Event bei An-/Abmeldungen", async () => {
    const L = await import("../supabase/functions/notify/logic.mjs");
    expect(L.isWinterEvent("2026-12-09")).toBe(true);
    expect(L.isWinterEvent("2026-12-02")).toBe(false);
    expect(L.isWinterEvent("2026-11-11")).toBe(false);
    const state = { t: [{ p: ["A B"] }], evt: { d: "2027-05-07", p: [] }, m: [{ tr: [{ d: "2026-12-09", lead: "A B", p: [] }, { d: "2026-12-16", lead: "A B", p: [] }, { d: "2027-01-06", p: [] }] }] };
    expect(L.trainingLeadMessages(state, "2026-12-07")).toEqual([]);
    expect(L.trainingLeadMessages(state, "2026-12-14").length).toBe(1);
    expect(L.leadMailMessages(state, L.zurichToUtc("2026-12-09") - 24 * 36e5 + 1000)).toEqual([]);
    expect(L.leadMailMessages(state, L.zurichToUtc("2026-12-16") - 24 * 36e5 + 1000).length).toBe(1);
    expect(L.signupMessage(state, { player: "A B", d: "2027-05-07", off: true }, "u", 0).title).toContain("abgemeldet");
  });
});

test.describe("Teams-Tab für alle Mitglieder", () => {
  test("Spieler sehen die Statistiken, aber keine Verwaltung", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    await expect(card(page, "Trainingsleitung")).toBeVisible();
    await expect(card(page, "Restaurant-Besuche")).toBeVisible();
    await expect(page.locator("h3", { hasText: /^Team 1/ })).toHaveCount(0);
    await expect(page.locator("h3", { hasText: "Mitglied einladen" })).toHaveCount(0);
    await expect(page.locator("form#catf")).toHaveCount(0);
  });

  test("Ohne Login kein Teams-Tab", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("nav [data-tab=team]")).toHaveCount(0);
  });

  test("Statistik Trainingsleitung: + geplant steht auf Mobilgeräten unter dem Namen", async ({ page, isMobile }) => {
    await seed(page, `d.m[2].tr[1].lead = "Silvan Frey";`);
    await login(page, SPIELER);
    await page.click("nav [data-tab=team]");
    const row = page.locator("[data-lst='Silvan Frey']");
    await expect(row.locator(".lf")).toHaveText("+1 geplant");
    const n = await row.locator(".nm").boundingBox(), l = await row.locator(".lf").boundingBox();
    if (isMobile) {
      expect(l.y).toBeGreaterThanOrEqual(n.y + n.height - 1);
      expect(Math.abs(l.x - n.x)).toBeLessThan(2);
    } else {
      expect(Math.abs(l.y + l.height / 2 - (n.y + n.height / 2))).toBeLessThan(8);
    }
  });
});

test("Toast nutzt den Unihockey-Ball, kein Eishockey-Icon", async ({ page }) => {
  test.slow(); // viele Durchgänge, auf WebKit in der CI sonst über dem Zeitlimit
  await seed(page);
  await training(page);
  const btn = mine(page).locator(".row").first().locator("[data-abw]");
  let svg = false;
  for (let i = 0; i < 14; i++) {
    await page.clock.setFixedTime(new Date(`2026-10-27T10:${String(i).padStart(2, "0")}:00`));
    await btn.click();
    if (i % 2) await mine(page).locator("[data-stt$='|on']").click();
    else {
      await mine(page).locator("[data-stt$='|off']").click();
      await mine(page).locator("form#abf input[name=g]").fill("Ferien");
      await mine(page).locator("form#abf button.del").click();
    }
    await expect(btn).toHaveText(i % 2 ? "✓ angemeldet" : "✗ abgemeldet");
    await expect(page.locator("#toast")).toBeVisible();
    expect(await page.locator("#toast").textContent()).not.toContain("🏒");
    svg = svg || (await page.locator("#toast svg").count()) > 0;
  }
  expect(svg).toBe(true);
});

test.describe("Trainings-Serie", () => {
  const PATCH = `d.m.forEach((m) => { m.base = {} }); const m = d.m.find((m) => m.tr.some((x) => x.d == "2026-10-21")); m.tr.unshift({ d: "2026-10-07", p: ["Silvan Frey"] }, { d: "2026-10-14", p: ["Silvan Frey"] }); m.tr.find((x) => x.d == "2026-10-21").p = ["Silvan Frey", "Beat Rentsch"];`;

  test("🔥 in der Anwesenheit und bei Meine Trainings", async ({ page }) => {
    await seed(page, PATCH);
    await training(page);
    await expect(mine(page).locator(".strk")).toContainText("🔥 3 Trainings in Folge");
    await expect(mine(page).locator(".strk")).toContainText("Rekord: 3");
    await page.click("nav [data-tab=rang]");
    const anw = card(page, "Anwesenheit Saison");
    await expect(anw.locator(".row", { hasText: "Silvan Frey" }).locator(".fire")).toHaveText("🔥3");
    await expect(anw.locator(".row", { hasText: "Beat Rentsch" }).locator(".fire")).toHaveCount(0); // erst 1
  });

  test("Serie reisst beim Fehlen, Rekord bleibt", async ({ page }) => {
    await seed(page, PATCH + ` m.tr.find((x) => x.d == "2026-10-21").p = ["Beat Rentsch"];`);
    await training(page);
    await expect(mine(page).locator(".strk")).toContainText("Neue Serie starten?");
    await expect(mine(page).locator(".strk")).toContainText("Rekord: 2");
  });
});

test("Team-Duell zeigt die Präsenz des laufenden Monats und wer das Bonustor holt", async ({ page }) => {
  await seed(page, `d.m.forEach((m) => { m.base = {} }); const m = d.m.find((m) => m.tr.some((x) => x.d == "2026-10-21")); m.tr.find((x) => x.d == "2026-10-21").p = d.t[1].p.slice(0, 4);`);
  await training(page);
  const c = card(page, "Team-Duell");
  await expect(c).toContainText("SpVgg Nieder führt");
  await expect(c.locator("h3")).toContainText("Team-Duell · ");
  expect(await c.locator(".da").evaluate((e) => e.style.width)).toBe("0%");
});

test.describe("Monats-Rückblick", () => {
  const PATCH = `d.m[2].res = [5, 3]; d.m[2].g = { "Silvan Frey": 3, "Beat Rentsch": 1 }; d.m[2].a = { "Silvan Frey": 1, "Beat Rentsch": 2 }; d.m[2].tr[0].r = "Rössli";`;

  test("erscheint nach dem Match Day; Restaurant nur für Mitglieder; teilen", async ({ page }) => {
    await seed(page, PATCH);
    await page.reload();
    const c = card(page, "Rückblick November");
    await expect(c).toContainText("Lochball Legenden 5 : 3 SpVgg Nieder");
    await expect(c).toContainText("Sieger: Lochball Legenden");
    await expect(c).not.toContainText("Spieler des Monats"); // App-Punkte sind nicht öffentlich
    await expect(c).toContainText("Silvan Frey (3)");
    await expect(c).not.toContainText("Rössli");
    await expect(c.locator("[data-recap]")).toHaveCount(0);

    await login(page, SPIELER);
    await page.click("nav [data-tab=rang]");
    await expect(c).toContainText("Rössli");
    await page.evaluate(() => Object.defineProperty(navigator, "share", { configurable: true, value: (d) => { window.__s = d; return Promise.resolve() } }));
    await c.locator("[data-recap]").click();
    const s = await page.evaluate(() => window.__s);
    expect(s.title).toBe("Rückblick November");
    expect(s.text.split("\n")[1]).toBe("Lochball Legenden 5 : 3 SpVgg Nieder – Sieger: Lochball Legenden");
  });

  const zeile = async (page, L) => {
    await seed(page, PATCH);
    const w = await page.evaluate((L) => {
      localStorage.setItem("__mock_act", JSON.stringify(L));
      const m = JSON.parse(localStorage.getItem("__mock_db")).data.m[2];
      return { silvan: an(m, "Silvan Frey") + 4, beat: an(m, "Beat Rentsch") + 3 };
    }, L);
    await login(page, SPIELER);
    await page.click("nav [data-tab=rang]");
    return { r: card(page, "Rückblick November").locator(".rcr", { hasText: "Spieler des Monats" }), w };
  };

  test("Spieler des Monats: Mix aus Anwesenheit und Skorerpunkten", async ({ page }) => {
    const { r, w } = await zeile(page, []);
    await expect(r).toContainText(`Silvan Frey (${w.silvan} Punkte)`);
    await expect(card(page, "Rückblick November")).toContainText("Die Spielleitung ist ausgeschlossen.");
  });

  test("Spieler des Monats: App-Punkte zählen mit", async ({ page }) => {
    const { r, w } = await zeile(page, [{ player: "Beat Rentsch", punkte: 10, spielleitung: false }]);
    expect(w.beat + 10).toBeGreaterThan(w.silvan);
    await expect(r).toContainText(`Beat Rentsch (${w.beat + 10} Punkte)`);
    await expect(r).not.toContainText("Silvan Frey");
  });

  test("Spieler des Monats: Spielleitung ist ausgeschlossen", async ({ page }) => {
    const { r } = await zeile(page, [{ player: "Silvan Frey", punkte: 10, spielleitung: true }]);
    await expect(r).toBeVisible();
    await expect(r).not.toContainText("Silvan Frey");
  });

  test("Aktivität: Statuswechsel zählt als Aktion", async ({ page }) => {
    await seed(page, PATCH);
    await login(page, SPIELER);
    await expect.poll(() => page.evaluate(() => typeof act)).toBe("function");
    await page.evaluate(() => { window.__a = []; const o = sb.rpc.bind(sb); sb.rpc = (f, a) => { if (f == "log_activity") window.__a.push(a.aktion); return o(f, a) } });
    await page.click("nav [data-tab=train]");
    await mine(page).locator("[data-abw]").first().click();
    await mine(page).locator("[data-stt$='|v']").click();
    await expect.poll(() => page.evaluate(() => window.__a)).toEqual([true]);
  });

  test("ohne Resultat kein Rückblick", async ({ page }) => {
    await seed(page, `d.m.forEach((m) => { m.res = [null, null] });`);
    await page.reload();
    await expect(page.locator("main")).toContainText("Meisterschaft");
    await expect(page.locator(".recap")).toHaveCount(0);
  });
});
