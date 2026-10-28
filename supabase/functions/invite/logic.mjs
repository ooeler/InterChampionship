// Prüft eine Einladung aus der App. Reine Logik, damit sie getestet werden kann.
// Captains dürfen nur Spieler einladen; die Spielleitung darf jede Rolle vergeben.
export const ROLES = ["player", "captain", "admin"];

export function checkInvite(input, callerRole) {
  if (callerRole !== "admin" && callerRole !== "captain") throw new Error("Nur Spielleitung und Captains dürfen einladen.");
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new Error("Bitte eine gültige Mail-Adresse eingeben.");
  const role = input?.role ?? "player";
  if (!ROLES.includes(role)) throw new Error("Unbekannte Rolle.");
  if (role !== "player" && callerRole !== "admin") throw new Error("Nur die Spielleitung darf Captains oder Spielleitung einladen.");
  const player = input?.player ? String(input.player).trim().slice(0, 80) : null;
  return { email, role, player };
}

// Verständliche Meldung für die häufigsten Fehler von Supabase
export function inviteError(message = "") {
  if (/already been registered|already registered|exists/i.test(message)) return "Diese Adresse hat bereits ein Konto.";
  if (/sending|smtp|email rate|rate limit/i.test(message)) return "Die Einladungs-Mail konnte nicht verschickt werden. Ist der Mailversand (SMTP) in Supabase eingerichtet?";
  return "Einladung fehlgeschlagen: " + message;
}
