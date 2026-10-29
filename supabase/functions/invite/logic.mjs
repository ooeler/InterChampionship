// Einladungslinks: reine Logik, damit sie getestet werden kann.
// Captains dürfen nur Spieler einladen; die Spielleitung darf jede Rolle vergeben.
export const ROLES = ["player", "captain", "admin"];
export const INVITE_DAYS = 7;

export function checkInvite(input, callerRole) {
  if (callerRole !== "admin" && callerRole !== "captain") throw new Error("Nur Spielleitung und Captains dürfen einladen.");
  const role = input?.role ?? "player";
  if (!ROLES.includes(role)) throw new Error("Unbekannte Rolle.");
  if (role !== "player" && callerRole !== "admin") throw new Error("Nur die Spielleitung darf Captains oder Spielleitung einladen.");
  const player = input?.player ? String(input.player).trim().slice(0, 80) : null;
  return { role, player };
}

// Link-Token: 32 Zufallsbytes (base64url). In der Datenbank liegt nur der SHA-256-Hash.
export function newToken() {
  const b = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(h)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

export function checkToken(token) {
  const t = String(token ?? "");
  if (!/^[A-Za-z0-9_-]{43}$/.test(t)) throw new Error("Dieser Einladungslink ist ungültig.");
  return t;
}

// Registrierung über den Link: Mail-Adresse und Passwort prüfen
export function checkJoin(input) {
  const email = String(input?.email ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || email.length > 254) throw new Error("Bitte eine gültige Mail-Adresse eingeben.");
  const password = String(input?.password ?? "");
  if (password.length < 8) throw new Error("Das Passwort braucht mindestens 8 Zeichen.");
  if (password.length > 72) throw new Error("Das Passwort darf höchstens 72 Zeichen haben.");
  return { email, password };
}

// Verständliche Meldung für die häufigsten Fehler von Supabase
export function joinError(message = "") {
  if (/already been registered|already registered|exists/i.test(message)) return "Diese Adresse hat bereits ein Konto. Bitte normal anmelden.";
  if (/password/i.test(message)) return "Das Passwort ist zu schwach. Bitte ein längeres wählen.";
  return "Registrierung fehlgeschlagen: " + message;
}
