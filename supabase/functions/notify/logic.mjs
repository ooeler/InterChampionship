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

// Winter Event (wie wevD() in app/js/training.js): das von der Spielleitung gewählte Datum state.wev,
// ohne Wahl der 2. Mittwoch im Dezember. Kein Training mit Leitung.
const isDay = (v) => typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v) && !isNaN(new Date(v + "T12:00:00Z")) && new Date(v + "T12:00:00Z").toISOString().slice(0, 10) === v;
export function isWinterEvent(state, d) {
  if (isDay(state?.wev)) return d === state.wev;
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
      if (ti === m.tr.length - 1 || !x.lead || x.d !== target || isWinterEvent(state, x.d)) return;
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
// Abmeldeschluss: 23 h vor Trainingsbeginn (wie in der App). "morgen", wenn er am Vortag liegt (Normalfall), sonst "heute"
const DEADLINE_H = 23;
const leadStart = (x) => zurichToUtc(x.d, x.t || "18:45");
const leadWhen = (x) => (zurichDate(new Date(leadStart(x) - DEADLINE_H * 36e5)) === x.d ? "heute" : "morgen");
function leadMail(state, x, appUrl) {
  const t = x.t || "18:45", w = leadWhen(x);
  const c = trainingCount(state, x);
  const list = (a) => (a.length ? a.join(", ") : "–");
  return {
    subject: `Training ${w}, ${wd(x.d)}: ${c.field} Feldspieler, ${c.gk} Torhüter`,
    text: [
      `Hallo ${x.lead.split(" ")[0]}`,
      "",
      `Danke, dass du ${w}, ${wd(x.d)}, ${t} Uhr, das Training leitest! 🙌`,
      "",
      "Der Abmeldeschluss ist vorbei. So viele kommen (alle Teams zusammen):",
      `Angemeldet: ${c.field} Feldspieler und ${c.gk} Torhüter${c.guests.length ? ` (inkl. ${c.guests.length} Gast${c.guests.length > 1 ? "spieler" : ""})` : ""}.`,
      `Torhüter: ${list(c.keepers)}`,
      `Gastspieler: ${list(c.guests)}`,
      `Abgemeldet: ${list(c.off)}`,
      ...(c.unsure.length ? [`Unsicher: ${list(c.unsure)}`] : []),
      ...(c.late.length ? [`Verspätet: ${list(c.late)}`] : []),
      "",
      "Denk an Einlaufen, Passübungen und deine 3 Übungen. Den aktuellen Stand siehst du in der App:",
      appUrl,
      "",
      "Let's fly!",
    ].join("\n"),
  };
}

// Mail an die Trainingsleitung am Trainingstag ab 08:00, frühestens nach dem Abmeldeschluss (23 h vorher);
// Spielleitung in Kopie. Läuft alle 15 Min.; push_log verhindert Doppelte.
// Fällig direkt bei Abmeldeschluss (Cron alle 15 Min.: eine Stunde lang, push_log verhindert Doppelte)
function leadDue(state, nowMs) {
  const out = [];
  (state.m || []).forEach((m) => {
    m.tr.forEach((x, ti) => {
      if (ti === m.tr.length - 1 || !x.lead || isWinterEvent(state, x.d)) return; // Match Day und Winter Event haben keine Trainingsleitung
      const start = leadStart(x), from = start - DEADLINE_H * 36e5;
      if (nowMs < from || nowMs >= Math.min(from + 36e5, start)) return;
      out.push(x);
    });
  });
  return out;
}
export function leadMailMessages(state, nowMs, appUrl = "") {
  return leadDue(state, nowMs).map((x) => ({ key: `lead-mail:${x.d}:${x.lead}`, player: x.lead, ...leadMail(state, x, appUrl) }));
}

// Push an die Trainingsleitung zur gleichen Zeit wie die Mail (unabhängig davon, ob Mail eingerichtet ist)
export function leadPushMessages(state, nowMs) {
  return leadDue(state, nowMs).map((x) => {
    const c = trainingCount(state, x);
    return {
      key: `lead-push:${x.d}:${x.lead}`,
      tag: `lead-${x.d}`,
      player: x.lead,
      title: `🙌 Danke, dass du ${leadWhen(x)} das Training leitest`,
      body: `${wd(x.d)}, ${x.t || "18:45"} Uhr: ${c.field} Feldspieler und ${c.gk} Torhüter angemeldet.` + (c.late.length ? ` Verspätet: ${c.late.length}.` : "") + (c.unsure.length ? ` Unsicher: ${c.unsure.length}.` : ""),
    };
  });
}

// Plausibilität der Skorerliste (gleiche Regeln wie skIssues in app/js/spieltag.js):
// Tore pro Team = Endresultat minus Vorsprung (Bonus Anwesenheit + Pre-Game), Assists höchstens so viele wie Tore.
// Bei Forfait ist das Resultat gesetzt, dann zählt nur: Assists höchstens so viele wie erfasste Tore des Teams
const anOf = (m, p, today) => ((m.base || {})[p] || 0) + m.tr.filter((x) => x.d <= today && (x.p || []).includes(p)).length;
export function leadOf(state, m, today) {
  const av = state.t.map((t) => (t.p.length ? t.p.reduce((a, p) => a + anOf(m, p, today), 0) / t.p.length : 0));
  const b = av[0] > av[1] ? [1, 0] : av[1] > av[0] ? [0, 1] : av[0] > 0 ? [1, 1] : [0, 0];
  return [b[0] + ((m.pre || [])[0] || 0), b[1] + ((m.pre || [])[1] || 0)];
}
export function statsIssues(state, i, today) {
  const m = state.m[i];
  if (!m) return [];
  const out = [], sums = (t) => {
    const keys = state.t[t].p.concat((m.gs || []).filter((g) => g.t == t).map((g) => g.k));
    const s = (o) => keys.reduce((a, p) => a + ((o || {})[p] || 0), 0);
    return [s(m.g), s(m.a)];
  };
  if (m.ff != null) {
    [0, 1].forEach((t) => { const [g, a] = sums(t); if (a > g) out.push({ t, k: "a", v: a, w: g }); });
    return out;
  }
  if (m.res[0] == null || m.res[1] == null) return out;
  const l = leadOf(state, m, today);
  [0, 1].forEach((t) => {
    const [g, a] = sums(t), e = m.res[t] - l[t];
    if (e < 0) { out.push({ t, k: "neg", v: m.res[t], w: l[t] }); return; }
    if (g != e) out.push({ t, k: "g", v: g, w: e });
    if (a > e) out.push({ t, k: "a", v: a, w: e });
  });
  return out;
}
export function statsText(state, q) {
  const n = state.t[q.t].n, d = Math.abs(q.v - q.w);
  return q.k == "neg" ? `${n}: Endresultat ${q.v} ist kleiner als der Vorsprung ${q.w}.`
    : q.k == "a" ? `${n}: ${d} Assist${d > 1 ? "s" : ""} zu viel (${q.v} erfasst, höchstens ${q.w} möglich – 1 pro Tor).`
    : `${n}: ${d}${d > 1 ? " Tore" : " Tor"}${q.v > q.w ? " zu viel" : " zu wenig"} (${q.v} erfasst, laut Endresultat minus Vorsprung ${q.w}).`;
}
// Eine einzige Meldung pro Match Day (push_log-Key ohne Datum): am ersten Morgen ab sendAt (eine Stunde lang, Cron alle 15 Min.)
// nach dem Match Day, an dem die Skorerliste nicht stimmt – höchstens `days` Tage danach. Empfänger: Spielleitung und die Captains der betroffenen Teams (teams).
// Empfänger der Skorer-Meldung: alle Spielleitungen und die Captains, deren Spieler in einem der Teams ist (user_ids)
export function statsRecipients(state, teams, members) {
  const T = teams.flatMap((t) => state.t[t]?.p ?? []);
  return members.filter((x) => x.role === "admin" || (x.role === "captain" && T.includes(x.player))).map((x) => x.user_id);
}
// Geräte (push_subscriptions), an die eine Nachricht geht. Alle Empfängerfilter (onlyUsers, msg.player, msg.teams)
// stehen auf der Abfrage, BEVOR sie ausgeführt wird – sonst wirken sie nicht. db = Supabase-Client (im Test eine Attrappe).
export async function pushSubsFor(db, state, msg, onlyUsers) {
  let q = db.from("push_subscriptions").select("endpoint, sub");
  if (onlyUsers) q = q.in("user_id", onlyUsers);
  if (msg.player) { // nur an die Geräte der Konten, die diesem Spieler zugeordnet sind
    const { data: owners } = await db.from("members").select("user_id").eq("player", msg.player);
    q = q.in("user_id", (owners ?? []).map((o) => o.user_id));
  }
  if (msg.teams) { // nur Spielleitung + Captains der betroffenen Teams
    const { data: mem } = await db.from("members").select("user_id, role, player").in("role", ["admin", "captain"]);
    q = q.in("user_id", statsRecipients(state, msg.teams, mem ?? []));
  }
  const { data: subs } = await q;
  return subs ?? [];
}
export function statsMessages(state, nowMs, sendAt = "08:00", days = 14) {
  const today = zurichDate(new Date(nowMs)), from = zurichToUtc(today, sendAt);
  if (nowMs < from || nowMs >= from + 36e5) return [];
  const out = [];
  (state.m || []).forEach((m, i) => {
    const md = m.tr.length ? m.tr[m.tr.length - 1].d : null;
    if (!md || md >= today || addDays(md, days) < today) return;
    const Q = statsIssues(state, i, today);
    if (!Q.length) return;
    out.push({
      key: `stats:${i}`,
      tag: `stats-${i}`,
      teams: [...new Set(Q.map((q) => q.t))],
      title: `⚠️ Skorerliste ${MON[i]} prüfen`,
      body: Q.map((q) => statsText(state, q)).join(" "),
    });
  });
  return out;
}

// Test-Mail für die Spielleitung: so sähe die Mail für das nächste Training aus (ohne Leitung: Beispielname)
export function testLeadMail(state, nowMs, appUrl = "") {
  for (const m of state.m || []) {
    for (let ti = 0; ti < m.tr.length - 1; ti++) {
      const x = m.tr[ti];
      if (zurichToUtc(x.d, x.t || "18:45") <= nowMs || isWinterEvent(state, x.d)) continue;
      const mail = leadMail(state, { ...x, lead: x.lead || "Trainingsleitung" }, appUrl);
      return { subject: "[Test] " + mail.subject, text: "Dies ist eine Test-Mail aus Herren Inter (Teams → Mail testen).\n\n" + mail.text };
    }
  }
  return null;
}
