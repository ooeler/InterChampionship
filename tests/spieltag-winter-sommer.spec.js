const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const WA = "https://wa.me/?text=";

// Schiri und zwei Gäste im November (Monat 2, Winter) und ein Schiri im Februar (Monat 5, Sommer)
async function seed(page) {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    d.m[2].ref = "Rita Pfiff";
    d.m[2].gs = [{ n: "Gabi Gast", t: 0, k: "★Gabi Gast" }, { n: "Toni Tor", t: 1, k: "★Toni Tor", gk: true }];
    d.m[5].ref = "Sepp Sommer";
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  });
}
const waText = async (a) => decodeURIComponent((await a.getAttribute("href")).slice(WA.length));

test.describe("Spieltage nach Winter und Sommer", () => {
  test("Monatsauswahl und Spieltage-Liste sind in Winter und Sommer gegliedert", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const chips = page.locator("main > .chips");
    await expect(chips.locator(".chg")).toHaveText(["❄️ Winter", "☀️ Sommer"]);
    // Winter vor September, Sommer zwischen Dezember und Januar
    const order = await chips.evaluate((c) => [...c.children].map((e) => e.textContent.trim()));
    expect(order.slice(0, 2)).toEqual(["❄️ Winter", "Sep"]);
    expect(order.indexOf("☀️ Sommer")).toBe(order.findIndex((t) => t.startsWith("Dez")) + 1);
    expect(order[order.indexOf("☀️ Sommer") + 1]).toBe("Jan");
    await page.click("nav [data-tab=rang]");
    const card = page.locator(".card", { has: page.locator("h3", { hasText: /^Spieltage$/ }) });
    await expect(card.locator(".rlh")).toHaveText(["❄️ Winter (Sep–Dez)", "☀️ Sommer (Jan–Apr)"]);
    await expect(card.locator(".rlh").nth(1).locator("+ .row")).toContainText("Januar");
  });
});

test.describe("Danke & Einladung per WhatsApp", () => {
  test("Spielleitung: Schiri und Gäste im Winter bekommen eine Einladung an den Winter Event", async ({ page }) => {
    await seed(page);
    await login(page, ADMIN);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='2']");
    const card = page.locator(".card.dank");
    await expect(card).toBeVisible();
    const ev = await page.evaluate(() => ({ w: wd(wevD()), md: fd(S.m[2].tr[S.m[2].tr.length - 1].d) }));
    const ref = await waText(card.locator("[data-dkwa=ref]"));
    expect(ref).toContain("Danke, Rita Pfiff, dass du am Match Day vom " + ev.md + " bei Herren Inter Schiri warst!");
    expect(ref).toContain("herzlich an unseren Winter Event am " + ev.w + " eingeladen");
    await expect(card.locator("[data-dkwa]")).toHaveText(["💬 Schiri Rita Pfiff danken", "💬 Gast Gabi Gast danken", "💬 Gast Toni Tor danken"]);
    const gast = await waText(card.locator("[data-dkwa='1']"));
    expect(gast).toContain("Danke, Toni Tor, dass du am Match Day vom " + ev.md + " bei Herren Inter als Gastspieler mitgespielt hast!");
    expect(gast).toContain("Winter Event");
    // im Sommer: Einladung an den Sommer Event
    await page.click("[data-c='5']");
    const so = await waText(card.locator("[data-dkwa=ref]"));
    const sev = await page.evaluate(() => wd(sevD()));
    expect(so).toContain("Danke, Sepp Sommer,");
    expect(so).toContain("an unseren Sommer Event am " + sev);
    // ohne Schiri und Gäste keine Karte
    await page.click("[data-c='3']");
    await expect(card).toHaveCount(0);
  });

  for (const [wer, user] of [["Captain", undefined], ["Spieler", SPIELER]]) {
    test(`${wer} ohne Trainer-Aufgabe sieht die Karte nicht`, async ({ page }) => {
      await seed(page);
      await login(page, user);
      await page.click("nav [data-tab=spiel]");
      await page.click("[data-c='2']");
      await expect(page.locator(".score .vs").first()).toHaveText("November");
      await expect(page.locator(".card.dank")).toHaveCount(0);
    });
  }

  test("Spieler mit Trainer-Aufgabe sieht die Karte", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_trainer", "1"));
    await login(page, SPIELER);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='2']");
    await expect(page.locator(".card.dank [data-dkwa]")).toHaveCount(3);
  });
});
