const fs = require("fs");
const path = require("path");
const vm = require("vm");
const { test, expect, setup, login } = require("./fixtures");

// Mehrere Benutzer speichern gleichzeitig: alles bleibt erhalten; nur wenn beide dasselbe Feld verschieden
// geändert haben, wird der zweite gefragt, ob er überschreiben will.

// Logik ohne Seite: kern.js in einer leeren Umgebung laden
function kern() {
  const ctx = { console };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "../app/js/kern.js"), "utf8"), ctx);
  return ctx;
}
const plain = (x) => JSON.parse(JSON.stringify(x));

test.describe("Zusammenführen mit Konflikterkennung", () => {
  test("verschiedene Felder: beides bleibt, kein Konflikt", { tag: "@logik" }, () => {
    const K = kern(), o = { c: [] };
    const b = { info: "A", m: [{ res: [null, null], ref: "" }] };
    const r = K.merge3(b, { info: "A", m: [{ res: [3, 2], ref: "" }] }, { info: "B", m: [{ res: [null, null], ref: "Bruno" }] }, o);
    expect(plain(r)).toEqual({ info: "B", m: [{ res: [3, 2], ref: "Bruno" }] });
    expect(o.c).toHaveLength(0);
  });

  test("gleiche Änderung auf beiden Seiten ist kein Konflikt", { tag: "@logik" }, () => {
    const K = kern(), o = { c: [] };
    const r = K.merge3({ res: [null, null], r: "A" }, { res: [3, 2], r: "B" }, { res: [3, 2], r: "B" }, o);
    expect(plain(r)).toEqual({ res: [3, 2], r: "B" });
    expect(o.c).toHaveLength(0);
  });

  test("dasselbe Feld verschieden geändert: Konflikt mit Pfad und Werten, Wahl pro Konflikt", { tag: "@logik" }, () => {
    const K = kern();
    const b = { m: [{}, { res: [null, null], ref: "" }] };
    const mine = { m: [{}, { res: [3, 2], ref: "Max" }] };
    const them = { m: [{}, { res: [4, 2], ref: "" }] };
    const o = { c: [] };
    expect(plain(K.merge3(b, mine, them, o))).toEqual(mine); // ohne Wahl wie bisher: eigener Wert
    expect(plain(o.c)).toEqual([{ p: ["m", 1, "res"], b: [null, null], m: [3, 2], t: [4, 2] }]);
    const nein = K.merge3(b, mine, them, { c: [], pick: () => false });
    expect(plain(nein)).toEqual({ m: [{}, { res: [4, 2], ref: "Max" }] }); // eigene konfliktfreie Änderung bleibt
    expect(K.kText(o.c)).toContain("• Resultat Oktober: dein Wert 3 : 2, gespeichert 4 : 2");
    expect(K.kText(o.c)).toContain("Mit deinen Werten überschreiben?");
  });

  test("Resultat: nur eine Seite geändert bleibt ein ganzes Paar", { tag: "@logik" }, () => {
    const K = kern(), o = { c: [] };
    expect(plain(K.merge3([1, 3], [2, 3], [1, 3], o))).toEqual([2, 3]);
    expect(plain(K.merge3([1, 3], [2, 3], [1, 4], o))).toEqual([2, 3]);
    expect(o.c).toHaveLength(1); // beide haben das Resultat geändert
  });

  test("Anwesenheit, Abmeldungen und Status verschiedener Personen: kein Konflikt", { tag: "@logik" }, () => {
    const K = kern(), o = { c: [] };
    const b = { tr: [{ d: "2026-10-28", p: ["A", "B"], ab: [], st: {} }] };
    const mine = { tr: [{ d: "2026-10-28", p: ["A", "B", "C"], ab: ["X"], st: { A: "v" } }] };
    const them = { tr: [{ d: "2026-10-28", p: ["B"], ab: ["Y"], st: { B: "u" } }] };
    expect(plain(K.merge3(b, mine, them, o))).toEqual({ tr: [{ d: "2026-10-28", p: ["B", "C"], ab: ["Y", "X"], st: { A: "v", B: "u" } }] });
    expect(o.c).toHaveLength(0);
  });

  test("Löschen gegen Ändern ist ein Konflikt", { tag: "@logik" }, () => {
    const K = kern();
    const T = (r) => ({ d: "2026-10-21", p: [], ...(r ? { r } : {}) });
    const M = (tr) => ({ m: [{ tr }] });
    const b = M([T(), { d: "2026-10-28", p: [] }]);
    // Ich lösche das Training, jemand anderes trägt ein Restaurant ein
    let o = { c: [] };
    const mine = M([{ d: "2026-10-28", p: [] }]), them = M([T("Rössli"), { d: "2026-10-28", p: [] }]);
    expect(plain(K.merge3(b, mine, them, o))).toEqual(mine);
    expect(o.c).toHaveLength(1);
    expect(K.kText(o.c)).toContain("Training 21.10.2026: dein Wert gelöscht, gespeichert vorhanden");
    expect(plain(K.merge3(b, mine, them, { c: [], pick: () => false }))).toEqual(them);
    // Jemand anderes löscht, ich ändere: ohne Rückfrage ginge meine Änderung verloren
    o = { c: [] };
    expect(plain(K.merge3(b, them, mine, o))).toEqual(them);
    expect(o.c).toHaveLength(1);
    expect(plain(K.merge3(b, them, mine, { c: [], pick: () => false }))).toEqual(mine);
    // Feld gelöscht gegen Feld geändert
    o = { c: [] };
    K.merge3({ r: "Alt" }, {}, { r: "Rössli" }, o);
    expect(plain(o.c)).toEqual([{ p: ["r"], b: "Alt", t: "Rössli" }]);
  });

  test("Teamname geändert: Teams bleiben an ihrer Stelle, Spieler des anderen bleiben", { tag: "@logik" }, () => {
    const K = kern(), o = { c: [] };
    const b = { t: [{ n: "A", p: ["x"] }, { n: "B", p: ["y"] }] };
    const r = K.merge3(b, { t: [{ n: "Neu", p: ["x"] }, { n: "B", p: ["y"] }] }, { t: [{ n: "A", p: ["x", "z"] }, { n: "B", p: ["y"] }] }, o);
    expect(plain(r)).toEqual({ t: [{ n: "Neu", p: ["x", "z"] }, { n: "B", p: ["y"] }] });
    expect(o.c).toHaveLength(0);
  });

  test("Rückfrage: lesbare Bezeichnungen, höchstens fünf Einträge", { tag: "@logik" }, () => {
    const K = kern();
    const b = K.fix(K.def()), mine = K.clone(b), them = K.clone(b);
    mine.m[2].tr[0].r = "Rössli"; them.m[2].tr[0].r = "Sternen";
    mine.m[2].tr[0].lead = "Beat Rentsch"; them.m[2].tr[0].lead = "Tobias Keller";
    mine.m[2].tr[1].st = { "Silvan Frey": "u" }; them.m[2].tr[1].st = { "Silvan Frey": "v" };
    mine.m[2].g = { "Silvan Frey": 2 }; them.m[2].g = { "Silvan Frey": 1 };
    mine.m[2].pre = [1, 0]; them.m[2].pre = [0, 1];
    mine.t[0].n = "Lochball"; them.t[0].n = "Legenden";
    mine.info = "Neu A"; them.info = "Neu B";
    const o = { c: [] };
    K.merge3(b, mine, them, o);
    expect(o.c).toHaveLength(7);
    const t = K.kText(o.c);
    expect(t).toContain("Restaurant Training 21.10.2026: dein Wert „Rössli“, gespeichert „Sternen“");
    expect(t).toContain("Leitung Training 21.10.2026");
    expect(t).toContain("Status Silvan Frey Training 28.10.2026: dein Wert unsicher, gespeichert verspätet");
    expect(t).toContain("… und 2 weitere");
    const names = o.c.map((c) => K.kName(c.p));
    expect(names).toContain("Pre-Game November");
    expect(names).toContain("Teamname (Lochball Legenden)");
    expect(names).toContain("Infos");
    expect(names).toContain("Skorer November (Silvan Frey, Tore)");
    const g = o.c.find((c) => c.p[2] == "g");
    expect([K.kVal(g.m, g), K.kVal(g.t, g)]).toEqual(["2", "1"]);
  });
});

// Zwei Benutzer (zwei Tabs mit gemeinsamem Mock-Server)
async function seed(page) {
  await page.goto("/");
  await page.evaluate(() => {
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", updated_at: "2026-10-27T08:00:00.000Z", data: fix(def()) }));
  });
}
const db = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data);
const bereit = (p) => expect.poll(() => p.evaluate(() => !!me && !!BASE), { timeout: 10000 }).toBe(true);

async function zwei(page, context, antwort = true) {
  await seed(page);
  await login(page);
  await bereit(page);
  const b = await context.newPage();
  await setup(b);
  b.removeAllListeners("dialog");
  const fragen = [];
  b.on("dialog", (d) => { fragen.push(d.message()); return antwort ? d.accept() : d.dismiss() });
  page.on("dialog", (d) => fragen.push("A: " + d.message()));
  await b.goto("/");
  await bereit(b);
  return { a: page, b, fragen };
}
// B hat schon geändert, sein Speichern steht noch an (wie während der 400 ms nach der Eingabe)
const bAendert = (b, code) => b.evaluate((code) => { new Function(code)(); save(); clearTimeout(tm) }, code);
const aSpeichert = async (a, code, ok) => {
  await a.evaluate((code) => { new Function(code)(); save() }, code);
  await expect.poll(async () => ok(await db(a))).toBe(true);
};
// Eigenes Gerät: Änderung offen (Tabs teilen sich „ic_dirty“, echte Geräte nicht)
const bSpeichert = (b) => b.evaluate(() => { localStorage.setItem("ic_dirty", "1"); push() });

test.describe("Gleichzeitig speichern", () => {
  test("verschiedene Felder: beide Änderungen gespeichert, keine Rückfrage", async ({ page, context }) => {
    const { a, b, fragen } = await zwei(page, context);
    await bAendert(b, `S.m[2].ref = "Bruno"; S.m[2].tr[1].r = "Sternen"`);
    await aSpeichert(a, `S.m[2].res = [4, 2]; S.m[2].tr[0].r = "Rössli"`, (d) => d.m[2].res[0] == 4);
    await bSpeichert(b);
    await expect.poll(async () => (await db(a)).m[2].ref).toBe("Bruno");
    const d = await db(a);
    expect(d.m[2].res).toEqual([4, 2]);
    expect(d.m[2].tr[0].r).toBe("Rössli");
    expect(d.m[2].tr[1].r).toBe("Sternen");
    // Beide sehen den gemeinsamen Stand
    await expect.poll(() => a.evaluate(() => [S.m[2].ref, S.m[2].tr[1].r])).toEqual(["Bruno", "Sternen"]);
    await expect.poll(() => b.evaluate(() => [S.m[2].res, S.m[2].tr[0].r])).toEqual([[4, 2], "Rössli"]);
    expect(fragen).toEqual([]);
  });

  test("dasselbe Feld, Ja: der zweite überschreibt, seine übrigen Änderungen bleiben", async ({ page, context }) => {
    const { a, b, fragen } = await zwei(page, context, true);
    await bAendert(b, `S.m[2].res = [3, 2]; S.m[2].ref = "Bruno"`);
    await aSpeichert(a, `S.m[2].res = [4, 2]; S.m[2].tr[0].r = "Rössli"`, (d) => d.m[2].res[0] == 4);
    await bSpeichert(b);
    await expect.poll(() => fragen.length).toBe(1);
    expect(fragen[0]).toContain("Jemand anderes hat gleichzeitig dieselben Felder geändert");
    expect(fragen[0]).toContain("Resultat November: dein Wert 3 : 2, gespeichert 4 : 2");
    expect(fragen[0]).not.toContain("Schiedsrichter");
    await expect.poll(async () => (await db(a)).m[2].res).toEqual([3, 2]);
    const d = await db(a);
    expect(d.m[2].ref).toBe("Bruno");
    expect(d.m[2].tr[0].r).toBe("Rössli");
    await expect.poll(() => a.evaluate(() => S.m[2].res)).toEqual([3, 2]);
    expect(fragen).toHaveLength(1);
  });

  test("dasselbe Feld, Nein: der erste Wert bleibt, die übrigen Änderungen des zweiten werden gespeichert", async ({ page, context }) => {
    const { a, b, fragen } = await zwei(page, context, false);
    await bAendert(b, `S.m[2].res = [3, 2]; S.m[2].ref = "Bruno"`);
    await aSpeichert(a, `S.m[2].res = [4, 2]`, (d) => d.m[2].res[0] == 4);
    await bSpeichert(b);
    await expect.poll(async () => (await db(a)).m[2].ref).toBe("Bruno");
    expect((await db(a)).m[2].res).toEqual([4, 2]);
    expect(fragen).toHaveLength(1);
    // B zeigt danach den gespeicherten Wert
    await expect.poll(() => b.evaluate(() => S.m[2].res)).toEqual([4, 2]);
    await expect.poll(() => b.evaluate(() => localStorage.getItem("ic_dirty"))).toBeNull();
  });

  test("Anwesenheit und Abmeldung verschiedener Personen am selben Training: kein Konflikt", async ({ page, context }) => {
    const { a, b, fragen } = await zwei(page, context);
    await bAendert(b, `const x = S.m[2].tr[0]; x.p.push("Silvan Frey"); x.ab = ["Beat Rentsch"]; x.st = { "Tobias Keller": "v" }`);
    await aSpeichert(a, `const x = S.m[2].tr[0]; x.p.push("Cornel Eberle"); x.ab = ["Manuel Ammann"]; x.st = { "Silvan Frehner": "u" }`, (d) => d.m[2].tr[0].p.length == 1);
    await bSpeichert(b);
    await expect.poll(async () => (await db(a)).m[2].tr[0].p.slice().sort()).toEqual(["Cornel Eberle", "Silvan Frey"]);
    const x = (await db(a)).m[2].tr[0];
    expect(x.ab.slice().sort()).toEqual(["Beat Rentsch", "Manuel Ammann"]);
    expect(x.st).toEqual({ "Silvan Frehner": "u", "Tobias Keller": "v" });
    expect(fragen).toEqual([]);
  });

  test("Rückfrage wartet, solange getippt wird, und kommt nur einmal", async ({ page, context }) => {
    const { a, b, fragen } = await zwei(page, context, true);
    await bAendert(b, `S.m[2].tr[0].r = "Sternen"`);
    await aSpeichert(a, `S.m[2].tr[0].r = "Rössli"`, (d) => d.m[2].tr[0].r == "Rössli");
    // B tippt gerade in ein Textfeld
    await b.evaluate(() => { const i = document.createElement("input"); i.id = "tipp"; document.body.append(i); i.focus() });
    await bSpeichert(b);
    await expect.poll(() => b.evaluate(() => KWAIT)).toBe(true);
    await expect(b.locator("#sync")).toBeVisible(); // „Noch nicht gespeichert“
    expect(fragen).toEqual([]);
    expect((await db(a)).m[2].tr[0].r).toBe("Rössli");
    // Beim ersten Speicherversuch nach der Antwort ist jemand anderes nochmals schneller: keine zweite Rückfrage
    await b.evaluate(() => {
      const f = sb.from.bind(sb);
      let einmal = true;
      sb.from = function (t) {
        const q = f(t);
        if (t == "league_state") {
          const u = q.update;
          q.update = function (p) {
            if (einmal) {
              einmal = false;
              const r = JSON.parse(localStorage.getItem("__mock_db"));
              r.updated_at = new Date(Date.now() + 5e5).toISOString();
              localStorage.setItem("__mock_db", JSON.stringify(r));
            }
            return u.call(q, p);
          };
        }
        return q;
      };
    });
    await b.evaluate(() => document.getElementById("tipp").blur());
    await expect.poll(async () => (await db(a)).m[2].tr[0].r, { timeout: 10000 }).toBe("Sternen");
    expect(fragen).toHaveLength(1);
    expect(fragen[0]).toContain("Restaurant Training 21.10.2026: dein Wert „Sternen“, gespeichert „Rössli“");
    await expect(b.locator("#sync")).toBeHidden();
  });
});
