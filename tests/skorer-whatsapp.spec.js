const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const CAPTAIN = { email: "captain@flyingpenguins.test", password: "geheim123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const WA = "https://wa.me/?text=";
const NL = String.fromCharCode(10);
const ban = (page) => page.locator(".skban");
const waText = async (page) => decodeURIComponent((await page.locator("a[data-skwa]").getAttribute("href")).slice(WA.length));

// November (Monat 2) ohne Anwesenheit und Pre-Game: Vorsprung 0, das Endresultat zählt direkt
const BEIDE = `m.res = [2, 3]; m.g = { [d.t[0].p[0]]: 3, [d.t[1].p[0]]: 1 }; m.a = { [d.t[1].p[1]]: 4 };`;
async function seedDb(page, patch) {
  await page.goto("/");
  await page.evaluate((patch) => {
    const d = fix(def());
    d.m.forEach((m) => { m.res = [null, null]; m.g = {}; m.a = {} });
    const m = d.m[2];
    m.base = {}; m.pre = [0, 0]; m.tr.forEach((x) => { x.p = [] });
    new Function("d", "m", patch)(d, m);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, patch);
}
async function seed(page, user, patch = BEIDE) {
  await seedDb(page, patch);
  await login(page, user);
  await page.click("nav [data-tab=spiel]");
  await page.click("[data-c='2']");
  await expect(ban(page)).toBeVisible();
}
// Link frisch geöffnet, dann anmelden
async function openLink(page, hash, user) {
  await page.goto("/" + hash);
  await page.reload();
  await page.click("#li");
  await page.fill("#auth input[name=email]", user.email);
  await page.fill("#auth input[name=pw]", user.password);
  await page.click("#auth form .btn");
  await expect(page.locator("header")).toBeVisible();
}

test.describe("Skorerliste per WhatsApp teilen", () => {
  test("Spielleitung: Knopf mit Aufforderung, Resultat, Abweichungen und Link auf den Spieltag", async ({ page }) => {
    await seed(page, ADMIN);
    const wa = ban(page).locator("a.add.wa[data-skwa]");
    await expect(wa).toBeVisible();
    await expect(wa).toHaveText("💬 Per WhatsApp teilen");
    await expect(wa).toHaveAttribute("target", "_blank");
    expect((await wa.getAttribute("href")).startsWith(WA)).toBe(true);
    const t = await waText(page);
    const [n, msg] = await page.evaluate(() => [S.t.map((x) => x.n), skIssues(S.m[2]).map(skMsg)]);
    const L = t.split(NL);
    expect(L[0]).toBe("🙏 Bitte die Skorerliste vom Match Day November korrigieren");
    expect(L[1]).toBe(`Captains ${n[0]} und ${n[1]}: Tore und Assists passen noch nicht zum Resultat.`);
    expect(L[2]).toBe("");
    expect(L[3]).toBe(`🏒 ${n[0]} 2 : 3 ${n[1]}`);
    expect(msg).toHaveLength(3);
    expect(L.slice(4, 7)).toEqual(msg.map((x) => "• " + x));
    expect(L[7]).toBe("");
    expect(L[8]).toBe("👉 Im Spieltag auf „✏️ Spielbericht bearbeiten“ tippen und korrigieren – danke! 💪");
    expect(L[9]).toBe(await page.evaluate(() => location.origin + location.pathname + "#spieltag=2"));
    expect(t).toMatch(/\/#spieltag=2$/);
  });

  test("nur ein Team betroffen: Captain im Singular, Sonderzeichen im Teamnamen sauber im Link", async ({ page }) => {
    await seed(page, ADMIN, `d.t[1].n = 'Tom & "Jerry" <B>'; m.res = [2, 1]; m.g = { [d.t[0].p[0]]: 2 };`);
    const html = await ban(page).evaluate((e) => e.innerHTML);
    expect(html).not.toContain("<B>");
    const t = await waText(page);
    const L = t.split(NL);
    expect(L[1]).toBe('Captain Tom & "Jerry" <B>: Tore und Assists passen noch nicht zum Resultat.');
    expect(L[4]).toBe('• Tom & "Jerry" <B>: 1 Tor zu wenig (0 erfasst, laut Endresultat minus Vorsprung 1).');
    expect(L.filter((l) => l.startsWith("• "))).toHaveLength(1);
  });

  for (const [rolle, user] of [["Captain", CAPTAIN], ["Spieler", SPIELER]]) {
    test(`${rolle}: Hinweis ja, WhatsApp-Knopf nein`, async ({ page }) => {
      await seed(page, user);
      await expect(ban(page).locator(".skbi")).toHaveCount(3);
      await expect(page.locator("a[data-skwa]")).toHaveCount(0);
    });
  }

  test("ohne Abweichung kein Knopf, auch nicht für die Spielleitung", async ({ page }) => {
    await seedDb(page, `m.res = [2, 1]; m.g = { [d.t[0].p[0]]: 2, [d.t[1].p[0]]: 1 };`);
    await login(page, ADMIN);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='2']");
    await expect(page.locator(".score")).toBeVisible();
    await expect(ban(page)).toHaveCount(0);
    await expect(page.locator("a[data-skwa]")).toHaveCount(0);
  });

  test("Link #spieltag=2 öffnet nach dem Anmelden den Spieltag November beim Hinweis", async ({ page }) => {
    // Im Januar: ohne Link stünde die App auf einem anderen Monat – ein ignorierter Link fällt so auf
    await page.clock.setFixedTime(new Date("2027-01-20T10:00:00"));
    await seedDb(page, BEIDE);
    await openLink(page, "#spieltag=2", CAPTAIN);
    await expect(page.locator("nav [data-tab=spiel]")).toHaveClass(/on/);
    expect(await page.evaluate(() => cur)).toBe(2);
    await expect(ban(page)).toBeInViewport();
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(await page.evaluate(() => { const c = cur; goNow(); const ohneLink = cur; cur = c; return ohneLink })).not.toBe(2);
  });

  test("Link auf einen anderen Monat wählt diesen Spieltag", async ({ page }) => {
    await seedDb(page, BEIDE);
    await openLink(page, "#spieltag=5", SPIELER);
    await expect(page.locator("nav [data-tab=spiel]")).toHaveClass(/on/);
    expect(await page.evaluate(() => [cur, MON[cur]])).toEqual([5, "Februar"]);
    await expect(page.locator("#app .score")).toBeVisible();
    expect(await page.evaluate(() => location.hash)).toBe("");
  });

  test("ungültiger Link #spieltag=9 wird ignoriert", async ({ page }) => {
    await seedDb(page, BEIDE);
    await openLink(page, "#spieltag=9", ADMIN);
    await expect(page.locator("nav [data-tab=rang]")).toBeVisible();
    await expect(page.locator("nav [data-tab=spiel]")).not.toHaveClass(/on/);
    expect(await page.evaluate(() => cur)).toBeLessThan(8);
  });
});
