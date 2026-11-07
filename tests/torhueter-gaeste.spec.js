const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });

async function seed(page, patch = "", player = "Silvan Frey") {
  await page.goto("/");
  await page.evaluate(({ patch, player }) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    if (player) localStorage.setItem("__mock_player", player);
  }, { patch, player });
}

test.describe("Torhüter", () => {
  test("Captain markiert Torhüter im Teams-Tab", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=team]");
    await page.click("[data-ted='1']"); // Team bearbeiten
    const b = page.locator("button[data-gkp='1'][data-p='Tobias Keller']");
    await expect(b).toHaveAttribute("aria-pressed", "false");
    await b.click();
    await expect(b).toHaveAttribute("aria-pressed", "true");
    await expect.poll(async () => (await db(page)).t[1].gk).toEqual(["Tobias Keller"]);
    await b.click(); // wieder entfernen
    await expect.poll(async () => (await db(page)).t[1].gk).toEqual([]);
  });

  test("Torhüter sind in der Übersicht pro Training gekennzeichnet und gezählt", async ({ page }) => {
    await seed(page, `d.t[1].gk = ["Tobias Keller"]; d.t[0].gk = ["Othmar Oeler"]; d.m[2].tr[1].ab = ["Othmar Oeler"];`);
    await login(page);
    await page.click("nav [data-tab=train]");
    const ov = overview(page);
    await expect(ov.locator(".pb", { hasText: "Tobias Keller" })).toContainText("🧤");
    await expect(ov.locator(".sk", { hasText: "SpVgg Nieder" }).first()).toContainText("8 angemeldet (🧤 1)");
    await expect(ov.locator("[data-tot]")).toHaveText("Total 14 Feldspieler · 1 Torhüter"); // Othmar (Torhüter) abgemeldet
  });

  test("Umbenennen und Entfernen ziehen die Torhüter-Markierung mit", async ({ page }) => {
    await seed(page, `d.t[1].gk = ["Tobias Keller"];`);
    await login(page);
    await page.click("nav [data-tab=team]");
    await page.click("[data-ted='1']"); // Team bearbeiten
    const inp = page.locator("input[data-pn='1'][value='Tobias Keller']");
    await inp.fill("Tobi Keller");
    await inp.blur();
    await expect.poll(async () => (await db(page)).t[1].gk).toEqual(["Tobi Keller"]);
    await page.locator("button[data-rm='1']").last().click(); // letzter Spieler im Team 2 (alphabetisch: Tobi Keller)
    await expect.poll(async () => (await db(page)).t[1].gk).toEqual([]);
  });
});

test.describe("Gastspieler pro Training", () => {
  test("Gast erfassen (auch als Torhüter), zählt im Total, wieder entfernen", async ({ page }) => {
    await seed(page);
    await login(page, SPIELER); // auch Spieler dürfen Gäste erfassen
    await page.click("nav [data-tab=train]");
    const ov = overview(page);
    const f = ov.locator("form#tgs");
    await f.locator("input[name=n]").fill("Gast Goalie");
    await f.locator("input[name=gk]").check();
    await f.locator("button.add").click();
    await f.locator("input[name=n]").fill("Fritz Gast");
    await f.locator("button.add").click();
    await expect(ov.locator(".pb", { hasText: "Gast Goalie" })).toContainText("🧤");
    await expect(ov.locator("[data-tot]")).toHaveText("Total 17 Feldspieler · 1 Torhüter (inkl. 2 Gäste)");
    await expect.poll(async () => (await db(page)).m[2].tr[1].gs).toEqual([{ n: "Gast Goalie", gk: true }, { n: "Fritz Gast", gk: false }]);
    await ov.locator("[data-tgdel='0']").click();
    await expect(ov.locator("[data-tot]")).toHaveText("Total 17 Feldspieler · 0 Torhüter (inkl. 1 Gast)");
  });

  test("Gäste gehören zum gewählten Training", async ({ page }) => {
    await seed(page, `d.m[2].tr[2].gs = [{ n: "Match Gast", gk: false }];`);
    await login(page);
    await page.click("nav [data-tab=train]");
    const ov = overview(page);
    await expect(ov).not.toContainText("Match Gast");
    await ov.locator(".tch [data-tgo='2,2']").click();
    await expect(ov.locator(".pb", { hasText: "Match Gast" })).toBeVisible();
  });
});

test.describe("Mail an die Trainingsleitung (Edge Function)", () => {
  let L;
  const st = {
    t: [{ n: "A", p: ["Anna Goalie", "Beat B", "Cla C"], gk: ["Anna Goalie"] }, { n: "B", p: ["Dani D", "Eva E"] }],
    m: [{ tr: [
      { d: "2026-11-11", p: [], lead: "Beat B", ab: ["Eva E"], gs: [{ n: "Gast G", gk: true }, { n: "Hans H", gk: false }] },
      { d: "2026-11-18", p: [] },
      { d: "2026-12-02", p: [], lead: "Cla C" },
    ] }],
  };
  test.beforeAll(async () => { L = await import("../supabase/functions/notify/logic.mjs"); });

  test("am Trainingstag ab 08:00, mit Dank, Feldspielern, Torhütern, Gästen und Abmeldungen", () => {
    const at = (iso) => L.leadMailMessages(st, Date.parse(iso), "https://app");
    expect(at("2026-11-10T17:45:00Z")).toEqual([]); // Vortag, vor dem Abmeldeschluss
    expect(at("2026-11-11T06:55:00Z")).toEqual([]); // 07:55 Zürich
    const [m] = at("2026-11-11T07:00:00Z"); // Winterzeit: 08:00 Zürich = 07:00 UTC
    expect(m).toMatchObject({ key: "lead-mail:2026-11-11:Beat B", player: "Beat B", subject: "Training heute, Mi, 11.11.2026: 4 Feldspieler, 2 Torhüter" });
    expect(m.text).toContain("Danke, dass du heute, Mi, 11.11.2026, 18:45 Uhr, das Training leitest!");
    expect(m.text).toContain("alle Teams zusammen");
    expect(m.text).not.toContain("23 h");
    expect(m.text).toContain("Angemeldet: 4 Feldspieler und 2 Torhüter (inkl. 2 Gastspieler).");
    expect(m.text).toContain("Torhüter: Anna Goalie, Gast G (Gast)");
    expect(m.text).toContain("Abgemeldet: Eva E");
    expect(m.text).toContain("https://app");
    expect(at("2026-11-11T08:00:00Z")).toEqual([]); // Fenster vorbei
  });

  test("Push an die Trainingsleitung im gleichen Fenster wie die Mail", () => {
    const at = (iso) => L.leadPushMessages(st, Date.parse(iso));
    expect(at("2026-11-11T06:55:00Z")).toEqual([]);
    const [p] = at("2026-11-11T07:00:00Z");
    expect(p).toMatchObject({ key: "lead-push:2026-11-11:Beat B", tag: "lead-2026-11-11", player: "Beat B", title: "🙌 Danke, dass du heute das Training leitest" });
    expect(p.body).toContain("Mi, 11.11.2026, 18:45 Uhr: 4 Feldspieler und 2 Torhüter angemeldet.");
    expect(at("2026-11-11T08:00:00Z")).toEqual([]);
    expect(L.leadPushMessages(st, Date.parse("2026-11-18T07:00:00Z"))).toEqual([]); // keine Leitung
    expect(L.leadPushMessages(st, Date.parse("2026-12-02T07:00:00Z"))).toEqual([]); // Match Day
  });

  test("ohne Leitung und am Match Day keine Mail", () => {
    expect(L.leadMailMessages(st, Date.parse("2026-11-18T07:00:00Z"))).toEqual([]); // keine Leitung
    expect(L.leadMailMessages(st, Date.parse("2026-12-02T07:00:00Z"))).toEqual([]); // Match Day
  });
});
