// Reine Logik für die Push-Texte – ohne Supabase/Netz, damit sie in den Tests geprüft werden kann.
// Monate und Doppel-Spieltage entsprechen MON/DBL in app/index.html.
export const MON = ["September", "Oktober", "November", "Dezember", "Januar", "Februar", "März", "April"];
export const DBL = [3, 7];

export function zurichDate(now) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Zurich" }).format(now);
}

export function addDays(day, n) {
  const d = new Date(day + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const fd = (d) => d.split("-").reverse().join(".");

// Match Day = letztes Training eines Monats.
export function matchdayMessages(state, today, daysBefore = 3) {
  const target = addDays(today, daysBefore);
  const out = [];
  state.m.forEach((m, i) => {
    const md = m.tr.length ? m.tr[m.tr.length - 1].d : null;
    if (md !== target) return;
    out.push({
      key: `matchday:${md}`,
      tag: `matchday-${i}`,
      title: "⚑ Match Day in 3 Tagen!",
      body: `${MON[i]}: ${state.t[0].n} vs ${state.t[1].n} am ${fd(md)}` + (DBL.includes(i) ? " – zählt doppelt!" : ""),
    });
  });
  return out;
}

const WD = ["So", "Mo", "Di", "Mi", "Do", "Fr", "Sa"];
const wd = (d) => WD[new Date(d + "T12:00:00Z").getUTCDay()] + ", " + fd(d);

// Trainingsleitung: Erinnerung an den eingeteilten Spieler (nicht am Match Day).
// `player` sagt der Edge Function, dass nur dessen Geräte die Nachricht bekommen.
export function trainingLeadMessages(state, today, daysBefore = 2) {
  const target = addDays(today, daysBefore);
  const out = [];
  state.m.forEach((m) => {
    m.tr.forEach((x, ti) => {
      if (ti === m.tr.length - 1 || !x.lead || x.d !== target) return;
      const off = (x.ab || []).includes(x.lead);
      out.push({
        key: `training:${x.d}:${x.lead}`,
        tag: `training-${x.d}`,
        player: x.lead,
        title: off ? "⚠ Du leitest ein Training – bist aber abgemeldet" : "Du leitest das Training",
        body: off
          ? `${wd(x.d)}: Bitte Ersatz für die Trainingsleitung suchen und in der App eintragen.`
          : `${wd(x.d)}: Denk an Einlaufen, Passübungen und deine 3 Übungen.`,
      });
    });
  });
  return out;
}

export function resultMessage(state, i) {
  const m = state.m[i];
  if (!m || m.res[0] == null || m.res[1] == null) return null;
  const [a, b] = m.res;
  const dbl = DBL.includes(i);
  const verdict = a === b
    ? `Unentschieden (${dbl ? "2 : 2" : "1 : 1"} Punkte)`
    : `Sieger: ${state.t[a > b ? 0 : 1].n}${dbl ? " (2 Punkte)" : ""}`;
  return {
    key: `result:${i}:${a}-${b}`,
    tag: `result-${i}`,
    title: `Endstand ${MON[i]}`,
    body: `${state.t[0].n} ${a} : ${b} ${state.t[1].n} – ${verdict}`,
  };
}

// Zeitpunkt "Datum + Uhrzeit in Zürich" als UTC-Millisekunden (Sommer-/Winterzeit korrekt)
export function zurichToUtc(day, time = "18:45") {
  const guess = Date.parse(`${day}T${time}:00Z`);
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Zurich", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
  }).formatToParts(new Date(guess)).map((x) => [x.type, x.value]));
  const asZurich = Date.parse(`${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}:00Z`);
  return guess - (asZurich - guess);
}

// Erinnerung an alle: 26 h vor jedem Training (läuft alle 15 Min.; push_log verhindert Doppelte)
export function trainingSoonMessages(state, nowMs, hoursBefore = 26) {
  const out = [];
  state.m.forEach((m) => {
    m.tr.forEach((x, ti) => {
      const t = x.t || "18:45";
      const start = zurichToUtc(x.d, t);
      const from = start - hoursBefore * 36e5;
      if (nowMs < from || nowMs >= from + 36e5) return; // Fenster von einer Stunde ab 26 h vorher
      const md = ti === m.tr.length - 1;
      out.push({
        key: `training-soon:${x.d}`,
        tag: `training-soon-${x.d}`,
        title: md ? "⚑ Morgen ist Match Day" : "🏒 Morgen ist Training",
        body: `${wd(x.d)}, ${t} Uhr. Kannst du nicht? Abmelden bis 23 h vorher in der App.`,
      });
    });
  });
  return out;
}

// Nachricht, wenn sich jemand an- oder abmeldet
// Prüft gegen die Saison-Daten: nur echte Spieler und echte Trainings, Beginn aus den Daten (nicht vom Client).
// Der Schlüssel begrenzt auf eine Nachricht pro Person, Spieler, Training und Richtung alle 10 Minuten.
export function signupMessage(state, { player, d, off }, uid = "", now = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return null;
  if (!(state.t || []).some((t) => (t.p || []).includes(player))) return null;
  const x = (state.m || []).flatMap((m) => m.tr || []).find((tr) => tr.d === d);
  if (!x) return null;
  return {
    key: `signup:${uid}:${d}:${player}:${off ? 1 : 0}:${Math.floor(now / 6e5)}`,
    tag: `signup-${d}`,
    title: off ? `✗ ${player} hat sich abgemeldet` : `✓ ${player} ist wieder angemeldet`,
    body: `Training ${wd(d)}, ${x.t || "18:45"} Uhr`,
  };
}
