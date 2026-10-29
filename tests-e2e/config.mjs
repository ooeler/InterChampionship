// Schreibt dist/config.js für die lokale Test-Supabase (nur E2E; app/config.js bleibt unverändert).
import { writeFileSync } from "node:fs";

const url = process.env.E2E_SUPABASE_URL, key = process.env.E2E_ANON_KEY;
if (!url || !key) {
  console.error("E2E_SUPABASE_URL und E2E_ANON_KEY fehlen (lokale Supabase starten, siehe playwright.e2e.config.js)");
  process.exit(1);
}
if (!/^http:\/\/(127\.0\.0\.1|localhost)[:/]/.test(url)) {
  console.error("E2E-Tests laufen nur gegen eine lokale Supabase, nicht gegen " + url);
  process.exit(1);
}
writeFileSync("dist/config.js", "window.IM_CONFIG = " + JSON.stringify({ url, key, providers: [], vapidPublicKey: "" }, null, 2) + ";\n");
