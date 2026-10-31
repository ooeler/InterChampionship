// Prüft die GitHub-Abläufe auf Fehler, die schon einmal ein Release verhindert haben.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const wf = (n) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", n), "utf8");

test("Release: Supabase CLI ist auf eine getestete Version fixiert", () => {
  expect(wf("release.yml")).toMatch(/supabase\/setup-cli@[0-9a-f]{40} # v\d+\s+with:\s+version: \d+\.\d+\.\d+/);
});

test("Release: Migrations-Abfrage versteht beide JSON-Formate der CLI", () => {
  const y = wf("release.yml");
  // v1.1.0 scheiterte an `.rows[0].c`, weil die CLI in GitHub Actions eine Liste liefert
  expect(y).toContain(`jq -r 'if type == "array" then .[0].c else .rows[0].c end'`);
  expect(y).toContain("--agent no");
});

test("Release: Reihenfolge Backup → Migrationen → Functions → App", () => {
  const y = wf("release.yml");
  const i = ["name: Backup vor dem Deployment", "name: Datenbank-Migrationen", "name: Edge Functions", "needs: backend"].map((s) => y.indexOf(s));
  expect(i.every((x) => x > 0)).toBe(true);
  expect([...i].sort((a, b) => a - b)).toEqual(i);
});

test("Auto-Merge: keine Entwürfe und keine Forks", () => {
  const y = wf("auto-merge.yml");
  expect(y).toContain("github.event.pull_request.draft == false");
  expect(y).toContain("github.event.pull_request.head.repo.full_name == github.repository");
});

test("Tests als Unterablauf brauchen keine Schreibrechte", () => {
  // v1.0.0 scheiterte, weil ein Job in ci.yml Schreibrechte verlangte
  expect(wf("ci.yml")).not.toMatch(/:\s*write/);
});

test("Release: Backup per SQL, ohne Abhängigkeit von Edge Functions", () => {
  const y = wf("release.yml");
  // v1.1.1 scheiterte, weil das Backup über eine Funktion lief, die selbst einen Fehler hatte
  expect(y).not.toContain("functions/v1/ops");
  expect(y).toContain("insert into public.league_state_history");
  // in Bash muss $$ escaped sein, sonst wird es zur Prozessnummer
  expect(y).not.toMatch(/"do \$\$/);
  expect(y).toContain(String.raw`"do \$\$`);
});

test("Release: Funktionstest der Datenbank nach den Migrationen", () => {
  const y = wf("release.yml");
  expect(y.indexOf("name: Funktionstest Datenbank")).toBeGreaterThan(y.indexOf("name: Datenbank-Migrationen"));
  expect(y).toContain("perform public.snapshot_league('Funktionstest')");
});

test("SQL: Parameter, die wie Spalten heissen, sind eindeutig aufgelöst", () => {
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

test("Auto-Merge: Entwurfs-Läufe brechen echte Läufe nicht ab", () => {
  // bei #6 brach ein übersprungener Entwurfs-Lauf den echten Lauf nach "ready for review" ab
  expect(wf("auto-merge.yml")).toContain("group: auto-merge-${{ github.event.pull_request.number }}-${{ github.event.pull_request.draft }}");
});

test("Vollsicherung: nur lokal und verschlüsselt, Probe nur mit Testdaten", () => {
  const s = fs.readFileSync(path.join(__dirname, "..", "scripts", "vollsicherung.sh"), "utf8");
  expect(s).toContain("--symmetric --cipher-algo AES256");
  expect(s).toContain("--schema=auth");
  expect(s).toContain("trap");
  expect(fs.readFileSync(path.join(__dirname, "..", ".gitignore"), "utf8")).toContain("*.sql.gpg");
  expect(wf("vollsicherung-probe.yml")).not.toMatch(/secrets.|--linked|upload-artifact/); // nie gegen Produktion, keine Daten ins Repository
});
