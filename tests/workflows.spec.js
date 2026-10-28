// Prüft die GitHub-Abläufe auf Fehler, die schon einmal ein Release verhindert haben.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const wf = (n) => fs.readFileSync(path.join(__dirname, "..", ".github", "workflows", n), "utf8");

test("Release: Supabase CLI ist auf eine getestete Version fixiert", () => {
  expect(wf("release.yml")).toMatch(/supabase\/setup-cli@v\d+\s+with:\s+version: \d+\.\d+\.\d+/);
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
