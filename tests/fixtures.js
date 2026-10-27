const path = require("path");
const base = require("@playwright/test");

const MOCK = path.join(__dirname, "mock-supabase.js");
const USER = { email: "captain@flyingpenguins.test", password: "geheim123" };

// Jede Seite: feste Zeit, Supabase-Mock statt config.js, keine externen Requests.
async function setup(page, { mock = true } = {}) {
  await page.clock.setFixedTime(new Date("2026-10-27T10:00:00"));
  await page.addInitScript(() => {
    try { Object.defineProperty(navigator, "canShare", { value: undefined }) } catch (e) {}
  });
  if (mock) await page.route("**/config.js", (r) => r.fulfill({ path: MOCK, contentType: "application/javascript" }));
  await page.route("**/vendor/supabase.js", (r) => r.fulfill({ body: "", contentType: "application/javascript" }));
  await page.route(/fonts\.(googleapis|gstatic)\.com/, (r) => r.abort());
  page.on("dialog", (d) => d.accept());
}

async function login(page, user = USER) {
  await page.goto("/");
  await page.fill("#auth input[name=email]", user.email);
  await page.fill("#auth input[name=pw]", user.password);
  await page.click("#auth form .btn");
  await base.expect(page.locator("header")).toBeVisible();
}

const test = base.test.extend({
  page: async ({ page }, use) => {
    await setup(page);
    await use(page);
  },
});

module.exports = { test, expect: base.expect, setup, login, USER };
