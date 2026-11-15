// „Passwort vergessen“: reine Logik, damit sie getestet werden kann (tests/passwort.spec.js).
// Die Mail geht über denselben Weg wie die Test-Mail (_shared/mailer.ts: SMTP/Mailomat oder Brevo),
// nicht über den Mailversand von Supabase Auth.

export const DEFAULT_APP_URL = "https://ooeler.github.io/InterChampionship/";
export const PRO_ADRESSE_MIN = 10; // höchstens 1 Mail pro Adresse in 10 Minuten
export const PRO_STUNDE = 30; // höchstens 30 Anfragen pro Stunde insgesamt
export const PREFIX = "pwreset:"; // Schlüssel in push_log: pwreset:<SHA-256 der Adresse>:<10-Min.-Fenster>

export const MSG_ADRESSE = "Bitte eine gültige Mail-Adresse eingeben.";
export const MSG_LIMIT = "Zu viele Anfragen. Bitte warte ein paar Minuten und versuche es dann nochmals.";
export const MSG_FEHLER = "Die Mail zum Zurücksetzen konnte nicht verschickt werden. Bitte später nochmals versuchen oder die Spielleitung informieren.";

// Mail-Adresse normalisieren (Kleinbuchstaben, ohne Leerzeichen) und prüfen
export function checkEmail(input) {
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email)) throw new Error(MSG_ADRESSE);
  return email;
}

// SHA-256 der normalisierten Adresse: in der Datenbank steht die Adresse nie im Klartext
export async function emailHash(email) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(String(email)));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// Schlüssel und Zeitgrenzen für die Sperren (now in ms)
export function rateKeys(hash, now) {
  if (!/^[0-9a-f]{64}$/.test(hash)) throw new Error("ungültiger Hash");
  return {
    key: `${PREFIX}${hash}:${Math.floor(now / (PRO_ADRESSE_MIN * 6e4))}`, // eindeutig: gleiches Fenster → zweiter Eintrag scheitert
    adresse: `${PREFIX}${hash}:%`, // alle Einträge dieser Adresse (für die gleitende 10-Minuten-Sperre)
    alle: `${PREFIX}%`,
    seitAdresse: new Date(now - PRO_ADRESSE_MIN * 6e4).toISOString(),
    seitStunde: new Date(now - 36e5).toISOString(),
    alt: new Date(now - 864e5).toISOString(), // ältere Einträge werden gelöscht
  };
}

// Sperre greift? Anzahl Einträge dieser Adresse in 10 Min. und aller Anfragen in der letzten Stunde
export function limitReached(proAdresse, proStunde) {
  return (Number(proAdresse) || 0) >= 1 || (Number(proStunde) || 0) >= PRO_STUNDE;
}

// Ziel nach dem Klick auf den Link: nur die App-Adresse vom Server (Secret APP_URL), nie aus der Anfrage
export function appUrl(value) {
  try {
    const u = new URL(String(value || ""));
    const lokal = u.protocol === "http:" && /^(localhost|127\.0\.0\.1)$/.test(u.hostname);
    if ((u.protocol === "https:" || lokal) && !u.username && !u.password) return u.href;
  } catch { /* ungültig → Standard */ }
  return DEFAULT_APP_URL;
}

// Inhalt der Mail (Text wie in supabase/mail-vorlagen.json, recovery)
export function resetMail(link) {
  const l = String(link || "");
  if (!/^https?:\/\/\S+$/.test(l)) throw new Error("ungültiger Link");
  return {
    subject: "Herren Inter: Passwort zurücksetzen",
    text: [
      "Hallo",
      "",
      "Du möchtest ein neues Passwort für die App Herren Inter festlegen. Tippe dazu auf diesen Link:",
      "",
      l,
      "",
      "Der Link ist nur kurze Zeit gültig und funktioniert nur einmal.",
      "",
      "Warst du das nicht? Dann kannst du diese Mail einfach ignorieren, dein Passwort bleibt unverändert.",
      "",
      "Let's fly!",
    ].join("\n"),
  };
}

// Fehler von generateLink, die nur bedeuten „kein Konto mit dieser Adresse“ – kein Log, gleiche Antwort
export function unknownUser(err) {
  return !!err && (err.status === 404 || /not found|no user|does not exist/i.test(String(err.message || "")));
}
