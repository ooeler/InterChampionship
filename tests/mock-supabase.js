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

    function from(table) {
      return {
        select: function () {
          return {
            eq: function (col, val) {
              return { maybeSingle: function () { var r = get(DB); return ok(r && r[col] == val ? { data: r.data } : null) } };
            },
            order: function () {
              var res;
              if (table == "feedback") res = (get("__mock_feedback") || []).slice().reverse(); // eigene Vorschläge (RLS)
              else if (role() != "admin") res = []; // RLS: Mitgliederliste und Verlauf nur für die Spielleitung
              else if (table == "league_state_history") res = (get(HIST) || []).slice().reverse().map(function (h) { return { id: h.id, saved_at: h.saved_at, reason: h.reason } });
              else res = Object.keys(USERS).sort().map(function (e) { return { user_id: "u-" + e, email: e, role: USERS[e].role, player: USERS[e].player || null, resto: !!USERS[e].resto } });
              var p = ok(res); p.limit = function (n) { return ok(res.slice(0, n)) }; return p;
            }
          };
        },
        upsert: function (row) {
          if (!get(SESS)) return fail("JWT expired");
          if (table == "league_state") {
            var old = get(DB);
            // Spiegelt den Trigger guard_league_state aus supabase/setup.sql
            if (role() == "player" && (!old || ["t", "sn", "logo", "sp"].some(function (k) { return JSON.stringify(old.data[k]) != JSON.stringify(row.data[k]) })))
              return fail("Nur Admins und Captains dürfen Teams und Einstellungen ändern");
            if (old) hist(old.data, "Änderung"); // spiegelt den Trigger keep_league_history
            set(DB, JSON.parse(JSON.stringify(row)));
          }
          log({ op: "upsert", table: table, row: table == "league_state" ? undefined : row });
          return ok();
        },
        delete: function () { return { eq: function (c, v) { log({ op: "delete", table: table, value: v }); return ok() } } }
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
        return ok({ role: role(), player: localStorage.getItem("__mock_player") || me.player || null, prev_seen: localStorage.getItem("__mock_prev_seen"), notify_changes: localStorage.getItem("__mock_notify") == "1", resto: !!me.resto || localStorage.getItem("__mock_resto") == "1" });
      }
      log({ op: "rpc", fn: fn, args: a });
      if (fn == "set_resto") {
        if (role() != "admin") return fail("Nur die Spielleitung darf Rollen vergeben");
        USERS[a.uid.slice(2)].resto = a.on_resto; return ok(null);
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
        if (name == "invite") { // spiegelt supabase/functions/invite/logic.mjs (vereinfacht)
          var b = o.body, em = String(b.email || "").toLowerCase(), r = role();
          var err = function (m) { return Promise.resolve({ data: null, error: { message: "non-2xx", context: { json: function () { return Promise.resolve({ error: m }) } } } }) };
          if (r != "admin" && r != "captain") return err("Nur Spielleitung und Captains dürfen einladen.");
          if (b.role != "player" && r != "admin") return err("Nur die Spielleitung darf Captains oder Spielleitung einladen.");
          if (USERS[em]) return err("Diese Adresse hat bereits ein Konto.");
          USERS[em] = { pw: null, role: b.role, player: b.player }; return ok({ ok: true, email: em });
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
