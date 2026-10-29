const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const overview = (page) => page.locator(".card", { has: page.locator("h3", { hasText: "Übersicht pro Training" }) });
const board = (page) => page.locator(".card", { has: page.locator("h3", { hasText: /^Strafen$/ }) });
const pens = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_pen") || "[]"));

// Strafen vorab in die Test-Datenbank legen
async function seed(page, list = []) {
  await page.goto("/");
  await page.evaluate((list) => localStorage.setItem("__mock_pen", JSON.stringify(list.map((p, i) => ({ id: i + 1, paid: false, ...p })))), list);
}

async function addPenalty(page, player, reason, amount) {
  const f = overview(page).locator("form#pen");
  await f.locator("select[name=p]").selectOption(player);
  await f.locator("input[name=g]").fill(reason);
  if (amount != null) await f.locator("input[name=b]").fill(String(amount));
  await f.locator("button.add").click();
}

test.describe("Strafen", () => {
  test("Captain trägt eine Strafe für das gewählte Training ein", async ({ page }) => {
    await seed(page);
    await login(page);
    await page.click("nav [data-tab=train]");
    await addPenalty(page, "Silvan Frey", "zu spät", 5);
    await expect(overview(page).locator(".pnr")).toHaveCount(1);
    await expect(overview(page).locator(".pnr")).toContainText("Silvan Frey");
    await expect(overview(page).locator(".pnr")).toContainText("zu spät");
    await expect(overview(page).locator(".pnr")).toContainText("CHF 5.00");
    expect(await pens(page)).toEqual([expect.objectContaining({ d: "2026-10-28", player: "Silvan Frey", reason: "zu spät", amount: 5, paid: false })]);
    // erscheint in der Übersicht pro Spieler
    await expect(board(page)).toContainText("Total CHF 5.00 · offen CHF 5.00");
  });

  test("Strafe gehört zum Training: anderes Training gewählt → andere Liste", async ({ page }) => {
    await seed(page, [{ d: "2026-10-28", player: "Silvan Frey", reason: "zu spät", amount: 5 }, { d: "2026-11-04", player: "Tobias Keller", reason: "Handy", amount: 10 }]);
    await login(page);
    await page.click("nav [data-tab=train]");
    await expect(overview(page).locator(".pnr")).toHaveCount(1);
    await expect(overview(page).locator(".pnr")).toContainText("Silvan Frey");
    const sel = overview(page).locator("select[data-tsel]");
    const v = await sel.locator("option", { hasText: "04.11.2026" }).getAttribute("value");
    await sel.selectOption(v);
    await expect(overview(page).locator(".pnr")).toHaveCount(1);
    await expect(overview(page).locator(".pnr")).toContainText("Tobias Keller");
  });

  test("Vorschläge für den Grund, Betrag wird übernommen", async ({ page }) => {
    await seed(page, [{ d: "2026-10-07", player: "Tobias Keller", reason: "Handy", amount: 10 }, { d: "2026-10-14", player: "Tobias Keller", reason: "zu spät", amount: 5 }, { d: "2026-10-21", player: "Silvan Frey", reason: "zu spät", amount: 5 }]);
    await login(page);
    await page.click("nav [data-tab=train]");
    expect(await page.locator("#pgr option").evaluateAll((o) => o.map((x) => x.value))).toEqual(["zu spät", "Handy"]);
    await overview(page).locator("input[name=g]").fill("Handy");
    await expect(overview(page).locator("input[name=b]")).toHaveValue("10");
    await overview(page).locator("select[name=p]").selectOption("Silvan Frey");
    await overview(page).locator("button.add", { hasText: "+ Strafe" }).click();
    await expect.poll(async () => (await pens(page)).length).toBe(4);
    expect((await pens(page))[3]).toMatchObject({ player: "Silvan Frey", reason: "Handy", amount: 10 });
  });

  test("Als bezahlt markieren und löschen", async ({ page }) => {
    await seed(page, [{ d: "2026-10-28", player: "Silvan Frey", reason: "zu spät", amount: 5 }]);
    await login(page);
    await page.click("nav [data-tab=train]");
    await overview(page).locator("[data-pnpay]").click();
    await expect(overview(page).locator("[data-pnpay]")).toHaveText("✓ bezahlt");
    await expect.poll(async () => (await pens(page))[0].paid).toBe(true);
    await expect(board(page)).toContainText("offen CHF 0.00");
    await overview(page).locator("[data-pndel]").click();
    await expect(overview(page).locator(".pnr")).toHaveCount(0);
    expect(await pens(page)).toEqual([]);
  });

  test("Spieler ohne Rolle sehen Strafen, können aber keine eintragen", async ({ page }) => {
    await seed(page, [{ d: "2026-10-28", player: "Silvan Frey", reason: "zu spät", amount: 5 }, { d: "2026-10-21", player: "Tobias Keller", reason: "Handy", amount: 10, paid: true }]);
    await page.evaluate(() => localStorage.setItem("__mock_player", "Silvan Frey"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await expect(overview(page).locator(".pnr")).toContainText("zu spät");
    await expect(overview(page).locator("form#pen")).toHaveCount(0);
    await expect(overview(page).locator("[data-pnpay],[data-pndel]")).toHaveCount(0);
    // eigene offene Strafen hervorgehoben
    await expect(board(page)).toContainText("du: CHF 5.00 offen");
    await expect(board(page).locator(".row.lme")).toContainText("Silvan Frey");
    // auch direkt an der Datenbank vorbei geht nichts (RLS)
    const r = await page.evaluate(() => sb.from("penalties").insert({ d: "2026-10-28", player: "Tobias Keller", reason: "x", amount: 1 }));
    expect(r.error.message).toContain("row-level security");
  });

  test("Strafenchef darf eintragen", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_strafen", "1"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=train]");
    await addPenalty(page, "Tobias Keller", "Material vergessen", 3);
    await expect(overview(page).locator(".pnr")).toContainText("Tobias Keller");
  });

  test("Spielleitung vergibt die Zusatzrolle Strafenchef", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const box = page.locator("input[data-mstraf='u-spieler@flyingpenguins.test']");
    await expect(box).not.toBeChecked();
    await box.check();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "set_strafen"));
    expect(log[0].args).toEqual({ uid: "u-spieler@flyingpenguins.test", on_strafen: true });
  });

  test("Übersicht pro Spieler: Top 5, nach offenem Betrag sortiert", async ({ page }) => {
    const names = ["Silvan Frey", "Tobias Keller", "Andi Scherrer", "Marco Huber", "Luca Meier", "Nico Brunner"];
    await seed(page, names.map((n, i) => ({ d: "2026-10-21", player: n, reason: "zu spät", amount: i + 1 })));
    await login(page);
    await page.click("nav [data-tab=train]");
    await expect(board(page).locator(".row")).toHaveCount(5);
    await expect(board(page).locator(".row").first()).toContainText("Nico Brunner");
    await board(page).locator("[data-more]").click();
    await expect(board(page).locator(".row")).toHaveCount(6);
  });

  test("Ohne Login: keine Strafen sichtbar", async ({ page }) => {
    await seed(page, [{ d: "2026-10-28", player: "Silvan Frey", reason: "zu spät", amount: 5 }]);
    await page.reload();
    await expect(page.locator("body")).not.toContainText("zu spät");
    await expect(board(page)).toHaveCount(0);
  });
});
