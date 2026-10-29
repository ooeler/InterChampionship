const { test, expect, login } = require("./fixtures");

const board = (page, title) => page.locator(".card", { has: page.locator("h3", { hasText: new RegExp("^" + title + "$") }) });

async function seed(page, patch) {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    new Function("d", patch)(d);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch || "");
  await page.reload();
}

test.describe("Rangliste", () => {
  test("ohne Login sichtbar, mit den gemeinsamen Daten", async ({ page }) => {
    await seed(page, `d.t[0].n = "Öffentliche Pinguine"`);
    await expect(page.locator("#sub")).toHaveText("Öffentliche Pinguine vs SpVgg Nieder");
    await expect(board(page, "Anwesenheit Saison")).toBeVisible();
    // nur lesen: nichts wird gespeichert
    await page.evaluate(() => { S.t[0].n = "Hack"; save() });
    await page.waitForTimeout(600);
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data.t[0].n)).toBe("Öffentliche Pinguine");
  });

  test("zeigt die Top 5 und auf Wunsch alle", async ({ page }) => {
    await page.goto("/");
    const b = board(page, "Anwesenheit Saison");
    await expect(b.locator(".row")).toHaveCount(5);
    await b.locator("[data-more]").click();
    await expect(b.locator(".row")).toHaveCount(16);
    await expect(b.locator("[data-more]")).toHaveText("Weniger zeigen");
    await b.locator("[data-more]").click();
    await expect(b.locator(".row")).toHaveCount(5);
    await expect(b.locator("[data-more]")).toHaveText("Zeige mehr (16)");
  });

  test("markiert Auf- und Absteiger seit dem letzten Termin", async ({ page }) => {
    // Match Day 04.11.: Beat Rentsch schiesst 3 Tore und überholt Othmar Oeler
    await page.clock.setFixedTime(new Date("2026-11-05T10:00:00"));
    await seed(page, `d.m[0].g = { "Othmar Oeler": 2, "Beat Rentsch": 1 }; d.m[2].g = { "Beat Rentsch": 3 };`);
    const b = board(page, "Tore");
    const beat = b.locator(".row", { hasText: "Beat Rentsch" });
    const othmar = b.locator(".row", { hasText: "Othmar Oeler" });
    await expect(beat.locator(".rk")).toHaveText("1");
    await expect(beat.locator(".mv.up")).toHaveText("▲");
    await expect(othmar.locator(".mv.dn")).toHaveText("▼");
    await expect(b.locator(".mv.up, .mv.dn")).toHaveCount(2); // alle anderen unverändert
  });

  test("ohne Veränderung keine Pfeile", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".mv.up, .mv.dn")).toHaveCount(0);
  });

  test("eingeloggt bleibt die Rangliste gleich", async ({ page }) => {
    await login(page);
    await expect(board(page, "Anwesenheit Saison").locator(".row")).toHaveCount(5);
    await expect(page.locator("#li")).toBeHidden();
    await expect(page.locator("nav button")).toHaveCount(5);
  });
});

test("Teamsponsor steht zwischen Meisterschaft und Spieltagen", async ({ page }) => {
  await seed(page, `d.sp = "data:image/png;base64,iVBORw0KGgo="`);
  const titles = await page.locator("main .card > h3").allTextContents();
  const i = (t) => titles.indexOf(t);
  expect(i("Teamsponsor")).toBe(i("Meisterschaft") + 1);
  expect(i("Spieltage")).toBe(i("Teamsponsor") + 1);
});
