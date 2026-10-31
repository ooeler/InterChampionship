const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const log = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]"));

// Saison existiert (vom Captain angelegt); optional Spieler-Zuordnung und Änderungen
async function seed(page, { player = "Silvan Frey", patch = "" } = {}) {
  await page.goto("/");
  await page.evaluate(({ player, patch }) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
  }, { player, patch });
}
async function openTraining(page, user) {
  await login(page, user);
  await page.click("nav [data-tab=train]");
}
const mine = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Meine Trainings" }) });
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
const team = (page, name) => overview(page).locator(".sk", { hasText: name }).first();

test.describe("Training-Tab", () => {
  test("eigener Navigationspunkt, Spieltag ohne Trainingsteile", async ({ page }) => {
    await seed(page, { player: null });
    await login(page);
    await expect(page.locator("nav [data-tab=train]")).toHaveText(/Training/);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("main")).not.toContainText("Übersicht pro Training");
    await expect(page.locator("main")).not.toContainText("Meine Trainings");
    await page.click("nav [data-tab=train]");
    await expect(overview(page)).toBeVisible();
    await expect(page.locator("main")).toContainText("Monatsübersicht");
  });

  test("Meine Trainings: erste 5, auf Wunsch alle – mit Events", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const c = mine(page);
    await expect(c.locator(".row")).toHaveCount(5);
    await expect(c.locator(".row").first()).toContainText("Mi, 28.10.2026");
    await expect(c.locator(".row", { hasText: "04.11.2026" })).toContainText("Match Day ⚑");
    await c.locator("[data-tall]").click();
    await expect(c.locator(".row", { hasText: "09.12.2026" })).toContainText("🎉 Winter Event");
    await expect(c.locator(".row", { hasText: "07.05.2027" })).toContainText("🎉 Sommer Event");
    await expect(c.locator("[data-tall]")).toHaveText("Weniger zeigen");
  });

  test("automatisch angemeldet, abmelden vor der Frist meldet es weiter", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const first = mine(page).locator(".row").first();
    await expect(first.locator("[data-abw]")).toHaveText("✓ angemeldet");
    await first.locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|off']").click();
    await mine(page).locator("form#abf input[name=g]").fill("Ferien");
    await mine(page).locator("form#abf button.del").click();
    await expect(first.locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await expect.poll(async () => (await db(page)).m[2].tr[1].ab).toEqual(["Silvan Frey"]);
    expect(await log(page)).toContainEqual({ op: "invoke", name: "notify", body: { type: "signup", d: "2026-10-28", t: "18:45", player: "Silvan Frey", off: true } });
    await first.locator("[data-abw]").click(); // wieder anmelden
    await mine(page).locator("[data-stt$='|on']").click();
    await expect(first.locator("[data-abw]")).toHaveText("✓ angemeldet");
  });

  test("Abmelden nur bis 23 h vor Trainingsbeginn", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T20:00:00")); // Training 28.10. 18:45 → noch 22 h 45 min
    await seed(page);
    await openTraining(page, SPIELER);
    const first = mine(page).locator(".row").first();
    await expect(first).toContainText("Abmelden nicht mehr möglich");
    await first.locator("[data-abw]").click();
    await expect(mine(page).locator("[data-stt$='|off']")).toHaveCount(0); // Abmelden wird gar nicht angeboten
    expect((await db(page)).m[2].tr[1].ab || []).toEqual([]);
  });

  test("Captains können auch nach der Frist ab- und anmelden", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T20:00:00"));
    await seed(page, { player: null });
    await openTraining(page);
    await team(page, "SpVgg Nieder").locator("[data-tp='Beat Rentsch']").click();
    await expect(team(page, "SpVgg Nieder")).toContainText("7 angemeldet · 1 abgemeldet");
    await expect.poll(async () => (await db(page)).m[2].tr[1].ab).toEqual(["Beat Rentsch"]);
  });

  test("Spieler können andere nicht abmelden", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const msg = page.waitForEvent("dialog");
    await team(page, "SpVgg Nieder").locator("[data-tp='Beat Rentsch']").click();
    expect((await msg).message()).toContain("nur die Spieler selbst");
  });

  test("Übersicht pro Training ist nach Mannschaft gruppiert", async ({ page }) => {
    await seed(page, { patch: `d.m[2].tr[1].ab = ["Beat Rentsch", "Othmar Oeler"]` });
    await openTraining(page, SPIELER);
    await expect(overview(page).locator(".tch [data-tgo='2,1']")).toHaveClass(/ on/);
    const a = team(page, "Lochball Legenden"), b = team(page, "SpVgg Nieder");
    await expect(a).toContainText("7 angemeldet · 1 abgemeldet");
    await expect(b).toContainText("7 angemeldet · 1 abgemeldet");
    await expect(a.locator("button.pb.off")).toHaveText("✗ Othmar Oeler");
    await expect(b.locator("button.pb.off")).toHaveText("✗ Beat Rentsch");
    // anderes Training wählen
    await overview(page).locator(".tch [data-tgo='2,2']").click();
    await expect(overview(page)).toContainText("Match Day ⚑");
    await expect(a).toContainText("8 angemeldet · 0 abgemeldet");
  });

  test("Anwesenheit bestätigen erst ab Trainingsbeginn – erst dann zählt sie", async ({ page }) => {
    await seed(page, { patch: `d.m[2].tr[1].ab = ["Beat Rentsch"]` });
    await openTraining(page);
    await expect(overview(page)).toContainText("ab Trainingsbeginn (Mi, 28.10.2026, 18:45) möglich");
    await expect(overview(page).locator("[data-allc]")).toHaveCount(0);

    await page.clock.setFixedTime(new Date("2026-10-28T19:00:00"));
    await page.reload();
    await page.click("nav [data-tab=train]");
    const before = await page.evaluate(() => an(S.m[2], "Tobias Keller"));
    await overview(page).locator("[data-allc='0']").click();
    expect(await page.evaluate(() => S.m[2].tr[1].p.every((p) => S.t[0].p.includes(p)))).toBe(true); // nur dieses Team
    await overview(page).locator("[data-allc='1']").click();
    await expect(team(page, "SpVgg Nieder")).toContainText("7 bestätigt");
    expect(await page.evaluate(() => an(S.m[2], "Tobias Keller"))).toBe(before + 1);
    expect(await page.evaluate(() => S.m[2].tr[1].p.includes("Beat Rentsch"))).toBe(false); // abgemeldet → nicht bestätigt
    // einzeln korrigieren
    await team(page, "SpVgg Nieder").locator("[data-tp='Tobias Keller']").click();
    await expect(team(page, "SpVgg Nieder")).toContainText("6 bestätigt");
  });

  test("Datum und Beginn nur für Spielleitung und Captains", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    await expect(overview(page).locator("input[data-tdt]")).toHaveCount(0);
    await expect(overview(page).locator("[data-tadd]")).toHaveCount(0);
    await page.click("#lo");
    await openTraining(page);
    await overview(page).locator("input[data-ttm]").fill("19:30");
    await overview(page).locator("input[data-ttm]").blur();
    await expect.poll(async () => (await db(page)).m[2].tr[1].t).toBe("19:30");
    await expect(overview(page)).toContainText("Beginn 19:30");
  });

  test("Training hinzufügen und löschen (Captain)", async ({ page }) => {
    await seed(page, { player: null });
    await openTraining(page);
    await overview(page).locator("[data-tadd]").click();
    await expect.poll(async () => (await db(page)).m[2].tr.map((x) => x.d)).toEqual(["2026-10-21", "2026-10-28", "2026-10-29", "2026-11-04"]);
    await expect(overview(page).locator(".tch [data-tgo='2,2']")).toHaveClass(/ on/);
    await overview(page).locator("[data-tdel]").click();
    await expect.poll(async () => (await db(page)).m[2].tr.map((x) => x.d)).toEqual(["2026-10-21", "2026-10-28", "2026-11-04"]);
  });

  test("Monatsübersicht: anwesend, abgemeldet, gefehlt", async ({ page }) => {
    await seed(page, { player: null, patch: `d.m[2].tr[0].p = ["Andreas Scherrer"]; d.m[2].tr[0].ab = ["Beat Rentsch"];` });
    await openTraining(page);
    const card = page.locator(".card", { hasText: "Monatsübersicht" });
    await card.locator("[data-tmon='2']").click();
    await expect(card).toContainText("3 Trainings, davon 1 vorbei");
    const cells = async (name) => card.locator("tr", { hasText: name }).locator("td").allTextContents();
    expect(await cells("Andreas Scherrer")).toEqual(["Andreas Scherrer C 👑", "2", "0", "0"]); // C = Captain, 👑 = führt die Anwesenheit an // 1 übernommen + 1 bestätigt
    expect(await cells("Beat Rentsch")).toEqual(["Beat Rentsch", "1", "1", "0"]);
    expect(await cells("Julien Stadler")).toEqual(["Julien Stadler", "1", "0", "1"]);
  });

  test("Einstellung: bei An- und Abmeldungen informieren", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const box = page.locator("input[data-ntf]");
    await expect(box).not.toBeChecked();
    await box.check();
    await expect.poll(async () => (await log(page)).some((l) => l.fn == "set_notify" && l.args.on_changes === true)).toBe(true);
    await page.reload();
    await page.click("nav [data-tab=train]");
    await expect(page.locator("input[data-ntf]")).toBeChecked();
  });

  test("Trainingsleitung in der Übersicht und in Meine Trainings", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    await overview(page).locator("select[data-lead='2,1']").selectOption("Beat Rentsch");
    await expect(mine(page).locator(".row").first()).toContainText("Leitung: Beat Rentsch");
    await mine(page).locator(".row").first().locator("[data-leadme]").click(); // Übernehmen (Bestätigung)
    await expect(mine(page).locator(".row").first()).toContainText("Du leitest das Training");
    await expect(overview(page).locator("select[data-lead='2,2']")).toHaveCount(0); // Match Day: keine Leitung
  });

  test("Matchtag-Karte im Spieltag zeigt, wer dabei ist", async ({ page }) => {
    await seed(page, { player: null, patch: `d.m[2].tr[2].ab = ["Silvan Frey", "Beat Rentsch"]` });
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const md = page.locator(".card", { hasText: "Ablauf Matchtag" });
    await expect(md).toContainText("SpVgg Nieder6 von 8 dabei");
    await expect(md).toContainText("abgemeldet: Beat Rentsch, Silvan Frey");
  });

  test("Umbenennen zieht Abmeldung und Leitung mit", async ({ page }) => {
    await seed(page, { player: null, patch: `d.m[2].tr[1].lead = "Andreas Scherrer"; d.m[2].tr[1].ab = ["Andreas Scherrer"];` });
    await login(page);
    await page.click("nav [data-tab=team]");
    const inp = page.locator("input[data-pn='0']").first();
    await inp.fill("Andi Scherrer");
    await inp.blur();
    const tr = await page.evaluate(() => S.m[2].tr[1]);
    expect(tr.lead).toBe("Andi Scherrer");
    expect(tr.ab).toEqual(["Andi Scherrer"]);
  });
});

test.describe("Push-Texte Training (Edge Function)", () => {
  let L, state;
  test.beforeAll(async () => {
    L = await import("../supabase/functions/notify/logic.mjs");
    state = { t: [{ n: "A" }, { n: "B" }], m: [{ tr: [{ d: "2026-10-28", p: [] }, { d: "2026-11-04", p: [] }], res: [null, null] }, { tr: [{ d: "2027-03-31", t: "19:30", p: [] }, { d: "2027-04-07", p: [] }], res: [null, null] }] };
  });

  test("Zürcher Zeit inkl. Sommerzeit", () => {
    expect(new Date(L.zurichToUtc("2026-10-28", "18:45")).toISOString()).toBe("2026-10-28T17:45:00.000Z"); // Winterzeit
    expect(new Date(L.zurichToUtc("2027-03-31", "19:30")).toISOString()).toBe("2027-03-31T17:30:00.000Z"); // Sommerzeit
  });

  test("Erinnerung 26 h vor dem Training, genau einmal pro Stunde-Fenster", () => {
    const at = (iso) => L.trainingSoonMessages(state, Date.parse(iso));
    expect(at("2026-10-27T15:40:00Z")).toEqual([]); // 26 h 05 min vorher
    const [m] = at("2026-10-27T15:45:00Z"); // genau 26 h vorher
    expect(m).toMatchObject({ key: "training-soon:2026-10-28", title: "🏑 Morgen ist Training", body: "Mi, 28.10.2026, 18:45 Uhr. Kannst du nicht? Abmelden bis 23 h vorher in der App." });
    expect(at("2026-10-27T16:30:00Z")).toHaveLength(1);
    expect(at("2026-10-27T16:45:00Z")).toEqual([]); // Fenster vorbei
    expect(at("2026-11-03T16:00:00Z")[0].title).toBe("⚑ Morgen ist Match Day");
    expect(at("2027-03-30T15:30:00Z")[0].body).toContain("19:30 Uhr"); // eigene Startzeit, Sommerzeit
  });

  test("An-/Abmeldung als Nachricht, nur für echte Spieler und Trainings", () => {
    const st = { ...state, t: [{ n: "A", p: ["Silvan Frey"] }, { n: "B", p: [] }] };
    const now = Date.parse("2026-10-27T10:00:00Z");
    const m = L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-28", off: true }, "u1", now);
    expect(m).toMatchObject({ title: "✗ Silvan Frey hat sich abgemeldet", body: "Training Mi, 28.10.2026, 18:45 Uhr" });
    expect(L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-28", off: false }, "u1", now).title).toBe("✓ Silvan Frey ist wieder angemeldet");
    expect(L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-28", t: "99:99 – Klick hier: evil.example", off: true }, "u1", now).body).toBe("Training Mi, 28.10.2026, 18:45 Uhr"); // Zeit kommt aus den Daten
    // gleiche Meldung innerhalb von 10 Minuten → gleicher Schlüssel (wird nur einmal verschickt)
    expect(L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-28", off: true }, "u1", now + 5 * 6e4).key).toBe(m.key);
    expect(L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-28", off: true }, "u1", now + 11 * 6e4).key).not.toBe(m.key);
    expect(L.signupMessage(st, { player: "Gratis-Gutschein unter evil.example", d: "2026-10-28", off: true })).toBeNull(); // kein Spieler
    expect(L.signupMessage(st, { player: "Silvan Frey", d: "2026-10-29", off: true })).toBeNull(); // kein Training
    expect(L.signupMessage(st, { player: "", d: "x" })).toBeNull();
  });
});

test.describe("Usability Training", () => {
  test("unbestätigte Trainings zählen nicht als gefehlt, Captains sehen einen Hinweis", async ({ page }) => {
    await seed(page, { player: null });
    await openTraining(page);
    const ov = page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
    await expect(ov.locator(".uc")).toContainText("1 Training ist noch nicht bestätigt");
    await ov.locator("[data-tgo]").first().click();
    await expect(ov.locator(".tch .pb.on")).toHaveText("21.10.");
    const card = page.locator(".card", { hasText: "Monatsübersicht" });
    await card.locator("[data-tmon='2']").click();
    await expect(card).toContainText("1 noch nicht bestätigt");
    expect(await card.locator("tr", { hasText: "Julien Stadler" }).locator("td").allTextContents()).toEqual(["Julien Stadler", "1", "0", "0"]);
  });

  test("Spieler sehen keinen Bestätigungs-Hinweis", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    await expect(page.locator(".uc")).toHaveCount(0);
  });
});

test.describe("Statistik Trainingsleitung", () => {
  test("Teams-Tab zeigt geleitete und geplante Trainings pro Spieler", async ({ page }) => {
    await seed(page, { player: null, patch: `d.m[2].tr[0].lead = "Beat Rentsch"; d.m[2].tr[1].lead = "Beat Rentsch"; d.m[3].tr[0].lead = "Othmar Oeler";` });
    await login(page);
    await page.click("nav [data-tab=team]");
    const card = page.locator(".card", { has: page.locator("h3", { hasText: /^Trainingsleitung$/ }) });
    await expect(card.locator(".row").first()).toHaveAttribute("data-lst", "Beat Rentsch");
    await expect(card.locator(".row[data-lst='Beat Rentsch'] b")).toHaveText("1");
    await expect(card.locator(".row[data-lst='Beat Rentsch'] .lf")).toHaveText("+1 geplant");
    await expect(card.locator(".row[data-lst='Othmar Oeler'] b")).toHaveText("0");
    await expect(card.locator(".row[data-lst='Othmar Oeler'] .lf")).toHaveText("+1 geplant");
    await expect(card.locator(".row")).toHaveCount(16); // alle Spieler, auch wer noch nie geleitet hat
    await expect(card.locator(".uc")).toHaveText("⚠️ 1 Training in den nächsten 4 Wochen noch ohne Leitung");
  });
});

test.describe("Übersicht pro Training nach Spieltag", () => {
  test("Spieltag wählen, dann das Training", async ({ page }) => {
    await seed(page);
    await openTraining(page);
    const ov = overview(page);
    await expect(ov.locator(".tsm .chip.on")).toHaveText("Nov");
    await expect(ov.locator(".tch [data-tgo]")).toHaveText(["21.10.", "28.10.", "04.11. ⚑"]);
    await ov.locator(".tsm [data-tsm='4']").click(); // Januar-Spieltag
    await expect(ov.locator(".tch [data-tgo]")).toHaveCount(4);
    await expect(ov.locator(".tch .pb.on")).toContainText("09.12.");
    await expect(ov).toContainText("Mi, 09.12.2026 · Beginn 18:45");
    await ov.locator(".tch [data-tgo]").nth(1).click();
    await expect(ov).toContainText("Mi, 16.12.2026 · Beginn 18:45");
  });

  test("Team-Logos vor den Teamnamen (Übersicht und Monatsübersicht)", async ({ page }) => {
    await seed(page, { patch: `d.t[0].img = d.t[1].img = "data:image/png;base64,iVBORw0KGgo=";` });
    await openTraining(page);
    await expect(overview(page).locator(".kv b img.sl")).toHaveCount(2);
    await expect(page.locator(".card", { hasText: "Monatsübersicht" }).locator("th img.sl")).toHaveCount(2);
  });
});

test.describe("Engagement", () => {
  test("Toast beim Abmelden (Schade …) und beim Wieder-Anmelden, verschwindet nach 6 s", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const first = mine(page).locator(".row").first();
    await first.locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|off']").click();
    await mine(page).locator("form#abf input[name=g]").fill("Ferien");
    await mine(page).locator("form#abf button.del").click();
    const t = page.locator("#toast");
    await expect(t).toBeVisible();
    await expect(t).toContainText(/Schade|Abgemeldet/);
    await expect(t).toContainText("28.10.");
    await expect(t).toBeHidden({ timeout: 8000 });
    await first.locator("[data-abw]").click();
    await mine(page).locator("[data-stt$='|on']").click();
    await expect(t).toContainText(/wieder dabei|kommst/);
    await t.click(); // antippen schliesst
    await expect(t).toBeHidden();
  });

  test("Wer die letzten 3 Trainings verpasst hat, wird auch mal ins Training eingeladen", async ({ page }) => {
    // 3 bestätigte Trainings vor heute, Silvan war bei keinem dabei
    await seed(page, { patch: `const m = d.m.find((m) => m.tr.some((x) => x.d == "2026-10-21")); m.tr.unshift({ d: "2026-10-07", p: [] }, { d: "2026-10-14", p: [] }); m.tr.filter((x) => x.d < "2026-10-27").forEach((x) => { x.p = ["Beat Rentsch"] });` });
    await openTraining(page, SPIELER);
    const r = await page.evaluate(() => { const o = [missing()]; PLAYER = "Beat Rentsch"; o.push(missing()); return o; });
    expect(r).toEqual([true, false]);
    // die Begrüssung wechselt je nach Tag zwischen "Komm mal wieder …" und der normalen
    const g = await page.evaluate(() => { PLAYER = "Silvan Frey"; const o = new Set(); for (let i = 0; i < 30; i++) { const k = "2026-10-27Silvan" + i; o.add(missing() && pick([1, 0], k + "mw") ? "mw" : "normal") } return [...o].sort(); });
    expect(g).toEqual(["mw", "normal"]);
  });
});

test.describe("Meine Trainings auf dem Handy", () => {
  test("Hinweis und Übernehmen stehen auf einer eigenen Zeile", async ({ page, isMobile }) => {
    await seed(page, { patch: "d.m.forEach((m) => m.tr.slice(0, -1).forEach((x) => { if (x.d > '2026-10-27') x.lead = 'Jemand Anderes' }))" });
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    const z = page.locator(".row.tm", { has: page.locator("[data-leadme]") }).filter({ hasText: "Übernehmen" }).first();
    const box = (l) => l.boundingBox();
    const [d, i, b, s] = [await box(z.locator(".td")), await box(z.locator(".ti")), await box(z.locator("[data-leadme]")), await box(z.locator("[data-abw]"))];
    if (isMobile) {
      expect(i.y).toBeGreaterThanOrEqual(d.y + d.height - 1);
      expect(b.y).toBeGreaterThanOrEqual(s.y + s.height - 1);
      expect(i.x).toBeLessThan(d.x + 1);
      await expect(z.locator(".tsep")).toBeHidden();
      expect(await z.locator(".ti").innerText()).toMatch(/^Leitung/);
    } else {
      expect(Math.abs(b.y + b.height / 2 - (s.y + s.height / 2))).toBeLessThan(3);
      await expect(z.locator(".tsep")).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
});
