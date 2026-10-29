# Sicherheit

## Schwachstelle melden
Bitte nicht als öffentliches Issue, sondern über **Security → Report a vulnerability** im GitHub-Repository.

## Was vor jedem Merge geprüft wird
Ein Pull Request wird nur gemergt, wenn alles grün ist (`auto-merge.yml`):

| Prüfung | Was sie findet |
|---|---|
| **CodeQL** (security-extended) | Schwachstellen im JavaScript/TypeScript-Code und in den Workflows, z. B. XSS, Injection |
| **Semgrep** | bekannte Schwachstellen-Muster, versehentlich eingecheckte Secrets, unsichere GitHub-Workflows |
| **npm audit** | Abhängigkeiten mit bekannten Schwachstellen (ab „high“) |
| `tests/sicherheit-statisch.spec.js` | Datenbank-Funktionen ohne Login ausführbar, Tabellen ohne Row Level Security, Edge Functions ohne Zugriffsprüfung, unsichere Workflows, Secrets im Repo |
| `tests/sicherheit.spec.js` | Content-Security-Policy, blockierter eingeschleuster Code, Prüfung der Bilddaten |

Bei jedem Release prüft `release.yml` zusätzlich die **echte Datenbank**: Keine Funktion darf ohne Login ausführbar sein, jede Tabelle braucht Row Level Security. Sonst bricht das Release ab.

Laufend aktiv: GitHub Secret Scanning mit Push-Schutz und Dependabot-Sicherheitsupdates, die automatisch gemergt und ausgeliefert werden.

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
