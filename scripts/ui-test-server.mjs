// Lokale Demo der gebauten App für den Agenten "ui-tester": echte Oberfläche, aber Test-Backend statt Supabase
// (tests/mock-supabase.js), damit nichts an den echten Daten passiert. Start: npm run ui-test
// Daten liegen nur im Browser des Testers. Port 4174, damit die Playwright-Tests (4173) parallel laufen können.
import { createServer } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import { extname, join, normalize } from "node:path";

const PORT = 4174, ROOT = "dist";
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "application/javascript; charset=utf-8", ".json": "application/json", ".webmanifest": "application/manifest+json", ".png": "image/png", ".svg": "image/svg+xml" };

// Test-Konten: wie in den Tests, zusätzlich jedem Konto einen Spieler zugeordnet, plus ein Konto mit Zusatzrollen
const mock = () => readFileSync("tests/mock-supabase.js", "utf8")
  .replace(`{ pw: "geheim123", role: "captain" }`, `{ pw: "geheim123", role: "captain", player: "Andreas Scherrer" }`)
  .replace(`{ pw: "admin123", role: "admin" }`, `{ pw: "admin123", role: "admin", player: "Othmar Oeler" }`)
  .replace(`{ pw: "spieler123", role: "player", name: "Silvan Frey" }`, `{ pw: "spieler123", role: "player", name: "Silvan Frey", player: "Silvan Frey" },
    "chef@flyingpenguins.test": { pw: "chef123", role: "player", player: "Beat Rentsch", resto: true, strafen: true }`);

createServer((req, res) => {
  const path = normalize(decodeURIComponent(new URL(req.url, "http://localhost").pathname));
  const send = (body, type) => { res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body) };
  if (path.endsWith("config.js")) return send(mock(), TYPES[".js"]);
  if (path.endsWith("supabase.js")) return send("", TYPES[".js"]); // das Test-Backend ersetzt die Bibliothek
  const file = join(ROOT, path === "\\" || path === "/" ? "index.html" : path);
  if (!file.startsWith(ROOT) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); return res.end("Nicht gefunden") }
  send(readFileSync(file), TYPES[extname(file)] || "application/octet-stream");
}).listen(PORT, "127.0.0.1", () => console.log(`UI-Test: http://localhost:${PORT}`));
