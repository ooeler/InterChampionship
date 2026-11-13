// Prüft die GitHub-Abläufe auf Fehler, die schon einmal ein Release verhindert haben.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const wf = (n) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", n), "utf8");

test("Release: Supabase CLI ist auf eine getestete Version fixiert", { tag: "@logik" }, () => {
  expect(wf("release.yml")).toMatch(/supabase\/setup-cli@[0-9a-f]{40} # v\d+\s+with:\s+version: \d+\.\d+\.\d+/);
});

test("Release: Migrations-Abfrage versteht beide JSON-Formate der CLI", { tag: "@logik" }, () => {
  const y = wf("release.yml");
  // v1.1.0 scheiterte an `.rows[0].c`, weil die CLI in GitHub Actions eine Liste liefert
  expect(y).toContain(`jq -r 'if type == "array" then .[0].c else .rows[0].c end'`);
  expect(y).toContain("--agent no");
});

test("Release: Reihenfolge Backup → Migrationen → Functions → App", { tag: "@logik" }, () => {
  const y = wf("release.yml");
  const i = ["name: Backup vor dem Deployment", "name: Datenbank-Migrationen", "name: Edge Functions", "needs: backend"].map((s) => y.indexOf(s));
  expect(i.every((x) => x > 0)).toBe(true);
  expect([...i].sort((a, b) => a - b)).toEqual(i);
});

test("Auto-Merge: keine Entwürfe und keine Forks", { tag: "@logik" }, () => {
  const y = wf("auto-merge.yml");
  expect(y).toContain("github.event.pull_request.draft == false");
  expect(y).toContain("github.event.pull_request.head.repo.full_name == github.repository");
});

test("Tests als Unterablauf brauchen keine Schreibrechte", { tag: "@logik" }, () => {
  // v1.0.0 scheiterte, weil ein Job in ci.yml Schreibrechte verlangte
  expect(wf("ci.yml")).not.toMatch(/:\s*write/);
});

test("Release: Backup per SQL, ohne Abhängigkeit von Edge Functions", { tag: "@logik" }, () => {
  const y = wf("release.yml");
  // v1.1.1 scheiterte, weil das Backup über eine Funktion lief, die selbst einen Fehler hatte
  expect(y).not.toContain("functions/v1/ops");
  expect(y).toContain("insert into public.league_state_history");
  // in Bash muss $$ escaped sein, sonst wird es zur Prozessnummer
  expect(y).not.toMatch(/"do \$\$/);
  expect(y).toContain(String.raw`"do \$\$`);
});

test("Release: Funktionstest der Datenbank nach den Migrationen", { tag: "@logik" }, () => {
  const y = wf("release.yml");
  expect(y.indexOf("name: Funktionstest Datenbank")).toBeGreaterThan(y.indexOf("name: Datenbank-Migrationen"));
  expect(y).toContain("perform public.snapshot_league('Funktionstest')");
});

test("SQL: Parameter, die wie Spalten heissen, sind eindeutig aufgelöst", { tag: "@logik" }, () => {
  const dir = path.join(__dirname, "..", "supabase", "migrations");
  const last = {};
  for (const f of fs.readdirSync(dir).sort()) {
    const sql = fs.readFileSync(path.join(dir, f), "utf8");
    for (const m of sql.matchAll(/create or replace function public\.(\w+)\(([^)]*)\)[\s\S]*?\$\$([\s\S]*?)end \$\$/g)) last[m[1]] = { params: m[2], body: m[3], f };
  }
  // snapshot_league hat den Parameter "reason" wie die Spalte league_state_history.reason
  expect(last.snapshot_league.f).toBe("20261029_04_fix_snapshot.sql");
  expect(last.snapshot_league.body).toContain("#variable_conflict use_column");
});

test("Auto-Merge: Entwurfs-Läufe brechen echte Läufe nicht ab", { tag: "@logik" }, () => {
  // bei #6 brach ein übersprungener Entwurfs-Lauf den echten Lauf nach "ready for review" ab
  expect(wf("auto-merge.yml")).toContain("group: auto-merge-${{ github.event.pull_request.number }}-${{ github.event.pull_request.draft }}");
});

test("Vollsicherung: nur lokal und verschlüsselt, Probe nur mit Testdaten", { tag: "@logik" }, () => {
  const s = fs.readFileSync(path.join(__dirname, "..", "scripts", "vollsicherung.sh"), "utf8");
  expect(s).toContain("--symmetric --cipher-algo AES256");
  expect(s).toContain("--schema=auth");
  expect(s).toContain("trap");
  expect(fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8")).toContain("*.sql.gpg");
  expect(wf("vollsicherung-probe.yml")).not.toMatch(/secrets.|--linked|upload-artifact/); // nie gegen Produktion, keine Daten ins Repository
});

// ---- Release: Tests nur überspringen, wenn der Stand belegt geprüft ist; Deploy nur von main/v* ----
// Kleiner Leser für die Job-Ebene von release.yml (ohne YAML-Bibliothek): Jobs, Schlüssel der Job-Ebene, Blöcke.
function relJobs(datei = "release.yml") {
  const L = wf(datei).replace(/\r/g, "").split("\n");
  const J = {};
  let cur = null;
  for (const l of L.slice(L.indexOf("jobs:") + 1)) {
    const m = l.match(/^  ([\w-]+):\s*$/);
    if (m) { cur = J[m[1]] = []; continue; }
    if (/^\S/.test(l)) break;
    if (cur) cur.push(l);
  }
  return Object.fromEntries(Object.entries(J).map(([k, v]) => [k, v.join("\n")]));
}
const jobKey = (job, k) => ((job.match(new RegExp("^    " + k + ":(.*)$", "m")) || [])[1] || "").trim();
// Zeilen eines Blocks (z. B. "    env:" oder "        run: |") bis zur nächsten Zeile mit gleicher oder kleinerer Einrückung
function block(text, head) {
  const L = text.split("\n"), i = L.findIndex((l) => l.trimEnd() === head);
  if (i < 0) return null;
  const ind = head.length - head.trimStart().length, R = [];
  for (const l of L.slice(i + 1)) {
    if (l.trim() && l.length - l.trimStart().length <= ind) break;
    R.push(l);
  }
  return R;
}
// `if:`-Ausdruck in die mit && verbundenen Teile der obersten Ebene zerlegen (Klammern zählen)
function konjunktionen(expr) {
  const T = [];
  let d = 0, s = "";
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i];
    if (c == "(") d++;
    if (c == ")") d--;
    if (d == 0 && expr.startsWith("&&", i)) { T.push(s.trim()); s = ""; i++; continue; }
    s += c;
  }
  T.push(s.trim());
  return T.map((t) => t.replace(/\s+/g, " "));
}
const NUR_MAIN = "(github.ref == 'refs/heads/main' || startsWith(github.ref, 'refs/tags/v'))";

test("Release: Deploy-Jobs nur von main oder Tags v*, Backend nur nach grünen oder belegt übersprungenen Tests", { tag: "@logik" }, () => {
  const J = relJobs();
  expect(Object.keys(J)).toEqual(["pruefen", "test", "backend", "pages", "wartung-aus"]);
  for (const j of ["backend", "pages", "wartung-aus"]) {
    const k = konjunktionen(jobKey(J[j], "if"));
    expect(k, j).toContain(NUR_MAIN);
    expect(k.filter((t) => !t.startsWith("(")).join(" "), j + ": kein || auf oberster Ebene").not.toContain("||");
  }
  // Tests laufen, ausser pruefen belegt den Stand als geprüft
  expect(jobKey(J.test, "needs")).toBe("pruefen");
  expect(jobKey(J.test, "if")).toBe("needs.pruefen.outputs.tests == 'ja'");
  // Backend: braucht pruefen und test; weiter nur bei grünen Tests oder übersprungenen Tests mit tests=nein
  expect(jobKey(J.backend, "needs")).toBe("[pruefen, test]");
  expect(konjunktionen(jobKey(J.backend, "if")).sort()).toEqual([
    "(needs.test.result == 'success' || (needs.test.result == 'skipped' && needs.pruefen.outputs.tests == 'nein'))",
    NUR_MAIN, "always()", "needs.pruefen.result == 'success'"].sort());
  expect(jobKey(J.pages, "needs")).toBe("backend");
  expect(konjunktionen(jobKey(J.pages, "if"))).toContain("needs.backend.result == 'success'");
  expect(jobKey(J["wartung-aus"], "needs")).toBe("[backend, pages]");
  expect(konjunktionen(jobKey(J["wartung-aus"], "if"))).toContain("needs.backend.result != 'skipped'");
  // Environment production (Branch-Policy auf GitHub) für alles, was Supabase-Secrets braucht
  expect(jobKey(J.backend, "environment")).toBe("production");
  expect(jobKey(J["wartung-aus"], "environment")).toBe("production");
  // Secrets nur in Schritten (env eines Steps), nie im Job-env und nie direkt im Skript
  for (const [n, j] of Object.entries(J)) {
    expect((block(j, "    env:") || []).filter((l) => l.includes("secrets.")), n + ": Secret im Job-env").toEqual([]);
    for (const l of j.split("\n").filter((l) => l.includes("secrets."))) {
      expect(l, n).toMatch(/^ {10}[A-Z_]+: \$\{\{ secrets\.[A-Z_]+ \}\}$/);
    }
  }
});

// Das Skript von "pruefen" läuft mit nachgebauten git/gh/jq: Nur wenn alles belegt ist, steht tests=nein.
// Unabhängig vom Gerät: läuft nur im Projekt logik (bash-Aufrufe sind unter Windows langsam).
test("Release: pruefen setzt tests=nein nur bei gleichem Tree, gemergtem PR und grünen Pflicht-Jobs", { tag: "@logik" }, () => {
  test.setTimeout(180_000);
  const { spawnSync } = require("child_process");
  const os = require("os");
  const run = block(relJobs().pruefen, "        run: |");
  expect(run && run.length).toBeGreaterThan(10);
  const skript = run.map((l) => l.slice(10)).join("\n");
  // Attrappen: git liefert den Tree, gh antwortet je nach API-Pfad aus T_*-Variablen (und protokolliert), jq prüft nur die Job-Liste
  const stubs = [
    'git() { echo "$T_BAUM"; }',
    'gh() {',
    '  echo "gh $*" >> "$T_LOG"',
    '  local p="${2#repos/$GITHUB_REPOSITORY/}"',
    '  case "$p" in',
    '    compare/*) [ "$T_STATUS" = "fehler" ] && return 1; echo "$T_STATUS" ;;',
    '    commits/*/pulls) echo "$T_MC" ;;',
    '    commits/*) echo "$T_MTREE" ;;',
    '    "actions/runs?"*) for r in $T_RUNS; do echo "$r"; done ;;',
    '    actions/runs/*/jobs*) local id="${p#actions/runs/}"; id="${id%%/*}"; local v="T_JOBS_$id"; echo "${!v}" ;;',
    '    *) return 1 ;;',
    '  esac',
    '}',
    'jq() { [ "$1 $2 $3 $5" = \'-e --arg j any(.[]; . == $j)\' ] || return 2; grep -qF "\\"$4\\""; }',
    '',
  ].join("\n");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pruefen-"));
  const baum = "a".repeat(40), kopf = "b".repeat(40), merge = "c".repeat(40);
  const PFLICHT = ["test / test", "test / e2e", "test / security", "codeql / analyze (javascript-typescript)"];
  const gut = { GETESTET: baum, KOPF: kopf, T_BAUM: baum, T_STATUS: "identical", T_MC: merge, T_MTREE: baum, T_RUNS: "11", T_JOBS_11: JSON.stringify(PFLICHT) };
  let n = 0;
  const lauf = (anders) => {
    const out = path.join(dir, "out" + ++n), log = path.join(dir, "log" + n);
    fs.writeFileSync(out, "");
    const r = spawnSync("bash", ["-c", stubs + skript], {
      env: { ...process.env, ...gut, ...anders, GITHUB_OUTPUT: out, T_LOG: log, GITHUB_REPOSITORY: "ooeler/InterChampionship", GITHUB_SHA: merge },
      encoding: "utf8",
    });
    if (r.error && r.error.code == "ENOENT" && !process.env.CI) test.skip(true, "bash fehlt");
    expect(r.status, r.stderr).toBe(0);
    const t = fs.readFileSync(out, "utf8").split("\n").filter((l) => l.startsWith("tests="));
    expect(t, "genau eine Ausgabe tests=").toHaveLength(1);
    return { tests: t[0].slice(6), log: fs.existsSync(log) ? fs.readFileSync(log, "utf8") : "", stdout: r.stdout };
  };
  try {
    const ok = lauf({});
    expect(ok.tests, ok.stdout).toBe("nein");
    // die API-Abfragen prüfen den richtigen PR und den richtigen Workflow
    expect(ok.log).toContain("compare/main..." + merge);
    expect(ok.log).toContain(`select(.merged_at != null and .base.ref == "main" and .head.sha == "${kopf}")`);
    expect(ok.log).toContain(`actions/runs?head_sha=${kopf}&event=pull_request`);
    expect(ok.log).toContain(`select(.path == ".github/workflows/auto-merge.yml" and .head_repository.full_name == "ooeler/InterChampionship")`);
    expect(lauf({ T_STATUS: "behind" }).tests).toBe("nein");
    expect(lauf({ T_RUNS: "10 11", T_JOBS_10: JSON.stringify(PFLICHT.slice(1)) }).tests).toBe("nein"); // ein anderer Lauf war ganz grün
    const faelle = {
      "kein Tree": { GETESTET: "" },
      "Tree kein Hash": { GETESTET: "x" + baum.slice(1) },
      "anderer Tree": { GETESTET: "d".repeat(40) },
      "kein Kopf": { KOPF: "" },
      "Kopf kein Hash": { KOPF: kopf + "0" },
      "Vergleich fehlgeschlagen": { T_STATUS: "fehler" },
      "nicht auf main": { T_STATUS: "ahead" },
      "abgezweigt": { T_STATUS: "diverged" },
      "kein gemergter PR": { T_MC: "" },
      "Merge mit anderem Tree": { T_MTREE: "e".repeat(40) },
      "kein Lauf": { T_RUNS: "" },
      "Lauf ohne Jobs": { T_JOBS_11: "" },
      ...Object.fromEntries(PFLICHT.map((j) => ["rot: " + j, { T_JOBS_11: JSON.stringify(PFLICHT.filter((x) => x != j)) }])),
    };
    for (const [name, a] of Object.entries(faelle)) expect(lauf(a).tests, name).toBe("ja");
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---- Auto-Merge: Dependabot-Updates von GitHub Actions nur nach der Regelprüfung ----
// Schritte eines Jobs (Zeilen ab "      - " bis zum nächsten Schritt)
function schritte(job) {
  const S = [];
  for (const l of job.split("\n")) {
    if (/^ {6}- /.test(l)) S.push([l]);
    else if (S.length && (l.startsWith("        ") || !l.trim())) S[S.length - 1].push(l);
    else if (S.length && /^ {0,5}\S/.test(l)) break;
  }
  return S.map((z) => z.join("\n"));
}
const schrittName = (s) => (s.match(/name: (.*)/) || [])[1] || (s.match(/uses: (\S+)/) || [])[1];

test("Auto-Merge: Regelprüfung mit Leserechten, Skript vom Basis-Stand, GH_TOKEN nur in schreibenden Schritten", { tag: "@logik" }, () => {
  const y = wf("auto-merge.yml");
  expect(y).toMatch(/^permissions:\n  contents: read\n\n/m);
  const J = relJobs("auto-merge.yml");
  expect(Object.keys(J)).toEqual(["test", "codeql", "meta", "regeln", "merge"]);
  // regeln: nur lesen, nach grünen Tests und CodeQL
  expect(jobKey(J.regeln, "needs")).toBe("[test, codeql, meta]");
  expect(block(J.regeln, "    permissions:").filter((l) => l.trim())).toEqual(["      contents: read", "      pull-requests: read", "      actions: read"]);
  expect(J.regeln).not.toContain("secrets.");
  const R = schritte(J.regeln);
  expect(R).toHaveLength(2);
  for (const s of R) expect(s).toContain("if: needs.meta.outputs.eco == 'github_actions'");
  expect(R[0]).toMatch(/uses: actions\/checkout@[0-9a-f]{40} # v\d+/);
  expect(R[0]).toContain("ref: ${{ github.event.pull_request.base.sha }}"); // nicht der Stand aus dem PR
  expect(R[0]).toContain("persist-credentials: false");
  expect(R[1]).toContain("run: node scripts/actions-update-pruefen.mjs");
  expect(R[1]).toContain("GH_TOKEN: ${{ github.token }}");
  for (const k of ["AKTEUR: ${{ github.actor }}", "OEKOSYSTEM: ${{ needs.meta.outputs.eco }}", "UPDATE_TYP: ${{ needs.meta.outputs.upd }}", "KOPF: ${{ github.event.pull_request.head.sha }}"]) expect(R[1]).toContain(k);
  expect(jobKey(J.regeln, "outputs") + block(J.regeln, "    outputs:").join("\n")).toContain("ergebnis: ${{ steps.pruefen.outputs.ergebnis }}");
  // merge wartet auf regeln; GH_TOKEN nur in den Schritten, die schreiben, nie im Job-env
  expect(jobKey(J.merge, "needs").replace(/ #.*/, "")).toBe("[test, codeql, meta, regeln]");
  expect(block(J.merge, "    env:").join("\n")).not.toContain("GH_TOKEN");
  const M = schritte(J.merge);
  expect(M.map(schrittName)).toEqual(["Art der Änderung bestimmen", "Mergen", "Hinweis bei Actions-Update hinter main", "Release erstellen und deployen"]);
  expect(M.filter((s) => s.includes("GH_TOKEN")).map(schrittName)).toEqual(["Mergen", "Hinweis bei Actions-Update hinter main", "Release erstellen und deployen"]);
  expect(M[1]).toContain(`gh pr merge "$PR" --repo "$GITHUB_REPOSITORY" --rebase --delete-branch --match-head-commit "$KOPF"`);
  expect(M[1]).toContain("if: steps.kind.outputs.merge == 'true'");
  expect(M[2]).toContain("if: steps.kind.outputs.hinter == 'true'");
  expect(M[3]).toContain("if: steps.kind.outputs.merge == 'true' && steps.kind.outputs.bump != 'none'");
});

// Das Skript "Art der Änderung bestimmen" mit verschiedenen Branches und Ergebnissen der Regelprüfung
test("Auto-Merge: Actions-Updates nur bei Regelprüfung ok, ohne Release; hinter main kein Merge", { tag: "@logik" }, () => {
  const { spawnSync } = require("child_process");
  const os = require("os");
  const run = block(schritte(relJobs("auto-merge.yml").merge)[0], "        run: |");
  const skript = run.map((l) => l.slice(10)).join("\n");
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "kind-"));
  let n = 0;
  const art = (BRANCH, ECO = "", REGELN = "") => {
    const out = path.join(dir, "o" + ++n);
    fs.writeFileSync(out, "");
    const r = spawnSync("bash", ["-c", skript], { env: { ...process.env, BRANCH, ECO, REGELN, GITHUB_OUTPUT: out }, encoding: "utf8" });
    if (r.error && r.error.code == "ENOENT" && !process.env.CI) test.skip(true, "bash fehlt");
    expect(r.status, r.stderr).toBe(0);
    return Object.fromEntries(fs.readFileSync(out, "utf8").trim().split("\n").map((l) => l.split("=")));
  };
  try {
    const A = "dependabot/github_actions/actions-abc";
    expect(art(A, "github_actions", "ok")).toEqual({ bump: "none", merge: "true", hinter: "false" });
    expect(art(A, "github_actions", "hinter-main")).toEqual({ bump: "none", merge: "false", hinter: "true" });
    for (const r of ["abgelehnt", "", "OK", "ok "]) expect(art(A, "github_actions", r).merge, r).toBe("false");
    expect(art(A, "", "ok").merge).toBe("false"); // keine Metadaten (z. B. jemand anderes hat gepusht)
    expect(art("dependabot/npm_and_yarn/x", "npm_and_yarn")).toEqual({ bump: "patch", merge: "true", hinter: "false" });
    expect(art("dependabot/docker/x", "docker", "ok").merge).toBe("false");
    expect(art("feature/x")).toEqual({ bump: "minor", merge: "true", hinter: "false" });
    expect(art("ci/x", "", "abgelehnt")).toEqual({ bump: "none", merge: "true", hinter: "false" });
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test("Dependabot: Actions-Updates mit 7 Tagen Wartezeit", { tag: "@logik" }, () => {
  const d = fs.readFileSync(path.join(__dirname, "..", ".github", "dependabot.yml"), "utf8").replace(/\r/g, "");
  expect(d).toMatch(/- package-ecosystem: github-actions\n(    .*\n)*    cooldown:\n      default-days: 7\n/);
});

// Die Testteile in ci.yml decken jedes Playwright-Projekt genau einmal und vollständig ab
test("Tests: jedes Projekt läuft in genau einer Gruppe, jede Gruppe vollständig aufgeteilt", { tag: "@logik" }, () => {
  const ci = wf("ci.yml").replace(/\r/g, "");
  const teile = [...ci.matchAll(/- \{ teil: (\d+), projekte: "([^"]*)", shard: (\d+)\/(\d+) \}/g)]
    .map(([, teil, p, n, von]) => ({ teil: +teil, projekte: [...p.matchAll(/--project=(\S+)/g)].map((x) => x[1]).sort().join(" "), n: +n, von: +von }));
  expect(teile.length).toBeGreaterThan(1);
  expect(ci).toContain(`name: test (Teil \${{ matrix.teil }}/${teile.length})`);
  expect(teile.map((t) => t.teil)).toEqual(teile.map((_, i) => i + 1));
  expect(ci).toMatch(/PROJEKTE: \$\{\{ matrix\.projekte \}\}\n\s+SHARD: \$\{\{ matrix\.shard \}\}\n\s+run: npx playwright test \$PROJEKTE --shard="\$SHARD"\n/);
  const gruppen = {};
  for (const t of teile) (gruppen[t.projekte] ??= []).push(t);
  for (const [g, L] of Object.entries(gruppen)) {
    expect(L.map((t) => `${t.n}/${t.von}`), g).toEqual(L.map((_, i) => `${i + 1}/${L.length}`));
  }
  const inCi = Object.keys(gruppen).flatMap((g) => g.split(" ")).sort();
  const konfiguriert = require("../playwright.config.js").projects.map((p) => p.name).sort();
  expect(inCi).toEqual(konfiguriert); // jedes Projekt genau einmal, keines vergessen
  // Der Pflicht-Check heisst weiterhin "test" und sammelt alle Teile ein
  expect(ci).toMatch(/\n  test:\n    # Sammelt die \d+ Teile[^\n]*\n    needs: shard\n    if: always\(\)\n/);
});
