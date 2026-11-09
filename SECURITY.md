# Sicherheit

## Schwachstelle melden
Bitte nicht als öffentliches Issue, sondern über **Security → Report a vulnerability** im GitHub-Repository.

## GitHub-Sicherheitsfunktionen (kostenlos für öffentliche Repos)
Aktiv: Code Scanning (CodeQL), Secret Scanning mit Push-Schutz (Pushes mit erkannten Schlüsseln werden abgelehnt), Dependabot-Warnungen und automatische Sicherheits-Updates, private Meldung von Schwachstellen.

## Was vor jedem Merge geprüft wird
Ein Pull Request wird nur gemergt, wenn alles grün ist (`auto-merge.yml`):

| Prüfung | Was sie findet |
|---|---|
| **CodeQL** (security-extended) | Schwachstellen im JavaScript/TypeScript-Code und in den Workflows, z. B. XSS, Injection |
| **Semgrep** | bekannte Schwachstellen-Muster, versehentlich eingecheckte Secrets, unsichere GitHub-Workflows |
| **npm audit** | Abhängigkeiten mit bekannten Schwachstellen (ab „high“) |
| `tests/sicherheit-statisch.spec.js` | Datenbank-Funktionen ohne Login ausführbar, Tabellen ohne Row Level Security, Edge Functions ohne Zugriffsprüfung, unsichere Workflows, Secrets im Repo |
| `tests/sicherheit.spec.js` | Content-Security-Policy, blockierter eingeschleuster Code, Prüfung der Bilddaten |
| **E2E mit echter Datenbank** (`tests-e2e/`) | lokale Supabase mit allen Migrationen: Funktionsrechte und RLS, Zugriffe ohne Login, Rechte von Spielern (Teams, Rollen, Strafen), Einladungslink nur einmal gültig |

Bei jedem Release prüft `release.yml` zusätzlich die **echte Datenbank**: Keine Funktion darf ohne Login ausführbar sein, jede Tabelle braucht Row Level Security. Sonst bricht das Release ab.

Laufend aktiv: GitHub Secret Scanning mit Push-Schutz und Dependabot-Sicherheitsupdates, die automatisch gemergt und ausgeliefert werden.

## CI/CD-Härtung (Lieferkette)
- **Dependabot-Updates für GitHub Actions nur nach fester Regelprüfung automatisch.** Der Job `regeln` in `auto-merge.yml` führt `scripts/actions-update-pruefen.mjs` aus – nur mit Leserechten und mit dem Skript vom Basis-Stand (`main`), nicht aus dem PR. Gemergt wird (ohne Release) nur, wenn **alle** Regeln erfüllt sind; sonst bleibt der PR offen und der Lauf nennt die verletzte Regel (`::notice::`):
  1. Ausgelöst von `dependabot[bot]`, PR von Dependabot aus diesem Repository nach `main`, Ökosystem `github_actions`, Update-Art Minor oder Patch (kein Major, auch nicht im Versions-Kommentar); alle Commits von Dependabot und von GitHub signiert; der letzte Commit ist der getestete Stand.
  2. Geändert sind nur Zeilen `uses: besitzer/repo[/pfad]@<40-stelliger SHA> # vX[.Y[.Z]]` in `.github/workflows/*.yml` – keine anderen Zeilen, keine anderen, neuen oder umbenannten Dateien; Action und Pfad bleiben gleich.
  3. Jeder Besitzer steht auf der Erlaubt-Liste `ERLAUBTE_BESITZER` im Skript (`actions`, `github`, `supabase`, `dependabot`).
  4. Jeder neue SHA ist genau der Commit, auf den der Tag aus dem Kommentar im Original-Repository zeigt (annotierte Tags werden über das Tag-Objekt aufgelöst). Dependabot lässt Kommentare wie `# v3` stehen und setzt den SHA, auf den `v3` zeigt; wurde der Tag inzwischen weitergeschoben, passt der SHA nicht mehr und der PR bleibt offen, bis Dependabot ihn aktualisiert.
  5. Ändert der PR `vollsicherung-probe.yml`, startet dort die Backup-Probe; ihr Lauf für denselben Commit muss grün sein (die Prüfung wartet bis 25 Minuten). Sonst gilt: Tests, e2e, Semgrep/npm audit und CodeQL müssen grün sein (Job `merge` braucht `test` und `codeql`).
  6. Tag und Commit sind mindestens 7 Tage alt. Zusätzlich schlägt Dependabot neue Action-Versionen erst nach 7 Tagen vor (`cooldown: default-days: 7` in `.github/dependabot.yml`). Daten von Commits und Tags setzt der Herausgeber selbst; die Prüfung ist eine zweite Linie, nicht die einzige.
- **Hürde beim Mergen (Workflow-Dateien):** Mit dem `GITHUB_TOKEN` darf ein Workflow keine Commits erzeugen, die Workflow-Dateien ändern (dazu bräuchte es die Berechtigung `workflows`, die das `GITHUB_TOKEN` nicht bekommen kann). Ein Rebase-Merge eines PRs, der auf dem aktuellen `main` aufsetzt, funktioniert (so wurden bisher alle `ci/`-PRs mit Workflow-Änderungen gemergt); liegt der PR **hinter** `main`, müssen die Commits neu geschrieben werden, und GitHub lehnt ab. Squash-Merges erzeugen ebenfalls einen neuen Commit, Merge-Commits verbietet die lineare Historie – deshalb bleibt es beim Rebase-Merge mit `--match-head-commit` (gemergt wird nur genau der geprüfte Stand). Liegt ein Actions-Update hinter `main`, wird **nicht** gemergt: der Workflow schreibt einmalig einen Hinweis in den PR. Dependabot nimmt `@dependabot rebase` von `github-actions[bot]` nicht an (nur von Personen mit Schreibrecht), und Dependabot rebased von sich aus nur bei Konflikten. Der Besitzer schreibt deshalb selbst `@dependabot rebase`; nach dem Rebase läuft alles neu und der PR wird gemergt, wenn die Regeln weiter erfüllt sind.
- **Rückfallebene, falls der Merge trotzdem scheitert:** Ein fein granuliertes Token nur für dieses Repository mit der Berechtigung *Workflows: write* (und *Contents/Pull requests: write*), das der **Besitzer** selbst erstellt und als Secret hinterlegt; der Merge-Schritt würde es statt des `GITHUB_TOKEN` verwenden. Das ist bewusst nicht eingerichtet – ein solches Token kann Workflows ändern und ist entsprechend zu schützen.
- **Secrets nur dort, wo sie gebraucht werden:** `SUPABASE_ACCESS_TOKEN`, das Cron-Secret und `GH_TOKEN` stehen in den einzelnen Schritten, nicht im Job. Fremde Actions (`checkout`, `setup-cli`, `setup-node`, …) sehen sie nicht. `dependabot/fetch-metadata` läuft in einem eigenen Job nur mit Leserechten.
- **Environment `production`:** Die Deploy-Jobs (`backend`, `wartung-aus`) laufen im Environment `production`, Pages wie bisher in `github-pages`. Beide erlauben nur `main` und Tags `v*`. Zusätzlich prüfen die Jobs selbst den Ref.
- **Tag-Schutz:** Ein Ruleset verhindert, dass bestehende Release-Tags `v*` verschoben oder gelöscht werden (Ausnahme: Admin). Das Anlegen neuer Tags bleibt erlaubt, weil der Release-Workflow sie mit dem `GITHUB_TOKEN` erstellt. In einem persönlichen Repository lässt sich GitHub Actions nicht als Ausnahme eintragen.
- **Tests überspringen nur mit Nachweis:** `release.yml` wiederholt die Tests nur dann nicht, wenn über die GitHub-API belegt ist, dass der Release-Stand auf `main` liegt, ein gemergter Pull Request genau diesen Git-Tree hinterlassen hat und in dessen Lauf die Jobs `test`, `e2e`, `security` und CodeQL grün waren. Sonst laufen alle Tests.
- **SQL im Release:** Der Ref-Name wird vor der Verwendung im SQL geprüft. Das Cron-Secret wird nur noch geschrieben, wenn es sich geändert hat (Vergleich per SHA-256), und steht damit nicht mehr bei jedem Release im SQL-Text.
- **Container per Digest gepinnt** (Playwright, Semgrep). Dependabot aktualisiert Images in Workflows nicht. Bei einem Update von `@playwright/test` müssen Tag und Digest in `ci.yml` von Hand angepasst werden (`tests/ci-container.spec.js` meldet eine abweichende Version, den Digest prüft er nicht). Semgrep sollte gelegentlich von Hand aktualisiert werden.

## Security-Assessment Oktober 2026

### Behoben
| # | Schwere | Befund | Behebung |
|---|---|---|---|
| 1 | **Hoch** | Datenbank-Funktionen waren **ohne Login** aufrufbar. In Postgres darf standardmässig jeder (`PUBLIC`) Funktionen ausführen, deshalb wirkte `revoke … from anon` nicht. Ohne Login liessen sich so Push-Nachrichten an alle auslösen (`call_notify`) und Backups in beliebiger Menge anlegen (`snapshot_league`). | Migration `07_sicherheit`: Rechte auf `PUBLIC` und `anon` entzogen; neue Funktionen sind künftig nicht mehr automatisch freigegeben; Prüfung im Release und in den Tests |
| 2 | Mittel | Trainingsdatum und Beginn waren nur in der App geschützt. Mit etwas Technik-Wissen konnten Spieler sie direkt in der Datenbank ändern. | Datenbank-Trigger erlaubt Änderungen nur Spielleitung und Captains; die App lädt bei Ablehnung den gültigen Stand neu |
| 3 | Mittel | Die Push-Nachricht „An-/Abmeldung“ übernahm Name und Uhrzeit ungeprüft vom Gerät. Ein Mitglied hätte allen Abonnenten beliebigen Text schicken können (Phishing), und zwar beliebig oft. | Spieler und Training werden gegen die Saison-Daten geprüft, die Uhrzeit kommt aus den Daten; höchstens eine Nachricht pro Person, Training und 10 Minuten |
| 4 | Niedrig | Push-Adressen wurden ungeprüft angesprochen. Ein Mitglied hätte den Server Anfragen an beliebige Adressen schicken lassen können (SSRF). | Nur noch die Push-Dienste von Google, Mozilla, Apple und Microsoft |
| 5 | Niedrig | Das Cron-Secret wurde nicht in konstanter Zeit verglichen (Timing-Angriff). | `safeEqual` in `supabase/functions/_shared/sicherheit.mjs` |
| 6 | Niedrig | GitHub Actions waren nur per Versions-Tag eingebunden; ein manipulierter Tag hätte fremden Code mit Deploy-Rechten ausgeführt (Lieferkette). | Alle Actions auf feste Commit-Hashes gepinnt (Dependabot hält sie aktuell) |
| 7 | Niedrig | Der Build-Ordner `dist/` war eingecheckt. | Aus dem Repository entfernt (steht in `.gitignore`) |
| – | Hoch | *(v1.8.0)* Bilddaten (Logos, Sponsor) wurden ungeprüft ins HTML eingesetzt (XSS). | Prüfung der Bilddaten und Content-Security-Policy mit Prüfsummen |

### Bewusst akzeptiert / offen
- **Öffentliche Rangliste:** Ohne Login gibt es nur die eingeschränkte Sicht `public_league()` (Migration `36_oeffentlich_nur_summen`, ohne Trainingsserie seit `37_serie_nur_mitglieder`), nie den ganzen Saison-Stand. Öffentlich sind Teams und Spielernamen, Resultate, Tore und Assists, Gäste (Name, Team, Torhüter), pro Training nur Datum, Beginn und **Anzahl** Anwesende, pro Monat die **Summe** der Anwesenheit pro Spieler und die Torhüter des Match Days. **Nicht** öffentlich: wer an welchem Training war, die Trainingsserie (🔥, nur für Mitglieder), Restaurants, Abmeldungen und Gründe, Status, Trainingsleitung, Trainings-Gäste, Schiedsrichter, Mail-Adressen. Die App-Punkte gibt es nur als fertige Punkte für gespielte Monate (`public_app_points`). Besucher sehen darum keine ▲/▼ bei der Anwesenheit, kein 🔥 und keine Restaurants.
- **Vertrauen im Team:** Mitglieder können Resultate und die Anwesenheit anderer ändern. Das ist so gewollt; jede Änderung ist im Verlauf gesichert und lässt sich wiederherstellen.
- **Passwörter:** Mindestens 8 Zeichen. Der Schutz vor geleakten Passwörtern (Have I Been Pwned) braucht den Supabase-Pro-Plan.
- Der öffentliche Supabase-Schlüssel (`anon`) steht absichtlich in der App. Geschützt wird über Login und Row Level Security.
