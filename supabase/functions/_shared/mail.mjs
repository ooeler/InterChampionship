// Mailversand über Brevo (https://www.brevo.com). Secrets in Supabase → Edge Functions → Secrets:
//   BREVO_API_KEY – API-Schlüssel aus Brevo (SMTP & API → API Keys, nicht der SMTP-Schlüssel)
//   MAIL_FROM     – in Brevo verifizierte Absenderadresse, z. B. app@flyingpenguins.ch oder "Herren Inter <app@flyingpenguins.ch>"
const env = (k) => globalThis.Deno?.env.get(k) || "";

export const MAIL_MISSING = "BREVO_API_KEY oder MAIL_FROM fehlt (Supabase → Edge Functions → Secrets)";
export const mailReady = () => !!(env("BREVO_API_KEY") && env("MAIL_FROM"));

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

// Eine Mail verschicken: { ok: true } oder { ok: false, error }
export async function sendMail(m) {
  if (!mailReady()) return { ok: false, error: MAIL_MISSING };
  const r = await fetch("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: { "api-key": env("BREVO_API_KEY"), "Content-Type": "application/json", accept: "application/json" },
    body: JSON.stringify(mailBody(env("MAIL_FROM"), m)),
  });
  return r.ok ? { ok: true } : { ok: false, error: `Brevo ${r.status}: ${(await r.text()).slice(0, 300)}` };
}
