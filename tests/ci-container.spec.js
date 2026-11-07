// Das Playwright-Image im Testjob muss zur installierten Version von @playwright/test passen.
const { test, expect } = require("@playwright/test");
const fs = require("fs");

test("Playwright-Image im CI passt zur Version in package.json", () => {
  const v = JSON.parse(fs.readFileSync("package.json", "utf8")).devDependencies["@playwright/test"].replace(/^[\^~]/, "");
  const ci = fs.readFileSync(".github/workflows/ci.yml", "utf8");
  expect(ci).toContain("mcr.microsoft.com/playwright:v" + v + "-");
});
