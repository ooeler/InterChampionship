const { test, expect, login } = require("./fixtures");

const SPIELER = { email: "spieler@flyingpenguins.test", password: "spieler123" };
const ADMIN = { email: "admin@flyingpenguins.test", password: "admin123" };

test.describe("Rollen", () => {
  test("Spieler sehen im Bereich Teams nur Statistiken", async ({ page }) => {
    await login(page, SPIELER);
    await expect(page.locator("nav [data-tab=rang]")).toBeVisible();
    await expect(page.locator("nav [data-tab=spiel]")).toBeVisible();
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main")).toContainText("Trainingsleitung");
    await expect(page.locator("main")).not.toContainText("Team 1 ·");
  });

  test("Captains sehen den Bereich Teams", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator("main")).toContainText("Team 1 · 8 Spieler");
  });

  test("Admins sehen den Bereich Teams", async ({ page }) => {
    await login(page, ADMIN);
    await expect(page.locator("nav [data-tab=team]")).toBeVisible();
  });

  test("Spieler-Änderungen an Teams lehnt der Server ab", async ({ page }) => {
    await login(page); // Captain legt die Saison an
    await expect.poll(() => page.evaluate(() => !!localStorage.getItem("__mock_db"))).toBe(true);
    await page.click("#lo");
    await login(page, SPIELER);
    await page.evaluate(() => { S.t[0].n = "Gehackt"; save() });
    await page.waitForTimeout(600);
    const name = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data.t[0].n);
    expect(name).toBe("Lochball Legenden");
  });
});

test.describe("Benutzer & Spieler-Zuordnung", () => {
  test("Spielleitung ordnet Benutzern Rolle und Spieler zu", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    const card = page.locator(".card", { hasText: "Benutzer & Rollen" });
    await page.click("h3[data-acc=us]"); // standardmässig zugeklappt
    await expect(card).toContainText("spieler@flyingpenguins.test");
    await card.locator("select[data-mpl='u-captain@flyingpenguins.test']").selectOption("Andreas Scherrer");
    await card.locator("select[data-mrole='u-spieler@flyingpenguins.test']").selectOption("captain");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "set_member"));
    expect(log[0].args).toEqual({ uid: "u-captain@flyingpenguins.test", new_role: "captain", new_player: "Andreas Scherrer" });
    expect(log[1].args).toEqual({ uid: "u-spieler@flyingpenguins.test", new_role: "captain", new_player: null });
  });

  test("Spielleitung kann sich die Admin-Rolle nicht selbst entziehen", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=team]");
    await page.click("h3[data-acc=us]");
    const msg = page.waitForEvent("dialog");
    await page.locator("select[data-mrole='u-admin@flyingpenguins.test']").selectOption("player");
    expect((await msg).message()).toContain("nicht selbst entziehen");
    await expect(page.locator("select[data-mrole='u-admin@flyingpenguins.test']")).toHaveValue("admin");
  });

  test("Captains sehen die Benutzerverwaltung nicht", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    await expect(page.locator(".card", { hasText: "Benutzer & Rollen" })).toHaveCount(0);
  });

  test("Begrüssung mit zugeordnetem Spieler", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_player", "Othmar Oeler"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText(/^(Guten Morgen|Hallo|Hoi) Othmar!$/);
  });

  test("Umbenennen eines Spielers behält die Zuordnung", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=team]");
    const inp = page.locator("input[data-pn='0']").first();
    const old = await inp.inputValue();
    await inp.fill("Andi S.");
    await inp.blur();
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.fn == "rename_player"));
    expect(log[0].args).toEqual({ old_name: old, new_name: "Andi S." });
  });
});

test.describe("Konzept", () => {
  test("Infos-Tab zeigt das Konzept für alle", async ({ page }) => {
    await login(page, SPIELER);
    await page.click("nav [data-tab=info]");
    const main = page.locator("main");
    for (const t of ["Jeder erste Mittwoch im Monat ist Match-Tag.", "Wintermeisterschaft", "Sommermeisterschaft", "Forfait 0 : 5", "Spielleitung: Michael Süess, Othmar Oeler"]) {
      await expect(main).toContainText(t);
    }
    await expect(main).toContainText("Nächster Match-Tag: Mi, 04.11.2026");
    await expect(main).toContainText("zweiten Dezember-Mittwoch (09.12.2026)");
    await expect(main).toContainText("ersten Mai-Freitag (07.05.2027)");
  });

  test("Spieltag zeigt den Ablauf des Matchtags", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    const card = page.locator(".card", { hasText: "Ablauf Matchtag" });
    await expect(card.locator("h3")).toContainText("Mi, 04.11.2026");
    await expect(card).toContainText("19:40");
  });

  test("Forfait ergibt 0 : 5", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-ff='1']");
    await expect(page.locator(".pill.win")).toHaveText("Sieger: Lochball Legenden");
    expect(await page.evaluate(() => S.m[cur].res)).toEqual([5, 0]);
  });

  test("Spieler sehen keinen Forfait-Knopf", async ({ page }) => {
    await login(page, SPIELER);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("[data-ff]")).toHaveCount(0);
  });

  test("Spielstand zeigt bis Ende Dezember die Wintermeisterschaft", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-12-31T20:00:00"));
    await login(page);
    await page.evaluate(() => { S.m[4].res = [7, 1]; render() }); // Januar zählt noch nicht
    const card = page.locator(".card", { hasText: "Meisterschaft" }).first();
    await expect(card.locator(".score .vs").first()).toHaveText("Wintermeisterschaft");
    await expect(card.locator(".score b").nth(0)).toHaveText("1");
    await expect(card.locator(".score b").nth(1)).toHaveText("1");
  });

  test("Ab Januar zeigt der Spielstand die Serie zum Sommermeister", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2027-01-02T10:00:00"));
    await login(page);
    await page.evaluate(() => { S.m[4].res = [7, 1]; S.m[7].res = [2, 3]; render() });
    const card = page.locator(".card", { hasText: "Meisterschaft" }).first();
    await expect(card.locator(".score .vs").first()).toHaveText("Sommermeisterschaft");
    await expect(card.locator(".score b").nth(0)).toHaveText("1");
    await expect(card.locator(".score b").nth(1)).toHaveText("2"); // April zählt doppelt
  });

  test("Rangliste nennt das Verliererteam mit Event-Datum", async ({ page }) => {
    await login(page);
    await page.evaluate(() => { S.m[2].res = [4, 1]; S.m[3].res = [6, 2]; render() });
    const card = page.locator(".card", { hasText: "Meisterschaft" }).first();
    await expect(card).toContainText("🏆 Wintermeister");
    await expect(card).toContainText("SpVgg Nieder organisiert den Winter Event am 09.12.2026");
    await expect(card).toContainText("Sommermeister (Jan–Apr)");
  });
});

test.describe("Social-Media-Bild", () => {
  test("Nur die Spielleitung sieht den Generator", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("[data-sm]")).toHaveCount(0);
  });

  test("Bild wird aus den Daten erzeugt und gespeichert", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-c='1']"); // Oktober: 9 : 5
    await page.click("[data-sm]");
    const c = page.locator("#smc");
    await expect(c).toBeVisible();
    await page.waitForTimeout(300);
    const px = await page.evaluate(() => {
      const x = document.getElementById("smc").getContext("2d");
      return { right: Array.from(x.getImageData(1060, 500, 1, 1).data), band: Array.from(x.getImageData(300, 100, 1, 1).data), sponsor: Array.from(x.getImageData(40, 600, 1, 1).data) };
    });
    expect(px.right.slice(0, 3)).toEqual([205, 42, 42]); // rote Fläche
    expect(px.band.slice(0, 3)).toEqual([38, 38, 38]);   // Fotoband ohne Foto
    expect(px.sponsor.slice(0, 3)).toEqual([255, 255, 255]);

    await page.setInputFiles("[data-smimg='0']", { name: "a.png", mimeType: "image/png", buffer: require("fs").readFileSync(require("path").join(__dirname, "..", "app", "icon-192.png")) });
    await expect(page.locator("label", { hasText: "✓ Foto 1" })).toBeVisible();

    await page.fill("[data-smt]", "Herren Inter 26/27");
    await page.locator("[data-smt]").blur();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.click("[data-smdl]")]);
    expect(dl.suggestedFilename()).toBe("interchampionship-oktober.png");
    const buf = require("fs").readFileSync(await dl.path());
    expect(buf.readUInt32BE(16)).toBe(1080); // PNG-Breite
    expect(buf.readUInt32BE(20)).toBe(1080); // PNG-Höhe
  });

  test("Ohne Resultat kommt ein Hinweis", async ({ page }) => {
    await login(page, ADMIN);
    await page.click("nav [data-tab=spiel]");
    await page.click("[data-sm]");
    await expect(page.locator(".card", { hasText: "Social Media" })).toContainText("Zuerst das Endresultat erfassen.");
  });
});

test.describe("Begrüssung", () => {
  test("Standard: Gruss + Name, je nach Tageszeit", async ({ page }) => {
    await login(page); // Dienstag 10:00, kein Training
    await expect(page.locator("#hi")).toHaveText(/^(Guten Morgen|Hallo|Hoi) Captain!$/);
  });

  test("Abends", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T20:00:00"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText(/^(Guten Abend|Hallo|Hoi) Captain!$/);
  });

  test("Nachtschwärmer", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-28T00:30:00"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText("Hallo Nachtschwärmer Captain! 🌙");
  });

  test("Am Trainingstag: vorher, während und danach", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-28T12:00:00"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText("Hallo Captain, heute ist Training! 🏑");
    await page.clock.setFixedTime(new Date("2026-10-28T18:30:00"));
    await page.evaluate(() => render());
    await expect(page.locator("#hi")).toHaveText("Gutes Training Captain! 🏑");
    await page.clock.setFixedTime(new Date("2026-10-28T20:45:00"));
    await page.evaluate(() => render());
    await expect(page.locator("#hi")).toHaveText(/^(Viel Spass beim Bier|Prost|Zum Wohl) Captain! 🍺$/);
  });

  test("Variante bleibt am selben Tag gleich", async ({ page }) => {
    await login(page);
    const a = await page.locator("#hi").textContent();
    await page.evaluate(() => render());
    await expect(page.locator("#hi")).toHaveText(a);
  });

  test("Name aus dem Profil (z. B. Google/Microsoft)", async ({ page }) => {
    await login(page, SPIELER);
    await expect(page.locator("#hi")).toHaveText(/^(Guten Morgen|Hallo|Hoi) Silvan!$/);
  });

  test("Am Match Day", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-11-04T18:00:00"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText("Hallo Captain, heute ist Match Day! ⚑");
    await page.clock.setFixedTime(new Date("2026-11-04T19:00:00"));
    await page.evaluate(() => render());
    await expect(page.locator("#hi")).toHaveText("Guter Match Captain! ⚑");
  });

  test("Frühaufsteher", async ({ page }) => {
    await page.clock.setFixedTime(new Date("2026-10-27T06:15:00"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText("Hallo Frühaufsteher Captain! ☀️");
  });

  test("Willkommen zurück nach über 30 Tagen", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_prev_seen", "2026-08-15T10:00:00Z"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText("Hallo Captain, willkommen zurück!");
  });

  test("Kein 'Willkommen zurück' nach kurzer Pause", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_prev_seen", "2026-10-20T10:00:00Z"));
    await login(page);
    await expect(page.locator("#hi")).toHaveText(/^(Guten Morgen|Hallo|Hoi) Captain!$/);
  });
});

test.describe("Push-Nachrichten", () => {
  test("Resultat melden schickt Push über die Edge Function", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=spiel]");
    await expect(page.locator("[data-notify]")).toHaveCount(0);
    await page.click('[data-k=res][data-t="0"][data-d="1"]');
    const msg = page.waitForEvent("dialog", (d) => d.type() === "alert");
    await page.click("[data-notify]");
    expect((await msg).message()).toBe("Push-Nachricht wurde verschickt.");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    expect(log).toContainEqual({ op: "invoke", name: "notify", body: { type: "result", month: 2 } });
    // Resultat wurde vor dem Versand gespeichert
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_db")).data.m[2].res)).toEqual([1, 0]);
  });

  test("Benachrichtigungen aktivieren speichert das Abo", async ({ page, browserName }) => {
    test.skip(browserName !== "chromium", "Web-Push-Stub nur in Chromium");
    await page.addInitScript(() => {
      const sub = { endpoint: "https://push.test/abc", toJSON() { return { endpoint: this.endpoint, keys: { p256dh: "k", auth: "a" } } } };
      let current = null;
      const reg = { pushManager: { getSubscription: async () => current, subscribe: async () => (current = sub) } };
      Object.defineProperty(navigator, "serviceWorker", { value: { register: async () => reg, ready: Promise.resolve(reg) } });
      Notification.requestPermission = async () => "granted";
      Object.defineProperty(Notification, "permission", { get: () => (current ? "granted" : "default") });
      localStorage.setItem("__mock_vapid", "BElw0d9Vj8C0eJQ0b1n5S8rS9QH0iZ3n2B4kq9pKX7pZ6Y0iN3QnB9uU1c8m2Wl8hYqK7vQyR8hC3f5a4Tz6x1A");
    });
    await login(page);
    await page.click("nav [data-tab=train]"); // alle Benachrichtigungen im Training-Tab
    const card = page.locator(".card", { has: page.locator("h3", { hasText: "Benachrichtigungen" }) });
    await expect(card).toBeVisible();
    await card.locator("[data-push]").click();
    await expect(card.locator("[data-push]")).toHaveCount(0);
    await expect(card).toContainText("Push-Nachrichten sind auf diesem Gerät aktiv");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")));
    const up = log.find((l) => l.table === "push_subscriptions");
    expect(up.row).toMatchObject({ endpoint: "https://push.test/abc", user_id: "u-captain@flyingpenguins.test" });
  });

  test("iPhone ohne Installation bekommt eine Anleitung", async ({ page, browserName }) => {
    test.skip(browserName !== "webkit", "nur iPhone-Profil");
    await page.addInitScript(() => localStorage.setItem("__mock_vapid", "x"));
    await login(page);
    await page.click("nav [data-tab=train]");
    await expect(page.locator(".card", { hasText: "Benachrichtigungen" })).toContainText("Zum Home-Bildschirm");
  });
});

test.describe("Verbesserungsvorschläge", () => {
  test("Vorschlag wird als GitHub-Issue erfasst", async ({ page }) => {
    await login(page, SPIELER);
    await page.click("nav [data-tab=info]");
    const card = page.locator(".card", { hasText: "Verbesserungsvorschlag" });
    await card.locator("[data-fbk=fehler]").click();
    await expect(card.locator("[data-fbk=fehler]")).toHaveClass(/on/);
    await card.locator("input[name=title]").fill("Tore lassen sich nicht löschen");
    await card.locator("textarea[name=text]").fill("Beim Minus-Knopf passiert nichts.");
    await card.locator("button.add").click();
    await expect(card.locator(".fbm")).toHaveText("Danke! Dein Vorschlag wird in wenigen Minuten als GitHub-Issue erfasst.");
    await expect(card.locator("input[name=title]")).toHaveValue("");
    // Status in "Meine Vorschläge"
    await expect(card.locator(".row", { hasText: "Tore lassen sich nicht löschen" })).toContainText("wird erfasst");
    const log = await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log")).filter((l) => l.name == "feedback"));
    expect(log[0].body).toEqual({ kind: "fehler", title: "Tore lassen sich nicht löschen", text: "Beim Minus-Knopf passiert nichts." });
  });

  test("Erfasste Vorschläge verlinken das Issue", async ({ page }) => {
    await page.goto("/");
    await page.evaluate(() => localStorage.setItem("__mock_feedback", JSON.stringify([
      { title: "💡 Dark Mode", status: "erfasst", issue_number: 7, issue_url: "https://github.com/ooeler/InterChampionship/issues/7" },
      { title: "🐞 Absturz", status: "fehler" }])));
    await login(page);
    await page.click("nav [data-tab=info]");
    const card = page.locator(".card", { hasText: "Verbesserungsvorschlag" });
    await expect(card.locator(".row", { hasText: "Dark Mode" }).locator("a")).toHaveAttribute("href", "https://github.com/ooeler/InterChampionship/issues/7");
    await expect(card.locator(".row", { hasText: "Absturz" })).toContainText("Fehler beim Erfassen");
  });

  test("Titel ist Pflicht", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    await page.locator("#fb button.add").click();
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem("__mock_log") || "[]").some((l) => l.name == "feedback"))).toBe(false);
  });

  test("Entwurf bleibt bei Live-Aktualisierung erhalten", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    await page.locator("#fb textarea").fill("Halb geschrieben");
    await page.evaluate(() => render());
    await expect(page.locator("#fb textarea")).toHaveValue("Halb geschrieben");
  });

  test("Fehlermeldung vom Server wird angezeigt", async ({ page }) => {
    await login(page);
    await page.click("nav [data-tab=info]");
    await page.locator("#fb input[name=title]").fill("zu viele");
    await page.locator("#fb button.add").click();
    await expect(page.locator("#fb .fbm")).toHaveText("Senden fehlgeschlagen: Maximal 5 Vorschläge pro Tag.");
  });
});

test.describe("Issue-Texte (Edge Function feedback)", () => {
  let F;
  test.beforeAll(async () => { F = await import("../supabase/functions/feedback/logic.mjs") });

  test("Issue mit Label, ohne Mail-Adresse, ohne @-Ping", () => {
    const i = F.buildIssue({ kind: "idee", title: "  Dark   Mode  ", text: "Bitte @othmar anschauen" }, { player: "Silvan Frey", role: "player" }, new Date("2026-10-27T10:00:00Z"));
    expect(i.title).toBe("💡 Dark Mode");
    expect(i.labels).toEqual(["verbesserung", "aus-der-app"]);
    expect(i.body).toContain("@​othmar");
    expect(i.body).toContain("Eingereicht in der App von **Silvan Frey** (player) am 27.10.2026.");
    expect(i.body).not.toMatch(/@\w+\.\w+/);
  });

  test("Ohne Spieler-Zuordnung anonym", () => {
    expect(F.buildIssue({ kind: "fehler", title: "Absturz" }, { role: "captain" }).body).toContain("von **ein Mitglied** (captain)");
  });

  test("Ungültige Eingaben werden abgelehnt", () => {
    expect(() => F.buildIssue({ kind: "spam", title: "Hallo" }, {})).toThrow("Idee oder Fehler");
    expect(() => F.buildIssue({ kind: "idee", title: "x" }, {})).toThrow("3–100");
    expect(() => F.buildIssue({ kind: "idee", title: "ok ok", text: "a".repeat(4001) }, {})).toThrow("4000");
  });
});

test.describe("Push-Texte (Edge Function)", () => {
  let L, state;
  test.beforeAll(async () => {
    L = await import("../supabase/functions/notify/logic.mjs");
    const DT = [[], [], ["2026-10-21", "2026-10-28", "2026-11-04"], ["2026-11-11", "2026-12-02"], [], [], [], ["2027-03-10", "2027-04-07"]];
    state = {
      t: [{ n: "Lochball Legenden" }, { n: "SpVgg Nieder" }],
      m: DT.map((d) => ({ tr: d.map((x) => ({ d: x, p: [] })), res: [null, null] })),
    };
  });

  test("Match Day genau 3 Tage vorher", () => {
    expect(L.matchdayMessages(state, "2026-11-01")).toEqual([{
      key: "matchday:2026-11-04", tag: "matchday-2", title: "⚑ Match Day in 3 Tagen!",
      body: "November: Lochball Legenden vs SpVgg Nieder am 04.11.2026",
    }]);
    expect(L.matchdayMessages(state, "2026-11-02")).toEqual([]);
    expect(L.matchdayMessages(state, "2026-10-25")).toEqual([]); // normales Training, kein Match Day
  });

  test("Doppel-Spieltag wird erwähnt, auch über Monatsgrenzen", () => {
    expect(L.matchdayMessages(state, "2026-11-29")[0].body).toContain("zählt doppelt");
    expect(L.matchdayMessages(state, "2027-04-04")[0].body).toBe("April: Lochball Legenden vs SpVgg Nieder am 07.04.2027 – zählt doppelt!");
  });

  test("Resultat-Texte", () => {
    expect(L.resultMessage(state, 2)).toBeNull();
    state.m[2].res = [4, 2];
    expect(L.resultMessage(state, 2)).toMatchObject({ key: "result:2:4-2", title: "Endstand November", body: "Lochball Legenden 4 : 2 SpVgg Nieder – Sieger: Lochball Legenden" });
    state.m[3].res = [3, 3];
    expect(L.resultMessage(state, 3).body).toBe("Lochball Legenden 3 : 3 SpVgg Nieder – Unentschieden (2 : 2 Punkte)");
    state.m[7].res = [1, 5];
    expect(L.resultMessage(state, 7).body).toContain("Sieger: SpVgg Nieder (2 Punkte)");
  });

  test("Trainingsleitung: Erinnerung 2 Tage vorher, nur an den Leiter", () => {
    const s = JSON.parse(JSON.stringify(state));
    s.m[2].tr[1].lead = "Silvan Frey"; // 28.10.
    s.m[2].tr[2].lead = "Beat Rentsch"; // 04.11. = Match Day → keine Erinnerung
    expect(L.trainingLeadMessages(s, "2026-10-26")).toEqual([{
      key: "training:2026-10-28:Silvan Frey", tag: "training-2026-10-28", player: "Silvan Frey",
      title: "Du leitest das Training", body: "Mi, 28.10.2026: Denk an Einlaufen, Passübungen und deine 3 Übungen.",
    }]);
    expect(L.trainingLeadMessages(s, "2026-10-27")).toEqual([]);
    expect(L.trainingLeadMessages(s, "2026-11-02")).toEqual([]);
  });

  test("Trainingsleitung: abgemeldeter Leiter soll Ersatz suchen", () => {
    const s = JSON.parse(JSON.stringify(state));
    s.m[2].tr[1].lead = "Silvan Frey"; s.m[2].tr[1].ab = ["Silvan Frey"];
    const [m] = L.trainingLeadMessages(s, "2026-10-26");
    expect(m.title).toContain("abgemeldet");
    expect(m.body).toContain("Ersatz");
  });

  test("Datum in Schweizer Zeit", () => {
    expect(L.zurichDate(new Date("2026-11-03T23:30:00Z"))).toBe("2026-11-04");
    expect(L.addDays("2026-12-30", 3)).toBe("2027-01-02");
  });
});

test("Leader werden auch mal mit Titel begrüsst (Anwesenheitskönig, Topskorer, Knipser …)", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    const d = fix(def());
    d.m[0].base = { "Silvan Frey": 9 }; d.m[0].g = { "Silvan Frey": 7 };
    localStorage.setItem("__mock_db", JSON.stringify({ id: "main", data: d }));
    localStorage.setItem("__mock_player", "Silvan Frey");
  });
  await login(page, { email: "spieler@flyingpenguins.test", password: "spieler123" });
  const T = /^(Hallo Anwesenheitskönig|Hoi Trainingsweltmeister|Salü Dauerbrenner|Hallo Mister 100 Prozent|Hallo Topskorer|Hoi Punktesammler|Salü Skorerkönig|Hallo Spielmacher|Hallo Knipser|Hoi Torjäger|Salü Goalgetter|Hallo Vollstrecker) Silvan! (👑|🏆|🎯)$/;
  // über mehrere Tage: mal mit Titel, mal normal – und nie ein Titel für Nicht-Leader
  const seen = await page.evaluate(() => { const o = []; for (let i = 1; i <= 20; i++) { TD = "2026-11-" + String(i).padStart(2, "0"); o.push(leadTitle(TD + "Silvan")) } return o; });
  expect(seen.filter(Boolean).length).toBeGreaterThan(5);
  expect(seen.filter((x) => !x).length).toBeGreaterThan(0);
  for (const x of seen.filter(Boolean)) expect(x[0] + " Silvan! " + x[1]).toMatch(T);
  expect(await page.evaluate(() => { PLAYER = "Beat Rentsch"; return leadTitle("x") })).toBeNull();
});

test("Begrüssung: Happy Friday und Schöne OLMA / OFFA (an manchen Tagen)", async ({ page }) => {
  await login(page);
  const at = (iso) => page.evaluate((iso) => { const o = new Set(); for (let i = 0; i < 25; i++) { TD = iso.slice(0, 10); PLAYER = "P" + i; o.add(hello()) } return [...o]; }, iso);
  await page.clock.setFixedTime(new Date("2026-10-30T12:00:00")); // Freitag
  const fr = await at("2026-10-30");
  expect(fr.some((g) => /^Happy Friday .*! 🎉$/.test(g))).toBe(true);
  expect(fr.some((g) => !g.startsWith("Happy Friday"))).toBe(true);
  await page.clock.setFixedTime(new Date("2027-04-22T12:00:00")); // OFFA (Donnerstag)
  const of = await at("2027-04-22");
  expect(of.some((g) => /^(Schöne |Viel Spass an der )OFFA .*! 🌷$/.test(g))).toBe(true);
  await page.clock.setFixedTime(new Date("2027-04-28T12:00:00"));
  expect((await at("2027-04-28")).some((g) => /OFFA|OLMA/.test(g))).toBe(false);
});
