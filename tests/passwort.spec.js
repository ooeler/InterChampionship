// „Passwort vergessen“ über die eigene Edge Function (supabase/functions/passwort): Logik und Regeln im Code
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");

test.describe("Passwort vergessen: Edge Function passwort", () => {
  let L;
  test.beforeAll(async () => { L = await import("../supabase/functions/passwort/logic.mjs") });

  test("Adresse wird normalisiert und geprüft", { tag: "@logik" }, () => {
    expect(L.checkEmail({ email: "  Anna.Muster@Example.CH " })).toBe("anna.muster@example.ch");
    for (const e of ["", "anna", "anna@", "@example.ch", "anna@example", "an na@example.ch", "a@b.c", null, undefined])
      expect(() => L.checkEmail({ email: e }), String(e)).toThrow(L.MSG_ADRESSE);
    expect(() => L.checkEmail({ email: "a".repeat(250) + "@x.ch" })).toThrow(L.MSG_ADRESSE);
    expect(() => L.checkEmail(null)).toThrow(L.MSG_ADRESSE);
  });

  test("Sperr-Schlüssel enthält die Adresse nur als SHA-256", { tag: "@logik" }, async () => {
    const h = await L.emailHash("anna@example.ch");
    expect(h).toMatch(/^[0-9a-f]{64}$/);
    expect(h).toBe("d638395e10492552529e88710d7e080892e66a4933dbb8f8b4e263694632d287"); // SHA-256 von "anna@example.ch"
    expect(await L.emailHash("anna@example.ch")).toBe(h); // stabil
    expect(await L.emailHash("beat@example.ch")).not.toBe(h);
    const now = Date.parse("2026-11-15T10:03:00Z");
    const k = L.rateKeys(h, now);
    expect(k.key).toBe(`pwreset:${h}:${Math.floor(now / 6e5)}`);
    expect(k.key).not.toContain("anna");
    expect(k.adresse).toBe(`pwreset:${h}:%`);
    expect(k.alle).toBe("pwreset:%");
    expect(k.seitAdresse).toBe("2026-11-15T09:53:00.000Z"); // gleitend 10 Minuten
    expect(k.seitStunde).toBe("2026-11-15T09:03:00.000Z");
    expect(k.alt).toBe("2026-11-14T10:03:00.000Z");
    // gleiches 10-Minuten-Fenster → gleicher Schlüssel (der zweite Eintrag scheitert am Primärschlüssel)
    expect(L.rateKeys(h, now + 60e3).key).toBe(k.key);
    expect(() => L.rateKeys("anna@example.ch", now)).toThrow(); // nie die Adresse selbst als Schlüssel
  });

  test("Sperre: 1 pro Adresse in 10 Minuten, 30 pro Stunde insgesamt", { tag: "@logik" }, () => {
    expect(L.limitReached(0, 0)).toBe(false);
    expect(L.limitReached(1, 1)).toBe(true);
    expect(L.limitReached(0, 29)).toBe(false);
    expect(L.limitReached(0, 30)).toBe(true);
    expect(L.limitReached(null, null)).toBe(false);
  });

  test("Ziel des Links nur aus APP_URL, sonst die Standard-Adresse", { tag: "@logik" }, () => {
    expect(L.appUrl("https://ooeler.github.io/InterChampionship/")).toBe("https://ooeler.github.io/InterChampionship/");
    expect(L.appUrl("http://localhost:4173/")).toBe("http://localhost:4173/");
    for (const v of ["", undefined, "javascript:alert(1)", "http://example.ch/", "ftp://x/", "https://a:b@example.ch/", "kein link"])
      expect(L.appUrl(v), String(v)).toBe(L.DEFAULT_APP_URL);
  });

  test("Mail: Betreff wie die Mailvorlage, Text mit dem Link", { tag: "@logik" }, () => {
    const link = "https://abc.supabase.co/auth/v1/verify?token=xyz&type=recovery&redirect_to=https://ooeler.github.io/InterChampionship/";
    const m = L.resetMail(link);
    const v = JSON.parse(read("supabase/mail-vorlagen.json"));
    expect(m.subject).toBe(v.mailer_subjects_recovery);
    expect(m.text).toContain("\n" + link + "\n");
    expect(m.text).toContain("Hallo");
    expect(m.text).toContain("Warst du das nicht?");
    expect(m.text).not.toContain("ß");
    expect(() => L.resetMail("")).toThrow();
    expect(() => L.resetMail("javascript:alert(1)")).toThrow();
  });

  test("Unbekannte Adresse wird erkannt (keine Meldung nach aussen)", { tag: "@logik" }, () => {
    expect(L.unknownUser({ status: 404, message: "x" })).toBe(true);
    expect(L.unknownUser({ message: "User not found" })).toBe(true);
    expect(L.unknownUser({ status: 500, message: "Database error" })).toBe(false);
    expect(L.unknownUser(null)).toBe(false);
  });

  test("Function: Link-Ziel nie aus der Anfrage, Antwort für alle Adressen gleich, Mail über den eigenen Versand", { tag: "@logik" }, () => {
    const src = read("supabase/functions/passwort/index.ts");
    expect(src).toContain('generateLink({ type: "recovery", email, options: { redirectTo: APP_URL } })');
    expect(src).toMatch(/const APP_URL = appUrl\(Deno\.env\.get\("APP_URL"\)\)/);
    expect(src).not.toMatch(/body\.(redirect|url|link)/i);
    expect(src).toContain('from "../_shared/mailer.ts"');
    expect(src).not.toMatch(/resetPasswordForEmail|inviteUserByEmail/);
    // Erfolg: genau eine Antwort { ok: true }, nach dem Versand-Job (der Job meldet nichts nach aussen)
    expect(src.match(/json\(\{ ok: true \}\)/g)).toHaveLength(1);
    expect(src).not.toMatch(/json\(\{[^}]*(action_link|link|email)[^}]*\}/);
    // Sperre in push_log nur mit dem Hash, nie mit der Adresse
    expect(src).toContain("rateKeys(await emailHash(email), now)");
    expect(src).not.toMatch(/insert\(\{[^}]*email/);
  });

  test("App: „Passwort vergessen“ ruft die Function auf, nicht Supabase Auth", { tag: "@logik" }, () => {
    const js = fs.readdirSync(path.join(root, "app/js")).map((f) => read("app/js/" + f)).join("\n");
    expect(js).not.toContain("resetPasswordForEmail");
    expect(js).toContain('fnCall("passwort",{email:F.email.value.trim()})');
    // Rücksprung: der Link von Supabase Auth endet mit #…type=recovery → „Passwort festlegen“
    expect(js).toMatch(/INV=\/type=\(invite\|recovery\)\/\.test\(H\)/);
    expect(js).toContain('if(ev=="PASSWORD_RECOVERY")INV=true');
  });
});
