// Visuelle Regressionstests (tests/visuell.spec.js), getrennt von den normalen Läufen (dort per testIgnore ausgeschlossen).
// Referenzbilder liegen nicht im Repo, sondern in VISUELL_REFERENZ (Standard: visuell-referenz/, in .gitignore).
// Ablauf in der CI (Job "visuell" in .github/workflows/ci.yml): Basis-Stand mit --update-snapshots=all fotografieren,
// dann den PR-Stand dagegen vergleichen. Port über VISUELL_PORT, damit parallele Läufe nicht kollidieren.
const path = require("path");
const { defineConfig, devices } = require("@playwright/test");

const PORT = Number(process.env.VISUELL_PORT || 4175);
const REFERENZ = path.resolve(__dirname, process.env.VISUELL_REFERENZ || "visuell-referenz").split(path.sep).join("/");

module.exports = defineConfig({
  testDir: "tests",
  testMatch: /visuell\.spec\.js$/,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0, // eine Abweichung soll nicht durch einen zweiten Versuch verschwinden
  outputDir: "visuell-ergebnis", // bei Abweichung: Referenz, Ist-Bild und Diff je Ansicht
  reporter: process.env.CI ? [["github"], ["html", { open: "never", outputFolder: "visuell-bericht" }]] : "list",
  snapshotPathTemplate: `${REFERENZ}/{projectName}/{arg}{ext}`,
  expect: {
    // Kleine Toleranz gegen Kantenglättung; eine sichtbare Änderung (Farbe, Abstand, Schrift) liegt weit darüber
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, threshold: 0.05, animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    serviceWorkers: "block",
    trace: "off",
    locale: "de-CH",
    timezoneId: "Europe/Zurich",
  },
  projects: [
    { name: "android", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    // Immer neu bauen und starten: der Basis- und der PR-Stand liegen nacheinander in app/
    command: `node scripts/build.mjs && npx http-server dist -p ${PORT} -c-1 -s`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
  },
});
