// End-to-End-Tests gegen eine echte, lokale Supabase (Docker) – siehe Job "e2e" in .github/workflows/ci.yml.
// Anders als tests/ (nachgebaute Datenbank) prüfen diese Tests die echten Migrationen, RLS-Regeln und Edge Functions.
// Lokal: `supabase start` + Migrationen anwenden (siehe ci.yml), dann E2E_SUPABASE_URL/E2E_ANON_KEY/E2E_SERVICE_KEY setzen
// und `npm run test:e2e` ausführen.
const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests-e2e",
  fullyParallel: false,
  workers: 1, // ein Ablauf auf einer gemeinsamen Datenbank, Schritte bauen aufeinander auf
  forbidOnly: !!process.env.CI,
  retries: 0,
  timeout: 60_000,
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "playwright-report-e2e" }]] : "list",
  use: {
    baseURL: "http://localhost:4174",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    locale: "de-CH",
    ...devices["Desktop Chrome"],
  },
  webServer: {
    // Gebaute App mit config.js für die lokale Supabase (geschrieben von tests-e2e/config.mjs)
    command: "node scripts/build.mjs && node tests-e2e/config.mjs && npx http-server dist -p 4174 -c-1 -s",
    url: "http://localhost:4174",
    reuseExistingServer: false,
    env: { SUPABASE_URL: process.env.E2E_SUPABASE_URL || "" },
  },
});
