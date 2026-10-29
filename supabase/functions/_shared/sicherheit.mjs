// Gemeinsame Sicherheits-Helfer der Edge Functions. Reine Logik, damit sie getestet werden kann.

// Vergleicht Secrets in konstanter Zeit (verrät über die Antwortzeit nicht, wie viele Zeichen stimmen)
export function safeEqual(a, b) {
  const x = new TextEncoder().encode(String(a ?? "")), y = new TextEncoder().encode(String(b ?? ""));
  let d = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) d |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return d === 0 && x.length > 0;
}

// Push wird nur an die bekannten Push-Dienste der Browser geschickt – nie an beliebige Adressen
const PUSH_HOSTS = [/^fcm\.googleapis\.com$/, /^updates\.push\.services\.mozilla\.com$/, /(^|\.)push\.apple\.com$/, /\.notify\.windows\.com$/];
export function pushEndpointOk(url) {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && PUSH_HOSTS.some((r) => r.test(u.hostname));
  } catch {
    return false;
  }
}
