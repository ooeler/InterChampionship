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
  test("Datenbank-Funktionen sind ohne Login nicht ausführbar", () => {
    const defs = [...sql.matchAll(/create or replace function public\.(\w+)\([^)]*\) returns (\w+)[\s\S]*?security definer/gi)];
    const names = [...new Set(defs.filter((m) => m[2].toLowerCase() !== "trigger").map((m) => m[1]))];
    expect(names.length).toBeGreaterThan(5);
    const missing = names.filter((n) => !new RegExp(`revoke execute on function public\\.${n}\\([^)]*\\)\\s+from public`, "i").test(sql));
    expect(missing, "Funktionen ohne 'revoke … from public'").toEqual([]);
  });

  test("Jede Tabelle hat Row Level Security", () => {
    const tables = [...sql.matchAll(/create table if not exists public\.(\w+)/gi)].map((m) => m[1]);
    const missing = tables.filter((t) => !new RegExp(`alter table public\\.${t} enable row level security`, "i").test(sql));
    expect(missing).toEqual([]);
  });

  test("Edge Functions prüfen Login oder Secret, Secrets in konstanter Zeit", () => {
    for (const d of fnDirs) {
      const src = read(`supabase/functions/${d}/index.ts`);
      expect(/auth\.getUser\(|safeEqual\(token/.test(src), `${d}: keine Zugriffsprüfung`).toBe(true);
      expect(src, `${d}: Secret mit === verglichen`).not.toMatch(/[!=]==\s*Deno\.env\.get\("CRON_SECRET"\)/);
    }
  });

  test("Sicherheits-Helfer: Secret-Vergleich und erlaubte Push-Dienste", async () => {
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

  test("Workflows: minimale Rechte, kein pull_request_target, Actions mit Version", () => {
    for (const [f, y] of workflows) {
      expect(y, `${f}: permissions fehlen`).toMatch(/^permissions:/m);
      expect(y, `${f}: pull_request_target`).not.toMatch(/pull_request_target/);
      expect(y, `${f}: Action ohne feste Version`).not.toMatch(/uses: [^\s]+@(main|master)\b/);
      // Werte aus PRs/Issues nie direkt ins Shell-Skript (Script-Injection), sondern über env:
      expect(y, `${f}: Script-Injection`).not.toMatch(/run:.*\$\{\{\s*github\.event\.(pull_request|issue|comment)\.[^}]*(title|body|head\.ref)/);
    }
  });

  test("Keine Secrets im Repository", () => {
    let files;
    try { files = execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean); } catch { test.skip(); return; }
    const bad = /(sb_secret_[A-Za-z0-9_-]{10,}|sbp_[a-f0-9]{30,}|ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|VAPID_PRIVATE_KEY\s*=\s*\S{20,}|service_role[^\n]{0,40}eyJ[A-Za-z0-9_-]{20,})/;
    const hits = files.filter((f) => !/\.(png|jpe?g|ico|pdf|woff2?)$/i.test(f) && fs.existsSync(path.join(root, f)) && bad.test(read(f)));
    expect(hits).toEqual([]);
    expect(files.some((f) => f.startsWith(".secrets/"))).toBe(false);
  });
});
