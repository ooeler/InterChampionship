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

  test("Inhalt: nächstes Training mit Feldspielern und Torhütern, als Test markiert", { tag: "@logik" }, async () => {
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

test("Brevo: Absender mit Namen, Kopie (Trainer) ohne Doppel", { tag: "@logik" }, async () => {
  const M = await import("../supabase/functions/_shared/mail.mjs");
  expect(M.mailBody("app@x.ch", { to: ["Beat@x.ch"], cc: ["admin@x.ch", "beat@x.ch", "", "admin@x.ch"], subject: "S", text: "T" }))
    .toEqual({ sender: { name: "Herren Inter", email: "app@x.ch" }, to: [{ email: "Beat@x.ch" }], cc: [{ email: "admin@x.ch" }], subject: "S", textContent: "T" });
  expect(M.mailBody("Club <a@x.ch>", { to: ["b@x.ch"], subject: "S", text: "T" }))
    .toEqual({ sender: { name: "Club", email: "a@x.ch" }, to: [{ email: "b@x.ch" }], subject: "S", textContent: "T" });
  expect(M.mailBody('"Herren Inter" <a@x.ch>', { to: ["b@x.ch"], subject: "S", text: "T" }).sender).toEqual({ name: "Herren Inter", email: "a@x.ch" });
  expect(M.mailReady()).toBe(false); // ohne Secrets
  expect(await M.sendMail({ to: ["b@x.ch"], subject: "S", text: "T" })).toEqual({ ok: false, error: M.MAIL_MISSING });
});

test("SMTP (z. B. Mailomat) hat Vorrang vor Brevo, Fehler ohne Passwort", { tag: "@logik" }, async () => {
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

// Rolle Trainer: bekommt die Mail an die Trainingsleitung in Kopie – nicht mehr die Spielleitung
const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };

test("Kopie der Trainingsleitungs-Mail geht an die Trainer, ohne Trainer an niemanden", { tag: "@logik" }, async () => {
  const L = await import("../supabase/functions/notify/logic.mjs");
  const M = [
    { email: "admin@x.ch", role: "admin", trainer: false, lead_mail_cc: true },
    { email: "trainer@x.ch", role: "player", trainer: true, lead_mail_cc: true },
    { email: "Zwei@x.ch", role: "captain", trainer: true },
    { email: "aus@x.ch", role: "player", trainer: true, lead_mail_cc: false },
    { email: "zwei@x.ch", role: "player", trainer: true, lead_mail_cc: true },
  ];
  // nur Trainer (auch mehrere), Abgeschaltete nicht, keine Doppel; die Spielleitung ohne Rolle Trainer nicht
  expect(L.leadMailCc(M, ["beat@x.ch"])).toEqual(["trainer@x.ch", "Zwei@x.ch"]);
  // leitet ein Trainer selbst, bekommt er die Mail nur einmal (als Empfänger)
  expect(L.leadMailCc(M, ["TRAINER@x.ch"])).toEqual(["Zwei@x.ch"]);
  // kein Trainer: keine Kopie, kein Rückfall auf die Spielleitung
  expect(L.leadMailCc([{ email: "admin@x.ch", role: "admin", lead_mail_cc: true }], ["beat@x.ch"])).toEqual([]);
  expect(L.leadMailCc([], ["beat@x.ch"])).toEqual([]);
  expect(L.leadMailCc(null)).toEqual([]);
});

test("Mail an die Trainingsleitung: Zahlen bleiben, Hinweis nur noch auf die 3 Übungen", { tag: "@logik" }, async () => {
  const L = await import("../supabase/functions/notify/logic.mjs");
  const st = { t: [{ n: "A", p: ["Anna", "Beat", "Dario"], gk: ["Anna"] }, { n: "B", p: ["Cla"] }],
    m: [{ tr: [{ d: "2026-11-11", p: [], lead: "Beat", ab: ["Dario"], gs: [{ n: "Gast" }] }, { d: "2026-12-02", p: [] }] }] };
  const m = L.testLeadMail(st, Date.parse("2026-11-09T10:00:00Z"), "https://app");
  expect(m.subject).toBe("[Test] Training morgen, Mi, 11.11.2026: 3 Feldspieler, 1 Torhüter");
  const lines = m.text.split("\n");
  expect(lines).toContain("Angemeldet: 3 Feldspieler und 1 Torhüter (inkl. 1 Gast).");
  expect(lines).toContain("Abgemeldet: Dario");
  expect(lines).toContain("Bitte bereite deine 3 Übungen vor. Den aktuellen Stand siehst du in der App:");
  expect(m.text).not.toMatch(/Einlaufen|Passübungen/);
  // echte Mail beim Abmeldeschluss: gleicher Text
  const [real] = L.leadMailMessages(st, Date.parse("2026-11-10T18:50:00Z"), "https://app"); // Abmeldeschluss 23 h vor 18:45 Uhr
  expect(real.player).toBe("Beat");
  expect(real.text).toContain("Bitte bereite deine 3 Übungen vor.");
  expect(real.text).not.toMatch(/Einlaufen|Passübungen/);
});

test("Spielleitung vergibt die Zusatzrolle Trainer, die Kopie-Einstellung gibt es bei ihr nicht mehr", async ({ page }) => {
  await login(page, ADMIN);
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=mt]");
  await expect(page.locator("[data-tmail]")).toBeVisible(); // Test-Mail bleibt für die Spielleitung
  await expect(page.locator("[data-leadcc]")).toHaveCount(0);
  await expect(page.locator(".card", { hasText: "Mail und Benachrichtigung testen" })).toContainText("In Kopie gehen die Mails an alle mit der Zusatzrolle Trainer.");
  await page.click("h3[data-acc=us]");
  const sk = page.locator(".sk", { has: page.locator("input[data-mtrainer='u-spieler@flyingpenguins.test']") });
  await expect(sk.locator(".rlh").first()).toHaveText("Rolle (Rechte) · verknüpfter Spieler"); // Hauptrolle und Zusatzaufgaben sind beschriftet
  await expect(sk.locator(".rlh").nth(1)).toContainText("Zusätzliche Aufgaben");
  const box = page.locator("input[data-mtrainer='u-spieler@flyingpenguins.test']");
  await expect(box).not.toBeChecked();
  await box.check();
  const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "set_trainer"));
  expect(log[0].args).toEqual({ uid: "u-spieler@flyingpenguins.test", on_trainer: true });
  await expect(page.locator("input[data-mtrainer='u-spieler@flyingpenguins.test']")).toBeChecked();
  // sich selbst zum Trainer machen: Trainer-Karte mit dem Kopie-Schalter erscheint
  await expect(page.locator("h3[data-acc=trc]")).toHaveCount(0);
  await page.locator("input[data-mtrainer='u-admin@flyingpenguins.test']").check();
  await expect(page.locator("h3[data-acc=trc]")).toBeVisible();
});

test("Trainer schaltet die Kopie der Trainingsleitungs-Mail selbst ein und aus", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("__mock_trainer", "1"));
  await login(page, SPIELER);
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=trc]");
  await expect(page.locator(".card", { has: page.locator("h3[data-acc=trc]") })).toContainText("in Kopie");
  const cb = page.locator("[data-leadcc]");
  await expect(cb).toBeChecked(); // Standard: Kopie an
  await cb.uncheck();
  await expect(page.locator("#toast")).toContainText("Keine Kopie mehr");
  expect(await page.evaluate(() => localStorage.getItem("__mock_leadcc"))).toBe("0");
  await page.reload();
  await page.click("nav [data-tab=team]");
  await page.click("h3[data-acc=trc]");
  await expect(page.locator("[data-leadcc]")).not.toBeChecked();
  await expect(page.locator("[data-tmail]")).toHaveCount(0); // Test-Mail nur für die Spielleitung
});

test("ohne Rolle Trainer: kein Kopie-Schalter, und der Server lehnt ihn ab", async ({ page }) => {
  await login(page, SPIELER);
  await page.click("nav [data-tab=team]");
  await expect(page.locator("h3[data-acc=trc]")).toHaveCount(0);
  await expect(page.locator("[data-leadcc]")).toHaveCount(0);
  await expect(page.locator("[data-mtrainer]")).toHaveCount(0);
  const r = await page.evaluate(async () => [(await sb.rpc("set_lead_cc", { on_cc: false })).error, (await sb.rpc("set_trainer", { uid: me.id, on_trainer: true })).error]);
  expect(r[0].message).toBe("Nur für Trainer");
  expect(r[1].message).toBe("Nur die Spielleitung darf Rollen vergeben");
});
