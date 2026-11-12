// Mailversand für die Edge Functions: Logik aus mail.mjs, SMTP (z. B. Mailomat) über nodemailer.
// nodemailer wird erst beim ersten SMTP-Versand geladen: ein Ladefehler trifft so nur die Mail (Fehlermeldung),
// nie den Start der Function (Push-Nachrichten laufen weiter). Fehler fängt sendMail in mail.mjs ab.
import { sendMail as send, mailReady, mailProvider, MAIL_MISSING } from "./mail.mjs";

type Cfg = { host: string; port: number; user: string; pass: string };
async function smtp(c: Cfg, msg: Record<string, unknown>) {
  const { default: nodemailer } = await import("npm:nodemailer@6.9.16");
  const t = nodemailer.createTransport({ host: c.host, port: c.port, secure: c.port === 465, auth: { user: c.user, pass: c.pass } });
  await t.sendMail(msg);
}

export const sendMail = (m: { to: string[]; cc?: string[]; subject: string; text: string }) => send(m, { smtp });
export { mailReady, mailProvider, MAIL_MISSING };
