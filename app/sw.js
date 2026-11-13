// Bei jeder Änderung an der App die Version erhöhen, damit Handys das Update laden.
var V = "ic-v1";
var SHELL = ["./", "index.html", "css/app.css", "js/kern.js", "js/allgemein.js", "js/infos-hall.js", "js/training.js", "js/spieltag.js", "js/teams.js", "js/ui.js", "js/social.js", "js/start.js", "config.js", "vendor/supabase.js", "manifest.webmanifest", "logo.png", "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png", "icon-192-club.png", "icon-512-club.png", "icon-maskable-512-club.png"];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(V).then(function (c) { return c.addAll(SHELL) }).then(function () { return self.skipWaiting() }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (ks) {
    return Promise.all(ks.filter(function (k) { return k != V }).map(function (k) { return caches.delete(k) }));
  }).then(function () { return self.clients.claim() }));
});

// Push-Nachrichten (Match Day, Resultat) – gesendet von supabase/functions/notify
self.addEventListener("push", function (e) {
  var d = {};
  try { d = e.data.json() } catch (x) { d = { body: e.data ? e.data.text() : "" } }
  e.waitUntil(self.registration.showNotification(d.title || "Herren Inter", {
    body: d.body || "", icon: "icon-192.png", badge: "icon-192.png", tag: d.tag, data: { url: d.url || "./" }
  }));
});

// Antippen: Ziel der Nachricht öffnen (z. B. ./#trainings, ./#spieltag=2), nur innerhalb der App.
// Ist die App schon offen, wird sie nach vorne geholt und bekommt das Ziel per Nachricht (app/js/start.js wechselt den Reiter),
// ohne Neuladen – so gehen ungespeicherte Eingaben nicht verloren.
self.addEventListener("notificationclick", function (e) {
  e.notification.close();
  var url = new URL((e.notification.data && e.notification.data.url) || "./", self.registration.scope);
  if (url.origin != location.origin) url = new URL("./", self.registration.scope);
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(function (ws) {
    for (var i = 0; i < ws.length; i++) if ("focus" in ws[i]) {
      ws[i].postMessage({ type: "nav", url: url.href });
      return ws[i].focus();
    }
    return self.clients.openWindow(url.href);
  }));
});

// App-Dateien: zuerst Netz (für Updates), offline aus dem Cache. Schriften: Cache zuerst.
// Anfragen an die Supabase-API (andere Domain) werden nie gecacht.
self.addEventListener("fetch", function (e) {
  var r = e.request;
  if (r.method != "GET") return;
  var u = new URL(r.url);
  if (u.host == "fonts.googleapis.com" || u.host == "fonts.gstatic.com") {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (res) {
        var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp) }); return res;
      });
    }));
    return;
  }
  if (u.origin != location.origin) return;
  e.respondWith(fetch(r).then(function (res) {
    if (res.ok) { var cp = res.clone(); caches.open(V).then(function (c) { c.put(r, cp) }) }
    return res;
  }).catch(function () {
    return caches.match(r, { ignoreSearch: true }).then(function (m) { return m || caches.match("index.html") });
  }));
});
