#!/usr/bin/env bash
# Spielt eine Vollsicherung in eine Datenbank zurück, in der setup.sql und alle Migrationen schon laufen.
# ERSETZT alle Daten und Konten dieser Datenbank.
# Aufruf: bash scripts/wiederherstellung.sh <Datei>
# Fragt nach Datenbank-Adresse und Passwort, solange SUPABASE_DB_URL und BACKUP_PASSPHRASE nicht gesetzt sind.
set -euo pipefail

command -v psql > /dev/null || PATH="$PATH:$(ls -d "/c/Program Files/PostgreSQL/"*/bin 2> /dev/null | sort -V | tail -n 1)"
command -v psql > /dev/null || { echo "psql fehlt: bitte die PostgreSQL-Werkzeuge installieren (siehe README)."; exit 1; }

datei=$1
url=${SUPABASE_DB_URL:-}
pass=${BACKUP_PASSPHRASE:-}
if [ -z "$url" ]; then read -rsp "Datenbank-Adresse (postgresql://…): " url; echo; fi
if [ -z "$pass" ]; then read -rsp "Passwort der Sicherung: " pass; echo; fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
gpg --batch --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt --output "$tmp/data.sql" "$datei" 3< <(printf %s "$pass")

# Zuerst leeren (mit Fremdschlüsseln), dann laden: im Replica-Modus laufen keine Trigger, die Daten bleiben unverändert
psql "$url" --single-transaction --quiet --variable ON_ERROR_STOP=1 \
  --command "delete from auth.users" \
  --command "do \$\$ declare t text; begin
      for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'schema_migrations' loop
        execute format('truncate public.%I cascade', t);
      end loop;
    end \$\$" \
  --command "set session_replication_role = replica" \
  --file "$tmp/data.sql"
echo "Wiederhergestellt aus $datei"
