const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const CAPTAIN = { email: "captain@flyingpenguins.test", password: "geheim123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const PRE = "https://wa.me/?text=";

// Konto mit Spieler verknüpfen (sonst gibt es „Meine Trainings“ nicht), anmelden, Trainings-Tab öffnen
async function training(page, user, player = "Silvan Frey") {
  await page.goto("/");
  await page.evaluate((p) => localStorage.setItem("__mock_player", p), player);
  await login(page, user);
  await page.click("nav [data-tab=train]");
  await expect(page.locator(".card:not(.cl) > h3[data-acc=mytr]")).toBeVisible();
}
// Leitung für das nächste Training (ohne Match Day/Winter Event) setzen; lead=null → keine Leitung, dafür das übernächste mit Leitung
async function setLead(page, lead) {
  return page.evaluate((lead) => {
    const L = allTr().filter((r) => !noLead(r) && !started(r.x)), n = L[0];
    if (lead) {
      n.x.lead = lead;
      const P = allP().filter((p) => p != lead);
      n.x.st = Object.assign({}, n.x.st, { [P[0]]: "v", [P[1]]: "u" }); // je eine Person verspätet/unsicher
    } else { delete n.x.lead; L[1].x.lead = allP()[1] }
    render();
    return { key: trKey(n), d: n.x.d, wd: wd(n.x.d), t: tstart(n.x), nextKey: trKey(L[1]) };
  }, lead);
}
const card = (page) => page.locator(".card", { has: page.locator("h3[data-acc=mytr]") });

test.describe("Spielleitung: Leitung per WhatsApp informieren", () => {
  test("genau ein Knopf, beim nächsten Training mit Leitung, mit Zahlen wie in der Kurzübersicht", async ({ page }) => {
    await training(page, ADMIN);
    const lead = await page.evaluate(() => allP().find((p) => p != "Silvan Frey" && p.includes(" ")));
    const n = await setLead(page, lead);
    const wa = card(page).locator("a[data-lwa]");
    await expect(wa).toHaveCount(1);
    await expect(wa).toHaveText("💬 Leitung per WhatsApp informieren");
    await expect(wa).toHaveAttribute("target", "_blank");
    await expect(wa).toHaveAttribute("rel", "noopener");
    // direkt unter der Zeile dieses Trainings (mit „Leitung: …“)
    const row = card(page).locator(`.row.tm:has([data-abw="${n.key}"])`);
    await expect(row).toContainText("Leitung: " + lead);
    expect(await row.evaluate((r) => r.nextElementSibling && r.nextElementSibling.matches("a[data-lwa]"))).toBe(true);

    const href = await wa.getAttribute("href");
    expect(href.startsWith(PRE)).toBe(true);
    const t = decodeURIComponent(href.slice(PRE.length)), lines = t.split("\n");
    expect(lines[0]).toBe("Hallo " + lead.split(" ")[0] + " 👋");
    expect(lines[1]).toBe(`Du leitest das Training am ${n.wd}, ${n.t} Uhr – danke! 🙌`);
    expect(lines[2]).toBe("");
    // Zahlen gegen die Kurzübersicht prüfen
    await card(page).locator(`[data-tsum="${n.key}"]`).click();
    const sum = card(page).locator(".tsum");
    const gk = await sum.locator("tr", { hasText: "Torhüter" }).locator("td b").innerText();
    const fs = await sum.locator("tr", { hasText: "Feldspieler" }).locator("td b").innerText();
    expect(lines[3]).toBe(`Stand jetzt: ${fs} Feldspieler und ${gk} Torhüter angemeldet · Verspätet: 1 · Unsicher: 1`);
    expect(t).toContain("Beim Abmeldeschluss (23 h vorher) bekommst du die definitive Zahl per Mail und Push.");
    expect(t).toContain("Denk an Einlaufen, Passübungen und deine 3 Übungen.\nAlle Details in der App:\n");
    expect(t).toMatch(/\/#trainings$/);
  });

  test("kein Knopf, wenn das nächste Training keine Leitung hat – auch nicht beim späteren", async ({ page }) => {
    await training(page, ADMIN);
    const n = await setLead(page, null);
    await expect(card(page).locator(`.row.tm:has([data-abw="${n.nextKey}"])`)).toContainText("Leitung:");
    await expect(page.locator("a[data-lwa]")).toHaveCount(0);
  });

  for (const [name, user] of [["Captain", CAPTAIN], ["Spieler", SPIELER]]) {
    test(`${name} sieht den Knopf nicht`, async ({ page }) => {
      await training(page, user);
      await setLead(page, "Othmar Oeler");
      await expect(card(page)).toContainText("Leitung: Othmar Oeler");
      await expect(page.locator("a[data-lwa]")).toHaveCount(0);
    });
  }

  test("Spielleitung in der Spieler-Ansicht sieht den Knopf nicht", async ({ page }) => {
    await training(page, ADMIN);
    await setLead(page, "Othmar Oeler");
    await expect(page.locator("a[data-lwa]")).toHaveCount(1);
    await page.click("nav [data-tab=team]");
    await page.locator(".vw [data-view=player]").click();
    await page.click("nav [data-tab=train]");
    await setLead(page, "Othmar Oeler");
    await expect(card(page)).toContainText("Leitung: Othmar Oeler");
    await expect(page.locator("a[data-lwa]")).toHaveCount(0);
  });
});
