// Mailversand – zwei Wege, Secrets in Supabase → Edge Functions → Secrets:
//   SMTP (z. B. Mailomat, https://mailomat.swiss) – hat Vorrang, wenn gesetzt:
//     SMTP_HOST, SMTP_USER, SMTP_PASS – Zugangsdaten des SMTP-Kontos
//     SMTP_PORT (optional, Standard 465) – Supabase Edge Functions blockieren die Ports 25 und 587
//   Brevo (https://www.brevo.com):
//     BREVO_API_KEY – API-Schlüssel aus Brevo (SMTP & API → API Keys, nicht der SMTP-Schlüssel)
//   MAIL_FROM – beim Anbieter verifizierte Absenderadresse, z. B. app@flyingpenguins.ch oder "Herren Inter <app@flyingpenguins.ch>"
// Diese Datei enthält nur Logik ohne Netz-Bibliothek (in den Tests prüfbar); den SMTP-Versand liefert ../_shared/mailer.ts.
const env = (k) => globalThis.Deno?.env.get(k) || "";

export const MAIL_MISSING = "MAIL_FROM und SMTP_HOST/SMTP_USER/SMTP_PASS (z. B. Mailomat) oder BREVO_API_KEY fehlen (Supabase → Edge Functions → Secrets)";
export const smtpReady = () => !!(env("SMTP_HOST") && env("SMTP_USER") && env("SMTP_PASS"));
// "smtp", "brevo" oder "" (nichts eingerichtet)
export const mailProvider = () => (smtpReady() ? "smtp" : env("BREVO_API_KEY") ? "brevo" : "");
export const mailReady = () => !!(mailProvider() && env("MAIL_FROM"));

// Absender "Name <adresse>" oder nur "adresse" (dann Name "Herren Inter")
function sender(from) {
  const m = /^\s*(.*?)\s*<\s*([^>]+?)\s*>\s*$/.exec(from);
  return m ? { name: m[1].replace(/^"|"$/g, "") || "Herren Inter", email: m[2] } : { name: "Herren Inter", email: from.trim() };
}

// Inhalt für die Brevo-API; doppelte und leere Adressen fallen weg, wer im "to" steht, nicht nochmals im "cc"
export function mailBody(from, { to, cc = [], subject, text }) {
  const uniq = (a) => [...new Map(a.filter(Boolean).map((e) => [e.toLowerCase(), e])).values()];
  const T = uniq(to), own = new Set(T.map((e) => e.toLowerCase()));
  const C = uniq(cc).filter((e) => !own.has(e.toLowerCase()));
  const box = (e) => ({ email: e });
  return { sender: sender(from), to: T.map(box), ...(C.length ? { cc: C.map(box) } : {}), subject, textContent: text };
}

// Dieselbe Mail für SMTP (Format von nodemailer)
export function smtpMessage(from, m) {
  const b = mailBody(from, m), mail = (L) => (L || []).map((x) => x.email);
  return { from: `"${b.sender.name.replace(/["\\\r\n]/g, "")}" <${b.sender.email}>`, to: mail(b.to), ...(b.cc ? { cc: mail(b.cc) } : {}), subject: b.subject, text: b.textContent };
}
export const smtpConfig = () => ({ host: env("SMTP_HOST"), port: Number(env("SMTP_PORT")) || 465, user: env("SMTP_USER"), pass: env("SMTP_PASS") });

// Eine Mail verschicken: { ok: true } oder { ok: false, error }. smtp = Versandfunktion (cfg, msg) für den SMTP-Weg.
export async function sendMail(m, { smtp } = {}) {
  if (!mailReady()) return { ok: false, error: MAIL_MISSING };
  if (mailProvider() === "smtp") {
    if (!smtp) return { ok: false, error: "SMTP-Versand nicht verfügbar" };
    try {
      await smtp(smtpConfig(), smtpMessage(env("MAIL_FROM"), m));
      return { ok: true };
    } catch (e) {
      return { ok: false, error: `SMTP: ${String(e?.message || e).replace(env("SMTP_PASS"), "***").slice(0, 300)}` };
    }
  }
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(mailBody(env("MAIL_FROM"), m)),
  });
  return r.ok ? { ok: true } : { ok: false, error: `Brevo ${r.status}: ${(await r.text()).slice(0, 300)}` };
}
