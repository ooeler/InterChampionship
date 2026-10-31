// Test-Ersatz für Supabase. Wird in den Tests anstelle von app/config.js ausgeliefert.
// Simuliert Login (Passwort + OAuth), Einladung, Passwort-Reset, Rollen, die Tabelle league_state
// inkl. Schutzregel für Teams, Realtime (über localStorage-Events zwischen Tabs), Push-Abos und
// die Edge Function "notify".
(function () {
  var USERS = {
    "captain@flyingpenguins.test": { pw: "geheim123", role: "captain" },
    "admin@flyingpenguins.test": { pw: "admin123", role: "admin" },
    "spieler@flyingpenguins.test": { pw: "spieler123", role: "player", name: "Silvan Frey" },
  };
  var DB = "__mock_db", SESS = "__mock_session", LOG = "__mock_log", HIST = "__mock_hist";
  function get(k) { try { return JSON.parse(localStorage.getItem(k)) } catch (e) { return null } }
  function set(k, v) { localStorage.setItem(k, JSON.stringify(v)) }
  function log(x) { var l = get(LOG) || []; l.push(x); set(LOG, l) }
  function ok(d) { return Promise.resolve({ data: d === undefined ? null : d, error: null }) }
  function fail(m) { return Promise.resolve({ data: null, error: { message: m } }) }
  function user(email) {
    var u = USERS[email] || {};
    return { id: "u-" + email, email: email, user_metadata: u.name ? { full_name: u.name } : {} };
  }
  function session(email) { return { access_token: "t", user: user(email) } }
  var PEN = "__mock_pen", CAT = "__mock_cat";
  // Strafenkatalog pflegen: Spielleitung oder Strafenchef (spiegelt can_edit_catalog)
  function canCat() { var s = get(SESS); return !!s && (role() == "admin" || !!(USERS[s.user.email] || {}).strafen || localStorage.getItem("__mock_strafen") == "1") }
  function canFine() { var s = get(SESS); return !!s && (["admin", "captain"].indexOf(role()) >= 0 || !!(USERS[s.user.email] || {}).strafen || localStorage.getItem("__mock_strafen") == "1") }
  var ABS = "__mock_abs", HSE = "__mock_hall", HPH = "__mock_hallph";
  var RLS = function (t) { return fail("new row violates row-level security policy for table \"" + t + "\"") };
  function myPlayer() { var s = get(SESS); return s && (localStorage.getItem("__mock_player") || (USERS[s.user.email] || {}).player) }
  function canAbs(x) { return ["admin", "captain"].indexOf(role()) >= 0 || x.player == myPlayer() }
  function role() { var s = get(SESS); return s && (USERS[s.user.email] || { role: "player" }).role }

  function createClient() {
    var subs = [], chans = [];
    function emit(ev, s) { subs.forEach(function (cb) { cb(ev, s) }) }

    // Rücksprung von Einladung / Reset / OAuth: #access_token=…[&type=invite|recovery]&email=…
    var h = location.hash;
    if (/access_token=/.test(h)) {
      var em = decodeURIComponent((h.match(/email=([^&]+)/) || [])[1] || "neu@flyingpenguins.test");
      var ty = (h.match(/type=(\w+)/) || [])[1];
      if (!USERS[em]) USERS[em] = { pw: null, role: "player" };
      set(SESS, session(em));
      history.replaceState(null, "", location.pathname + location.search + (ty ? "#type=" + ty : ""));
    }

    addEventListener("storage", function (e) {
      if (e.key != DB || !e.newValue) return;
      var row = JSON.parse(e.newValue);
      // Leicht verzögert wie ein echter Server; Tabs teilen sich localStorage (inkl. "ic_dirty"),
      // echte Geräte nicht – so ist der Speichervorgang des anderen Tabs abgeschlossen.
      setTimeout(function () { chans.forEach(function (c) { c.cb({ eventType: "UPDATE", new: row }) }) }, 100);
    });

    var auth = {
      onAuthStateChange: function (cb) {
        subs.push(cb);
        setTimeout(function () {
          var s = get(SESS);
          cb("INITIAL_SESSION", s);
          if (s && /type=recovery/.test(location.hash)) cb("PASSWORD_RECOVERY", s);
        }, 0);
        return { data: { subscription: { unsubscribe: function () {} } } };
      },
      signInWithPassword: function (c) {
        if (!USERS[c.email] || USERS[c.email].pw !== c.password) return fail("Invalid login credentials");
        var s = session(c.email); set(SESS, s); setTimeout(function () { emit("SIGNED_IN", s) }, 0); return ok({ session: s });
      },
      signInWithOAuth: function (o) {
        var em = localStorage.getItem("__mock_oauth_email") || "captain@flyingpenguins.test";
        log({ op: "oauth", provider: o.provider, redirectTo: o.options.redirectTo });
        // Echte Anbieter kommen von einer fremden Domain zurück → kompletter Seiten-Neuladen.
        // Ein reiner #-Wechsel lädt nicht neu, darum explizit reload().
        setTimeout(function () {
          location.href = o.options.redirectTo + (USERS[em]
            ? "#access_token=x&email=" + encodeURIComponent(em)
            : "#error=access_denied&error_description=Signups+not+allowed+for+this+instance");
          location.reload();
        }, 0);
        return ok({});
      },
      resetPasswordForEmail: function (email, o) { log({ op: "reset", email: email, redirectTo: o && o.redirectTo }); return ok({}) },
      updateUser: function (u) {
        var s = get(SESS); if (!s) return fail("Not logged in");
        USERS[s.user.email].pw = u.password; log({ op: "updateUser", email: s.user.email });
        setTimeout(function () { emit("USER_UPDATED", s) }, 0); return ok({ user: s.user });
      },
      signOut: function () { localStorage.removeItem(SESS); setTimeout(function () { emit("SIGNED_OUT", null) }, 0); return ok() }
    };

    function canHall() { return role() == "admin" || role() == "captain" }

    function from(table) {
      return {
        select: function () {
          return {
            eq: function (col, val) {
              if (table == "hall_photos") return { order: function () { return ok(get(SESS) ? (get(HPH) || []).filter(function (x) { return x[col] == val }) : []) } }; // RLS: nur Mitglieder
              if (table == "app_status") return { maybeSingle: function () { return ok({ maintenance: localStorage.getItem("__mock_maint") == "1" }) } };
              return { maybeSingle: function () { var r = get(DB); return ok(r && r[col] == val ? { data: r.data, updated_at: r.updated_at } : null) } };
            },
            order: function () {
              var res;
              if (table == "feedback") res = (get("__mock_feedback") || []).slice().reverse(); // eigene Vorschläge (RLS)
              else if (table == "penalties") res = get(SESS) ? (get(PEN) || []) : []; // alle Mitglieder lesen
              else if (table == "hall_seasons") res = (get(HSE) || []).slice().sort(function (a, b) { return a.season < b.season ? 1 : -1 }); // öffentlich lesbar
              else if (table == "absence_reasons") res = get(SESS) ? (get(ABS) || []) : []; // RLS: alle Mitglieder lesen
              else if (table == "penalty_catalog") res = get(SESS) ? (get(CAT) || []).slice().sort(function (a, b) { return a.reason.localeCompare(b.reason, "de") }) : [];
              else if (role() != "admin") res = []; // RLS: Mitgliederliste und Verlauf nur für die Spielleitung
              else if (table == "league_state_history") res = (get(HIST) || []).slice().reverse().map(function (h) { return { id: h.id, saved_at: h.saved_at, reason: h.reason } });
              else res = Object.keys(USERS).sort().map(function (e) { return { user_id: "u-" + e, email: e, role: USERS[e].role, player: USERS[e].player || null, resto: !!USERS[e].resto, strafen: !!USERS[e].strafen } });
              var p = ok(res); p.limit = function (n) { return ok(res.slice(0, n)) }; return p;
            }
          };
        },
        upsert: function (row) {
          if (!get(SESS)) return fail("JWT expired");
          if (table == "hall_seasons") {
            if (!canHall()) return RLS(table);
            var H = (get(HSE) || []).filter(function (x) { return x.season != row.season }); H.push(row); set(HSE, H); log({ op: "upsert", table: table, row: row }); return ok();
          }
          if (table == "absence_reasons") {
            if (!canAbs(row)) return fail("new row violates row-level security policy for table \"absence_reasons\"");
            var R = (get(ABS) || []).filter(function (x) { return !(x.d == row.d && x.player == row.player) }); R.push(row); set(ABS, R); log({ op: "upsert", table: table, row: row }); return ok();
          }
          if (table == "league_state") {
            var old = get(DB);
            // Spiegelt den Trigger guard_league_state aus supabase/setup.sql
            if (role() == "player" && (!old || ["t", "sn", "logo", "sp"].some(function (k) { return JSON.stringify(old.data[k]) != JSON.stringify(row.data[k]) })))
              return fail("Nur Admins und Captains dürfen Teams und Einstellungen ändern");
            if (old && role() != "admin") { if (old.data.info === undefined) delete row.data.info; else row.data.info = old.data.info }
            if (old) hist(old.data, "Änderung"); // spiegelt den Trigger keep_league_history
            set(DB, JSON.parse(JSON.stringify(row)));
          }
          log({ op: "upsert", table: table, row: table == "league_state" ? undefined : row });
          return ok();
        },
        // Strafen: spiegelt die RLS-Policies (Strafenchef, Captains, Spielleitung)
        insert: function (row) {
          if (table == "hall_photos") {
            if (!canHall()) return RLS(table);
            var Q = get(HPH) || [];
            if (row.kind && Q.some(function (x) { return x.season == row.season && x.kind == row.kind })) return fail("duplicate key value violates unique constraint \"hall_photos_kind\"");
            Q.push(Object.assign({ id: Q.length ? Math.max.apply(null, Q.map(function (x) { return x.id })) + 1 : 1 }, row)); set(HPH, Q); log({ op: "insert", table: table, season: row.season, caption: row.caption }); return ok();
          }
          if (table == "penalty_catalog") {
            if (!canCat()) return fail("new row violates row-level security policy for table \"penalty_catalog\"");
            var C = get(CAT) || [];
            if (C.some(function (x) { return x.reason == row.reason })) return fail("duplicate key value violates unique constraint \"penalty_catalog_reason_key\"");
            C.push(Object.assign({ id: C.length ? Math.max.apply(null, C.map(function (x) { return x.id })) + 1 : 1 }, row)); set(CAT, C); log({ op: "insert", table: table, row: row }); return ok();
          }
          if (table != "penalties") return ok();
          if (!canFine()) return fail("new row violates row-level security policy for table \"penalties\"");
          var L = get(PEN) || []; L.push(Object.assign({ id: L.length + 1, paid: false }, row)); set(PEN, L); log({ op: "insert", table: table, row: row }); return ok();
        },
        update: function (patch) {
          if (table == "league_state") { // bedingtes Speichern: nur wenn der Stand noch derselbe ist
            var w = {}, q = { eq: function (k, v) { w[k] = v; return q }, select: function () {
              var old = get(DB);
              if (!old || old.updated_at != w.updated_at) return ok([]);
              return from(table).upsert(Object.assign({ id: "main" }, patch)).then(function (r) { return r.error ? r : { data: [{ id: "main" }], error: null } });
            } };
            return q;
          }
          return { eq: function (c, v) {
            if (table == "absence_reasons") { var A = get(ABS) || []; A.forEach(function (x) { if (x[c] == v && canAbs(x)) Object.assign(x, patch) }); set(ABS, A); return ok(); }
            if (table == "penalties" && !canFine()) return ok(); // RLS: still keine Zeile geändert
            if (table == "penalty_catalog") { if (canCat()) { var C = get(CAT) || []; C.forEach(function (x) { if (x[c] == v) Object.assign(x, patch) }); set(CAT, C) } return ok(); }
            var L = get(PEN) || []; L.forEach(function (x) { if (x[c] == v) Object.assign(x, patch) }); set(PEN, L); log({ op: "update", table: table, patch: patch, value: v }); return ok();
          } };
        },
        delete: function () { return { match: function (q) {
          set(ABS, (get(ABS) || []).filter(function (x) { return !(x.d == q.d && x.player == q.player && canAbs(x)) })); return ok();
        }, eq: function (c, v) {
          log({ op: "delete", table: table, value: v });
          if (table == "hall_seasons" && canHall()) { set(HSE, (get(HSE) || []).filter(function (x) { return x[c] != v })); set(HPH, (get(HPH) || []).filter(function (x) { return x.season != v })) } // on delete cascade
          if (table == "hall_photos" && canHall()) set(HPH, (get(HPH) || []).filter(function (x) { return x[c] != v }));
          if (table == "penalties" && canFine()) set(PEN, (get(PEN) || []).filter(function (x) { return x[c] != v }));
          if (table == "penalty_catalog" && canCat()) set(CAT, (get(CAT) || []).filter(function (x) { return x[c] != v }));
          return ok();
        } } }
      };
    }

    function hist(data, reason) {
      var h = get(HIST) || []; h.push({ id: h.length + 1, data: data, reason: reason, saved_at: new Date().toISOString() }); set(HIST, h); return h.length;
    }

    function rpc(fn, a) {
      var s = get(SESS);
      if (!s) return fail("JWT expired");
      if (fn == "me") {
        var me = USERS[s.user.email] || {};
        return ok({ role: role(), player: localStorage.getItem("__mock_player") || me.player || null, prev_seen: localStorage.getItem("__mock_prev_seen"), notify_changes: localStorage.getItem("__mock_notify") == "1", resto: !!me.resto || localStorage.getItem("__mock_resto") == "1", strafen: !!me.strafen || localStorage.getItem("__mock_strafen") == "1" });
      }
      log({ op: "rpc", fn: fn, args: a });
      if (fn == "log_activity") return ok(null);
      if (fn == "activity_points") return ok(get("__mock_act") || []); // spiegelt die Funktion: Rohdaten bleiben auf dem Server
      if (fn == "set_resto") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Rollen vergeben");
        USERS[a.uid.slice(2)].resto = a.on_resto; return ok(null);
      }
      if (fn == "set_strafen") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Rollen vergeben");
        USERS[a.uid.slice(2)].strafen = a.on_strafen; return ok(null);
      }
      if (fn == "set_notify") { localStorage.setItem("__mock_notify", a.on_changes ? "1" : "0"); return ok(null) }
      if (fn == "snapshot_league") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Backups anlegen");
        return ok(hist(get(DB).data, a.reason));
      }
      if (fn == "restore_league_state") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Daten wiederherstellen");
        var e = (get(HIST) || []).filter(function (h) { return h.id == a.hid })[0];
        if (!e) return fail("Version nicht gefunden");
        var cur = get(DB); hist(cur.data, "vor Wiederherstellung");
        cur.data = e.data; cur.client = "restore"; set(DB, cur); return ok(null);
      }
      if (fn == "delete_member") { // spiegelt supabase/migrations/20261030_15_benutzer_loeschen.sql
        if (role() != "admin") return fail("Nur die Spielleitung darf Benutzer löschen");
        if (a.uid == "u-" + s.user.email) return fail("Du kannst dich nicht selbst löschen");
        delete USERS[a.uid.slice(2)]; return ok(null);
      }
      if (fn == "set_member") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Benutzer verwalten");
        if (a.uid == "u-" + s.user.email && a.new_role != "admin") return fail("Du kannst dir die Admin-Rolle nicht selbst entziehen");
        var u = USERS[a.uid.slice(2)]; u.role = a.new_role; u.player = a.new_player;
      }
      return ok(null);
    }

    var functions = {
      invoke: function (name, o) {
        log({ op: "invoke", name: name, body: o.body });
        if (name == "notify" && o.body.type == "testmail") { // spiegelt supabase/functions/notify (testmail)
          if (role() != "admin") return Promise.resolve({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: function () { return Promise.resolve({ error: "Nur die Spielleitung darf Test-Mails verschicken" }) } } } });
          if (localStorage.getItem("__mock_brevo") != "1") return Promise.resolve({ data: null, error: { message: "Edge Function returned a non-2xx status code", context: { json: function () { return Promise.resolve({ error: "BREVO_API_KEY oder MAIL_FROM fehlt (Supabase → Edge Functions → Secrets)" }) } } } });
          return Promise.resolve({ data: { ok: true, to: get(SESS).user.email }, error: null });
        }
        if (name == "invite") { // spiegelt supabase/functions/invite (vereinfacht), Einladungen in localStorage
          var b = o.body, r = role(), L = get("__mock_invites") || [], sv = function () { set("__mock_invites", L) };
          var err = function (m) { return Promise.resolve({ data: null, error: { message: "non-2xx", context: { json: function () { return Promise.resolve({ error: m }) } } } }) };
          var open = function (t) { return L.filter(function (x) { return x.token == t && !x.used && x.expires_at > new Date().toISOString() })[0] };
          if (b.action == "check") { var c = open(b.token); return c ? ok({ ok: true, player: c.player, role: c.role }) : err("Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon verwendet.") }
          if (b.action == "join") {
            var j = open(b.token), em = String(b.email || "").trim().toLowerCase();
            if (!j) return err("Dieser Einladungslink ist ungültig, abgelaufen oder wurde schon verwendet.");
            if (String(b.password || "").length < 8) return err("Das Passwort braucht mindestens 8 Zeichen.");
            if (USERS[em]) return err("Diese Adresse hat bereits ein Konto. Bitte normal anmelden.");
            USERS[em] = { pw: b.password, role: j.role, player: j.player, name: j.player }; j.used = true; sv(); return ok({ ok: true, email: em });
          }
          if (r != "admin" && r != "captain") return err("Nur Spielleitung und Captains dürfen einladen.");
          if (b.action == "create") {
            if (b.role != "player" && r != "admin") return err("Nur die Spielleitung darf Captains oder Spielleitung einladen.");
            var t = "T" + String(L.length + 1).padStart(42, "x"), exp = new Date(Date.now() + 7 * 864e5).toISOString();
            L.push({ id: L.length + 1, token: t, role: b.role, player: b.player, mine: true, expires_at: exp }); sv(); return ok({ ok: true, token: t, expires_at: exp });
          }
          if (b.action == "list") return ok({ ok: true, items: L.filter(function (x) { return !x.used }).map(function (x) { return { id: x.id, player: x.player, role: x.role, expires_at: x.expires_at, mine: x.mine } }).reverse() });
          if (b.action == "revoke") { L = L.filter(function (x) { return x.id != b.id }); sv(); return ok({ ok: true }) }
        }
        if (name == "feedback") {
          // wie supabase-js bei HTTP-Fehlern: data = null, Server-Antwort steckt in error.context (Response)
          if (o.body.title == "zu viele") return Promise.resolve({ data: null, error: { message: "Edge Function returned a non-2xx status code",
            context: { json: function () { return Promise.resolve({ error: "Maximal 5 Vorschläge pro Tag." }) } } } });
          var fb = get("__mock_feedback") || []; fb.push({ title: o.body.title, status: "neu", created_at: new Date().toISOString() }); set("__mock_feedback", fb);
          return ok({ queued: true, id: fb.length });
        }
        return ok({ sent: 1 });
      }
    };

    function channel() {
      var c = { on: function (t, f, cb) { c.cb = cb; return c }, subscribe: function () { chans.push(c); return c } };
      return c;
    }

    return { auth: auth, from: from, rpc: rpc, functions: functions, channel: channel,
      removeChannel: function (c) { chans = chans.filter(function (x) { return x !== c }) } };
  }

  // Nicht überschreibbar, damit die echte Bibliothek (falls sie doch lädt) den Mock nicht ersetzt.
  Object.defineProperty(window, "supabase", { value: { createClient: createClient }, writable: false, configurable: false });
  window.IM_CONFIG = {
    url: "https://mock.supabase.test", key: "mock-anon-key", providers: JSON.parse(localStorage.getItem("__mock_providers") || '["google","azure"]'),
    vapidPublicKey: localStorage.getItem("__mock_vapid") || ""
  };
})();
