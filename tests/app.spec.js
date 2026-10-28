const { test, expect, setup, login } = require("./fixtures");

const plus = (k, t) => `[data-k=${k}][data-t="${t}"][data-d="1"]`;

test.describe("Spiellogik", () => {
  test("Startvorsprung: Anwesenheitsbonus + Pre-Game-Siege", async ({ page }) => {
    await login(page);
    // September: Ø Anwesenheit 2.5 vs 3.0 → Bonus für Team 2; Pre-Game 1:3
    const r = await page.evaluate(() => ({ avg: [avg(S.m[0], 0), avg(S.m[0], 1)], bonus: bonus(S.m[0]), lead: lead(S.m[0]) }));
    expect(r).toEqual({ avg: [2.5, 3], bonus: [0, 1], lead: [1, 4] });
  });

  test("Punkte: Sieg 1, Unentschieden je 1, Dezember/April zählen doppelt", async ({ page }) => {
    await login(page);
    const r = await page.evaluate(() => {
      const a = pts(0, 7);
      S.m[3].res = [5, 5]; const b = pts(0, 3);
      S.m[7].res = [2, 6]; const c = pts(4, 7);
      return { a, b, c };
    });
    expect(r.a).toEqual([1, 1]);
    expect(r.b).toEqual([3, 3]);
    expect(r.c).toEqual([0, 2]);
  });

  test("Resultat erfassen im Doppel-Spieltag Dezember", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='3']");
    await expect(page.locator(".score .vs").first()).toHaveText("Dezember");
    for (let i = 0; i < 3; i++) await page.click(plus("res", 0));
    await expect(page.locator(".pill.win")).toHaveText("Sieger: Lochball Legenden (2 Punkte)");

    await page.click("nav [data-tab=rang]");
    const total = page.locator(".card", { hasText: "Meisterschaft" }).locator(".score b");
    await expect(total.nth(0)).toHaveText("3");
    await expect(total.nth(1)).toHaveText("1");
  });

  test("Pre-Game-Siege sind auf 3 begrenzt", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    for (let i = 0; i < 5; i++) await page.click(plus("pre", 1));
    expect(await page.evaluate(() => S.m[cur].pre[1])).toBe(3);
  });

  test("Tor erfassen erscheint in der Torschützenliste", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const row = page.locator(".sk", { hasText: "Othmar Oeler" });
    await row.locator('[data-k=g][data-d="1"]').click();
    await row.locator('[data-k=g][data-d="1"]').click();
    await page.click("nav [data-tab=rang]");
    const tore = page.locator(".card", { has: page.locator("h3", { hasText: /^Tore$/ }) });
    await expect(tore.locator(".row").first()).toContainText("Othmar Oeler");
    await expect(tore.locator(".row").first().locator("b")).toHaveText("2");
  });

  test("Spieler umbenennen übernimmt Statistiken", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const inp = page.locator("input[data-pn='0']").first();
    const old = await inp.inputValue();
    await inp.fill("Neuer Name");
    await inp.blur();
    const r = await page.evaluate((o) => ({ inTeam: S.t[0].p.includes("Neuer Name"), oldGone: !S.t[0].p.includes(o), base: S.m[0].base["Neuer Name"] }), old);
    expect(r.inTeam).toBe(true);
    expect(r.oldGone).toBe(true);
    expect(r.base).toBeGreaterThanOrEqual(0);
  });
});

test.describe("Daten & Synchronisation", () => {
  test("Änderungen werden ins Backend gespeichert", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await page.fill("input[data-tn='0']", "Pinguine");
    await page.locator("input[data-tn='0']").blur();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db") || "{}").data?.t?.[0]?.n)).toBe("Pinguine");
    await expect(page.locator("#sub")).toHaveText("Pinguine vs SpVgg Nieder");
  });

  test("Beim Login werden die gemeinsamen Daten geladen", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => {
      const s = fix(def()); s.t[1].n = "Server-Team";
      localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: s }));
    });
    await login(page);
    await expect(page.locator("#sub")).toHaveText("Lochball Legenden vs Server-Team");
  });

  test("Änderung auf Gerät B erscheint live auf Gerät A", async ({ page, context }) => {
    await login(page);
    const b = await context.newPage();
    await setup(b);
    await b.goto("/");
    await expect(b.locator("header")).toBeVisible();
    await b.click("nav [data-tab=spiel]");
    await b.click("[data-c='4']");
    await b.click(plus("res", 1));
    await expect(page.locator(".card", { hasText: "Spieltage" }).locator(".row", { hasText: "Januar" })).toContainText("0 : 1");
  });

  test("Backup speichern und wieder laden", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-exp]")]);
    expect(dl.suggestedFilename()).toBe("interchampionship-26-27-2026-10-27.json");
    const json = JSON.parse(require("fs").readFileSync(await dl.path(), "utf8"));
    expect(json.t[0].n).toBe("Lochball Legenden");

    json.t[0].n = "Aus Backup";
    await page.setInputFiles("[data-imp]", { name: "b.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(json)) });
    await expect(page.locator("#sub")).toHaveText("Aus Backup vs SpVgg Nieder");
  });

  test("Ungültiges Backup wird abgelehnt", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const msg = page.waitForEvent("dialog");
    await page.setInputFiles("[data-imp]", { name: "x.json", mimeType: "application/json", buffer: Buffer.from("{\"foo\":1}") });
    expect((await msg).message()).toContain("kein gültiges Backup");
    await expect(page.locator("#sub")).toHaveText("Lochball Legenden vs SpVgg Nieder");
  });
});
