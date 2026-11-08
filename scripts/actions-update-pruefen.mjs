// Regelprüfung für Dependabot-Updates von GitHub Actions (aufgerufen von .github/workflows/auto-merge.yml, Job "regeln").
// Ein solcher Pull Request wird nur automatisch gemergt, wenn ALLE Regeln erfüllt sind; sonst bleibt er offen
// und der Lauf nennt die verletzte Regel (::notice::).
//   1. Dependabot: ausgelöst von dependabot[bot], PR von dependabot[bot] aus diesem Repository, Ziel main, Ökosystem
//      github_actions, kein Major-Update; alle Commits von Dependabot und von GitHub signiert, letzter Commit = geprüfter Stand.
//   2. Geändert sind nur Zeilen `uses: besitzer/repo[/pfad]@<40-hex-SHA> # vX[.Y[.Z]]` in .github/workflows/*.yml
//      (keine anderen Zeilen, keine anderen Dateien); Action und Pfad bleiben gleich, nur SHA und Versions-Kommentar ändern.
//   3. Jeder Besitzer steht auf der Liste ERLAUBTE_BESITZER.
//   4. Jeder neue SHA ist genau der Commit, auf den der Tag im Kommentar im Original-Repository zeigt
//      (annotierte Tags werden aufgelöst). Dependabot lässt einen Kommentar wie `# v3` stehen und setzt den SHA,
//      auf den der Tag v3 gerade zeigt; wurde der Tag inzwischen weitergeschoben, passt der SHA nicht → bleibt offen.
//   5. Ändert der PR die Backup-Probe (vollsicherung-probe.yml), muss deren Lauf für diesen Commit grün sein (es wird gewartet).
//   6. Tag und Commit sind mindestens MINDESTALTER_TAGE alt (zusätzlich zum cooldown in .github/dependabot.yml).
// Sind alle Regeln erfüllt, aber der PR liegt hinter main, lautet das Ergebnis "hinter-main" (siehe SECURITY.md).
// Ausgabe: ergebnis=ok | hinter-main | abgelehnt (in $GITHUB_OUTPUT). Braucht nur ein Token mit Leserechten.

export const ERLAUBTE_BESITZER = ["actions", "github", "supabase", "dependabot"];
export const MINDESTALTER_TAGE = 7;
export const PROBE = ".github/workflows/vollsicherung-probe.yml";
const DEPENDABOT = "dependabot[bot]";
const SHA = /^[0-9a-f]{40}$/;
// eingerückt, optional "- ", dann uses: besitzer/repo[/pfad]@sha # version
const USES = /^(\s*(?:- )?uses: ([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)((?:\/[A-Za-z0-9_.-]+)*))@([0-9a-f]{40}) # (v(\d+)(?:\.\d+){0,2})$/;
const DATEI = /^\.github\/workflows\/[A-Za-z0-9_.-]+\.yml$/;

class Abgelehnt extends Error {}
const nein = (regel, text) => { throw new Abgelehnt(`Regel ${regel}: ${text}`); };

// Alle Seiten einer Liste (per_page=100)
async function alle(api, pfad) {
  const R = [];
  for (let s = 1; s <= 30; s++) {
    const seite = await api(`${pfad}${pfad.includes("?") ? "&" : "?"}per_page=100&page=${s}`);
    if (!Array.isArray(seite)) nein(2, `unerwartete Antwort für ${pfad}`);
    R.push(...seite);
    if (seite.length < 100) return R;
  }
  nein(2, `zu viele Einträge in ${pfad}`);
}

// Patch einer Datei → Paare [alt, neu] der geänderten uses-Zeilen
export function usesPaare(datei, patch) {
  const weg = [], dazu = [];
  for (const z of patch.replace(/\r/g, "").split("\n")) {
    if (z.startsWith("@@")) continue;
    if (z.startsWith(" ")) continue; // unveränderte Zeile (Kontext)
    if (z.startsWith("-")) weg.push(z.slice(1));
    else if (z.startsWith("+")) dazu.push(z.slice(1));
    else if (z !== "") nein(2, `${datei}: unerwartete Zeile im Diff (${z.slice(0, 60)})`);
  }
  if (weg.length === 0 || weg.length !== dazu.length) nein(2, `${datei}: nicht nur ersetzte uses-Zeilen`);
  return weg.map((a, i) => {
    const alt = a.match(USES), neu = dazu[i].match(USES);
    if (!alt || !neu) nein(2, `${datei}: geänderte Zeile ist keine gepinnte uses-Zeile (${(alt ? dazu[i] : a).trim().slice(0, 80)})`);
    if (alt[1] !== neu[1]) nein(2, `${datei}: Action oder Pfad geändert (${alt[1].trim()} → ${neu[1].trim()})`);
    if (alt[5] === neu[5]) nein(2, `${datei}: SHA unverändert (${neu[1].trim()})`);
    if (alt[7] !== neu[7]) nein(1, `${datei}: Major-Version geändert (${alt[6]} → ${neu[6]})`);
    return { besitzer: neu[2], repo: neu[3], aktion: `${neu[2]}/${neu[3]}${neu[4]}`, sha: neu[5], tag: neu[6] };
  });
}

export async function pruefe({ env, api, jetzt = Date.now(), warte = (ms) => new Promise((r) => setTimeout(r, ms)), wartenMax = 25 * 60_000, intervall = 30_000 }) {
  try {
    const R = env.GITHUB_REPOSITORY, PR = env.PR, KOPF = env.KOPF;
    // ---- Regel 1: Dependabot, github_actions, kein Major-Update ----
    if (env.AKTEUR !== DEPENDABOT) nein(1, `ausgelöst von ${env.AKTEUR || "?"}, nicht von Dependabot`);
    if (env.OEKOSYSTEM !== "github_actions") nein(1, `Ökosystem ${env.OEKOSYSTEM || "?"}, nicht github_actions`);
    if (!["version-update:semver-minor", "version-update:semver-patch"].includes(env.UPDATE_TYP))
      nein(1, `Update-Art ${env.UPDATE_TYP || "unbekannt"} (nur Minor- und Patch-Updates automatisch)`);
    if (!/^\d+$/.test(PR || "") || !SHA.test(KOPF || "")) nein(1, "PR-Nummer oder Commit fehlt");
    const pr = await api(`repos/${R}/pulls/${PR}`);
    if (pr.user?.login !== DEPENDABOT) nein(1, `PR von ${pr.user?.login}, nicht von Dependabot`);
    if (pr.head?.repo?.full_name !== R) nein(1, "PR kommt nicht aus diesem Repository");
    if (pr.state !== "open" || pr.draft) nein(1, "PR ist nicht offen oder ein Entwurf");
    if (pr.base?.ref !== "main") nein(1, `Ziel ist ${pr.base?.ref}, nicht main`);
    if (!String(pr.head?.ref).startsWith("dependabot/github_actions/")) nein(1, `Branch ${pr.head?.ref} ist kein Actions-Branch von Dependabot`);
    if (pr.head?.sha !== KOPF) nein(1, "PR hat inzwischen einen neueren Commit");
    const commits = await alle(api, `repos/${R}/pulls/${PR}/commits`);
    if (!commits.length || commits[commits.length - 1].sha !== KOPF) nein(1, "Commit-Liste passt nicht zum geprüften Stand");
    for (const c of commits) {
      if (c.author?.login !== DEPENDABOT || c.commit?.verification?.verified !== true) nein(1, `Commit ${String(c.sha).slice(0, 7)} nicht (signiert) von Dependabot`);
    }

    // ---- Regel 2: nur uses-Zeilen in Workflow-Dateien ----
    const dateien = await alle(api, `repos/${R}/pulls/${PR}/files`);
    if (!dateien.length || dateien.length !== pr.changed_files) nein(2, "Dateiliste unvollständig");
    const neu = [];
    for (const d of dateien) {
      if (!DATEI.test(d.filename) || d.status !== "modified" || d.previous_filename) nein(2, `andere Datei geändert: ${d.filename} (${d.status})`);
      if (typeof d.patch !== "string") nein(2, `${d.filename}: kein Diff verfügbar`);
      neu.push(...usesPaare(d.filename, d.patch));
    }

    // ---- Regel 3: Besitzer auf der Erlaubt-Liste ----
    for (const a of neu) if (!ERLAUBTE_BESITZER.includes(a.besitzer.toLowerCase())) nein(3, `${a.aktion}: Besitzer ${a.besitzer} nicht auf der Erlaubt-Liste`);

    // ---- Regeln 4 und 6: SHA = Commit des Tags, Tag und Commit alt genug ----
    const grenze = jetzt - MINDESTALTER_TAGE * 86_400_000;
    const geprueft = new Set();
    for (const a of neu) {
      const schluessel = `${a.besitzer}/${a.repo}@${a.sha}#${a.tag}`;
      if (geprueft.has(schluessel)) continue;
      geprueft.add(schluessel);
      const ur = `repos/${a.besitzer}/${a.repo}`;
      const ref = await api(`${ur}/git/ref/tags/${a.tag}`).catch((e) => nein(4, `${a.aktion}: Tag ${a.tag} nicht gefunden (${e.message})`));
      if (ref?.ref !== `refs/tags/${a.tag}`) nein(4, `${a.aktion}: Tag ${a.tag} nicht eindeutig gefunden`);
      const daten = [];
      let commit;
      if (ref.object?.type === "commit") commit = ref.object.sha;
      else if (ref.object?.type === "tag") {
        // annotierter Tag: auf den Commit auflösen, auf den das Tag-Objekt zeigt
        const t = await api(`${ur}/git/tags/${ref.object.sha}`);
        if (t.object?.type !== "commit") nein(4, `${a.aktion}: Tag ${a.tag} zeigt nicht direkt auf einen Commit`);
        commit = t.object.sha;
        daten.push(t.tagger?.date);
      } else nein(4, `${a.aktion}: Tag ${a.tag} hat einen unbekannten Typ`);
      if (commit !== a.sha) nein(4, `${a.aktion}: SHA ${a.sha.slice(0, 7)} ist nicht der Commit von ${a.tag} (${String(commit).slice(0, 7)})`);
      const c = await api(`${ur}/git/commits/${commit}`);
      if (c.sha !== commit) nein(4, `${a.aktion}: Commit ${commit.slice(0, 7)} nicht gefunden`);
      daten.push(c.committer?.date);
      for (const d of daten) {
        const t = Date.parse(d);
        if (!Number.isFinite(t)) nein(6, `${a.aktion}: Datum von ${a.tag} unbekannt`);
        if (t > grenze) nein(6, `${a.aktion}: ${a.tag} ist jünger als ${MINDESTALTER_TAGE} Tage (${d})`);
      }
    }

    // ---- Regel 5: Backup-Probe grün, wenn sie für diesen Commit läuft ----
    const erwartet = dateien.some((d) => d.filename === PROBE);
    for (let gewartet = 0; ; gewartet += intervall) {
      const runs = (await api(`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`)).workflow_runs || [];
      const probe = runs.filter((r) => r.path === PROBE && r.head_repository?.full_name === R).sort((x, y) => y.run_number - x.run_number)[0];
      if (!probe && !erwartet) break;
      if (probe?.status === "completed") {
        if (probe.conclusion !== "success") nein(5, `Backup-Probe ist ${probe.conclusion}`);
        break;
      }
      if (gewartet >= wartenMax) nein(5, "Backup-Probe ist nicht rechtzeitig fertig geworden");
      await warte(intervall);
    }

    // ---- Alles erfüllt: liegt der PR hinter main? ----
    const v = await api(`repos/${R}/compare/main...${KOPF}`);
    if (!Number.isInteger(v.behind_by)) nein(1, "Vergleich mit main fehlgeschlagen");
    if (v.behind_by > 0) return { ergebnis: "hinter-main", grund: `Alle Regeln erfüllt, aber der PR liegt ${v.behind_by} Commit(s) hinter main` };
    return { ergebnis: "ok", grund: `Alle Regeln erfüllt (${neu.length} uses-Zeile(n), ${geprueft.size} Tag(s) geprüft)` };
  } catch (e) {
    if (e instanceof Abgelehnt) return { ergebnis: "abgelehnt", grund: e.message };
    return { ergebnis: "abgelehnt", grund: `Prüfung fehlgeschlagen: ${e.message}` };
  }
}

// GitHub-REST-API mit dem Token aus GH_TOKEN (nur lesend)
function githubApi(basis, token) {
  return async (pfad) => {
    const r = await fetch(`${basis}/${pfad}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" },
    });
    if (!r.ok) throw new Error(`${pfad}: HTTP ${r.status}`);
    return r.json();
  };
}

if (process.argv[1] && import.meta.url === (await import("node:url")).pathToFileURL(process.argv[1]).href) {
  const { appendFileSync } = await import("node:fs");
  const env = process.env;
  const r = await pruefe({ env, api: githubApi(env.GITHUB_API_URL || "https://api.github.com", env.GH_TOKEN) });
  console.log(r.ergebnis === "abgelehnt" ? `::notice::Nicht automatisch gemergt – ${r.grund}` : r.grund);
  if (env.GITHUB_OUTPUT) appendFileSync(env.GITHUB_OUTPUT, `ergebnis=${r.ergebnis}\n`);
}
