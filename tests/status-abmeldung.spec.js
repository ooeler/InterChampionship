const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const reasons = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_abs") || "[]"));
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });
const mine = (page) => card(page, "Meine Trainings");
const overview = (page) => card(page, "Übersicht pro Training");
const first = (page) => mine(page).locator(".row").first();

async function seed(page, player = "Silvan Frey") {
  await page.goto("/");
  await page.evaluate((player) => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: fix(def()) }));
    localStorage.setItem("__mock_player", player);
  }, player);
}
async function open(page, user = SPIELER) {
  await login(page, user);
  await page.click("nav [data-tab=train]");
}
const choose = async (page, s) => {
  await first(page).locator("[data-abw]").click();
  await mine(page).locator(`[data-stt$='|${s}']`).click();
};

test.describe("Status pro Training", () => {
  test("Unsicher und Verspätet: zählt als angemeldet, sichtbar für alle", async ({ page }) => {
    await seed(page);
    await open(page);
    const btn = first(page).locator("[data-abw]");
    await expect(btn).toHaveText("✓ angemeldet");

    await choose(page, "u");
    await expect(btn).toHaveText("❔ unsicher");
    await expect(btn).toHaveClass(/\bun\b/);
    await expect(page.locator("#toast")).toContainText("unsicher");
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Frey": "u" });
    expect((await db(page)).m[2].tr[1].ab || []).toEqual([]);
    await expect(mine(page).locator(".stc")).toHaveCount(0); // Auswahl schliesst sich
    const chip = overview(page).locator("[data-tp='Silvan Frey']");
    await expect(chip).toContainText("❔");
    await expect(overview(page)).toContainText("1 unsicher");

    await choose(page, "v");
    await expect(btn).toHaveText("⏰ verspätet");
    await expect(chip).toContainText("⏰");
    await expect(overview(page)).toContainText("1 verspätet");

    await choose(page, "on");
    await expect(btn).toHaveText("✓ angemeldet");
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toBeUndefined();
  });

  test("Nach der 23-h-Frist: Unsicher und Verspätet gehen, Abmelden nicht", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T20:00:00"));
    await seed(page);
    await open(page);
    await expect(first(page)).toContainText("Abmelden nicht mehr möglich");
    await first(page).locator("[data-abw]").click();
    await expect(mine(page).locator("[data-stt$='|off']")).toHaveCount(0);
    await mine(page).locator("[data-stt$='|v']").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("⏰ verspätet");
  });

  test("Umbenennen zieht Status und Sommer Event mit", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const d = fix(def());
      d.m[2].tr[1].st = { "Silvan Frey": "u" };
      d.evt = { d: "2027-05-07", p: [], ab: ["Silvan Frey"] };
      localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    });
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const inp = page.locator("input[data-pn][value='Silvan Frey']");
    await inp.fill("Silvan Neu");
    await inp.blur();
    await expect.poll(async () => (await db(page)).m[2].tr[1].st).toEqual({ "Silvan Neu": "u" });
    expect((await db(page)).evt.ab).toEqual(["Silvan Neu"]);
  });
});

test.describe("Grund beim Abmelden", () => {
  test("Ohne Grund keine Abmeldung; mit Grund abgemeldet und Grund sichtbar", async ({ page }) => {
    await seed(page);
    await open(page);
    await choose(page, "off");
    const f = mine(page).locator("form#abf");
    await expect(f.locator("input[name=g]")).toBeFocused();

    // zu kurz: Dialog, nichts gespeichert
    await f.locator("input[name=g]").fill("x");
    await f.locator("button.del").click();
    await expect(f).toBeVisible();
    expect((await db(page)).m[2].tr[1].ab || []).toEqual([]);
    expect(await reasons(page)).toEqual([]);

    await f.locator("input[name=g]").fill("Geschäftsreise");
    await f.locator("button.del").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await expect(first(page)).toContainText("Grund: Geschäftsreise");
    await expect.poll(async () => (await db(page)).m[2].tr[1].ab).toEqual(["Silvan Frey"]);
    expect(await reasons(page)).toMatchObject([{ d: "2026-10-28", player: "Silvan Frey", reason: "Geschäftsreise" }]);
    // der Grund landet nie in den öffentlichen Saison-Daten
    expect(JSON.stringify(await db(page))).not.toContain("Geschäftsreise");
    await expect(overview(page).locator(".abr")).toContainText("Silvan Frey: Geschäftsreise");
  });

  test("Formular löst keine Skriptfehler aus", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await seed(page);
    await open(page);
    await choose(page, "off");
    await mine(page).locator("form#abf input[name=g]").click();
    await mine(page).locator("form#abf input[name=g]").fill("Ferien");
    await mine(page).locator("form#abf button.del").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("✗ abgemeldet");
    expect(errors).toEqual([]);
  });

  test("Abbrechen lässt alles, wie es war", async ({ page }) => {
    await seed(page);
    await open(page);
    await choose(page, "off");
    await mine(page).locator("form#abf [data-stt$='|x']").click();
    await expect(mine(page).locator("form#abf")).toHaveCount(0);
    await expect(first(page).locator("[data-abw]")).toHaveText("✓ angemeldet");
    expect((await db(page)).m[2].tr[1].ab || []).toEqual([]);
  });

  test("Wieder anmelden löscht den Grund", async ({ page }) => {
    await seed(page);
    await open(page);
    await choose(page, "off");
    await mine(page).locator("form#abf input[name=g]").fill("krank");
    await mine(page).locator("form#abf button.del").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await choose(page, "on");
    await expect(first(page).locator("[data-abw]")).toHaveText("✓ angemeldet");
    await expect.poll(() => reasons(page)).toEqual([]);
    await expect(first(page)).not.toContainText("Grund:");
  });

  test("Auch in der Übersicht braucht die eigene Abmeldung einen Grund", async ({ page }) => {
    await seed(page);
    await open(page);
    await overview(page).locator("[data-tp='Silvan Frey']").click();
    const f = overview(page).locator("form#abf");
    await expect(f).toBeVisible();
    expect((await db(page)).m[2].tr[1].ab || []).toEqual([]);
    await f.locator("input[name=g]").fill("Ferien");
    await f.locator("button.del").click();
    await expect(overview(page).locator("[data-tp='Silvan Frey']")).toContainText("✗");
    await expect(overview(page).locator(".abr")).toContainText("Ferien");
  });

  test("Andere Mitglieder sehen den Grund, öffentlich niemand", async ({ page }) => {
    await seed(page);
    await open(page);
    await choose(page, "off");
    await mine(page).locator("form#abf input[name=g]").fill("Geschäftsreise");
    await mine(page).locator("form#abf button.del").click();
    await expect(first(page).locator("[data-abw]")).toHaveText("✗ abgemeldet");
    await expect.poll(async () => (await db(page)).m[2].tr[1].ab).toEqual(["Silvan Frey"]); // gespeichert
    await page.click("#lo");
    await expect(page.locator("#li")).toBeVisible();
    expect(await page.evaluate(() => sb.from("absence_reasons").select("reason").order("d").then((r) => r.data))).toEqual([]);

    await open(page, ADMIN);
    await expect(overview(page).locator(".abr")).toContainText("Silvan Frey: Geschäftsreise");
  });

  test("Captain meldet andere ohne Grund ab", async ({ page }) => {
    await seed(page, "Andreas Scherrer");
    await open(page, { email: "captain@flyingpenguins.test", password: "geheim123" });
    await overview(page).locator("[data-tp='Beat Rentsch']").click();
    await expect(overview(page).locator("[data-tp='Beat Rentsch']")).toContainText("✗");
    await expect(page.locator("form#abf")).toHaveCount(0);
  });
});

test("Edge Function: Mail nennt unsichere und verspätete Spieler", async () => {
  const L = await import("../supabase/functions/notify/logic.mjs");
  const state = { t: [{ p: ["A B", "C D", "E F"] }], m: [{ tr: [{ d: "2026-11-11", lead: "A B", p: [], st: { "C D": "u", "E F": "v" } }, { d: "2026-11-18", p: [] }] }] };
  const c = L.trainingCount(state, state.m[0].tr[0]);
  expect(c.unsure).toEqual(["C D"]);
  expect(c.late).toEqual(["E F"]);
  expect(c.field).toBe(3); // zählen weiter als angemeldet
  const [mail] = L.leadMailMessages(state, L.zurichToUtc("2026-11-11") - 24 * 36e5 + 1000, "https://x");
  expect(mail.text).toContain("Unsicher: C D");
  expect(mail.text).toContain("Verspätet: E F");
});

test("Übersicht pro Training: Anzahl steht auf Mobilgeräten unter dem Teamnamen", async ({ page, isMobile }) => {
  await seed(page);
  await open(page);
  const h = overview(page).locator(".tsh").first();
  const [n, c] = await h.evaluate((e) => [e.querySelector("b"), e.querySelector(".sp")].map((x) => x.getBoundingClientRect().toJSON())); // gleichzeitig messen, der Tab blendet noch ein
  if (isMobile) {
    expect(c.y).toBeGreaterThanOrEqual(n.y + n.height - 1);
    expect(n.height).toBeLessThan(30); // Teamname bleibt einzeilig
  } else {
    expect(c.x).toBeGreaterThan(n.x + n.width);
  }
});
