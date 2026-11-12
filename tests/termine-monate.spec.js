// Spielleitung: Trainings und Match Days bearbeiten, Trainings einem anderen Monat zuteilen, Match Days tauschen (Teams-Reiter)
// Der Match Day eines Monats ist immer sein spätester Termin.
const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const BTN = "📅 Trainings und Spieldaten bearbeiten";
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const dates = (d, i) => d.m[i].tr.map((x) => x.d);
// Datum/Zeit setzen: WebKit meldet die Änderung erst beim Verlassen des Felds
const put = async (loc, v) => { await loc.fill(v); await loc.blur(); };

// Oktober bekommt Trainings (inkl. Anwesenheit, Abmeldung, Leitung, Gast, Restaurant) und einen Match Day; ohne Resultat
const OKT = `d.m[1].tr = [
  { d: "2026-09-30", p: ["Andreas Scherrer"] },
  { d: "2026-10-07", t: "19:00", p: ["Andreas Scherrer", "Silvan Frey"], ab: ["Beat Rentsch"], st: { "Julien Stadler": "v" }, lead: "Julien Stadler", gs: [{ n: "Gast G", gk: true }], r: "Pizzeria Roma" },
  { d: "2026-10-14", p: [] }];`;

async function seed(page, { player = "Andreas Scherrer", patch = "", view = "" } = {}) {
  await page.goto("/");
  await page.evaluate(({ player, patch, view }) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
    if (view) localStorage.setItem("ic_view", view);
  }, { player, patch, view });
}
async function openEditor(page) {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  await page.locator("#term [data-term]").click();
  await expect(page.locator("#term .tmb")).toHaveCount(8);
}
const block = (page, i) => page.locator(`#term [data-tmb="${i}"]`);
const monat = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Monatsübersicht" }) });
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
const cells = (page, name) => monat(page).locator("tr", { hasText: name }).locator("td").allTextContents();

test("nur die Spielleitung sieht „Trainings und Spieldaten bearbeiten“", async ({ page }) => {
  await seed(page);
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  await expect(page.getByRole("button", { name: BTN })).toBeVisible();
  // Ansicht „Spieler“ der Spielleitung: kein Button
  await page.locator("[data-view=player]").click();
  await expect(page.locator("main")).toContainText("Lochball Legenden");
  await expect(page.getByRole("button", { name: BTN })).toHaveCount(0);
  await expect(page.locator("#term")).toHaveCount(0);
});

for (const [wer, user] of [["Captain", undefined], ["Spieler", SPIELER]]) {
  test(`${wer} sieht den Termin-Editor nicht`, async ({ page }) => {
    await seed(page, { player: user ? null : "Andreas Scherrer" });
    await login(page, user);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main")).toContainText("Lochball Legenden");
    await expect(page.getByRole("button", { name: BTN })).toHaveCount(0);
    await expect(page.locator("#term")).toHaveCount(0);
  });
}

test("Training von Oktober nach November: Daten bleiben, Zählungen wandern mit", async ({ page }) => {
  await seed(page, { patch: OKT + "d.m[1].res = [null, null];" });
  await openEditor(page);
  const vorher = (await db(page)).m[1].tr[1];
  const before = await page.evaluate(() => ({ an: [an(S.m[1], "Andreas Scherrer"), an(S.m[2], "Andreas Scherrer")], pct: [pct(S.m[1], 0), pct(S.m[2], 0), pct(S.m[2], 1)] }));
  expect(before).toEqual({ an: [7, 1], pct: [56, 88, 100] });
  // Match Day hat keine Monatsauswahl, Trainings schon
  await expect(block(page, 1).locator(".tmr")).toHaveCount(3);
  await expect(block(page, 1).locator("[data-tmm]")).toHaveCount(2);
  await expect(block(page, 1).locator(".tmr").last()).toContainText("Match Day");
  let dlg = 0; page.on("dialog", () => dlg++);
  await block(page, 1).locator('[data-tmm="1,1"]').selectOption("2");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-07", "2026-10-21", "2026-10-28", "2026-11-04"]);
  const d = await db(page);
  expect(dates(d, 1)).toEqual(["2026-09-30", "2026-10-14"]);
  expect(d.m[2].tr[0]).toEqual(vorher); // Anwesenheit, Abmeldung, Status, Leitung, Gast, Restaurant, Beginn
  expect(dlg).toBe(0); // kein Resultat → keine Rückfrage
  await expect(block(page, 2).locator(".tmr").first()).toContainText("07.10.2026");
  await expect(block(page, 2).locator(".tmr").last()).toContainText("Match Day");
  await expect(block(page, 2).locator('[data-tmm="2,0"]')).toHaveValue("2");
  const after = await page.evaluate(() => ({ an: [an(S.m[1], "Andreas Scherrer"), an(S.m[2], "Andreas Scherrer")], pct: [pct(S.m[1], 0), pct(S.m[2], 0), pct(S.m[2], 1)] }));
  expect(after).toEqual({ an: [6, 2], pct: [63, 50, 56] });
  // Monatsübersicht: November zählt das Training, Oktober nicht mehr
  await page.click("nav [data-tab=train]");
  await monat(page).locator("[data-tmon='2']").click();
  await expect(monat(page)).toContainText("4 Trainings, davon 2 vorbei");
  expect((await cells(page, "Andreas Scherrer"))[1]).toBe("2");
  expect((await cells(page, "Silvan Frey"))[1]).toBe("2");
  expect((await cells(page, "Beat Rentsch")).slice(1, 3)).toEqual(["1", "1"]);
  await monat(page).locator("[data-tmon='1']").click();
  await expect(monat(page)).toContainText("2 Trainings, davon 2 vorbei");
  expect((await cells(page, "Andreas Scherrer"))[1]).toBe("6");
  // Übersicht pro Training: Novemberblock enthält das Training mit seiner Anwesenheit
  await overview(page).locator("[data-tsm='2']").click();
  await expect(overview(page).locator(".tch")).toContainText("07.10.");
  await overview(page).locator(".tch [data-tgo='2,0']").click();
  await expect(overview(page)).toContainText("Mi, 07.10.2026 · Beginn 19:00");
  await expect(overview(page).locator(".blk")).toContainText("November-Block: Trainings vom 07.10. bis zum Match Day am 04.11.");
});

// Dialoge mitschreiben und selbst beantworten (statt der automatischen Zustimmung aus fixtures.js)
function dialogs(page, answer = () => true) {
  const L = [];
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => { L.push(d.type() + ": " + d.message()); return d.type() == "confirm" && answer(d.message()) ? d.accept() : d.dismiss(); });
  return L;
}
const md = (d, i) => d.m[i].tr[d.m[i].tr.length - 1].d;

test("Match Day ist immer der späteste Termin: späteres Training zuteilen macht es zum Match Day (Rückfrage)", async ({ page }) => {
  await seed(page, { patch: `d.m[3].tr[0].ab = ["Andreas Scherrer"]; d.m[3].tr[0].p = [];` });
  await openEditor(page);
  // Abbrechen: alles bleibt
  let L = dialogs(page, () => false);
  const vorher = await db(page);
  await block(page, 3).locator('[data-tmm="3,0"]').selectOption("2");
  await expect.poll(() => L.length).toBe(1);
  expect(L[0]).toContain("confirm: Der Match Day ist immer der späteste Termin eines Monats");
  expect(L[0]).toContain("November: Match Day neu am Mi, 11.11.2026 (bisher Mi, 04.11.2026)");
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
  await expect(block(page, 3).locator('[data-tmm="3,0"]')).toHaveValue("3");
  // Bestätigen: 11.11. gehört zum November und ist dort der Match Day, der 04.11. ein normales Training
  L = dialogs(page, () => true);
  await block(page, 3).locator('[data-tmm="3,0"]').selectOption("2");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04", "2026-11-11"]);
  expect(dates(await db(page), 3)).toEqual(["2026-11-18", "2026-11-25", "2026-12-02"]);
  expect((await db(page)).m[2].tr[3].ab).toEqual(["Andreas Scherrer"]);
  await expect(block(page, 2).locator(".tmr").last()).toContainText("Match Day");
  await expect(block(page, 2).locator(".tmr").last()).toContainText("11.11.2026");
  await expect(block(page, 2).locator('[data-tmm="2,2"]')).toHaveValue("2"); // 04.11. jetzt ein Training mit Monatsauswahl
  // Datum im Editor ändern ohne Wechsel des Match Days: keine Rückfrage, bleibt im November
  L = dialogs(page, () => true);
  await put(block(page, 2).locator('[data-tmd="2,1"]'), "2026-11-05");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-21", "2026-11-04", "2026-11-05", "2026-11-11"]);
  expect(L).toEqual([]);
  // Meine Trainings: Abmeldung bleibt
  await page.click("nav [data-tab=train]");
  const mine = page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
  await expect(mine.locator(".row", { hasText: "11.11.2026" })).toContainText("abgemeldet");
});

test("Training-Tab: Match Day vor ein Training verschieben – Rückfrage, Abbrechen lässt alles unverändert", async ({ page }) => {
  await seed(page, { patch: "d.m[3].res = [2, 1];" });
  await login(page, ADMIN);
  await page.click("nav [data-tab=train]");
  await overview(page).locator("[data-tsm='3']").click();
  await overview(page).locator(".tch [data-tgo='3,3']").click();
  await expect(overview(page).locator("[data-tdt]")).toHaveValue("2026-12-02");
  let L = dialogs(page, () => false);
  const vorher = await db(page);
  await put(overview(page).locator("[data-tdt]"), "2026-11-20");
  await expect.poll(() => L.length).toBe(1);
  expect(L[0]).toContain("Dezember: Match Day neu am Mi, 25.11.2026 (bisher Mi, 02.12.2026) – Resultat schon eingetragen");
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
  L = dialogs(page, () => true);
  await page.evaluate(() => { TSEL = "3,3"; render() });
  await put(overview(page).locator("[data-tdt]"), "2026-11-20");
  await expect.poll(async () => dates(await db(page), 3)).toEqual(["2026-11-11", "2026-11-18", "2026-11-20", "2026-11-25"]);
  expect(md(await db(page), 3)).toBe("2026-11-25");
});

test("Winter Event wird nie Match Day", async ({ page }) => {
  // Januar-Block nur mit Winter Event (09.12.) und Match Day (06.01.)
  await seed(page, { patch: `d.m[4].tr = [{ d: "2026-12-09", p: [] }, { d: "2027-01-06", p: [] }];` });
  await openEditor(page);
  const L = dialogs(page, () => true);
  const vorher = await db(page);
  await put(block(page, 4).locator('[data-tmd="4,1"]'), "2026-12-08");
  await expect.poll(() => L.length).toBe(1);
  expect(L[0]).toContain("alert: Der Winter Event kann nicht Match Day sein");
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
  await expect(block(page, 4).locator('[data-tmd="4,1"]')).toHaveValue("2027-01-06");
});


test("Match Day: Datum und Beginn änderbar, aber keine Monatsauswahl; Winter Event fest", async ({ page }) => {
  await seed(page);
  await openEditor(page);
  const md = block(page, 2).locator(".tmr").last();
  await expect(md).toContainText("Match Day");
  await expect(md.locator("[data-tmm]")).toHaveCount(0);
  await put(md.locator("[data-tmt]"), "19:30");
  await expect.poll(async () => (await db(page)).m[2].tr[2].t).toBe("19:30");
  await put(block(page, 2).locator('[data-tmd="2,2"]'), "2026-11-05");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-21", "2026-10-28", "2026-11-05"]);
  // Jeder Monat hat genau einen Match Day: keine Monatsauswahl in irgendeiner Match-Day-Zeile
  expect(await page.locator("#term .tmr.tmd [data-tmm]").count()).toBe(0);
  await expect(page.locator("#term .tmr.tmd")).toHaveCount(6); // Sep/Okt haben in den Testdaten keine Trainings
  // Winter Event (09.12., im Januar-Block): Datum und Monat fest, Beginn änderbar
  const we = block(page, 4).locator(".tmr").first();
  await expect(we).toContainText("Winter Event");
  await expect(we.locator("[data-tmd]")).toBeDisabled();
  await expect(we.locator("[data-tmm]")).toHaveCount(0);
  await expect(we.locator("[data-tmt]")).toBeEnabled();
  // Monate ohne Match Day lassen sich nicht wählen
  await expect(block(page, 2).locator('[data-tmm="2,0"] option[value="0"]')).toBeDisabled();
  await expect(page.locator("#term")).toContainText("Sommer Event");
});

test("Monat mit Resultat: Rückfrage, Abbrechen lässt alles unverändert", async ({ page }) => {
  await seed(page, { patch: OKT }); // Oktober hat in den Testdaten schon ein Resultat (9 : 5)
  await openEditor(page);
  await expect(block(page, 1)).toContainText("Resultat eingetragen");
  const vorher = await db(page);
  page.removeAllListeners("dialog");
  let msg = "";
  page.once("dialog", (d) => { msg = d.message(); d.dismiss(); });
  await block(page, 1).locator('[data-tmm="1,1"]').selectOption("2");
  await expect.poll(() => msg).toContain("Im Oktober ist schon ein Resultat eingetragen");
  expect(msg).toContain("von Oktober nach November verschieben?");
  await expect(block(page, 1).locator('[data-tmm="1,1"]')).toHaveValue("1");
  await page.waitForTimeout(600); // Speichern wäre nach 400 ms erfolgt
  expect(await db(page)).toEqual(vorher);
  expect(await page.evaluate(() => S.m[1].tr.map((x) => x.d))).toEqual(["2026-09-30", "2026-10-07", "2026-10-14"]);
  // Bestätigen verschiebt
  page.once("dialog", (d) => d.accept());
  await block(page, 1).locator('[data-tmm="1,1"]').selectOption("2");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-07", "2026-10-21", "2026-10-28", "2026-11-04"]);
});

test("Zusammenführen mit einer gleichzeitigen Änderung: Trainings rein nach Datum, der späteste Termin ist der Match Day", async ({ page }) => {
  await page.goto("/");
  const r = await page.evaluate(() => {
    const md = () => ({ d: "2026-11-04", p: [] });
    const base = [{ d: "2026-10-21", p: [] }, md()];
    const server = [{ d: "2026-10-21", p: [] }, md(), { d: "2026-11-11", p: ["Andreas Scherrer"] }]; // Spielleitung hat den 11.11. dem November zugeteilt (neuer Match Day)
    const mine = [{ d: "2026-10-21", p: ["Silvan Frey"] }, md()]; // gleichzeitig bestätigt jemand die Anwesenheit
    return merge3(base, mine, server).map((x) => x.d + ":" + x.p.join());
  });
  expect(r).toEqual(["2026-10-21:Silvan Frey", "2026-11-04:", "2026-11-11:Andreas Scherrer"]);
});

test("Alt-Daten mit einem Training nach dem Match Day werden beim Laden nicht still umsortiert", async ({ page }) => {
  await seed(page, { patch: `d.m[2].tr = [{ d: "2026-10-21", p: [] }, { d: "2026-11-11", p: [] }, { d: "2026-11-04", p: [] }]; d.m[3].tr.shift();` });
  await openEditor(page);
  expect(await page.evaluate(() => S.m[2].tr.map((x) => x.d))).toEqual(["2026-10-21", "2026-11-11", "2026-11-04"]);
  await expect(block(page, 2)).toContainText("Training nach dem Match Day");
  await expect(block(page, 2).locator(".tmr").last()).toContainText("04.11.2026");
});

// November-Match-Day auf den 05.12. verschoben (nach dem Dezember-Match-Day): Tauschen bringt die Monate wieder in Reihenfolge
const VERSCHOBEN = `d.m[2].tr[2] = { d: "2026-12-05", t: "19:15", p: ["Andreas Scherrer", "Silvan Frey"], ab: ["Beat Rentsch"], st: { "Julien Stadler": "v" }, gs: [{ n: "Gast N" }], r: "Pizzeria Roma" };
  d.m[3].tr[3] = { d: "2026-12-02", p: ["Tobias Keller"], ab: ["Manuel Ammann"] };
  d.m[3].res = [2, 1]; d.m[3].pre = [2, 1]; d.m[3].g = { "Andreas Scherrer": 2 }; d.m[3].a = { "Silvan Frey": 1 }; d.m[3].ref = "Ref R"; d.m[3].gs = [{ n: "Gast D", k: "g:x", t: 0 }]; d.m[3].kp = [["Thomas Allemann"], null];
  d.m[2].res = [null, null];`;

test("Match Days tauschen (Nov ↔ Dez): Termine mit Anwesenheit wechseln, Resultate und „zählt doppelt“ bleiben beim Monat", async ({ page }) => {
  await seed(page, { patch: VERSCHOBEN });
  await openEditor(page);
  const vorher = await db(page);
  const nov = vorher.m[2].tr[2], dez = vorher.m[3].tr[3];
  const monat = (m) => ({ res: m.res, pre: m.pre, g: m.g, a: m.a, ref: m.ref, gs: m.gs, kp: m.kp, base: m.base, ff: m.ff });
  // nur auf Match-Day-Zeilen, Optionen = andere Monate mit Match Day
  await expect(page.locator("#term [data-tsw]")).toHaveCount(6);
  expect(await page.locator("#term .tmr:not(.tmd) [data-tsw]").count()).toBe(0);
  const sel = block(page, 2).locator('[data-tsw="2"]');
  await expect(sel.locator("option")).toHaveText(["⇄ Match Day tauschen mit …", "Match Day Dezember (02.12.2026)", "Match Day Januar (06.01.2027)", "Match Day Februar (03.02.2027)", "Match Day März (03.03.2027)", "Match Day April (07.04.2027)"]);
  // Dezember hat ein Resultat: Rückfrage, Abbrechen lässt alles unverändert
  let L = dialogs(page, () => false);
  await sel.selectOption("3");
  await expect.poll(() => L.length).toBe(1);
  expect(L[0]).toContain("confirm: Im Dezember ist schon ein Resultat eingetragen");
  expect(L[0]).toContain("bleiben beim Monat");
  expect(L[0]).toContain("Match Day November (Sa, 05.12.2026) mit Match Day Dezember (Mi, 02.12.2026) tauschen?");
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
  await expect(sel).toHaveValue("");
  // Bestätigen
  L = dialogs(page, () => true);
  await sel.selectOption("3");
  await expect.poll(async () => dates(await db(page), 2)).toEqual(["2026-10-21", "2026-10-28", "2026-12-02"]);
  const d = await db(page);
  expect(dates(d, 3)).toEqual(["2026-11-11", "2026-11-18", "2026-11-25", "2026-12-05"]);
  // die ganzen Einträge (Datum, Beginn, Anwesenheit, Abmeldungen, Status, Gäste, Restaurant) haben getauscht
  expect(d.m[2].tr[2]).toEqual(dez);
  expect(d.m[3].tr[3]).toEqual(nov);
  // Monatsdaten bleiben beim Monat
  expect(monat(d.m[3])).toEqual(monat(vorher.m[3]));
  expect(monat(d.m[2])).toEqual(monat(vorher.m[2]));
  // „zählt doppelt“ bleibt beim Dezember: das Resultat zählt dort weiterhin 2 Punkte
  expect(await page.evaluate(() => ({ dbl: DBL.slice(), p: pts(3, 3), dez: S.m[3].res }))).toEqual({ dbl: [3, 7], p: [2, 0], dez: [2, 1] });
  await expect(block(page, 2).locator(".tmr").last()).toContainText("02.12.2026");
  await expect(block(page, 3).locator(".tmr").last()).toContainText("05.12.2026");
  await expect(block(page, 3).locator(".tmr").last()).toContainText("Match Day");
  // Anwesenheit am Match Day zählt jetzt im Dezember
  expect(await page.evaluate(() => [S.m[2].tr[2].p, S.m[3].tr[3].p])).toEqual([["Tobias Keller"], ["Andreas Scherrer", "Silvan Frey"]]);
});

test("Match Days tauschen geht nicht, wenn ein Match Day im anderen Monat vor einem Training läge", async ({ page }) => {
  await seed(page);
  await openEditor(page);
  const L = dialogs(page, () => true);
  const vorher = await db(page);
  await block(page, 2).locator('[data-tsw="2"]').selectOption("3");
  await expect.poll(() => L.length).toBe(1);
  expect(L[0]).toContain("alert: Tauschen geht nicht");
  expect(L[0]).toContain("Match Day vom Mi, 04.11.2026 läge im Dezember vor dem Training vom Mi, 25.11.2026");
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
});
