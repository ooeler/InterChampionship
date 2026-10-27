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
