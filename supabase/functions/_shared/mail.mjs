// Mailversand über Resend (https://resend.com). Secrets in Supabase → Edge Functions → Secrets:
//   RESEND_API_KEY – API-Schlüssel aus Resend
//   MAIL_FROM      – Absender auf der in Resend bestätigten Domain, z. B. app@flyingpenguins.ch oder "Herren Inter <app@flyingpenguins.ch>"
const env = (k) => globalThis.Deno?.env.get(k) || "";

export const MAIL_MISSING = "RESEND_API_KEY oder MAIL_FROM fehlt (Supabase → Edge Functions → Secrets)";
export const mailReady = () => !!(env("RESEND_API_KEY") && env("MAIL_FROM"));

// Inhalt für die Resend-API; doppelte und leere Adressen fallen weg, wer im "to" steht, nicht nochmals im "cc"
export function mailBody(from, { to, cc = [], subject, text }) {
  const uniq = (a) => [...new Map(a.filter(Boolean).map((e) => [e.toLowerCase(), e])).values()];
  const T = uniq(to), own = new Set(T.map((e) => e.toLowerCase()));
  const C = uniq(cc).filter((e) => !own.has(e.toLowerCase()));
  return { from: from.includes("<") ? from : `Herren Inter <${from}>`, to: T, ...(C.length ? { cc: C } : {}), subject, text };
}

// Eine Mail verschicken: { ok: true } oder { ok: false, error }
export async function sendMail(m) {
  if (!mailReady()) return { ok: false, error: MAIL_MISSING };
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env("RESEND_API_KEY")}`, "Content-Type": "application/json" },
    body: JSON.stringify(mailBody(env("MAIL_FROM"), m)),
  });
  return r.ok ? { ok: true } : { ok: false, error: `Resend ${r.status}: ${(await r.text()).slice(0, 300)}` };
}
