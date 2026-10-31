#!/usr/bin/env bash
# Vollsicherung auf den eigenen Rechner: alle Daten inklusive Konten, verschlüsselt in einer Datei.
# Das Schema braucht es nicht, es entsteht beim Wiederherstellen aus setup.sql und den Migrationen.
# Aufruf: bash scripts/vollsicherung.sh [Zielordner]   (Standard: ~/Herren-Inter-Sicherung)
# Fragt nach Datenbank-Adresse und Passwort, solange SUPABASE_DB_URL und BACKUP_PASSPHRASE nicht gesetzt sind.
set -euo pipefail

command -v pg_dump > /dev/null || PATH="$PATH:$(ls -d "/c/Program Files/PostgreSQL/"*/bin 2> /dev/null | sort -V | tail -n 1)"
command -v pg_dump > /dev/null || { echo "pg_dump fehlt: bitte die PostgreSQL-Werkzeuge installieren (siehe README)."; exit 1; }

ordner=${1:-"$HOME/Herren-Inter-Sicherung"}
url=${SUPABASE_DB_URL:-}
pass=${BACKUP_PASSPHRASE:-}
if [ -z "$url" ]; then read -rsp "Datenbank-Adresse (postgresql://…): " url; echo; fi
if [ -z "$pass" ]; then
  read -rsp "Passwort für die Sicherung: " pass; echo
  read -rsp "Passwort wiederholen: " nochmals; echo
  [ "$pass" = "$nochmals" ] || { echo "Die Passwörter stimmen nicht überein."; exit 1; }
fi
[ "${#pass}" -ge 16 ] || { echo "Das Passwort braucht mindestens 16 Zeichen."; exit 1; }

mkdir -p "$ordner"
ziel="$ordner/vollsicherung-$(date +%F).sql.gpg"
tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

pg_dump "$url" --data-only --schema=public --schema=auth \
  --exclude-table=public.schema_migrations --exclude-table=auth.schema_migrations --file="$tmp/data.sql"

# Eine leere Sicherung ist schlimmer als keine: Konten und Saison-Daten müssen drin sein
for t in auth.users public.league_state public.members; do
  zeile=$(grep -A1 -E "^COPY ${t%.*}\.\"?${t#*.}\"? " "$tmp/data.sql" | tail -n 1 || true)
  if [ -z "$zeile" ] || [ "$zeile" = '\.' ]; then
    echo "Sicherung unvollständig: keine Daten in $t"
    exit 1
  fi
done

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 \
  --output "$ziel" "$tmp/data.sql" 3< <(printf %s "$pass")

# Lässt sich die Datei wieder öffnen?
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$ziel" 3< <(printf %s "$pass") | cmp - "$tmp/data.sql"
echo "Vollsicherung erstellt: $ziel ($(du -h "$ziel" | cut -f1))"
