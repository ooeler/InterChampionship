// Tests für die Brücke Supabase → GitHub-Issues (scripts/feedback-to-issues.mjs).
// Sie stellen sicher, dass die Verbindung ohne persönliches Token funktioniert und Fehler sichtbar werden.
const { test, expect } = require("@playwright/test");

const ENV = { SUPABASE_URL: "https://x.supabase.co", CRON_SECRET: "geheim", GITHUB_TOKEN: "gh-auto", GITHUB_REPOSITORY: "ooeler/InterChampionship" };
const res = (status, body) => ({ ok: status < 300, status, json: async () => body, text: async () => JSON.stringify(body) });

function fakeFetch({ pending = [], githubStatus = 201, opsStatus = 200 } = {}) {
  const calls = [];
  let n = 100;
  const f = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, auth: init.headers.Authorization, body });
    if (url.endsWith("/functions/v1/feedback-export")) {
      if (body.action === "pending") return res(opsStatus, { items: pending });
      return res(200, { ok: true });
    }
    if (url === "https://api.github.com/repos/ooeler/InterChampionship/issues") {
      return githubStatus < 300 ? res(githubStatus, { number: ++n, html_url: `https://github.com/ooeler/InterChampionship/issues/${n}` }) : res(githubStatus, { message: "Bad credentials" });
    }
    throw new Error("unerwartete URL " + url);
  };
  return { f, calls };
}

let run;
test.beforeAll(async () => { ({ run } = await import("../scripts/feedback-to-issues.mjs")) });

test("legt Issues mit dem GitHub-Actions-Token an und meldet sie zurück", async () => {
  const items = [{ id: 1, title: "💡 Dark Mode", body: "Bitte", labels: ["verbesserung", "aus-der-app"] }, { id: 2, title: "🐞 Fehler", body: "x", labels: ["fehler", "aus-der-app"] }];
  const { f, calls } = fakeFetch({ pending: items });
  expect(await run({ env: ENV, fetch: f, log: () => {} })).toBe(2);
  const gh = calls.filter((c) => c.url.includes("api.github.com"));
  expect(gh).toHaveLength(2);
  expect(gh[0].auth).toBe("Bearer gh-auto"); // eingebauter Token, kein persönliches Token
  expect(gh[0].body).toEqual({ title: "💡 Dark Mode", body: "Bitte", labels: ["verbesserung", "aus-der-app"] });
  const done = calls.filter((c) => c.body.action === "done");
  expect(done.map((c) => [c.body.id, c.body.number])).toEqual([[1, 101], [2, 102]]);
  expect(calls[0].auth).toBe("Bearer geheim");
});

test("ohne neue Vorschläge passiert nichts", async () => {
  const { f, calls } = fakeFetch();
  expect(await run({ env: ENV, fetch: f, log: () => {} })).toBe(0);
  expect(calls).toHaveLength(1);
});

test("GitHub-Fehler wird gespeichert und lässt den Lauf fehlschlagen", async () => {
  const { f, calls } = fakeFetch({ pending: [{ id: 5, title: "x", body: "y", labels: [] }], githubStatus: 401 });
  await expect(run({ env: ENV, fetch: f, log: () => {} })).rejects.toThrow("1 Vorschläge konnten nicht");
  const failed = calls.find((c) => c.body.action === "failed");
  expect(failed.body.id).toBe(5);
  expect(failed.body.error).toContain("401");
});

test("nicht erreichbare Supabase-Funktion lässt den Lauf fehlschlagen", async () => {
  const { f } = fakeFetch({ opsStatus: 403 });
  await expect(run({ env: ENV, fetch: f, log: () => {} })).rejects.toThrow("HTTP 403");
});

test("Workflow nutzt keinen persönlichen Token und hat Issue-Schreibrecht", async () => {
  const yml = require("fs").readFileSync(require("path").join(__dirname, "..", ".github", "workflows", "feedback-issues.yml"), "utf8");
  expect(yml).toContain("issues: write");
  expect(yml).toContain("secrets.GITHUB_TOKEN");
  expect(yml).not.toContain("GITHUB_ISSUES_TOKEN");
  expect(yml).toMatch(/cron: "\*\/10 \* \* \* \*"/);
});
