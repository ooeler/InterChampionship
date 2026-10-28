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
    await expect(c.locator(".row", { hasText: "09.12.2026" })).toContainText("🎉 Weihnachts-Apéro");
    await expect(c.locator(".row.evr", { hasText: "07.05.2027" })).toContainText("🎉 Jahresabschluss");
    await expect(c.locator("[data-tall]")).toHaveText("Weniger zeigen");
  });

  test("automatisch angemeldet, abmelden vor der Frist meldet es weiter", async ({ page }) => {
    await seed(page);
    await openTraining(page, SPIELER);
    const first = mine(page).locator(".row").first();
    await expect(first.locator("[data-abw]")).toHaveText("✓ angemeldet");
    await first.locator("[data-abw]").click();
    await expect(first.locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await expect.poll(async () => (await db(page)).m[2].tr[1].ab).toEqual(["Silvan Frey"]);
    expect(await log(page)).toContainEqual({ op: "invoke", name: "notify", body: { type: "signup", d: "2026-10-28", t: "18:45", player: "Silvan Frey", off: true } });
    await first.locator("[data-abw]").click(); // wieder anmelden
    await expect(first.locator("[data-abw]")).toHaveText("✓ angemeldet");
  });

  test("Abmelden nur bis 23 h vor Trainingsbeginn", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T20:00:00")); // Training 28.10. 18:45 → noch 22 h 45 min
    await seed(page);
    await openTraining(page, SPIELER);
    const first = mine(page).locator(".row").first();
    await expect(first).toContainText("Abmelden nicht mehr möglich");
    const msg = page.waitForEvent("dialog");
    await first.locator("[data-abw]").click({ force: true }); // optisch gesperrt, erklärt per Hinweis
    expect((await msg).message()).toContain("23 Stunden");
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
    await expect(overview(page).locator("select[data-tsel]")).toHaveValue("2,1");
    const a = team(page, "Lochball Legenden"), b = team(page, "SpVgg Nieder");
    await expect(a).toContainText("7 angemeldet · 1 abgemeldet");
    await expect(b).toContainText("7 angemeldet · 1 abgemeldet");
    await expect(a.locator("button.pb.off")).toHaveText("✗ Othmar Oeler");
    await expect(b.locator("button.pb.off")).toHaveText("✗ Beat Rentsch");
    // anderes Training wählen
    await overview(page).locator("select[data-tsel]").selectOption("2,2");
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
    await overview(page).locator("[data-allc]").click();
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
    await expect(overview(page).locator("select[data-tsel]")).toHaveValue("2,2");
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
    expect(await cells("Andreas Scherrer")).toEqual(["Andreas Scherrer", "2", "0", "0"]); // 1 übernommen + 1 bestätigt
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
    expect(m).toMatchObject({ key: "training-soon:2026-10-28", title: "🏒 Morgen ist Training", body: "Mi, 28.10.2026, 18:45 Uhr. Kannst du nicht? Abmelden bis 23 h vorher in der App." });
    expect(at("2026-10-27T16:30:00Z")).toHaveLength(1);
    expect(at("2026-10-27T16:45:00Z")).toEqual([]); // Fenster vorbei
    expect(at("2026-11-03T16:00:00Z")[0].title).toBe("⚑ Morgen ist Match Day");
    expect(at("2027-03-30T15:30:00Z")[0].body).toContain("19:30 Uhr"); // eigene Startzeit, Sommerzeit
  });

  test("An-/Abmeldung als Nachricht", () => {
    expect(L.signupMessage({ player: "Silvan Frey", d: "2026-10-28", t: "18:45", off: true })).toMatchObject({ key: null, title: "✗ Silvan Frey hat sich abgemeldet", body: "Training Mi, 28.10.2026, 18:45 Uhr" });
    expect(L.signupMessage({ player: "Silvan Frey", d: "2026-10-28", off: false }).title).toBe("✓ Silvan Frey ist wieder angemeldet");
    expect(L.signupMessage({ player: "", d: "x" })).toBeNull();
  });
});
