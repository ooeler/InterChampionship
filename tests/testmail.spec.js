const { test, expect, login } = require("./fixtures");

const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };

async function testMail(page) {
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=mt]"); // standardmässig zugeklappt
  const msg = page.waitForEvent("dialog");
  await page.click("[data-tmail]");
  return (await msg).message();
}

test.describe("Test-Mail (Mail-Einrichtung prüfen)", () => {
  test("Spielleitung bekommt die Test-Mail an die eigene Adresse", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_brevo", "1"));
    await login(page, ADMIN);
    expect(await testMail(page)).toBe("Test-Mail an admin@flyingpenguins.test verschickt. Bitte Posteingang und Spam-Ordner prüfen.");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    expect(log).toContainEqual({ op: "invoke", name: "notify", body: { type: "testmail" } });
  });

  test("ohne Resend-Secrets: verständliche Fehlermeldung", async ({ page }) => {
    await login(page, ADMIN);
    expect(await testMail(page)).toContain("RESEND_API_KEY oder MAIL_FROM fehlt");
  });

  test("Captains sehen den Knopf nicht", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("[data-tmail]")).toHaveCount(0);
  });

  test("Inhalt: nächstes Training mit Feldspielern und Torhütern, als Test markiert", async () => {
    const L = await import("../supabase/functions/notify/logic.mjs");
    const st = { t: [{ n: "A", p: ["Anna", "Beat"], gk: ["Anna"] }, { n: "B", p: ["Cla"] }],
      m: [{ tr: [{ d: "2026-10-28", p: [] }, { d: "2026-11-11", p: [], lead: "Beat" }, { d: "2026-12-02", p: [] }] }] };
    const m = L.testLeadMail(st, Date.parse("2026-10-30T10:00:00Z"), "https://app");
    expect(m.subject).toBe("[Test] Training heute, Mi, 11.11.2026: 2 Feldspieler, 1 Torhüter");
    expect(m.text).toContain("Hallo Beat");
    // ohne kommendes Training (nur noch Match Day): keine Mail
    expect(L.testLeadMail(st, Date.parse("2026-11-20T10:00:00Z"))).toBeNull();
  });
});

test("Resend: Absender mit Namen, Spielleitung in Kopie ohne Doppel", async () => {
  const M = await import("../supabase/functions/_shared/mail.mjs");
  expect(M.mailBody("app@x.ch", { to: ["Beat@x.ch"], cc: ["admin@x.ch", "beat@x.ch", "", "admin@x.ch"], subject: "S", text: "T" }))
    .toEqual({ from: "Herren Inter <app@x.ch>", to: ["Beat@x.ch"], cc: ["admin@x.ch"], subject: "S", text: "T" });
  expect(M.mailBody("Club <a@x.ch>", { to: ["b@x.ch"], subject: "S", text: "T" })).toEqual({ from: "Club <a@x.ch>", to: ["b@x.ch"], subject: "S", text: "T" });
  expect(M.mailReady()).toBe(false); // ohne Secrets
  expect(await M.sendMail({ to: ["b@x.ch"], subject: "S", text: "T" })).toEqual({ ok: false, error: M.MAIL_MISSING });
});
