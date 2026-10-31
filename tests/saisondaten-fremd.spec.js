const fs = require("fs");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };
const X = '<img id="pwn" src="data:,">';

// Präparierter Stand, wie ihn ein Konto direkt in die Datenbank schreiben könnte
async function seed(page, patch) {
  await page.goto("/");
  await page.evaluate(({ patch, X }) => {
    const d = fix(def());
    new Function("d", "X", patch)(d, X);
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
  }, { patch, X });
}
async function sauber(page, sn) {
  if (sn) expect(await page.evaluate(() => S.sn)).toContain(sn); // der präparierte Stand ist wirklich geladen
  for (const tab of ["rang", "spiel", "train", "team", "info", "hall"]) {
    const b = page.locator(`nav [data-tab=${tab}]`);
    if (!(await b.count())) continue;
    await b.evaluate((e) => e.click()); // die langen Testtexte sprengen das Layout auf dem Handy
    await expect(page.locator("main")).not.toBeEmpty();
    await expect(page.locator("#pwn")).toHaveCount(0);
  }
}
const ALLES = `
  const m = d.m[2], x = m.tr[0], p = d.t[0].p[0];
  m.res = [X, X + "1"]; m.pre = [X, X]; m.g[p] = X; m.a[p] = X; m.base[p] = X;
  m.ref = X; m.ff = X; m.kp = [[X], X]; m.gs = [{ n: X, k: "★" + X, t: 0, gk: true }, { n: 1, k: 2, t: X }];
  x.t = X; x.r = X; x.lead = X; x.st = { [p]: X, [X]: "u" }; x.gs = [{ n: X, gk: true }, X]; x.ab = [X]; x.p = [X, 1];
  m.tr.push({ d: X, p: [] }); d.evt = { d: "2027-05-07", p: [X], t: X };
  d.sn = X; d.t[0].n = X; d.t[0].c = X; d.t[1].gk = [X]; d.t[1].img = X; d.logo = X; d.sp = X; d.m[3].g[X] = 1;
`;

test.describe("Fremde Saisondaten", () => {
  test("HTML in Zahlen- und Textfeldern wird nirgends zu HTML: Besucher", async ({ page }) => {
    await seed(page, ALLES);
    await page.reload();
    await sauber(page, "pwn");
  });

  for (const [wer, konto] of [["Spieler", SPIELER], ["Spielleitung", ADMIN]])
    test(`HTML in Zahlen- und Textfeldern wird nirgends zu HTML: ${wer}`, async ({ page }) => {
      await seed(page, ALLES);
      await login(page, konto);
      await sauber(page, "pwn");
      await page.locator("nav [data-tab=spiel]").evaluate((e) => e.click());
      await page.locator("[data-c='2']").evaluate((e) => e.click());
      await expect(page.locator("#pwn")).toHaveCount(0);
    });

  test("Kaputte Felder legen die App nicht lahm", async ({ page }) => {
    await seed(page, "d.m[1].res = null; d.m[2].pre = null; d.m[3].g = 5; d.m[3].gs = 'x'; d.m[4].tr = [null, { d: 'x' }, ...d.m[4].tr]; d.m[4].tr[2].p = 'x'; d.evt = 7;");
    await page.reload();
    await sauber(page);
    const r = await page.evaluate(() => ({ res: S.m[1].res, pre: S.m[2].pre, g: S.m[3].g, ok: S.m[4].tr.every((x) => /^[0-9]{4}/.test(x.d)), p: S.m[4].tr[0].p }));
    expect(r).toEqual({ res: [null, null], pre: [0, 0], g: {}, ok: true, p: [] });
  });

  test("Normale Daten bleiben beim Bereinigen unverändert", async ({ page }) => {
    await page.goto("/");
    const r = await page.evaluate(() => {
      const d = fix(def());
      d.m[2].res = [4, 3]; d.m[2].g[d.t[0].p[0]] = 2; d.m[2].ff = 0; d.m[2].kp = [["A"], null];
      Object.assign(d.m[2].tr[0], { t: "19:30", r: "Moosburg", lead: "A", ab: ["B"], st: { A: "u", B: "v" }, gs: [{ n: "Max", gk: true }] });
      const vor = JSON.stringify(d);
      return vor == JSON.stringify(fix(JSON.parse(vor)));
    });
    expect(r).toBe(true);
  });

  test("Vom Server abgelehnte Daten: Hinweis und Neuladen statt Endlosschleife", async ({ page }) => {
    const alerts = [];
    page.on("dialog", (d) => alerts.push(d.message()));
    await seed(page, "");
    await login(page, SPIELER);
    await page.evaluate(() => {
      const o = sb.from.bind(sb);
      sb.from = (t) => {
        const q = o(t);
        if (t != "league_state") return q;
        const nein = () => Promise.resolve({ error: { message: "Ungültige Daten: Resultat" } });
        q.upsert = nein;
        q.update = () => ({ eq: () => ({ eq: () => ({ select: nein }) }) });
        return q;
      };
      save();
    });
    await expect.poll(() => alerts.join()).toContain("Ungültige Daten: Resultat");
    expect(alerts.join()).toContain("neu geladen");
  });

  test("Formatversion der App passt zur Prüfung auf dem Server", async () => {
    const html = fs.readFileSync(path.join(__dirname, "../app/index.html"), "utf8");
    const dir = path.join(__dirname, "../supabase/migrations");
    const sql = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).join("\n");
    const srv = [...sql.matchAll(/function public\.league_version\(\)[^$]*\$\$ select (\d+) \$\$/g)].pop()[1];
    expect(html.match(/var SV=(\d+)/)[1]).toBe(srv);
  });

  test("Push: für andere melden nur Spielleitung und Captains, Resultat nur als Zahl", async () => {
    const L = await import("../supabase/functions/notify/logic.mjs");
    expect(L.mayNotifyFor({ role: "player", player: "A B" }, "A B")).toBe(true);
    expect(L.mayNotifyFor({ role: "player", player: "A B" }, "C D")).toBe(false);
    expect(L.mayNotifyFor({ role: "player", player: null }, undefined)).toBe(false);
    expect(L.mayNotifyFor({ role: "captain", player: "A B" }, "C D")).toBe(true);
    expect(L.mayNotifyFor({ role: "admin", player: null }, "C D")).toBe(true);
    const st = { t: [{ n: "A" }, { n: "B" }], m: [{ res: ["Gratis-Bier: evil.example", 1] }] };
    expect(L.resultMessage(st, 0)).toBeNull();
  });
});
