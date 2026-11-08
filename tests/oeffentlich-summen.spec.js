// Öffentliche Sicht nur mit Summen: Besucher bekommen keine Namenslisten pro Training und keine Restaurants,
// sehen aber dieselben Ranglisten wie Mitglieder (ohne ▲/▼ bei der Anwesenheit und ohne Restaurant).
const fs = require("fs");
const path = require("path");
const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const card = (page, t) => page.locator(".card", { has: page.locator("h3", { hasText: t }) });

async function seed(page) {
  await page.clock.setFixedTime(new Date("2026-11-20T12:00:00"));
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    const A = d.t[0].p, B = d.t[1].p;
    d.t[0].gk = [A[0], A[1]]; // zwei Torhüter: wer im Tor stand, ergibt sich aus der Anwesenheit am Match Day
    d.t[1].gk = [B[0]];
    d.m.forEach((m) => { m.res = [null, null] });
    d.m[0].res = [3, 11]; d.m[1].res = [9, 5];
    d.m[2].res = [6, 4]; d.m[2].pre = [1, 0];
    // Oktober/November: Silvan Frey immer dabei (Serie), A[2] im ganzen Monatsblock (100 %), A[0] nur am Match Day
    const T2 = d.m[2].tr, T3 = d.m[3].tr;
    T2[0].p = ["Silvan Frey", A[2], A[3], B[1], B[2]];
    T2[1].p = ["Silvan Frey", A[2], A[4], B[1]];
    T2[2].p = ["Silvan Frey", A[2], A[0], B[0], B[2], A[5]];
    T2[2].r = "Moosburg"; T2[0].r = "Sonne";
    T3[0].p = ["Silvan Frey", B[2], A[3]];
    T3[1].p = ["Silvan Frey", B[2], A[2]];
    d.m[2].g = { "Silvan Frey": 3, [A[2]]: 2, "★Max": 1 };
    d.m[2].a = { "Silvan Frey": 1, [B[1]]: 2 };
    d.m[2].gs = [{ n: "Max", k: "★Max", t: 0 }];
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    localStorage.setItem("__mock_player", "Silvan Frey");
    localStorage.setItem("__mock_act", JSON.stringify([{ player: "Silvan Frey", punkte: 4, spielleitung: false }, { player: d.t[1].p[1], punkte: 9, spielleitung: false }]));
  });
}

// Werte, die Besucher und Mitglieder gleich sehen müssen
function werte() {
  const P = allP();
  return {
    anw: P.map((p) => [p, tot("att", p), fullBadge(p), fire(p)]),
    sk: P.map((p) => [p, tot("g", p) + tot("a", p), tot("g", p)]),
    pct: S.m.map((m) => [pct(m, 0), pct(m, 1)]),
    full: S.m.map((m) => P.filter((p) => full(m, p))),
    star: S.m.map((m, i) => starTop(i)),
    gk: gkStats(S.m.map((m, i) => i)),
    rc: (recapData(2) || { R: [] }).R,
  };
}

test.describe("Öffentliche Sicht nur mit Summen", () => {
  test("Besucher sehen dieselben Ranglisten wie Mitglieder, ohne Namenslisten und Restaurants", async ({ page }) => {
    await seed(page);
    await page.reload();
    await expect(card(page, "Rückblick November")).toContainText("Spieler des Monats");
    // Der Besucher-Stand stammt aus public_league: keine Namenslisten pro Training, keine Restaurants
    const pub = await page.evaluate(async () => ({ roh: (await sb.rpc("public_league")).data, S: JSON.parse(JSON.stringify(S)) }));
    for (const s of [pub.roh, pub.S]) {
      for (const m of s.m) for (const x of m.tr) {
        expect(x.r).toBeUndefined();
        expect((x.p || []).length).toBe(0);
      }
    }
    for (const m of pub.roh.m) for (const x of m.tr) expect(Object.keys(x).sort()).toEqual(Object.keys(x).includes("t") ? ["d", "n", "t"] : ["d", "n"]);
    expect(JSON.stringify(pub.roh)).not.toMatch(/Moosburg|Sonne/);
    expect(pub.roh.m[2].tr.map((x) => x.n)).toEqual([5, 4, 6]);
    expect(pub.roh.m[2].anw["Silvan Frey"]).toBe(1 + 3);
    expect(pub.roh.stk["Silvan Frey"]).toBe(5);
    expect(Object.values(pub.roh.stk).every((n) => n >= 3)).toBe(true); // kürzere Serien zeigt die App nicht
    await expect(page.locator("main")).not.toContainText("Moosburg");
    await expect(card(page, "Rückblick November")).not.toContainText("Restaurant");
    await page.click('[data-more="Anwesenheit Saison"]');
    await expect(card(page, "Anwesenheit Saison").locator(".row", { hasText: "Silvan Frey" })).toContainText("🔥5");
    await expect(card(page, "Anwesenheit Saison").locator(".mv.up, .mv.dn")).toHaveCount(0);
    await expect(card(page, "Torhüter")).toContainText(pub.roh.t[0].p[0]);
    await page.waitForFunction(() => starTop(2) != null);
    const besucher = await page.evaluate(werte);
    // Die Testdaten decken 100 %, Serie, Torhüter aus dem Match Day und Spieler des Monats ab
    expect(besucher.full[2].slice().sort()).toEqual([pub.roh.t[0].p[2], "Silvan Frey"].sort());
    expect(besucher.gk.map((q) => q.p).sort()).toEqual([pub.roh.t[0].p[0], pub.roh.t[1].p[0]].sort());
    expect(besucher.star[2]).not.toBeNull();
    expect(besucher.rc.map((r) => r[0])).toEqual(expect.arrayContaining(["⭐", "🎯", "💯", "🧤"]));

    await login(page, SPIELER);
    await page.waitForFunction(() => !PUB && S.m[2].tr[0].p.length > 0 && starTop(2) != null);
    const mitglied = await page.evaluate(werte);
    expect(mitglied.rc.some((r) => r[0] == "🍽️")).toBe(true);
    expect(besucher.rc.some((r) => r[0] == "🍽️")).toBe(false);
    expect(besucher).toEqual({ ...mitglied, rc: mitglied.rc.filter((r) => r[0] != "🍽️") });
    // Mitglieder: Rückblick mit Restaurant
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='2']");
    await expect(card(page, "Rückblick November")).toContainText("Moosburg");
  });

  test("Neueste public_league-Definition gibt keine Namenslisten (p) und keine Restaurants (r) aus", () => {
    const dir = path.join(__dirname, "..", "supabase", "migrations");
    const defs = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8"))
      .flatMap((s) => [...s.matchAll(/create or replace function public\.public_league\s*\(\s*\)[\s\S]*?\n\$\$\s*;/gi)].map((m) => m[0]));
    const neu = defs[defs.length - 1];
    expect(neu).toBeTruthy();
    // Ausgabe pro Training ('tr', (…)): nur d, t (über jsonb_only) und n – kein 'p'/'r', auch nicht über
    // jsonb_build_object('p', …), tr.x->'p', tr.x #> '{p}' oder das ganze Objekt (|| tr.x)
    const i = neu.search(/'tr'\s*,\s*\(/);
    expect(i).toBeGreaterThan(0);
    let tief = 0, ende = -1;
    for (let k = neu.indexOf("(", i); k < neu.length; k++) {
      if (neu[k] == "(") tief++;
      if (neu[k] == ")" && --tief == 0) { ende = k; break; }
    }
    const trAus = neu.slice(i, ende + 1);
    expect(ende).toBeGreaterThan(i);
    expect(trAus).not.toMatch(/'(p|r)'|\{\s*(p|r)\s*\}|"(p|r)"/);
    // tr.x nur gefiltert (jsonb_only) oder mit einem einzelnen erlaubten Schlüssel
    const rest = trAus.replace(/jsonb_only\(\s*tr\.x\s*,\s*array\[\s*'d'\s*,\s*'t'\s*\]\s*\)/gi, "")
      .replace(/tr\.x\s*->>?\s*'(d|t)'/gi, "");
    expect(rest).not.toMatch(/\b(tr|a)\.x\b|\bx\b(?!\s*->)/);
    for (const o of [...trAus.matchAll(/jsonb_build_object\(([^()]*)\)/gi)].map((m) => m[1])) {
      const keys = [...o.matchAll(/'(\w+)'\s*,/g)].map((m) => m[1]);
      expect(keys.every((k) => ["d", "t", "n"].includes(k)), o).toBe(true);
    }
    // Felder pro Training nur über jsonb_only mit erlaubter Liste
    const listen = [...neu.matchAll(/jsonb_only\(\s*tr\.x\s*,\s*array\[([^\]]*)\]/gi)].map((m) => m[1]);
    expect(listen.length).toBeGreaterThan(0);
    for (const l of listen) {
      expect(l).not.toMatch(/'p'|'r'/);
    }
    // Kein Feld 'p' oder 'r' in irgendeiner Feldliste, keine ungefilterte Trainingsliste
    for (const l of [...neu.matchAll(/array\[([^\]]*)\]/gi)].map((m) => m[1])) expect(l).not.toMatch(/'p'|'r'/);
    expect(neu).not.toMatch(/'tr'\s*,\s*(mo\.)?m->'tr'/i);
    // Rechte wie bisher: ohne und mit Login ausführbar, nicht für alle
    const datei = fs.readdirSync(dir).sort().map((f) => fs.readFileSync(path.join(dir, f), "utf8")).filter((s) => s.includes(neu)).pop();
    expect(datei).toMatch(/revoke execute on function public\.public_league\(\) from public;/i);
    expect(datei).toMatch(/grant execute on function public\.public_league\(\) to anon, authenticated;/i);
  });
});
