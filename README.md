# InterChampionship

PWA der **UHC Flying Penguins** für die interne Inter-Herren-Meisterschaft: Spieltage, Anwesenheit, Pre-Game, Resultate, Skorer, Rangliste, Konzept – mit Login nur für eingeladene Mitglieder, Live-Sync zwischen allen Handys, Push-Nachrichten und Social-Media-Bild.

Alles läuft **kostenlos**: GitHub (Code, Tests, Hosting über GitHub Pages) + Supabase Free (Login, Datenbank, Push-Versand).

## Funktionen

| Bereich | Wer | Inhalt |
|---|---|---|
| ⚡ Spieltag | alle | „Meine Trainings“: selbst ab- und wieder anmelden; Resultat, Pre-Game, Startvorsprung, Anwesenheit (nächstes Training ist automatisch offen, Abmeldungen markiert), Tore/Assists, Ablauf Matchtag mit „x von y dabei“ |
| 🏆 Rangliste | alle | Spielstand der laufenden Serie (bis Ende Dezember Winter-, danach Sommermeisterschaft), Spieltage, Anwesenheit, Skorer, Torschützen |
| 👥 Teams | Spielleitung & Captains | Teams, Spieler, Captain, Logos, Sponsor, Backup |
| ℹ️ Infos | alle | Verbesserungsvorschlag (→ GitHub-Issue) und das Inter-Herren-Konzept |
| Benutzer & Rollen | Spielleitung | Rolle und zugeordneten Spieler pro Konto setzen |
| 📸 Social Media | Spielleitung | „Final Score“-Bild 1080×1080 aus den Daten + eigenen Fotos |
| 📣 Push | alle | 3 Tage vor dem Match Day und nach „Resultat melden“ |
| Forfait | Spielleitung & Captains | Setzt 0 : 5 gemäss Konzept |

Beim Laden fliegt das Flying-Penguins-Logo ein (bei „Bewegung reduzieren“ im System ruhig).

Begrüssung: „Hallo Name!“, am Match Day „heute ist Match Day“, früh morgens „Hallo Frühaufsteher“, nach über 30 Tagen Pause „willkommen zurück“.

## Projektstruktur

```
app/                      Die PWA (wird so ausgeliefert)
  index.html              App
  sw.js                   Service Worker (offline, Push)
  config.js               Verbindungsdaten (beim Release automatisch erzeugt)
supabase/
  setup.sql               Tabellen, Rollen, Sicherheitsregeln
  cron.sql                Täglicher Match-Day-Check
  functions/notify/       Edge Function für Push-Nachrichten
tests/                    Playwright-E2E-Tests (Android, iPhone, Desktop)
.github/                  Tests, Release-Deploy, Dependabot, CodeQL
```

## Einrichtung (einmalig)

### 1. Supabase

1. Auf [supabase.com](https://supabase.com) kostenloses Projekt anlegen (Region Zürich/Frankfurt).
2. **SQL Editor** → Inhalt von `supabase/setup.sql` einfügen → *Run*.
3. **Authentication → Sign In / Providers**:
   - *Allow new users to sign up* **ausschalten** (nur Eingeladene kommen rein – auch per Google/Microsoft).
   - Email: aktiv lassen.
   - Optional **Google** und/oder **Azure (Microsoft)** aktivieren (Client-ID/Secret aus Google Cloud Console bzw. Microsoft Entra; Anleitung direkt bei Supabase verlinkt).
4. **Authentication → URL Configuration**: *Site URL* und *Redirect URLs* = deine App-Adresse, z. B. `https://<github-name>.github.io/InterChampionship/`.
5. **E-Mail-Versand**: Supabase verschickt ohne eigenen Mailserver nur sehr wenige Mails. Gratis-SMTP z. B. bei [Brevo](https://www.brevo.com) (300 Mails/Tag) einrichten und unter **Authentication → Emails → SMTP Settings** eintragen.
6. **Benutzer einladen**: **Authentication → Users → Invite user** → Mail-Adresse. Die Person bekommt einen Link, legt ein Passwort fest (oder nutzt danach Google/Microsoft mit derselben Adresse).
7. Dich selbst einladen, anmelden, dann im SQL Editor:
   ```sql
   update public.members set role = 'admin' where email = 'deine@adresse.ch';
   ```
   Weitere Rollen und Spieler-Zuordnungen danach direkt in der App unter **Teams → Benutzer & Rollen**.

### 2. Push-Nachrichten

Die Schlüssel liegen in `.secrets/push.env` (nicht im Git!). Den Wert `VAPID_SUBJECT` auf eine echte Kontakt-Adresse ändern.

1. **Edge Functions → Secrets**: alle vier Werte aus `.secrets/push.env` eintragen.
2. `supabase/cron.sql` öffnen, `<PROJECT_REF>` und `<CRON_SECRET>` ersetzen, im SQL Editor ausführen (die Datei mit eingesetzten Werten nicht committen).
3. Hinweis iPhone: Push funktioniert erst, wenn die App über *Teilen → Zum Home-Bildschirm* installiert ist (ab iOS 16.4).

### 3. Verbesserungsvorschläge → GitHub-Issues

Im Tab **Infos** können alle Mitglieder Ideen und Fehler melden. Die Edge Function `feedback` speichert den Vorschlag in Supabase; der GitHub-Ablauf **„Vorschläge → Issues“** legt daraus alle 10 Minuten ein Issue an (Labels `verbesserung` bzw. `fehler` + `aus-der-app`, max. 5 pro Person und Tag, keine Mail-Adressen). In der App erscheint unter „Meine Vorschläge“ der Status mit Link zum Issue.

Es wird **kein persönliches GitHub-Token** benötigt – der Ablauf nutzt den eingebauten Token von GitHub Actions. Voraussetzung ist nur das Secret `SUPABASE_CRON_SECRET` (siehe unten).

### 4. GitHub

1. Repository `InterChampionship` anlegen und den Code pushen.
2. **Settings → Pages** → *Source: GitHub Actions*.
3. **Settings → Secrets and variables → Actions**
   - *Variables*: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_PROJECT_REF`, `VAPID_PUBLIC_KEY`, optional `OAUTH_PROVIDERS` (z. B. `google,azure`)
   - *Secrets*: `SUPABASE_ACCESS_TOKEN` (Supabase → Account → Access Tokens)
4. **Settings → Code security**: *Dependabot alerts* und *Dependabot security updates* einschalten, *CodeQL* läuft über den Workflow.
5. Optional **Settings → Environments → github-pages → Required reviewers**: dich eintragen, dann fragt GitHub vor jedem Deploy zusätzlich nach.

## Ablauf im Alltag

- **Jeder Push / Pull Request** → alle Tests laufen (Android-, iPhone- und Desktop-Browser) + CodeQL-Sicherheitsscan.
- **Sicherheitspatches gehen automatisch live**: Dependabot prüft täglich die Pakete. Bei einer Sicherheitslücke erstellt er einen Pull Request, die Tests laufen, danach wird **automatisch gemergt und deployt**. Normale Versions-Updates der Pakete sind abgeschaltet; Updates der GitHub Actions werden gemergt, aber nicht deployt.
- **Alles andere geht nur mit deinem Go live**: Auf GitHub → *Releases → Draft a new release* → Version (z. B. `v1.0.0`) → **Publish**. Dann laufen die Tests nochmals, danach werden App und Edge Function deployt.

## Lokal entwickeln

Voraussetzung: [Node.js](https://nodejs.org) 20+.

```bash
npm install
npx playwright install
npm test          # alle Tests
npm run test:ui   # Tests interaktiv
npm start         # App unter http://localhost:4173 (config.js mit Supabase-Werten füllen)
```

Die Tests nutzen eine Supabase-Simulation (`tests/mock-supabase.js`) – es werden nie echte Daten verändert.

## Später: echte App im Store

Die PWA lässt sich mit [Capacitor](https://capacitorjs.com) in eine Android- und iOS-App verpacken; der Code in `app/` bleibt dabei gleich. (iOS braucht einen Mac und das Apple-Developer-Programm, CHF ~99/Jahr.)

## Styleguide

Farben und Schriften folgen dem bisherigen Auftritt (Rot `#B9001B`, Schwarz, Oswald, „Let's Fly“). Sobald der offizielle Styleguide der UHC Flying Penguins vorliegt, werden die Werte im `<style>`-Block von `app/index.html` und in `drawSM()` (Social-Media-Bild) angepasst.
