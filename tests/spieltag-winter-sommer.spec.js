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

// Alle Danke-Texte an einem Ort: Reiter Teams, Karte „Danke & Einladung“, nach Winter und Sommer gruppiert
async function openDank(page) {
  await page.click("nav [data-tab=team]");
  const h = page.locator("h3[data-acc=dank]");
  await h.click();
  return page.locator(".card", { has: h });
}

test.describe("Danke & Einladung per WhatsApp", () => {
  test("Spielleitung: alle Schiris und Gäste an einem Ort, nach Winter und Sommer gruppiert", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => { const d = JSON.parse(localStorage.getItem("__mock_db")); d.data.m[3].ref = "rita pfiff"; localStorage.setItem("__mock_db", JSON.stringify(d)) });
    await login(page, ADMIN);
    const card = await openDank(page);
    const w = card.locator("[data-dkh=w]"), s = card.locator("[data-dkh=s]");
    await expect(w.locator(".rlh")).toHaveText("❄️ Winter (Sep–Dez)");
    await expect(s.locator(".rlh")).toHaveText("☀️ Sommer (Jan–Apr)");
    // gleicher Schiri zweimal im Winter = ein Eintrag mit beiden Match Days; Schiris vor Gästen
    await expect(w.locator("[data-dkwa]")).toHaveCount(3);
    await expect(w.locator("[data-dkwa]").nth(0)).toContainText("💬 Schiri Rita Pfiff danken");
    await expect(w.locator("[data-dkwa]").nth(1)).toContainText("💬 Gast Gabi Gast danken");
    await expect(w.locator("[data-dkwa]").nth(2)).toContainText("💬 Gast Toni Tor danken");
    const ev = await page.evaluate(() => { const md = (i) => fd(S.m[i].tr[S.m[i].tr.length - 1].d); return { w: wd(wevD()), s: wd(sevD()), nov: md(2), dez: md(3) } });
    const ref = await waText(w.locator("[data-dkwa=r]"));
    expect(ref).toContain("Danke, Rita Pfiff, dass du an den Match Days vom " + ev.nov + " und " + ev.dez + " bei Herren Inter Schiri warst!");
    expect(ref).toContain("herzlich an unseren Winter Event am " + ev.w + " eingeladen");
    expect(ref).toContain("Melde dich doch gerne an, damit wir den Event planen können.");
    const gast = await waText(w.locator("[data-dkwa=g]").nth(1));
    expect(gast).toContain("Danke, Toni Tor, dass du am Match Day vom " + ev.nov + " bei Herren Inter als Gastspieler mitgespielt hast!");
    // Sommer: Einladung an den Sommer Event
    await expect(s.locator("[data-dkwa]")).toHaveCount(1);
    const so = await waText(s.locator("[data-dkwa=r]"));
    expect(so).toContain("Danke, Sepp Sommer,");
    expect(so).toContain("an unseren Sommer Event am " + ev.s);
    // im Spieltag selbst gibt es keine eigene Danke-Karte mehr
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='2']");
    await expect(page.locator("[data-dkwa]")).toHaveCount(0);
  });

  test("ohne Einträge zeigt jede Hälfte einen Hinweis", async ({ page }) => {
    await login(page, ADMIN);
    const card = await openDank(page);
    await expect(card.locator(".dkh")).toHaveCount(2);
    await expect(card.locator(".dkh", { hasText: "Noch kein Schiri oder Gast erfasst." })).toHaveCount(2);
  });

  for (const [wer, user] of [["Captain", undefined], ["Spieler", SPIELER]]) {
    test(`${wer} ohne Trainer-Aufgabe sieht die Karte nicht`, async ({ page }) => {
      await seed(page);
      await login(page, user);
      await page.click("nav [data-tab=team]");
      await expect(page.locator(".card").first()).toBeVisible();
      await expect(page.locator("h3[data-acc=dank]")).toHaveCount(0);
    });
  }

  test("Spieler mit Trainer-Aufgabe sieht die Karte", async ({ page }) => {
    await seed(page);
    await page.evaluate(() => localStorage.setItem("__mock_trainer", "1"));
    await login(page, SPIELER);
    const card = await openDank(page);
    await expect(card.locator("[data-dkwa]")).toHaveCount(4);
  });
});
