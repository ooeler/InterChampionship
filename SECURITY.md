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
- **Dependabot-Updates für GitHub Actions werden nicht automatisch gemergt.** Sie bleiben offen, bis jemand die Änderungen der Action geprüft hat. Automatisch gemergt werden nur npm-Sicherheitsupdates.
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
- **Öffentliche Rangliste:** Ohne Login lesbar ist der ganze Saison-Stand, inklusive Abmeldungen, Trainingsleitung und Restaurants (keine Mail-Adressen). Falls das zu viel ist, kann eine reduzierte öffentliche Sicht gebaut werden.
- **Vertrauen im Team:** Mitglieder können Resultate und die Anwesenheit anderer ändern. Das ist so gewollt; jede Änderung ist im Verlauf gesichert und lässt sich wiederherstellen.
- **Passwörter:** Mindestens 8 Zeichen. Der Schutz vor geleakten Passwörtern (Have I Been Pwned) braucht den Supabase-Pro-Plan.
- Der öffentliche Supabase-Schlüssel (`anon`) steht absichtlich in der App. Geschützt wird über Login und Row Level Security.
