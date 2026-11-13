// Das Playwright-Image im Testjob muss zur installierten Version von @playwright/test passen.
// Tag und Digest stehen in .github/container-images.json (aktuell gehalten von Komponenten-Updates), ci.yml liest sie im Job bilder.
const { test, expect } = require("@playwright/test");
const fs = require("fs");

test("Playwright-Image im CI passt zur Version in package.json", { tag: "@logik" }, () => {
  const v = JSON.parse(fs.readFileSync("package.json", "utf8")).devDependencies["@playwright/test"].replace(/^[\^~]/, "");
  const bilder = JSON.parse(fs.readFileSync(".github/container-images.json", "utf8"));
  const m = bilder.playwright.match(/^mcr\.microsoft\.com\/playwright:v(\d+\.\d+\.\d+)-noble@sha256:[0-9a-f]{64}$/);
  expect(m && m[1]).toBe(v);
  expect(bilder.semgrep).toMatch(/^semgrep\/semgrep:\d+\.\d+\.\d+@sha256:[0-9a-f]{64}$/);
  expect(Object.keys(bilder).sort()).toEqual(["playwright", "semgrep"]);
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8").replace(/\r/g, "");
  // Images nur über den Job bilder (mit Prüfung von Herkunft und Digest), nie direkt im Workflow
  expect(ci).toContain("image: ${{ needs.bilder.outputs.playwright }}");
  expect(ci).toContain("image: ${{ needs.bilder.outputs.semgrep }}");
  expect(ci).not.toMatch(/image: (mcr\.microsoft\.com|semgrep\/)/);
  expect(ci).toContain(String.raw`grep -qxE 'mcr\.microsoft\.com/playwright:v[0-9]+\.[0-9]+\.[0-9]+-noble@sha256:[0-9a-f]{64}'`);
  expect(ci).toContain(String.raw`grep -qxE 'semgrep/semgrep:[0-9]+\.[0-9]+\.[0-9]+@sha256:[0-9a-f]{64}'`);
});
