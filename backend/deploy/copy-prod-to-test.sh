#!/usr/bin/env bash
#
# Kopiert die PROD-Daten (DB + Uploads) nach TEST, um einen Bug gegen echte,
# real geformte Daten zu reproduzieren oder eine Migration vorab zu proben.
#
# STRENG EINSEITIG: liest nur aus Prod, schreibt nur nach Test. Kehrt die
# Richtung nie um. (Genau die Verwechslung, gegen die auch getrennte DB_PATHs
# schützen — hier zusätzlich hart verdrahtet.)
#
# Hinweis: Die kopierte DB enthält auch Prod-Nutzer und -Sessions. Auf Test
# funktionieren danach also dieselben Logins — praktisch fürs Reproduzieren.
set -euo pipefail

PROD_DB=/var/lib/traveller/prod/traveller.db
PROD_UP=/var/lib/traveller/prod/uploads
TEST_DB=/var/lib/traveller/test/traveller.db
TEST_UP=/var/lib/traveller/test/uploads

echo "Quelle (Prod):  $PROD_DB  +  $PROD_UP"
echo "Ziel   (Test):  $TEST_DB  +  $TEST_UP   ← wird ÜBERSCHRIEBEN"
read -r -p "Test-Daten mit einer Kopie von PROD überschreiben? [ja/NEIN] " ok
[ "$ok" = "ja" ] || { echo "Abgebrochen."; exit 1; }

# Test stoppen, damit keine offene SQLite-/WAL-Datei überschrieben wird.
sudo /usr/bin/systemctl stop traveller@test.service

# DB konsistent kopieren (Online-Backup-API, WAL-sicher — auch bei laufendem Prod).
mkdir -p "$(dirname "$TEST_DB")"
rm -f "$TEST_DB" "$TEST_DB-wal" "$TEST_DB-shm"
sqlite3 "$PROD_DB" ".backup '$TEST_DB'"

# Uploads spiegeln.
rm -rf "$TEST_UP"
mkdir -p "$TEST_UP"
cp -a "$PROD_UP/." "$TEST_UP/"

sudo /usr/bin/systemctl start traveller@test.service
echo "✓ Test hat jetzt eine Kopie der Prod-Daten."
