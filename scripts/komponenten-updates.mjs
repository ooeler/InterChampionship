// Updates für Komponenten, die Dependabot nicht abdeckt (aufgerufen von .github/workflows/komponenten-updates.yml
// und komponenten-pruefen.yml):
//   - npm-Pakete in package.json (dependencies und devDependencies, mit package-lock.json)
//   - npm:-Imports der Edge Functions (supabase/functions/**/*.ts, auch dynamische import("npm:…"))
//   - Container-Images in .github/container-images.json (Playwright passend zu @playwright/test, Semgrep), per Digest gepinnt
// Gleiche Pakete stehen überall auf derselben Version (z. B. @supabase/supabase-js in package.json und in allen Functions).
//
// Befehle (node scripts/komponenten-updates.mjs <befehl>):
//   planen          neueste Versionen ermitteln (wöchentlich) bzw. bekannte Lücken prüfen (täglich, OSV) → Plan als JSON
//   bauen           Plan auf main anwenden, package-lock.json nachführen, je Gruppe einen Commit bauen (nur lokal)
//   veroeffentlichen  Pull Requests anlegen/aktualisieren, Prüfung (komponenten-pruefen.yml) per workflow_dispatch starten
//   regeln          Regelprüfung vor dem automatischen Merge (komponenten-pruefen.yml, Job "regeln", nur Leserechte)
//
// Regeln für eine neue Version:
//   - nur stabile Versionen X.Y.Z, nicht als veraltet markiert, nicht neuer als dist-tags.latest
//   - mindestens MINDESTALTER_TAGE alt – ausser die bisherige Version hat eine bekannte Lücke (OSV): dann sofort die
//     kleinste Version ohne diese Lücken
//   - die neue Version selbst hat keine bekannte Lücke (OSV)
//   - Container: Tag frisch aufgelöst, Digest gepinnt; Playwright-Image = Version von @playwright/test
// Gruppen: "standard" (Patch/Minor, automatischer Merge nach grünen Prüfungen) und "major" (bleibt offen, Label
// manuell-pruefen). Jede Gruppe hat höchstens einen offenen Pull Request; er wird aktualisiert statt doppelt geöffnet.
//
// Sicherheit: Antworten der Registries sind Daten. Versionen müssen ^\d+\.\d+\.\d+$ entsprechen, Digests
// ^sha256:[0-9a-f]{64}$, Branches BRANCH; nichts davon gelangt ungeprüft in Shell-Befehle (git/npm per execFile ohne Shell).

import { readFileSync, writeFileSync, readdirSync, existsSync, appendFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import path from "node:path";

export const MINDESTALTER_TAGE = 7;
export const BOT = "github-actions[bot]";
export const BOT_MAIL = "41898283+github-actions[bot]@users.noreply.github.com";
export const VERSION = /^\d+\.\d+\.\d+$/;
export const DIGEST = /^sha256:[0-9a-f]{64}$/;
export const BRANCH = /^fix\/abhaengigkeiten-(major-)?\d{4}-\d{2}-\d{2}$/;
export const BILDER = ".github/container-images.json";
export const GRUPPEN = ["standard", "major"];
const NPM_NAME = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const OSV_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,80}$/;
const SHA = /^[0-9a-f]{40}$/;
const TAG = 86_400_000;
// npm:-Import in einer Function: "npm:paket@1.2.3" oder "npm:paket@1.2.3/unterpfad"
const NPM_IMPORT = /(["'])npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@([^"'/\s]*)((?:\/[^"'\s]*)?)\1/g;

// Container: Muster der Einträge in .github/container-images.json
export const BILD = {
  playwright: {
    muster: /^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@(sha256:[0-9a-f]{64})$/,
    bild: (v, d) => `mcr.microsoft.com/playwright:v${v}-noble@${d}`,
    paket: "@playwright/test",
    notizen: (v) => `https://github.com/microsoft/playwright/releases/tag/v${v}`,
  },
  semgrep: {
    muster: /^semgrep\/semgrep:(\d+\.\d+\.\d+)@(sha256:[0-9a-f]{64})$/,
    bild: (v, d) => `semgrep/semgrep:${v}@${d}`,
    github: "semgrep/semgrep",
    notizen: (v) => `https://github.com/semgrep/semgrep/releases/tag/v${v}`,
  },
};

class Abgelehnt extends Error {}
const nein = (regel, text) => { throw new Abgelehnt(`Regel ${regel}: ${text}`); };

// ---------- Versionen ----------
const teile = (v) => v.split(".").map(Number);
export function vergleiche(a, b) {
  const A = teile(a), B = teile(b);
  for (let i = 0; i < 3; i++) if (A[i] !== B[i]) return A[i] - B[i];
  return 0;
}
const max = (a, b) => (!a ? b : !b ? a : vergleiche(a, b) >= 0 ? a : b);
// Art des Updates nach SemVer (bei 0.x zählt ein Minor-Sprung als Major)
export function art(alt, neu) {
  const c = vergleiche(neu, alt);
  if (c === 0) return "gleich";
  if (c < 0) return "zurueck";
  const [a1, a2] = teile(alt), [n1, n2] = teile(neu);
  if (a1 !== n1 || (a1 === 0 && a2 !== n2)) return "major";
  return a2 !== n2 ? "minor" : "patch";
}
const passtZuGruppe = (gruppe, alt, neu) => (gruppe === "major" ? art(alt, neu) === "major" : ["patch", "minor"].includes(art(alt, neu)));

// Stabile Versionen aus dem npm-Dokument: aufsteigend, nicht veraltet, nicht neuer als latest, mit Veröffentlichungszeit
export function stabileVersionen(doc) {
  const latest = doc?.["dist-tags"]?.latest;
  if (!VERSION.test(latest || "")) return [];
  return Object.keys(doc.versions || {})
    .filter((v) => VERSION.test(v) && !doc.versions[v]?.deprecated && vergleiche(v, latest) <= 0)
    .map((v) => ({ v, zeit: Date.parse(doc.time?.[v]) }))
    .filter((x) => Number.isFinite(x.zeit))
    .sort((a, b) => vergleiche(a.v, b.v));
}

// ---------- OSV ----------
// Liegt die Version in einem betroffenen Bereich der Meldung? (SEMVER/ECOSYSTEM-Bereiche und explizite Versionen)
export function betroffen(vuln, name, version) {
  if (!vuln || vuln.withdrawn) return false;
  for (const a of vuln.affected || []) {
    if (a.package?.ecosystem !== "npm" || a.package?.name !== name) continue;
    if ((a.versions || []).includes(version)) return true;
    for (const r of a.ranges || []) {
      if (r.type !== "SEMVER" && r.type !== "ECOSYSTEM") continue;
      const ev = (r.events || []).map((e) => {
        const [typ, wert] = Object.entries(e)[0] || [];
        const w = String(wert ?? "") === "0" ? "0.0.0" : String(wert ?? "").replace(/^v/, "").split(/[-+]/)[0];
        return { typ, w };
      }).filter((e) => VERSION.test(e.w) && ["introduced", "fixed", "last_affected", "limit"].includes(e.typ))
        .sort((x, y) => vergleiche(x.w, y.w));
      let drin = false;
      for (const e of ev) {
        if (e.typ === "introduced" && vergleiche(version, e.w) >= 0) drin = true;
        else if ((e.typ === "fixed" || e.typ === "limit") && vergleiche(version, e.w) >= 0) drin = false;
        else if (e.typ === "last_affected" && vergleiche(version, e.w) > 0) drin = false;
      }
      if (drin) return true;
    }
  }
  return false;
}

// Meldungen (vollständig), die diese Version betreffen: [[name, version], …] → Map "name@version" → [vuln]
export async function luecken(quellen, paare) {
  const R = new Map(paare.map(([n, v]) => [`${n}@${v}`, []]));
  if (!paare.length) return R;
  const antwort = await quellen.osv(paare.map(([name, version]) => ({ package: { name, ecosystem: "npm" }, version })));
  for (let i = 0; i < paare.length; i++) {
    const [n, v] = paare[i];
    for (const { id } of antwort[i]?.vulns || []) {
      if (!OSV_ID.test(id || "")) throw new Error(`OSV: ungültige ID ${String(id).slice(0, 40)}`);
      const d = await quellen.vuln(id);
      if (betroffen(d, n, v)) R.get(`${n}@${v}`).push(d);
    }
  }
  return R;
}

// Kleinste Version ab `start` (einschliesslich), die keine bekannte Lücke hat; `filter` begrenzt die Kandidaten.
// Ergebnis { version, behoben: [ids] } oder null
export async function naechsteSichere(quellen, name, start, versionen, filter = () => true) {
  let v = start;
  const behoben = new Set();
  for (let runde = 0; runde < 8; runde++) {
    const L = (await luecken(quellen, [[name, v]])).get(`${name}@${v}`);
    if (!L.length) return { version: v, behoben: [...behoben] };
    for (const d of L) behoben.add(d.id);
    const k = versionen.find((x) => vergleiche(x.v, v) > 0 && filter(x.v) && !L.some((d) => betroffen(d, name, x.v)));
    if (!k) return null;
    v = k.v;
  }
  return null;
}

// ---------- Dateien lesen und schreiben ----------
// dateien: { "package.json": text, "package-lock.json": text, ".github/container-images.json": text, "supabase/functions/…ts": text }
export function komponentenLesen(dateien) {
  const npm = {}, fehler = [];
  const ort = (name, version, datei) => {
    if (!NPM_NAME.test(name)) return fehler.push(`${datei}: Paketname ${name} ungültig`);
    if (!VERSION.test(version)) return fehler.push(`${datei}: ${name}@${version} ist keine feste Version X.Y.Z`);
    (npm[name] ??= { versionen: new Set(), orte: [] }).versionen.add(version);
    if (!npm[name].orte.includes(datei)) npm[name].orte.push(datei);
  };
  const pkg = JSON.parse(dateien["package.json"]);
  for (const feld of ["dependencies", "devDependencies"]) for (const [n, v] of Object.entries(pkg[feld] || {})) ort(n, String(v), "package.json");
  for (const [datei, text] of Object.entries(dateien)) {
    if (!/^supabase\/functions\/.+\.ts$/.test(datei)) continue;
    for (const m of text.matchAll(NPM_IMPORT)) ort(m[2], m[3], datei);
  }
  const bilder = {};
  if (dateien[BILDER] !== undefined) {
    const b = JSON.parse(dateien[BILDER]);
    for (const [k, d] of Object.entries(BILD)) {
      const m = String(b[k] ?? "").match(d.muster);
      if (!m) fehler.push(`${BILDER}: ${k} fehlt oder hat nicht die Form ${d.bild("X.Y.Z", "sha256:…")}`);
      else bilder[k] = { version: m[1], digest: m[2] };
    }
    for (const k of Object.keys(b)) if (!BILD[k]) fehler.push(`${BILDER}: unbekannter Eintrag ${k}`);
  }
  const R = {};
  for (const [n, x] of Object.entries(npm)) {
    const v = [...x.versionen].sort(vergleiche);
    R[n] = { version: v[v.length - 1], uneinheitlich: v.length > 1, orte: x.orte };
  }
  return { npm: R, bilder, fehler };
}

// Ziel-Versionen in die Dateien schreiben; nur Versionen (und Digests) ändern sich, alles andere bleibt Byte für Byte.
// ziel: { npm: { name: version }, bilder: { playwright: { version, digest } } } → geänderte Dateien { pfad: text }
export function anwenden(dateien, ziel) {
  const neu = {};
  const npm = ziel.npm || {};
  for (const [n, v] of Object.entries(npm)) {
    if (!NPM_NAME.test(n) || !VERSION.test(v)) throw new Error(`Ungültiges Ziel ${n}@${v}`);
  }
  // package.json: nur der Versions-String in dependencies/devDependencies
  let pkg = dateien["package.json"];
  const vorher = JSON.parse(pkg);
  for (const [n, v] of Object.entries(npm)) {
    const feld = ["dependencies", "devDependencies"].find((f) => vorher[f]?.[n] !== undefined);
    if (!feld) continue;
    const re = new RegExp(`("${n.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&")}"\\s*:\\s*")(\\d+\\.\\d+\\.\\d+)(")`, "g");
    if ((pkg.match(re) || []).length !== 1) throw new Error(`package.json: ${n} nicht eindeutig gefunden`);
    pkg = pkg.replace(re, `$1${v}$3`);
  }
  // Gegenprobe: ausser den Versionen ist package.json unverändert
  const nachher = JSON.parse(pkg);
  for (const f of ["dependencies", "devDependencies"]) for (const n of Object.keys(vorher[f] || {})) if (npm[n] && vorher[f][n]) vorher[f][n] = npm[n];
  if (JSON.stringify(vorher) !== JSON.stringify(nachher)) throw new Error("package.json: unerwartete Änderung");
  if (pkg !== dateien["package.json"]) neu["package.json"] = pkg;
  // Functions: nur die Version im npm:-Import
  for (const [datei, text] of Object.entries(dateien)) {
    if (!/^supabase\/functions\/.+\.ts$/.test(datei)) continue;
    const t = text.replace(NPM_IMPORT, (ganz, q, n, v, rest) => (npm[n] ? `${q}npm:${n}@${npm[n]}${rest}${q}` : ganz));
    if (t !== text) neu[datei] = t;
  }
  // Container-Images
  if (ziel.bilder && Object.keys(ziel.bilder).length) {
    const b = JSON.parse(dateien[BILDER]);
    for (const [k, z] of Object.entries(ziel.bilder)) {
      if (!BILD[k] || !VERSION.test(z.version) || !DIGEST.test(z.digest)) throw new Error(`Ungültiges Image-Ziel ${k}`);
      b[k] = BILD[k].bild(z.version, z.digest);
    }
    const t = JSON.stringify(b, null, 2) + "\n";
    if (t !== dateien[BILDER]) neu[BILDER] = t;
  }
  return neu;
}

// package-lock.json passt zu package.json und bezieht alles aus der npm-Registry
export function lockPruefen(pkgText, lockText) {
  const pkg = JSON.parse(pkgText), lock = JSON.parse(lockText);
  const wurzel = lock.packages?.[""];
  if (!wurzel) return "package-lock.json ohne Wurzel-Eintrag";
  for (const f of ["dependencies", "devDependencies"]) {
    const sortiert = (o) => JSON.stringify(Object.entries(o || {}).sort(([a], [b]) => (a < b ? -1 : 1)));
    if (sortiert(wurzel[f]) !== sortiert(pkg[f])) return `package-lock.json: ${f} passen nicht zu package.json`;
    for (const [n, v] of Object.entries(pkg[f] || {})) {
      if (lock.packages[`node_modules/${n}`]?.version !== v) return `package-lock.json: ${n} ist nicht ${v}`;
    }
  }
  for (const [p, e] of Object.entries(lock.packages)) {
    if (p === "" || e.link) continue;
    if (!String(e.resolved || "").startsWith("https://registry.npmjs.org/") || !/^sha512-/.test(e.integrity || "")) return `package-lock.json: ${p} nicht aus der npm-Registry (resolved/integrity)`;
  }
  return null;
}

// Link zu den Release Notes (GitHub-Repository aus dem npm-Dokument, sonst die npm-Seite der Version)
export function notizenLink(doc, name, v) {
  const url = typeof doc?.repository === "string" ? doc.repository : doc?.repository?.url || "";
  const m = String(url).match(/github\.com[/:]([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?$/);
  if (m) return `https://github.com/${m[1]}/${m[2]}/releases/tag/v${v}`;
  return `https://www.npmjs.com/package/${name}/v/${v}`;
}

// ---------- Planen ----------
// modus: "woechentlich" (neueste Versionen ≥ 7 Tage + Lücken) oder "sicherheit" (nur Lücken; offene PRs behalten ihre Versionen)
// behalten: { standard: { npm: {…}, bilder: { semgrep: "1.2.3" } }, major: {…} } – Versionen eines offenen PRs
export async function planen({ dateien, modus, behalten = {}, quellen, jetzt = Date.now() }) {
  const k = komponentenLesen(dateien);
  if (k.fehler.length) throw new Error(k.fehler.join("; "));
  const grenze = jetzt - MINDESTALTER_TAGE * TAG;
  const gruppen = { standard: [], major: [] }, befunde = [], hinweise = [];
  const alterTage = (t) => Math.floor((jetzt - t) / TAG);
  const namen = Object.keys(k.npm).sort();
  const aktuell = await luecken(quellen, namen.map((n) => [n, k.npm[n].version]));

  for (const name of namen) {
    const alt = k.npm[name].version;
    if (k.npm[name].uneinheitlich) hinweise.push(`${name}: uneinheitliche Versionen, wird überall auf eine Version gesetzt`);
    const doc = await quellen.npm(name);
    const versionen = stabileVersionen(doc);
    if (!versionen.length) { hinweise.push(`${name}: keine Versionen in der Registry gefunden`); continue; }
    const L = aktuell.get(`${name}@${alt}`);
    let fix = null;
    if (L.length) {
      fix = await naechsteSichere(quellen, name, alt, versionen);
      befunde.push({ paket: name, version: alt, ids: L.map((d) => d.id), behoben: fix?.version || null });
      if (!fix) hinweise.push(`${name}@${alt}: bekannte Lücke ohne behobene Version`);
    }
    for (const gruppe of GRUPPEN) {
      const passt = (v) => passtZuGruppe(gruppe, alt, v);
      // Kandidaten absteigend: wöchentlich die neueste ≥ 7 Tage alte Version, die Version eines offenen PRs, die Sicherheits-Version
      const kandidaten = [];
      if (modus === "woechentlich") kandidaten.push(...versionen.filter((x) => passt(x.v) && x.zeit <= grenze).map((x) => x.v).reverse());
      const b = behalten[gruppe]?.npm?.[name];
      if (VERSION.test(b || "") && passt(b) && versionen.some((x) => x.v === b)) kandidaten.push(b);
      if (fix && passt(fix.version)) kandidaten.push(fix.version);
      const sortiert = [...new Set(kandidaten)].sort((x, y) => vergleiche(y, x));
      let gewaehlt = null;
      for (const z of sortiert.slice(0, 6)) {
        // die gewählte Version selbst ohne bekannte Lücke (sonst die nächste sichere in derselben Gruppe)
        const s = await naechsteSichere(quellen, name, z, versionen, passt);
        if (!s) continue;
        let digest = null;
        if (name === BILD.playwright.paket) {
          digest = await quellen.digest("playwright", s.version);
          if (!DIGEST.test(digest || "")) { hinweise.push(`Playwright-Image v${s.version}-noble fehlt (noch)`); continue; }
        }
        gewaehlt = { v: s.version, digest };
        break;
      }
      if (!gewaehlt) continue;
      const z = gewaehlt.v, zeit = versionen.find((x) => x.v === z).zeit;
      const behoben = L.filter((d) => !betroffen(d, name, z)).map((d) => d.id);
      gruppen[gruppe].push({
        typ: "npm", name, alt, neu: z, art: art(alt, z), veroeffentlicht: new Date(zeit).toISOString(), alterTage: alterTage(zeit),
        sicherheit: behoben, notizen: notizenLink(doc, name, z), orte: k.npm[name].orte,
      });
      if (gewaehlt.digest) {
        gruppen[gruppe].push({
          typ: "container", name: "playwright", alt: k.bilder.playwright.version, neu: z, art: art(k.bilder.playwright.version, z),
          digest: gewaehlt.digest, veroeffentlicht: new Date(zeit).toISOString(), alterTage: alterTage(zeit), sicherheit: [],
          notizen: BILD.playwright.notizen(z), orte: [BILDER],
        });
      }
    }
  }

  // Semgrep: Version und Alter aus den GitHub-Releases, Digest frisch aus der Registry
  const sg = k.bilder.semgrep;
  if (sg && (modus === "woechentlich" || GRUPPEN.some((g) => behalten[g]?.bilder?.semgrep))) {
    let rel = [];
    try { rel = await quellen.releases(BILD.semgrep.github); } catch (e) { hinweise.push(`Semgrep-Releases nicht lesbar (${e.message})`); }
    const stabil = rel.map((r) => ({ v: String(r.tag_name || "").replace(/^v/, ""), zeit: Date.parse(r.published_at), ok: !r.draft && !r.prerelease }))
      .filter((r) => r.ok && VERSION.test(r.v) && /^v?\d+\.\d+\.\d+$/.test(r.v) && Number.isFinite(r.zeit))
      .sort((a, b) => vergleiche(b.v, a.v));
    for (const gruppe of GRUPPEN) {
      const passt = (v) => passtZuGruppe(gruppe, sg.version, v);
      const b = behalten[gruppe]?.bilder?.semgrep;
      const kand = stabil.filter((r) => passt(r.v) && ((modus === "woechentlich" && r.zeit <= grenze) || r.v === b));
      for (const r of kand.slice(0, 5)) {
        const digest = await quellen.digest("semgrep", r.v);
        if (!DIGEST.test(digest || "")) continue;
        gruppen[gruppe].push({
          typ: "container", name: "semgrep", alt: sg.version, neu: r.v, art: art(sg.version, r.v), digest,
          veroeffentlicht: new Date(r.zeit).toISOString(), alterTage: alterTage(r.zeit), sicherheit: [], notizen: BILD.semgrep.notizen(r.v), orte: [BILDER],
        });
        break;
      }
    }
  }
  return { modus, gruppen, befunde, hinweise };
}

// Ziel-Versionen einer Gruppe für anwenden()
export function zielAus(updates) {
  const ziel = { npm: {}, bilder: {} };
  for (const u of updates) {
    if (u.typ === "npm") ziel.npm[u.name] = u.neu;
    else ziel.bilder[u.name] = { version: u.neu, digest: u.digest };
  }
  return ziel;
}

// Plan aus einem vorherigen Job (Job-Ausgabe) streng prüfen, bevor er verwendet wird
export function planPruefen(text) {
  const p = JSON.parse(text);
  const fehler = (t) => { throw new Error(`Plan ungültig: ${t}`); };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p.datum || "")) fehler("datum");
  if (!["woechentlich", "sicherheit"].includes(p.modus)) fehler("modus");
  for (const g of GRUPPEN) {
    const G = p.gruppen?.[g];
    if (!G || !BRANCH.test(G.branch || "") || /-major-/.test(G.branch) !== (g === "major")) fehler(`${g}: branch`);
    if (G.pr !== null && !(Number.isInteger(G.pr) && G.pr > 0)) fehler(`${g}: pr`);
    if (!Array.isArray(G.updates)) fehler(`${g}: updates`);
    for (const u of G.updates) {
      if (u.typ === "npm" ? !NPM_NAME.test(u.name || "") : !(u.typ === "container" && BILD[u.name])) fehler(`${g}: Komponente`);
      if (!VERSION.test(u.alt || "") || !VERSION.test(u.neu || "")) fehler(`${g}: Version ${u.name}`);
      if (!passtZuGruppe(g, u.alt, u.neu)) fehler(`${g}: Art ${u.name}`);
      if (u.typ === "container" && !DIGEST.test(u.digest || "")) fehler(`${g}: Digest ${u.name}`);
      if (!(u.sicherheit || []).every((i) => OSV_ID.test(i))) fehler(`${g}: OSV-ID`);
      if (!/^https:\/\/(github\.com|www\.npmjs\.com)\/[A-Za-z0-9_.@/%-]+$/.test(u.notizen || "")) fehler(`${g}: Link ${u.name}`);
      if (!Number.isInteger(u.alterTage)) fehler(`${g}: Alter ${u.name}`);
    }
  }
  return p;
}

// ---------- Texte ----------
const ART = { patch: "Patch", minor: "Minor", major: "**Major**" };
export const MARKE = (g) => `<!-- komponenten-updates:${g} -->`;
export function titel(gruppe, updates) {
  const sich = updates.some((u) => u.sicherheit.length);
  const namen = [...new Set(updates.map((u) => (u.typ === "npm" ? u.name : `${u.name}-Image`)))];
  const kurz = namen.length <= 3 ? namen.join(", ") : `${namen.length} Komponenten`;
  return `${sich ? "Sicherheit: " : ""}${gruppe === "major" ? "Major-Update prüfen" : "Abhängigkeiten aktualisieren"}: ${kurz}`;
}
export function beschreibung(gruppe, updates, hinweise = []) {
  const ortKurz = (u) => {
    const fn = u.orte.filter((o) => o.startsWith("supabase/functions/")).length;
    return [u.orte.includes("package.json") ? "package.json" : "", fn ? `${fn} Function-Datei${fn > 1 ? "en" : ""}` : "", u.orte.includes(BILDER) ? "CI-Container" : ""].filter(Boolean).join(", ");
  };
  const zeilen = updates.map((u) => {
    const sich = u.sicherheit.length ? u.sicherheit.map((i) => `[${i}](https://osv.dev/vulnerability/${i})`).join(", ") : "–";
    const name = u.typ === "npm" ? `\`${u.name}\`` : `\`${u.name}\` (Image${u.digest ? `, \`${u.digest.slice(0, 19)}…\`` : ""})`;
    return `| ${name} | ${ortKurz(u)} | ${u.alt} → **${u.neu}** | ${ART[u.art] || u.art} | ${u.alterTage} Tage | ${sich} | [Release Notes](${u.notizen}) |`;
  });
  const T = [
    MARKE(gruppe),
    "Automatisches Update von Komponenten, die Dependabot nicht abdeckt (Workflow **Komponenten-Updates**, Regeln in `scripts/komponenten-updates.mjs`).",
    "",
    "| Komponente | Ort | alt → neu | Art | Alter | Behobene Lücken (OSV) | Release Notes |",
    "|---|---|---|---|---|---|---|",
    ...zeilen,
    "",
  ];
  if (gruppe === "major") {
    T.push("**Major-Update – wird nicht automatisch gemergt.** Bitte die Release Notes auf inkompatible Änderungen prüfen.",
      "Zum Mergen: *Actions → Komponenten prüfen → Run workflow*, Branch dieses Pull Requests wählen, PR-Nummer eintragen und *major_freigeben* ankreuzen. Danach wird nach grünen Prüfungen gemergt und (bei App/Functions) ein Release ausgeliefert.");
  } else {
    T.push("Die Prüfung (test, e2e, security, CodeQL) startet der Workflow selbst. Sind alle Prüfungen grün und alle Regeln erfüllt, wird automatisch gemergt; ein Release folgt nur, wenn App oder Edge Functions betroffen sind.");
  }
  if (updates.some((u) => u.sicherheit.length)) T.push("", "⚠️ Enthält Sicherheitskorrekturen: die bisherige Version hat bekannte Lücken (OSV), die Wartezeit von 7 Tagen gilt hier nicht.");
  if (hinweise.length) T.push("", "Hinweise:", ...hinweise.map((h) => `- ${h.replace(/[<>`|]/g, "")}`));
  return T.join("\n");
}

// ---------- Quellen (Registries, nur lesend) ----------
const ACCEPT_MANIFEST = "application/vnd.oci.image.index.v1+json, application/vnd.docker.distribution.manifest.list.v2+json, application/vnd.docker.distribution.manifest.v2+json, application/vnd.oci.image.manifest.v1+json";
export function registryQuellen({ token } = {}) {
  const holen = async (url, opt = {}) => {
    const r = await fetch(url, { ...opt, signal: AbortSignal.timeout(60_000) });
    return r;
  };
  const json = async (url, opt) => {
    const r = await holen(url, opt);
    if (!r.ok) throw new Error(`${new URL(url).host}: HTTP ${r.status}`);
    return r.json();
  };
  const cache = new Map();
  const einmal = (k, f) => (cache.has(k) ? cache.get(k) : (cache.set(k, f()), cache.get(k)));
  return {
    npm: (name) => einmal(`npm:${name}`, () => json(`https://registry.npmjs.org/${name.replace("/", "%2f")}`)),
    osv: async (queries) => (await json("https://api.osv.dev/v1/querybatch", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ queries }) })).results || [],
    vuln: (id) => einmal(`osv:${id}`, () => json(`https://api.osv.dev/v1/vulns/${encodeURIComponent(id)}`)),
    digest: async (bild, v) => {
      if (!VERSION.test(v)) return null;
      let url, headers = { Accept: ACCEPT_MANIFEST };
      if (bild === "playwright") url = `https://mcr.microsoft.com/v2/playwright/manifests/v${v}-noble`;
      else if (bild === "semgrep") {
        const t = await json("https://auth.docker.io/token?service=registry.docker.io&scope=repository:semgrep/semgrep:pull");
        headers.Authorization = `Bearer ${t.token}`;
        url = `https://registry-1.docker.io/v2/semgrep/semgrep/manifests/${v}`;
      } else return null;
      const r = await holen(url, { method: "HEAD", headers });
      if (r.status === 404) return null;
      if (!r.ok) throw new Error(`${bild}: HTTP ${r.status}`);
      const d = r.headers.get("docker-content-digest");
      return DIGEST.test(d || "") ? d : null;
    },
    releases: (repo) => json(`https://api.github.com/repos/${repo}/releases?per_page=50`, {
      headers: { Accept: "application/vnd.github+json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    }),
  };
}

// GitHub-REST-API: api(pfad) liest, api(pfad, { method, body }) schreibt; liefert die Antwort (JSON) oder wirft mit .status
export function githubApi(basis, token) {
  return async (pfad, { method = "GET", body } = {}) => {
    const r = await fetch(`${basis}/${pfad}`, {
      method, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(60_000),
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!r.ok) { const e = new Error(`${method} ${pfad.split("?")[0]}: HTTP ${r.status}`); e.status = r.status; e.text = (await r.text()).slice(0, 300); throw e; }
    return r.status === 204 ? null : r.json();
  };
}

// ---------- Git (ohne Shell) ----------
export const gitIn = (cwd) => (...args) => execFileSync("git", args, { cwd, encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] }).replace(/\n$/, "");
// Verwaltete Dateien eines Stands lesen (Arbeitsverzeichnis oder Commit)
export function dateienLesen({ git, ref, cwd = "." }) {
  const pfade = ref
    ? git("ls-tree", "-r", "--name-only", ref, "--", "package.json", "package-lock.json", BILDER, "supabase/functions").split("\n").filter(Boolean)
    : ["package.json", "package-lock.json", BILDER, ...walk(path.join(cwd, "supabase/functions")).map((p) => path.relative(cwd, p).split(path.sep).join("/"))];
  const D = {};
  for (const p of pfade) {
    if (!(p === "package.json" || p === "package-lock.json" || p === BILDER || /^supabase\/functions\/.+\.ts$/.test(p))) continue;
    if (ref) D[p] = git("show", `${ref}:${p}`) + "\n";
    else if (existsSync(path.join(cwd, p))) D[p] = readFileSync(path.join(cwd, p), "utf8");
  }
  return D;
}
function walk(d) {
  if (!existsSync(d)) return [];
  return readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
}
// git show schneidet den letzten Zeilenumbruch ab (gitIn) – für den Byte-Vergleich wieder gleich behandeln
const gleich = (a, b) => (a ?? "").replace(/\n$/, "") === (b ?? "").replace(/\n$/, "");

// Offene Pull Requests des Workflows je Gruppe
export async function offenePrs(api, repo) {
  const R = { standard: [], major: [] };
  for (let s = 1; s <= 10; s++) {
    const seite = await api(`repos/${repo}/pulls?state=open&per_page=100&page=${s}`);
    for (const p of seite) {
      if (p.user?.login !== BOT || p.head?.repo?.full_name !== repo || !BRANCH.test(p.head?.ref || "") || p.base?.ref !== "main") continue;
      R[p.head.ref.includes("-major-") ? "major" : "standard"].push({ nummer: p.number, branch: p.head.ref, sha: p.head.sha });
    }
    if (seite.length < 100) break;
  }
  for (const g of GRUPPEN) R[g].sort((a, b) => a.nummer - b.nummer);
  return R;
}

// Versionen eines offenen PRs (zum Behalten bei der täglichen Sicherheitsprüfung)
export function versionenAus(dateien) {
  const k = komponentenLesen(dateien);
  return { npm: Object.fromEntries(Object.entries(k.npm).map(([n, x]) => [n, x.version])), bilder: Object.fromEntries(Object.entries(k.bilder).map(([n, x]) => [n, x.version])) };
}

// ---------- Bauen: Plan auf main anwenden, ein Commit je Gruppe ----------
export function bauen({ plan, git, cwd = ".", npmLock, schreiben = (p, t) => writeFileSync(path.join(cwd, p), t), lesen }) {
  const basis = git("rev-parse", "HEAD");
  const ergebnis = {}, push = [];
  for (const g of GRUPPEN) {
    const G = plan.gruppen[g];
    if (!G.updates.length) { ergebnis[g] = { status: "leer", sha: "" }; continue; }
    git("checkout", "-q", "--detach", basis);
    const dateien = lesen();
    // Plan gegen den aktuellen Stand prüfen: hat sich main inzwischen geändert, wird diese Gruppe übersprungen
    const k = komponentenLesen(dateien);
    const veraltet = G.updates.filter((u) => (u.typ === "npm" ? k.npm[u.name]?.version : k.bilder[u.name]?.version) !== u.alt);
    if (veraltet.length) { ergebnis[g] = { status: "veraltet", sha: "" }; continue; }
    const neu = anwenden(dateien, zielAus(G.updates));
    for (const [p, t] of Object.entries(neu)) schreiben(p, t);
    if (neu["package.json"]) npmLock();
    const lock = lesen();
    const f = lockPruefen(lock["package.json"], lock["package-lock.json"]);
    if (f) throw new Error(f);
    git("add", "--", "package.json", "package-lock.json", BILDER, "supabase/functions");
    const msg = `${titel(g, G.updates)}\n\n${G.updates.map((u) => `- ${u.typ === "npm" ? u.name : `${u.name} (Image)`}: ${u.alt} → ${u.neu}${u.sicherheit.length ? ` (behebt ${u.sicherheit.join(", ")})` : ""}`).join("\n")}\n`;
    git("-c", `user.name=${BOT}`, "-c", `user.email=${BOT_MAIL}`, "commit", "-q", "-m", msg);
    let sha = git("rev-parse", "HEAD");
    // vorhandener Branch: nur ersetzen, wenn er ausschliesslich Commits des Workflows enthält
    let alt = "";
    try { git("fetch", "-q", "origin", `+refs/heads/${G.branch}:refs/remotes/origin/${G.branch}`); alt = git("rev-parse", `refs/remotes/origin/${G.branch}`); } catch { alt = ""; }
    let status = "neu";
    if (alt) {
      const autoren = git("log", "--format=%ae %ce", `${basis}..${alt}`).split("\n").filter(Boolean);
      if (autoren.some((a) => a !== `${BOT_MAIL} ${BOT_MAIL}`)) status = "fremd";
      else if (git("rev-parse", `${alt}^{tree}`) === git("rev-parse", `${sha}^{tree}`) && isAncestor(git, basis, alt)) { status = "gleich"; sha = alt; }
    }
    if (!SHA.test(sha) || (alt && !SHA.test(alt))) throw new Error("unerwarteter Commit-Hash");
    if (status === "neu") push.push(`${G.branch}=${sha}=${alt}`);
    ergebnis[g] = { status, sha: status === "fremd" ? "" : sha };
  }
  git("checkout", "-q", "--detach", basis);
  return { ergebnis, push };
}
function isAncestor(git, a, b) {
  try { git("merge-base", "--is-ancestor", a, b); return true; } catch { return false; }
}

// ---------- Veröffentlichen: PR anlegen/aktualisieren, Prüfung starten ----------
export const LABELS = { abhaengigkeiten: "0366d6", "manuell-pruefen": "d93f0b", sicherheit: "b60205" };
export async function veroeffentlichen({ plan, ergebnis, api, repo, log = console.log }) {
  const aktionen = [];
  const label = async (nr, namen) => {
    for (const n of namen) {
      try { await api(`repos/${repo}/labels`, { method: "POST", body: { name: n, color: LABELS[n] } }); } catch (e) { if (e.status !== 422) log(`::warning::Label ${n}: ${e.message}`); }
    }
    await api(`repos/${repo}/issues/${nr}/labels`, { method: "POST", body: { labels: namen } });
  };
  for (const g of GRUPPEN) {
    const G = plan.gruppen[g], E = ergebnis[g] || { status: "leer" };
    if (E.status === "leer") {
      if (G.pr) {
        await api(`repos/${repo}/issues/${G.pr}/comments`, { method: "POST", body: { body: "Keine Updates mehr nötig (main ist aktuell) – der Workflow schliesst diesen Pull Request." } });
        await api(`repos/${repo}/pulls/${G.pr}`, { method: "PATCH", body: { state: "closed" } });
        aktionen.push(`${g}: PR #${G.pr} geschlossen`);
      }
      continue;
    }
    if (E.status === "fremd" || E.status === "veraltet") {
      log(`::notice::${g}: Branch ${G.branch} ${E.status === "fremd" ? "enthält fremde Commits – wird nicht überschrieben" : "– main hat sich während des Laufs geändert, nächster Lauf"}`);
      aktionen.push(`${g}: ${E.status}`);
      continue;
    }
    const body = beschreibung(g, G.updates, plan.hinweise || []), title = titel(g, G.updates);
    let nr = G.pr, neu = false;
    if (nr) await api(`repos/${repo}/pulls/${nr}`, { method: "PATCH", body: { title, body } });
    else {
      try {
        nr = (await api(`repos/${repo}/pulls`, { method: "POST", body: { title, body, head: G.branch, base: "main" } })).number;
        neu = true;
      } catch (e) {
        if (e.status !== 403 && e.status !== 422) throw e;
        // z. B. "GitHub Actions is not permitted to create or approve pull requests" (Repository-Einstellung)
        log(`::warning::Pull Request für ${G.branch} konnte nicht erstellt werden (${e.message}). Siehe SECURITY.md (Komponenten-Updates).`);
        await hinweisIssue({ api, repo, gruppe: g, branch: G.branch, title, grund: e.text || e.message });
        aktionen.push(`${g}: Issue statt PR`);
        continue;
      }
    }
    const namen = ["abhaengigkeiten", ...(g === "major" ? ["manuell-pruefen"] : []), ...(G.updates.some((u) => u.sicherheit.length) ? ["sicherheit"] : [])];
    await label(nr, namen);
    if (E.status === "neu" || neu) {
      // GITHUB_TOKEN löst keine pull_request-Workflows aus – die Prüfung läuft per workflow_dispatch auf dem Branch
      await api(`repos/${repo}/actions/workflows/komponenten-pruefen.yml/dispatches`, { method: "POST", body: { ref: G.branch, inputs: { pr: String(nr) } } });
      aktionen.push(`${g}: PR #${nr} ${neu ? "erstellt" : "aktualisiert"}, Prüfung gestartet`);
    } else aktionen.push(`${g}: PR #${nr} unverändert`);
  }
  return aktionen;
}
async function hinweisIssue({ api, repo, gruppe, branch, title, grund }) {
  const kopf = "Komponenten-Updates: Pull Request konnte nicht erstellt werden";
  const offen = await api(`repos/${repo}/issues?state=open&creator=${encodeURIComponent(BOT)}&per_page=100`);
  if (offen.some((i) => i.title === kopf && !i.pull_request)) return;
  const body = [
    `Der Workflow **Komponenten-Updates** hat den Branch \`${branch}\` (${gruppe}: ${title.replace(/[<>`]/g, "")}) gepusht, konnte aber keinen Pull Request erstellen.`,
    "",
    `Antwort von GitHub: \`${String(grund).replace(/[`\r\n]/g, " ").slice(0, 200)}\``,
    "",
    "Vermutlich ist *Settings → Actions → General → Workflow permissions → Allow GitHub Actions to create and approve pull requests* ausgeschaltet. Nach dem Einschalten erstellt der nächste Lauf den Pull Request (oder *Actions → Komponenten-Updates → Run workflow*).",
    "",
    `Alternativ von Hand: https://github.com/${repo}/compare/main...${branch} – Achtung: ein von Hand erstellter \`fix/\`-PR wird von auto-merge.yml nach grünen Tests gemergt, auch bei Major-Updates.`,
  ].join("\n");
  await api(`repos/${repo}/issues`, { method: "POST", body: { title: kopf, body } });
}

// ---------- Regelprüfung vor dem Merge (komponenten-pruefen.yml) ----------
// Ergebnis { ergebnis: ok | hinter-main | abgelehnt, grund, release: ja | nein, pr }
//   1. PR vom Workflow (github-actions[bot]) aus diesem Repository nach main, Branch fix/abhaengigkeiten-…, offen, kein Entwurf,
//      Kopf = geprüfter Stand; alle Commits von github-actions[bot]
//   2. Geändert sind nur package.json, package-lock.json, .github/container-images.json, supabase/functions/**/*.ts – und
//      darin nur Versionen (Gegenprobe: anwenden(alt, neue Versionen) ergibt genau die neuen Dateien); Lockfile passt dazu
//   3. Kein Major-Update (ausser von einer Person freigegeben: major_freigeben), keine Rückstufung
//   4. Neue npm-Versionen: stabil, nicht veraltet, ≤ latest, ohne bekannte Lücke; mindestens 7 Tage alt oder die alte
//      Version hat eine bekannte Lücke (OSV), die die neue behebt
//   5. Container: Playwright-Image = @playwright/test; Digest = frisch aufgelöster Digest des Tags; Semgrep-Release ≥ 7 Tage
//   6. Gleiche Pakete überall gleiche Version
export async function regelnPruefen({ env, api, git, quellen, jetzt = Date.now() }) {
  const R = env.GITHUB_REPOSITORY, PR = env.PR, KOPF = env.KOPF;
  try {
    if (!/^\d+$/.test(PR || "") || !SHA.test(KOPF || "")) nein(1, "PR-Nummer oder Commit fehlt");
    const pr = await api(`repos/${R}/pulls/${PR}`);
    if (pr.user?.login !== BOT) nein(1, `PR von ${pr.user?.login}, nicht vom Workflow`);
    if (pr.head?.repo?.full_name !== R) nein(1, "PR kommt nicht aus diesem Repository");
    if (pr.state !== "open" || pr.draft) nein(1, "PR ist nicht offen oder ein Entwurf");
    if (pr.base?.ref !== "main") nein(1, `Ziel ist ${pr.base?.ref}, nicht main`);
    if (!BRANCH.test(pr.head?.ref || "") || pr.head.ref !== env.REF) nein(1, `Branch ${pr.head?.ref} passt nicht (Lauf auf ${env.REF})`);
    if (pr.head?.sha !== KOPF) nein(1, "PR hat inzwischen einen neueren Commit");
    const major = pr.head.ref.includes("-major-");
    const freigabe = env.FREIGABE === "true" && env.AUSLOESER && env.AUSLOESER !== BOT;

    git("fetch", "-q", "origin", KOPF);
    const mb = git("merge-base", "HEAD", KOPF);
    const hinter = Number(git("rev-list", "--count", `${KOPF}..HEAD`));
    const autoren = git("log", "--format=%ae %ce", `${mb}..${KOPF}`).split("\n").filter(Boolean);
    if (!autoren.length) nein(1, "keine Commits");
    if (autoren.some((a) => a !== `${BOT_MAIL} ${BOT_MAIL}`)) nein(1, "nicht alle Commits vom Workflow");

    // ---- Regel 2: nur Versionen geändert ----
    const geaendert = git("diff", "--name-only", mb, KOPF).split("\n").filter(Boolean);
    const erlaubt = (f) => f === "package.json" || f === "package-lock.json" || f === BILDER || (/^supabase\/functions\/[A-Za-z0-9_./-]+\.ts$/.test(f) && !f.includes(".."));
    for (const f of geaendert) if (!erlaubt(f)) nein(2, `andere Datei geändert: ${f}`);
    if (!geaendert.length) nein(2, "keine Änderung");
    const alt = dateienLesen({ git, ref: mb }), neu = dateienLesen({ git, ref: KOPF });
    if (Object.keys(alt).filter((p) => p !== "package-lock.json").sort().join() !== Object.keys(neu).filter((p) => p !== "package-lock.json").sort().join()) nein(2, "Dateien hinzugefügt oder entfernt");
    const ka = komponentenLesen(alt), kn = komponentenLesen(neu);
    if (kn.fehler.length) nein(2, kn.fehler.join("; "));
    if (Object.values(kn.npm).some((x) => x.uneinheitlich)) nein(6, "ein Paket hat an verschiedenen Orten verschiedene Versionen");
    const ziel = { npm: {}, bilder: {} };
    for (const [n, x] of Object.entries(kn.npm)) if (ka.npm[n]?.version !== x.version) ziel.npm[n] = x.version;
    for (const [n, x] of Object.entries(kn.bilder)) if (ka.bilder[n]?.version !== x.version || ka.bilder[n]?.digest !== x.digest) ziel.bilder[n] = x;
    const erwartet = { ...alt, ...anwenden(alt, ziel) };
    for (const p of Object.keys(neu)) if (p !== "package-lock.json" && !gleich(erwartet[p], neu[p])) nein(2, `${p}: Änderung ausserhalb der Versionen`);
    if (geaendert.includes("package-lock.json") || geaendert.includes("package.json")) {
      const f = lockPruefen(neu["package.json"], neu["package-lock.json"]);
      if (f) nein(2, f);
    }
    if (!Object.keys(ziel.npm).length && !Object.keys(ziel.bilder).length) nein(2, "keine Version geändert");

    // ---- Regeln 3 und 4: npm ----
    const grenze = jetzt - MINDESTALTER_TAGE * TAG;
    const paare = Object.keys(ziel.npm).flatMap((n) => [[n, ka.npm[n]?.version], [n, ziel.npm[n]]]).filter(([, v]) => v);
    const L = await luecken(quellen, paare);
    for (const [n, v] of Object.entries(ziel.npm)) {
      const a = ka.npm[n]?.version;
      if (!a) nein(2, `${n} ist neu`);
      const t = art(a, v);
      if (t === "zurueck") nein(3, `${n}: Rückstufung ${a} → ${v}`);
      if (t === "major" && !(major && freigabe)) nein(3, `${n}: Major-Update ${a} → ${v} (nur nach Freigabe)`);
      if (t !== "major" && major) nein(3, `${n}: Patch/Minor gehört nicht in den Major-Branch`);
      const vs = stabileVersionen(await quellen.npm(n));
      const x = vs.find((y) => y.v === v);
      if (!x) nein(4, `${n}@${v} ist keine stabile, nicht veraltete Version ≤ latest`);
      if (L.get(`${n}@${v}`).length) nein(4, `${n}@${v} hat bekannte Lücken (${L.get(`${n}@${v}`).map((d) => d.id).join(", ")})`);
      const sicherheit = L.get(`${n}@${a}`).length > 0;
      if (x.zeit > grenze && !sicherheit) nein(4, `${n}@${v} ist jünger als ${MINDESTALTER_TAGE} Tage und behebt keine bekannte Lücke`);
    }

    // ---- Regel 5: Container ----
    const pw = kn.npm[BILD.playwright.paket]?.version;
    if (pw && kn.bilder.playwright?.version !== pw) nein(5, `Playwright-Image ${kn.bilder.playwright?.version} passt nicht zu @playwright/test ${pw}`);
    for (const [n, x] of Object.entries(ziel.bilder)) {
      const a = ka.bilder[n]?.version;
      const t = art(a, x.version);
      if (t === "zurueck") nein(3, `${n}-Image: Rückstufung`);
      if (t === "major" && !(major && freigabe)) nein(3, `${n}-Image: Major-Update (nur nach Freigabe)`);
      const d = await quellen.digest(n, x.version);
      if (d !== x.digest) nein(5, `${n}-Image ${x.version}: Digest stimmt nicht mit der Registry überein`);
      if (n === "semgrep") {
        const rel = (await quellen.releases(BILD.semgrep.github)).find((r) => r.tag_name === `v${x.version}` && !r.draft && !r.prerelease);
        if (!rel || !(Date.parse(rel.published_at) <= grenze)) nein(5, `Semgrep ${x.version}: kein Release, das mindestens ${MINDESTALTER_TAGE} Tage alt ist`);
      }
    }

    const release = Object.keys(ziel.npm).some((n) => kn.npm[n].orte.some((o) => o.startsWith("supabase/functions/")) || JSON.parse(neu["package.json"]).dependencies?.[n]) ? "ja" : "nein";
    if (hinter > 0) return { ergebnis: "hinter-main", grund: `Alle Regeln erfüllt, aber der PR liegt ${hinter} Commit(s) hinter main – der nächste Lauf von Komponenten-Updates baut ihn neu`, release, pr: PR };
    return { ergebnis: "ok", grund: `Alle Regeln erfüllt (${Object.keys(ziel.npm).length} Paket(e), ${Object.keys(ziel.bilder).length} Image(s))`, release, pr: PR };
  } catch (e) {
    if (e instanceof Abgelehnt) return { ergebnis: "abgelehnt", grund: e.message, release: "nein", pr: /^\d+$/.test(PR || "") ? PR : "" };
    return { ergebnis: "abgelehnt", grund: `Prüfung fehlgeschlagen: ${e.message}`, release: "nein", pr: /^\d+$/.test(PR || "") ? PR : "" };
  }
}

// ---------- Kommandozeile ----------
function ausgabe(werte) {
  const datei = process.env.GITHUB_OUTPUT;
  for (const [k, v] of Object.entries(werte)) {
    if (/[\r\n]/.test(v)) throw new Error(`Ausgabe ${k} mehrzeilig`);
    if (datei) appendFileSync(datei, `${k}=${v}\n`);
    else console.log(`${k}=${v}`);
  }
}
function zusammenfassung(text) {
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");
  else console.log(text);
}

async function cli(befehl) {
  const env = process.env;
  const api = githubApi(env.GITHUB_API_URL || "https://api.github.com", env.GH_TOKEN);
  const git = gitIn(process.cwd());
  const repo = env.GITHUB_REPOSITORY;
  if (befehl === "planen") {
    const jetzt = Date.now();
    let modus = env.MODUS || "auto";
    if (modus === "auto") modus = new Date(jetzt).getUTCDay() === 1 ? "woechentlich" : "sicherheit";
    if (!["woechentlich", "sicherheit"].includes(modus)) throw new Error(`Modus ${modus} unbekannt`);
    const datum = new Date(jetzt).toISOString().slice(0, 10);
    const offen = repo && env.GH_TOKEN ? await offenePrs(api, repo) : { standard: [], major: [] };
    const behalten = {}, gruppen = {};
    for (const g of GRUPPEN) {
      const pr = offen[g][0];
      if (offen[g].length > 1) console.log(`::warning::Mehrere offene PRs für ${g}: ${offen[g].map((p) => "#" + p.nummer).join(", ")} – verwendet wird #${pr.nummer}`);
      if (pr && modus === "sicherheit") {
        git("fetch", "-q", "--depth=1", "origin", `+refs/heads/${pr.branch}:refs/remotes/origin/${pr.branch}`);
        behalten[g] = versionenAus(dateienLesen({ git, ref: `refs/remotes/origin/${pr.branch}` }));
      }
      gruppen[g] = { branch: pr ? pr.branch : `fix/abhaengigkeiten-${g === "major" ? "major-" : ""}${datum}`, pr: pr ? pr.nummer : null };
    }
    const p = await planen({ dateien: dateienLesen({ git }), modus, behalten, quellen: registryQuellen({ token: env.GH_TOKEN }), jetzt });
    const plan = { datum, modus, gruppen: Object.fromEntries(GRUPPEN.map((g) => [g, { ...gruppen[g], updates: p.gruppen[g] }])), befunde: p.befunde, hinweise: p.hinweise };
    planPruefen(JSON.stringify(plan));
    const aenderung = GRUPPEN.some((g) => plan.gruppen[g].updates.length || plan.gruppen[g].pr);
    zusammenfassung([
      `### Komponenten-Updates (${modus === "woechentlich" ? "wöchentlich: neueste Versionen ≥ 7 Tage + Sicherheit" : "täglich: Sicherheitsprüfung"})`,
      ...p.befunde.map((b) => `- ⚠️ ${b.paket}@${b.version}: ${b.ids.length} bekannte Lücke(n) (${b.ids.join(", ")}) → ${b.behoben ? `behoben in ${b.behoben}` : "keine behobene Version"}`),
      ...GRUPPEN.flatMap((g) => plan.gruppen[g].updates.length ? [`- **${g}** (${plan.gruppen[g].branch}${plan.gruppen[g].pr ? `, PR #${plan.gruppen[g].pr}` : ""}): ${plan.gruppen[g].updates.map((u) => `${u.name} ${u.alt} → ${u.neu}`).join(", ")}`] : [`- ${g}: keine Updates`]),
      ...p.hinweise.map((h) => `- Hinweis: ${h}`),
    ].join("\n"));
    ausgabe({ plan: JSON.stringify(plan), aenderung: aenderung ? "ja" : "nein" });
  } else if (befehl === "bauen") {
    const plan = planPruefen(env.PLAN || "");
    const npmLock = () => execFileSync("npm", ["install", "--package-lock-only", "--ignore-scripts", "--no-audit", "--no-fund"], { stdio: "inherit" }); // ohne Shell (läuft im Linux-Runner)
    const r = bauen({ plan, git, npmLock, lesen: () => dateienLesen({ git }) });
    for (const g of GRUPPEN) console.log(`${g}: ${r.ergebnis[g].status} ${r.ergebnis[g].sha}`);
    ausgabe({ ergebnis: JSON.stringify(r.ergebnis), push: r.push.join(" ") });
  } else if (befehl === "veroeffentlichen") {
    const plan = planPruefen(env.PLAN || "");
    const ergebnis = JSON.parse(env.ERGEBNIS || "{}");
    for (const g of GRUPPEN) {
      const e = ergebnis[g] || { status: "leer" };
      if (!["leer", "neu", "gleich", "fremd", "veraltet"].includes(e.status) || !(e.sha === "" || SHA.test(e.sha || ""))) throw new Error(`Ergebnis ${g} ungültig`);
    }
    for (const a of await veroeffentlichen({ plan, ergebnis, api, repo })) console.log(a);
  } else if (befehl === "regeln") {
    const r = await regelnPruefen({ env, api, git, quellen: registryQuellen({ token: env.GH_TOKEN }) });
    console.log(r.ergebnis === "abgelehnt" ? `::notice::Nicht automatisch gemergt – ${r.grund}` : r.grund);
    ausgabe({ ergebnis: r.ergebnis, release: r.release, pr: r.pr });
  } else {
    throw new Error("Befehl: planen | bauen | veroeffentlichen | regeln");
  }
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  await cli(process.argv[2]);
}
