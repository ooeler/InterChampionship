const { defineConfig, devices } = require("@playwright/test");

module.exports = defineConfig({
  testDir: "tests",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    serviceWorkers: "block",
    trace: "retain-on-failure",
    locale: "de-CH",
  },
  // Dateien, die zusammen länger als 1 Minute brauchen, erscheinen in der CI als Warnung "Slow Test"
  reportSlowTests: { max: 10, threshold: 60_000 },
  // Reine Logiktests (Node-Module, Workflows, Migrationen; ohne Seite) sind mit @logik markiert
  // und laufen nur einmal im Projekt "logik" statt auf allen drei Geräten.
  // Welche Projekte in welchem CI-Teil laufen, steht in .github/workflows/ci.yml (geprüft in tests/workflows.spec.js).
  projects: [
    { name: "android", grepInvert: /@logik/, use: { ...devices["Pixel 7"] } },
    { name: "iphone", grepInvert: /@logik/, use: { ...devices["iPhone 14"] } },
    { name: "desktop", grepInvert: /@logik/, use: { ...devices["Desktop Chrome"] } },
    { name: "logik", grep: /@logik/, use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Getestet wird die gebaute App (inkl. Content-Security-Policy) – genau das, was ausgeliefert wird
    command: "node scripts/build.mjs && npx http-server dist -p 4173 -c-1 -s",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
