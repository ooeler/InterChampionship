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

// Winter Event (2. Mittwoch im Dezember, wie evts() in app/index.html): kein Training mit Leitung
export function isWinterEvent(d) {
  const x = new Date(d + "T12:00:00Z");
  return x.getUTCMonth() === 11 && x.getUTCDay() === 3 && x.getUTCDate() >= 8 && x.getUTCDate() <= 14;
}

// Trainingsleitung: Erinnerung an den eingeteilten Spieler (nicht am Match Day und nicht am Winter Event).
// `player` sagt der Edge Function, dass nur dessen Geräte die Nachricht bekommen.
export function trainingLeadMessages(state, today, daysBefore = 2) {
  const target = addDays(today, daysBefore);
  const out = [];
  state.m.forEach((m) => {
    m.tr.forEach((x, ti) => {
      if (ti === m.tr.length - 1 || !x.lead || x.d !== target || isWinterEvent(x.d)) return;
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
  if (!m || !Number.isInteger(m.res[0]) || !Number.isInteger(m.res[1])) return null;
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
        title: md ? "⚑ Morgen ist Match Day" : "🏑 Morgen ist Training",
        body: `${wd(x.d)}, ${t} Uhr. Kannst du nicht? Abmelden bis 23 h vorher in der App.`,
      });
    });
  });
  return out;
}

// Für andere melden dürfen nur Spielleitung und Captains
export function mayNotifyFor(member, player) {
  return ["admin", "captain"].includes(member?.role) || (!!player && member?.player === player);
}

// Nachricht, wenn sich jemand an- oder abmeldet
// Prüft gegen die Saison-Daten: nur echte Spieler und echte Trainings, Beginn aus den Daten (nicht vom Client).
// Der Schlüssel begrenzt auf eine Nachricht pro Person, Spieler, Training und Richtung alle 10 Minuten.
export function signupMessage(state, { player, d, off }, uid = "", now = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d || "")) return null;
  if (!(state.t || []).some((t) => (t.p || []).includes(player))) return null;
  const x = (state.m || []).flatMap((m) => m.tr || []).concat(state.evt || []).find((tr) => tr.d === d);
  if (!x) return null;
  return {
    key: `signup:${uid}:${d}:${player}:${off ? 1 : 0}:${Math.floor(now / 6e5)}`,
    tag: `signup-${d}`,
    title: off ? `✗ ${player} hat sich abgemeldet` : `✓ ${player} ist wieder angemeldet`,
    body: `Training ${wd(d)}, ${x.t || "18:45"} Uhr`,
  };
}

// Wer kommt zum Training (Stand: Anmeldungen): Spieler ohne Abmeldung + Gastspieler; Torhüter separat gezählt
export function trainingCount(state, x) {
  const gkSet = new Set((state.t || []).flatMap((t) => t.gk || []));
  const ab = x.ab || [];
  const on = (state.t || []).flatMap((t) => t.p || []).filter((p) => !ab.includes(p));
  const gs = (x.gs || []).filter((g) => g && typeof g.n === "string" && g.n.trim());
  const keeper = on.filter((p) => gkSet.has(p)).concat(gs.filter((g) => g.gk).map((g) => g.n + " (Gast)"));
  return {
    field: on.length + gs.length - keeper.length,
    gk: keeper.length,
    keepers: keeper,
    guests: gs.map((g) => g.n + (g.gk ? " 🧤" : "")),
    off: (state.t || []).flatMap((t) => t.p || []).filter((p) => ab.includes(p)),
    unsure: on.filter((p) => (x.st || {})[p] === "u"),
    late: on.filter((p) => (x.st || {})[p] === "v"),
  };
}

// Inhalt der Mail an die Trainingsleitung für ein Training
function leadMail(state, x, appUrl) {
  const t = x.t || "18:45";
  const c = trainingCount(state, x);
  const list = (a) => (a.length ? a.join(", ") : "–");
  return {
    subject: `Training ${wd(x.d)}: ${c.field} Feldspieler, ${c.gk} Torhüter`,
    text: [
      `Hallo ${x.lead.split(" ")[0]}`,
      "",
      `Morgen, ${wd(x.d)}, ${t} Uhr, leitest du das Training.`,
      "",
      `Angemeldet: ${c.field} Feldspieler und ${c.gk} Torhüter${c.guests.length ? ` (inkl. ${c.guests.length} Gast${c.guests.length > 1 ? "spieler" : ""})` : ""}.`,
      `Torhüter: ${list(c.keepers)}`,
      `Gastspieler: ${list(c.guests)}`,
      `Abgemeldet: ${list(c.off)}`,
      ...(c.unsure.length ? [`Unsicher: ${list(c.unsure)}`] : []),
      ...(c.late.length ? [`Verspätet: ${list(c.late)}`] : []),
      "",
      "Denk an Einlaufen, Passübungen und deine 3 Übungen. Abmeldungen sind noch bis 23 h vorher möglich – den aktuellen Stand siehst du in der App:",
      appUrl,
      "",
      "Let's fly!",
    ].join("\n"),
  };
}

// Mail an die Trainingsleitung 24 h vor dem Training (läuft alle 15 Min.; push_log verhindert Doppelte)
export function leadMailMessages(state, nowMs, appUrl = "", hoursBefore = 24) {
  const out = [];
  (state.m || []).forEach((m) => {
    m.tr.forEach((x, ti) => {
      if (ti === m.tr.length - 1 || !x.lead || isWinterEvent(x.d)) return; // Match Day und Winter Event haben keine Trainingsleitung
      const from = zurichToUtc(x.d, x.t || "18:45") - hoursBefore * 36e5;
      if (nowMs < from || nowMs >= from + 36e5) return;
      out.push({ key: `lead-mail:${x.d}:${x.lead}`, player: x.lead, ...leadMail(state, x, appUrl) });
    });
  });
  return out;
}

// Test-Mail für die Spielleitung: so sähe die Mail für das nächste Training aus (ohne Leitung: Beispielname)
export function testLeadMail(state, nowMs, appUrl = "") {
  for (const m of state.m || []) {
    for (let ti = 0; ti < m.tr.length - 1; ti++) {
      const x = m.tr[ti];
      if (zurichToUtc(x.d, x.t || "18:45") <= nowMs || isWinterEvent(x.d)) continue;
      const mail = leadMail(state, { ...x, lead: x.lead || "Trainingsleitung" }, appUrl);
      return { subject: "[Test] " + mail.subject, text: "Dies ist eine Test-Mail aus Herren Inter (Teams → Mail testen).\n\n" + mail.text };
    }
  }
  return null;
}
