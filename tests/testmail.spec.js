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

  test("ohne Brevo-Secrets: verständliche Fehlermeldung", async ({ page }) => {
    await login(page, ADMIN);
    expect(await testMail(page)).toContain("BREVO_API_KEY oder MAIL_FROM fehlt");
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
    expect(m.subject).toBe("[Test] Training morgen, Mi, 11.11.2026: 2 Feldspieler, 1 Torhüter");
    expect(m.text).toContain("Hallo Beat");
    // ohne kommendes Training (nur noch Match Day): keine Mail
    expect(L.testLeadMail(st, Date.parse("2026-11-20T10:00:00Z"))).toBeNull();
  });
});

test("Brevo: Absender mit Namen, Spielleitung in Kopie ohne Doppel", async () => {
  const M = await import("../supabase/functions/_shared/mail.mjs");
  expect(M.mailBody("app@x.ch", { to: ["Beat@x.ch"], cc: ["admin@x.ch", "beat@x.ch", "", "admin@x.ch"], subject: "S", text: "T" }))
    .toEqual({ sender: { name: "Herren Inter", email: "app@x.ch" }, to: [{ email: "Beat@x.ch" }], cc: [{ email: "admin@x.ch" }], subject: "S", textContent: "T" });
  expect(M.mailBody("Club <a@x.ch>", { to: ["b@x.ch"], subject: "S", text: "T" }))
    .toEqual({ sender: { name: "Club", email: "a@x.ch" }, to: [{ email: "b@x.ch" }], subject: "S", textContent: "T" });
  expect(M.mailBody('"Herren Inter" <a@x.ch>', { to: ["b@x.ch"], subject: "S", text: "T" }).sender).toEqual({ name: "Herren Inter", email: "a@x.ch" });
  expect(M.mailReady()).toBe(false); // ohne Secrets
  expect(await M.sendMail({ to: ["b@x.ch"], subject: "S", text: "T" })).toEqual({ ok: false, error: M.MAIL_MISSING });
});

test("SMTP (z. B. Mailomat) hat Vorrang vor Brevo, Fehler ohne Passwort", async () => {
  const M = await import("../supabase/functions/_shared/mail.mjs");
  const msg = { to: ["b@x.ch"], cc: ["admin@x.ch", "B@x.ch"], subject: "S", text: "T" };
  expect(M.smtpMessage('"Club" <a@x.ch>', msg)).toEqual({ from: '"Club" <a@x.ch>', to: ["b@x.ch"], cc: ["admin@x.ch"], subject: "S", text: "T" });
  expect(M.smtpMessage("a@x.ch", { to: ["b@x.ch"], subject: "S", text: "T" })).toEqual({ from: '"Herren Inter" <a@x.ch>', to: ["b@x.ch"], subject: "S", text: "T" });
  const E = {}, old = globalThis.Deno, oldFetch = globalThis.fetch;
  globalThis.Deno = { env: { get: (k) => E[k] } };
  const brevo = [];
  globalThis.fetch = async (u) => { brevo.push(u); return { ok: true }; };
  try {
    Object.assign(E, { BREVO_API_KEY: "k", MAIL_FROM: "a@x.ch" });
    expect(M.mailProvider()).toBe("brevo");
    expect(await M.sendMail(msg)).toEqual({ ok: true });
    expect(brevo).toHaveLength(1);
    Object.assign(E, { SMTP_HOST: "smtp.example.ch", SMTP_USER: "u" }); // unvollständig: weiter Brevo
    expect(M.mailProvider()).toBe("brevo");
    E.SMTP_PASS = "geheim";
    expect(M.mailProvider()).toBe("smtp");
    expect(M.smtpConfig()).toEqual({ host: "smtp.example.ch", port: 465, user: "u", pass: "geheim" });
    const sent = [];
    expect(await M.sendMail(msg, { smtp: async (c, m) => sent.push([c.host, m.to]) })).toEqual({ ok: true });
    expect(sent).toEqual([["smtp.example.ch", ["b@x.ch"]]]);
    expect(brevo).toHaveLength(1); // nicht über Brevo
    const r = await M.sendMail(msg, { smtp: async () => { throw new Error("535 auth failed for u/geheim"); } });
    expect(r.ok).toBe(false);
    expect(r.error).toContain("SMTP: 535");
    expect(r.error).not.toContain("geheim");
    expect(await M.sendMail(msg)).toEqual({ ok: false, error: "SMTP-Versand nicht verfügbar" });
    delete E.MAIL_FROM;
    expect(M.mailReady()).toBe(false);
  } finally {
    globalThis.Deno = old;
    globalThis.fetch = oldFetch;
  }
});

test("Spielleitung schaltet die Kopie der Trainingsleitungs-Mail selbst ein und aus", async ({ page }) => {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=mt]");
  const cb = page.locator("[data-leadcc]");
  await expect(cb).toBeChecked(); // Standard: Kopie an
  await cb.uncheck();
  await expect(page.locator("#toast")).toContainText("Keine Kopie mehr");
  expect(await page.evaluate(() => localStorage.getItem("__mock_leadcc"))).toBe("0");
  await page.reload();
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=mt]");
  await expect(page.locator("[data-leadcc]")).not.toBeChecked();
});
