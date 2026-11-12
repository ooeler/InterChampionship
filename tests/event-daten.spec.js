// Spielleitung wählt das Datum von Winter Event (S.wev) und Sommer Event (S.sev) im Termin-Editor (Teams-Reiter).
// Ohne Wahl gilt das berechnete Datum (2. Mittwoch im Dezember, 1. Freitag im Mai).
const fs = require("fs");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const dates = (d, i) => d.m[i].tr.map((x) => x.d);
const put = async (loc, v) => { await loc.fill(v); await loc.blur(); };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

async function seed(page, { player = "Silvan Frey", patch = "" } = {}) {
  await page.goto("/");
  await page.evaluate(({ player, patch }) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
  }, { player, patch });
}
async function openEditor(page) {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  await page.locator("#term [data-term]").click();
  await expect(page.locator("#term #tev")).toBeVisible();
}
function dialogs(page, answer = () => true) {
  const L = [];
  page.removeAllListeners("dialog");
  page.on("dialog", (d) => { L.push(d.type() + ": " + d.message()); return d.type() == "confirm" && answer(d.message()) ? d.accept() : d.dismiss(); });
  return L;
}
const wev = (page) => page.locator("#term [data-wev]");
const sev = (page) => page.locator("#term [data-sev]");
// Winter-Event-Training mit Anwesenheit, Abmeldung und (ignorierter) Leitung
const WE = `const w = d.m[4].tr[0]; w.p = ["Silvan Frey"]; w.ab = ["Beat Rentsch"]; w.r = "Pizzeria Roma";`;
// Winter und Sommer entschieden: die Meisterschaft nennt das Verliererteam mit dem Event-Datum
const ENT = `d.m[2].res = [4, 1]; d.m[3].res = [6, 2]; [4, 5, 6, 7].forEach((i) => { d.m[i].res = [1, 0] });`;

test("Winter Event auf ein Datum ohne Training: das Event-Training wandert mit seinen Daten, Label und keine Leitung", async ({ page }) => {
  await seed(page, { patch: WE + ENT });
  await openEditor(page);
  await expect(page.locator("#tev")).toContainText("Winter Event · Mi, 09.12.2026 · berechnet");
  const vorher = (await db(page)).m[4].tr[0];
  const L = dialogs(page);
  await put(wev(page), "2026-12-30");
  await expect.poll(async () => (await db(page)).wev).toBe("2026-12-30");
  expect(L).toEqual([]);
  const d = await db(page);
  expect(dates(d, 4)).toEqual(["2026-12-16", "2026-12-23", "2026-12-30", "2027-01-06"]);
  expect(d.m[4].tr[2]).toEqual({ ...vorher, d: "2026-12-30" });
  await expect(page.locator("#tev")).toContainText("Winter Event · Mi, 30.12.2026 · gewählt");
  await expect(page.locator('#term [data-tmb="4"] .tmr', { hasText: "30.12.2026" })).toContainText("Winter Event");
  await expect(page.locator('#term [data-tmb="4"] .tmr', { hasText: "30.12.2026" }).locator("[data-tmd]")).toBeDisabled();
  // Trainingsleitung (Spielleitung): 30.12. fehlt, 16.12. ist da
  await page.click("h3[data-acc=tl]");
  const tl = card(page, "Trainingsleitung").first();
  await expect(tl.locator(".tlr", { hasText: "16.12.2026" })).toHaveCount(1);
  await expect(tl.locator(".tlr", { hasText: "30.12.2026" })).toHaveCount(0);
  // Training-Reiter: Label, keine Leitung
  await page.click("nav [data-tab=train]");
  const mine = card(page, "Meine Trainings");
  await mine.locator("[data-tall]").click();
  await expect(mine.locator(".row", { hasText: "30.12.2026" })).toContainText("🎉 Winter Event");
  await expect(mine.locator(".row", { hasText: "30.12.2026" }).locator("[data-leadme]")).toHaveCount(0);
  await page.evaluate(() => { TSEL = trKey(allTr().find((r) => r.x.d == "2026-12-30")); render() });
  await expect(card(page, "Übersicht pro Training").locator("select[data-lead]")).toHaveCount(0);
  // Meisterschaft und Infos zeigen das neue Datum, auch nach dem Neuladen
  await page.reload();
  await page.click("nav [data-tab=rang]");
  await expect(card(page, "Meisterschaft")).toContainText("den Winter Event am 30.12.2026");
  await page.click("nav [data-tab=info]");
  await expect(page.locator("main")).toContainText("(30.12.2026)");
  // Edge Function: Event am gewählten Datum, das alte Datum ist ein normales Datum
  const L2 = await import("../supabase/functions/notify/logic.mjs");
  const s = await db(page);
  expect(L2.isWinterEvent(s, "2026-12-30")).toBe(true);
  expect(L2.isWinterEvent(s, "2026-12-09")).toBe(false);
  s.m[4].tr[2].lead = "Silvan Frey"; s.m[4].tr[0].lead = "Silvan Frey";
  expect(L2.trainingLeadMessages(s, "2026-12-28")).toEqual([]);
  expect(L2.leadMailMessages(s, L2.zurichToUtc("2026-12-30", "18:45") - 23 * 36e5 + 1000)).toEqual([]);
  expect(L2.trainingLeadMessages(s, "2026-12-14").map((m) => m.key)).toEqual(["training:2026-12-16:Silvan Frey"]);
});

test("Winter Event auf ein bestehendes Training: dieses wird der Event, das bisherige wieder ein normales Training", async ({ page }) => {
  await seed(page, { patch: WE });
  await openEditor(page);
  await put(wev(page), "2026-12-16");
  await expect.poll(async () => (await db(page)).wev).toBe("2026-12-16");
  const d = await db(page);
  expect(dates(d, 4)).toEqual(["2026-12-09", "2026-12-16", "2026-12-23", "2027-01-06"]);
  expect(d.m[4].tr[0].p).toEqual(["Silvan Frey"]);
  const b = page.locator('#term [data-tmb="4"]');
  await expect(b.locator(".tmr", { hasText: "16.12.2026" })).toContainText("Winter Event");
  await expect(b.locator(".tmr", { hasText: "09.12.2026" })).not.toContainText("Winter Event");
  await expect(b.locator(".tmr", { hasText: "09.12.2026" }).locator("[data-tmd]")).toBeEnabled();
  await page.click("h3[data-acc=tl]");
  const tl = card(page, "Trainingsleitung").first();
  await expect(tl.locator(".tlr", { hasText: "09.12.2026" })).toHaveCount(1);
  await expect(tl.locator(".tlr", { hasText: "16.12.2026" })).toHaveCount(0);
  // zurück auf das berechnete Datum: kein gespeichertes Feld mehr
  await put(wev(page), "2026-12-09");
  await expect.poll(async () => "wev" in (await db(page))).toBe(false);
});

test("Winter Event: nicht am Match Day, nicht ausserhalb der Saison, nicht am Sommer Event", async ({ page }) => {
  await seed(page);
  await openEditor(page);
  const L = dialogs(page);
  const vorher = await db(page);
  for (const [v, msg] of [["2026-12-02", "ist ein Match Day"], ["2027-05-05", "in der Saison liegen"], ["2026-08-26", "in der Saison liegen"], ["2027-05-07", "in der Saison liegen"]]) {
    L.length = 0;
    await put(wev(page), v);
    await expect.poll(() => L.join()).toContain(msg);
    await expect(wev(page)).toHaveValue("2026-12-09");
  }
  await page.waitForTimeout(600);
  expect(await db(page)).toEqual(vorher);
});

test("Sommer Event: gewähltes Datum bleibt nach Neuladen und fix(), erscheint in Training, Meisterschaft und Infos", async ({ page }) => {
  await seed(page, { patch: ENT + `d.evt = { d: "2027-05-07", p: [], ab: ["Silvan Frey"] };` });
  await openEditor(page);
  await expect(page.locator("#tev")).toContainText("Sommer Event · Fr, 07.05.2027 · berechnet");
  const L = dialogs(page);
  // nicht an einem Training
  await put(sev(page), "2027-04-07");
  await expect.poll(() => L.join()).toContain("Am Mi, 07.04.2027 gibt es schon ein Training.");
  await expect(sev(page)).toHaveValue("2027-05-07");
  await put(sev(page), "2027-05-14");
  await expect.poll(async () => (await db(page)).sev).toBe("2027-05-14");
  await put(page.locator("#term [data-sevt]"), "19:30");
  await expect.poll(async () => (await db(page)).evt).toEqual({ d: "2027-05-14", t: "19:30", p: [], ab: ["Silvan Frey"] });
  await expect(page.locator("#tev")).toContainText("Sommer Event · Fr, 14.05.2027 · gewählt");
  await page.reload();
  expect(await page.evaluate(() => { S = fix(JSON.parse(JSON.stringify(S))); return [evTr().d, S.evt.d, sevD()] })).toEqual(["2027-05-14", "2027-05-14", "2027-05-14"]);
  await page.click("nav [data-tab=train]");
  const mine = card(page, "Meine Trainings");
  await mine.locator("[data-tall]").click();
  await expect(mine.locator(".row", { hasText: "14.05.2027" })).toContainText("🎉 Sommer Event");
  await expect(mine.locator(".row", { hasText: "07.05.2027" })).toHaveCount(0);
  await page.click("nav [data-tab=rang]");
  await expect(card(page, "Meisterschaft")).toContainText("den Sommer Event am 14.05.2027");
  await page.click("nav [data-tab=info]");
  await expect(page.locator("main")).toContainText("(14.05.2027)");
});

test("Besucher sehen das gewählte Datum des Winter Events", async ({ page }) => {
  await seed(page, { player: null, patch: `d.wev = "2026-12-30"; d.m[4].tr[0].d = "2026-12-30"; d.m[4].tr.sort((a, b) => a.d < b.d ? -1 : 1); d.sev = "2027-05-14";` + ENT });
  await page.reload();
  await expect(card(page, "Meisterschaft")).toContainText("den Winter Event am 30.12.2026");
  await expect(card(page, "Meisterschaft")).toContainText("den Sommer Event am 14.05.2027");
  const pub = await page.evaluate(async () => (await sb.rpc("public_league")).data);
  expect([pub.wev, pub.sev]).toEqual(["2026-12-30", "2027-05-14"]);
});

for (const [wer, user, player] of [["Captain", undefined, "Andreas Scherrer"], ["Spieler", SPIELER, null]]) {
  test(`${wer}: kein Termin-Editor, keine Event-Felder`, async ({ page }) => {
    await seed(page, { player });
    await login(page, user);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main")).toContainText("Lochball Legenden");
    await expect(page.locator("#term, [data-wev], [data-sev], [data-tsw]")).toHaveCount(0);
  });
}

test("Server: ein Spieler kann die Event-Daten nicht ändern, ungültige werden abgelehnt", async ({ page }) => {
  await seed(page, { patch: `d.wev = "2026-12-16";` });
  await login(page, SPIELER);
  const r = await page.evaluate(async () => {
    const send = async (f) => { const d = JSON.parse(localStorage.getItem("__mock_db")).data; f(d); return (await sb.from("league_state").upsert({ id: "main", data: d })).error };
    return { aendern: await send((d) => { d.wev = "2026-12-30"; d.sev = "2027-05-21" }), kaputt: await send((d) => { d.sev = "<b>" }) };
  });
  expect(r.aendern).toBeNull();
  expect(r.kaputt.message).toBe("Ungültige Daten: Event-Datum");
  const d = await db(page);
  expect([d.wev, "sev" in d]).toEqual(["2026-12-16", false]);
  // kern.js verwirft ein ungültiges Datum beim Normalisieren
  expect(await page.evaluate(() => { const s = fix(def()); s.wev = "2026-02-30"; s.sev = 5; fix(s); return ["wev" in s, "sev" in s] })).toEqual([false, false]);
});

test("Migration 38: Event-Daten prüfen, nur Spielleitung/Captains ändern, öffentlich mit wev/sev", () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const files = fs.readdirSync(dir).sort();
  const all = files.map((f) => fs.readFileSync(path.join(dir, f), "utf8"));
  const last = (re) => all.flatMap((s) => [...s.matchAll(re)].map((m) => m[0])).pop();
  const sql = fs.readFileSync(path.join(dir, "20261110_38_event_daten.sql"), "utf8");
  const lp = last(/create or replace function public\.league_problem\s*\([\s\S]*?\nend \$\$;/gi);
  const g = last(/create or replace function public\.guard_league_state\s*\(\)[\s\S]*?\nend \$\$;/gi);
  const pl = last(/create or replace function public\.public_league\s*\(\s*\)[\s\S]*?\n\$\$\s*;/gi);
  for (const k of ["wev", "sev"]) {
    expect(lp).toContain(`if not is_none(d->'${k}') and coalesce(d->>'${k}', '') !~ '^\\d{4}-\\d{2}-\\d{2}$' then return 'Event-Datum'; end if;`);
    expect(pl).toContain(`'${k}', s.d->'${k}'`);
  }
  expect(g.replace(/\s+/g, " ")).toContain("coalesce(public.my_role(), '') not in ('admin', 'captain') then foreach k in array array['wev', 'sev'] loop if new.data->k is distinct from old.data->k then new.data := case when old.data ? k then jsonb_set(new.data, array[k], old.data->k) else new.data - k end;");
  for (const f of [lp, pl]) expect(sql).toContain(f);
  // guard_league_state wurde später neu definiert (20261112_39, Trainingsleitung); die Regel für wev/sev steht in 38 und in der neuesten Fassung
  expect(sql.replace(/\s+/g, " ")).toContain("foreach k in array array['wev', 'sev'] loop");
  // Rechte unverändert, nur create or replace (idempotent)
  expect(sql).toMatch(/revoke execute on function public\.public_league\(\) from public;\s*grant execute on function public\.public_league\(\) to anon, authenticated;/);
  expect(sql).toMatch(/revoke execute on function public\.league_problem\(jsonb\) from public, anon, authenticated;/);
  expect(sql).not.toMatch(/^\s*(create table|create function|alter table|drop )/im);
});
