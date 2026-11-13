// Statische Sicherheitsprüfungen (laufen vor jedem Merge): Datenbank-Rechte, Edge Functions, Workflows, Secrets.
// Jede Regel stammt aus dem Security-Assessment (SECURITY.md) und verhindert, dass eine behobene Lücke zurückkommt.
const { test, expect } = require("@playwright/test");
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const root = path.join(__dirname, "..");
const read = (f) => fs.readFileSync(path.join(root, f), "utf8");
const sqlFiles = ["supabase/setup.sql", ...fs.readdirSync(path.join(root, "supabase/migrations")).map((f) => "supabase/migrations/" + f)];
const sql = sqlFiles.map(read).join("\n");
const fnDirs = fs.readdirSync(path.join(root, "supabase/functions")).filter((d) => !d.startsWith("_"));
const workflows = fs.readdirSync(path.join(root, ".github/workflows")).map((f) => [f, read(".github/workflows/" + f)]);

test.describe("Sicherheit (statisch)", () => {
  test("Datenbank-Funktionen sind ohne Login nicht ausführbar", { tag: "@logik" }, () => {
    const defs = [...sql.matchAll(/create or replace function public\.(\w+)\([^)]*\) returns (\w+)[\s\S]*?security definer/gi)];
    const names = [...new Set(defs.filter((m) => m[2].toLowerCase() !== "trigger").map((m) => m[1]))];
    expect(names.length).toBeGreaterThan(5);
    const missing = names.filter((n) => !new RegExp(`revoke execute on function public\\.${n}\\([^)]*\\)\\s+from public`, "i").test(sql));
    expect(missing, "Funktionen ohne 'revoke … from public'").toEqual([]);
  });

  test("Jede Tabelle hat Row Level Security", { tag: "@logik" }, () => {
    const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);
    const missing = tables.filter((t) => !new RegExp(`alter table public\\.${t} enable row level security`, "i").test(sql));
    expect(missing).toEqual([]);
  });

  test("Edge Functions prüfen Login oder Secret, Secrets in konstanter Zeit", { tag: "@logik" }, () => {
    for (const d of fnDirs) {
      const src = read(`supabase/functions/${d}/index.ts`);
      expect(/auth\.getUser\(|safeEqual\(token/.test(src), `${d}: keine Zugriffsprüfung`).toBe(true);
      expect(src, `${d}: Secret mit === verglichen`).not.toMatch(/[!=]==\s*Deno\.env\.get\("CRON_SECRET"\)/);
    }
  });

  test("Sicherheits-Helfer: Secret-Vergleich und erlaubte Push-Dienste", { tag: "@logik" }, async () => {
    const S = await import("../supabase/functions/_shared/sicherheit.mjs");
    expect(S.safeEqual("abc", "abc")).toBe(true);
    expect(S.safeEqual("abc", "abd")).toBe(false);
    expect(S.safeEqual("", "")).toBe(false); // fehlendes Secret öffnet nie die Tür
    expect(S.safeEqual(undefined, undefined)).toBe(false);
    expect(S.pushEndpointOk("https://fcm.googleapis.com/fcm/send/x")).toBe(true);
    expect(S.pushEndpointOk("https://web.push.apple.com/x")).toBe(true);
    expect(S.pushEndpointOk("https://updates.push.services.mozilla.com/wpush/v2/x")).toBe(true);
    expect(S.pushEndpointOk("http://fcm.googleapis.com/x")).toBe(false);
    expect(S.pushEndpointOk("https://169.254.169.254/latest")).toBe(false);
    expect(S.pushEndpointOk("https://fcm.googleapis.com.evil.example/x")).toBe(false);
    expect(S.pushEndpointOk("kaputt")).toBe(false);
  });

  test("Push-Abo: gesendet wird nur, wenn sub.endpoint der gespeicherten Adresse entspricht", { tag: "@logik" }, async () => {
    const S = await import("../supabase/functions/_shared/sicherheit.mjs");
    const fcm = "https://fcm.googleapis.com/fcm/send/abc";
    expect(S.pushSubOk({ endpoint: fcm, sub: { endpoint: fcm, keys: { p256dh: "x", auth: "y" } } })).toBe(true);
    expect(S.pushSubOk({ endpoint: fcm, sub: { endpoint: "https://example.org/x" } })).toBe(false);
    expect(S.pushSubOk({ endpoint: fcm, sub: { endpoint: "https://fcm.googleapis.com/fcm/send/anders" } })).toBe(false);
    expect(S.pushSubOk({ endpoint: "https://example.org/x", sub: { endpoint: "https://example.org/x" } })).toBe(false);
    expect(S.pushSubOk({ endpoint: fcm, sub: {} })).toBe(false);
    expect(S.pushSubOk({ endpoint: fcm, sub: null })).toBe(false);
    expect(S.pushSubOk({ endpoint: fcm })).toBe(false);
    expect(S.pushSubOk(null)).toBe(false);
    // notify prüft an beiden Stellen das ganze Abo, nicht nur die Spalte
    const src = read("supabase/functions/notify/index.ts");
    expect(src).not.toMatch(/pushEndpointOk\(s\.endpoint\)/);
    expect(src.match(/pushSubOk\(s\)/g)).toHaveLength(2);
  });

  test("Push-Abo: Datenbank-Regel entspricht pushEndpointOk", { tag: "@logik" }, async () => {
    const S = await import("../supabase/functions/_shared/sicherheit.mjs");
    // die neueste Migration, die die Regel setzt
    const datei = fs.readdirSync(path.join(root, "supabase/migrations")).sort().map((f) => read("supabase/migrations/" + f))
      .filter((s) => s.includes("add constraint push_subscriptions_endpoint_pruefen")).pop();
    expect(datei).toBeTruthy();
    const norm = (s) => s.replace(/\s+/g, " ").trim();
    const chk = datei.match(/add constraint push_subscriptions_endpoint_pruefen check \(coalesce\(([\s\S]*?),\s*false\)\);/);
    const del = datei.match(/delete from public\.push_subscriptions\s+where not coalesce\(([\s\S]*?),\s*false\);/);
    expect(chk, "Regel").toBeTruthy();
    expect(del, "Aufräumen").toBeTruthy();
    // Aufräumen löscht genau die Zeilen, die die Regel verbietet (sonst scheitert add constraint im Release)
    expect(norm(del[1])).toBe(norm(chk[1]));
    const teile = norm(chk[1]).match(/^sub->>'endpoint' = endpoint and endpoint ~ '([^']+)'$/);
    expect(teile, "Regel: Abo-Adresse = Spalte und bekannter Push-Dienst").toBeTruthy();
    const re = new RegExp(teile[1]);
    const gut = ["https://fcm.googleapis.com/fcm/send/x", "https://fcm.googleapis.com", "https://web.push.apple.com/x", "https://api.push.apple.com/x",
      "https://updates.push.services.mozilla.com/wpush/v2/x", "https://wns2-par02p.notify.windows.com/w/?token=x"];
    // fremde Hosts, die einer zu breiten Regel durchrutschen würden
    const fremd = ["https://storage.googleapis.com/x", "https://googleapis.com/x", "https://fcm-googleapis.com/x", "https://fcmXgoogleapis.com/x",
      "https://evil.example/fcm.googleapis.com", "https://evil.example/https://fcm.googleapis.com/x", "https://evil.example/?u=https://fcm.googleapis.com/",
      "https://fcm.googleapis.com.evil.example/x", "https://fcm.googleapis.com@evil.example/x", "https://FCM.GOOGLEAPIS.COM.evil.example/x",
      "https://evilpush.apple.com/x", "https://push.apple.com.evil.example/x", "https://notify.windows.com/x", "https://xnotify.windows.com/x",
      "https://updates.push.services.mozilla.com.evil.example/x", "https://push.services.mozilla.com/x",
      "http://fcm.googleapis.com/x", "http://web.push.apple.com/x", "wss://fcm.googleapis.com/x", "https://169.254.169.254/latest", "kaputt", ""];
    for (const u of gut) {
      expect(re.test(u), "DB: " + u).toBe(true);
      expect(S.pushEndpointOk(u), "JS: " + u).toBe(true);
    }
    for (const u of fremd) {
      expect(re.test(u), "DB: " + u).toBe(false);
      expect(S.pushEndpointOk(u), "JS: " + u).toBe(false);
    }
    // Gleicher Host anders geschrieben (Grossbuchstaben, Port, Benutzerangabe): die Datenbank lehnt ab;
    // pushEndpointOk prüft den normalisierten Host (new URL) und ist damit nie strenger als die Datenbank.
    for (const u of ["https://FCM.googleapis.com/x", "https://fcm.googleapis.com:8443/x", "https://user:pw@fcm.googleapis.com/x", "https://fcm.googleapis.com:443/x"]) {
      expect(re.test(u), "DB: " + u).toBe(false);
    }
    for (const u of [...gut, ...fremd]) if (re.test(u)) expect(S.pushEndpointOk(u), u).toBe(true);
  });

  test("Mitglied wird nur, wer über die Einladung kommt", { tag: "@logik" }, () => {
    const files = ["supabase/setup.sql", ...fs.readdirSync(path.join(root, "supabase/migrations")).sort().map((f) => "supabase/migrations/" + f)];
    const defs = files.flatMap((f) => [...read(f).matchAll(/create or replace function public\.handle_new_user\s*\(\s*\)[\s\S]*?\bend\s*\$\$\s*;/gi)].map((m) => m[0]));
    expect(defs.length).toBeGreaterThan(1);
    for (const d of [defs[0], defs[defs.length - 1]]) { // setup.sql und die neueste Definition
      expect(d).toMatch(/if coalesce\(new\.raw_app_meta_data->>'invited', ''\) = 'true'/);
      expect(d.indexOf("insert into public.members")).toBeGreaterThan(d.indexOf("raw_app_meta_data->>'invited'"));
      // Mitglied nur beim Anlegen mit Kennzeichen oder wenn das Kennzeichen neu dazukommt – eine von der Spielleitung
      // entfernte Mitgliedschaft entsteht bei einem späteren Update von app_metadata (z. B. weiterer Login-Anbieter) nicht neu
      expect(d.match(/insert into public\.members/gi)).toHaveLength(1);
      const wenn = d.match(/\bif\s+([\s\S]*?)\s+then\s+insert into public\.members/i);
      expect(wenn && wenn[1].replace(/\s+/g, " ")).toBe(
        "coalesce(new.raw_app_meta_data->>'invited', '') = 'true' and (tg_op = 'INSERT' or coalesce(old.raw_app_meta_data->>'invited', '') <> 'true')");
    }
    // Trigger bei INSERT und bei UPDATE von app_metadata (die Auth-API schreibt app_metadata erst nach dem Anlegen)
    const trig = files.flatMap((f) => [...read(f).matchAll(/create trigger on_auth_user_created\s+([^;]*);/gi)].map((m) => m[1].replace(/\s+/g, " ")));
    expect(trig.length).toBeGreaterThan(1);
    for (const t of [trig[0], trig[trig.length - 1]]) expect(t).toBe("after insert or update of raw_app_meta_data on auth.users for each row execute function public.handle_new_user()");
    // kein Nachtragen von Mitgliedern für beliebige Konten
    expect(sql).not.toMatch(/insert into public\.members\s*\([^)]*\)\s*select[^;]*from auth\.users/i);
    // die Function invite setzt das Kennzeichen, das nur der Server schreiben kann
    expect(read("supabase/functions/invite/index.ts")).toMatch(/createUser\(\{[^}]*app_metadata: \{ invited: true \}/);
    // das Release bricht ab, wenn die freie Registrierung eingeschaltet ist
    expect(read(".github/workflows/release.yml")).toMatch(/config\/auth[\s\S]*disable_signup/);
  });

  test("Workflows: minimale Rechte, kein pull_request_target, Actions mit Commit-Hash", { tag: "@logik" }, () => {
    for (const [f, y] of workflows) {
      expect(y, `${f}: permissions fehlen`).toMatch(/^permissions:/m);
      expect(y, `${f}: pull_request_target`).not.toMatch(/pull_request_target/);
      // Fremde Actions nur über festen Commit-Hash (ein Versions-Tag kann nachträglich verändert werden)
      const loose = [...y.matchAll(/uses: ([^\s.][^\s]*)@([^\s]+)/g)].filter((m) => !/^[0-9a-f]{40}$/.test(m[2])).map((m) => m[0]);
      expect(loose, `${f}: Action ohne Commit-Hash`).toEqual([]);
      // Werte aus PRs/Issues nie direkt ins Shell-Skript (Script-Injection), sondern über env:
      expect(y, `${f}: Script-Injection`).not.toMatch(/run:.*\$\{\{\s*github\.event\.(pull_request|issue|comment)\.[^}]*(title|body|head\.ref)/);
    }
  });

  test("Keine Secrets im Repository", { tag: "@logik" }, () => {
    let files;
    try { files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { test.skip(); return; }
    const bad = /(sb_secret_[A-Za-z0-9_-]{10,}|sbp_[a-f0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|VAPID_PRIVATE_KEY\s*=\s*\S{20,}|service_role[^\n]{0,40}eyJ[A-Za-z0-9_-]{20,})/;
    const hits = files.filter((f) => !/\.(png|jpe?g|ico|pdf|woff2?)$/i.test(f) && fs.existsSync(path.join(root, f)) && bad.test(read(f)));
    expect(hits).toEqual([]);
    expect(files.some((f) => f.startsWith(".secrets/"))).toBe(false);
  });
});
