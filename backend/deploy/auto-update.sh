#!/usr/bin/env bash
#
# Auto-Update für den TEST-Server. Wird von traveller-autoupdate@test.timer
# alle paar Minuten aufgerufen: prüft auf neue Commits im Zweig, holt sie und
# startet Test neu. Bei geändertem package-lock.json vorher `npm ci`.
#
# Verweigert sich absichtlich für "prod" — Prod wird per deploy-prod.sh manuell
# aktualisiert (bewusster Neustart, DB-Snapshot davor, kein Update am Spieltisch).
#
# Erwartet einen sudoers-Eintrag, der dem Dienst-User den Neustart erlaubt
# (siehe sudoers.d-traveller.example).
set -euo pipefail

INSTANCE="${1:?Aufruf: auto-update.sh <instance>}"
if [ "$INSTANCE" = "prod" ]; then
  echo "auto-update ist für prod gesperrt — Prod bitte per deploy-prod.sh aktualisieren." >&2
  exit 1
fi

REPO_DIR="/srv/traveller-${INSTANCE}"
BRANCH="${TRAVELLER_TEST_BRANCH:-main}"
cd "$REPO_DIR"

git fetch --quiet origin "$BRANCH"
LOCAL="$(git rev-parse HEAD)"
REMOTE="$(git rev-parse "origin/${BRANCH}")"
if [ "$LOCAL" = "$REMOTE" ]; then
  exit 0   # nichts Neues, still beenden (kein Log-Rauschen im Journal)
fi

echo "Neuer Stand ${REMOTE:0:9} auf ${BRANCH} — aktualisiere ${INSTANCE}"
LOCK_BEFORE="$(sha1sum backend/package-lock.json | awk '{print $1}')"

# Test darf hart auf den Remote-Stand zurückgesetzt werden — dort gibt es keine
# schützenswerten lokalen Änderungen.
git reset --hard "origin/${BRANCH}"

LOCK_AFTER="$(sha1sum backend/package-lock.json | awk '{print $1}')"
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  echo "package-lock.json geändert — npm ci"
  ( cd backend && npm ci )
fi

sudo /usr/bin/systemctl restart "traveller@${INSTANCE}.service"
echo "✓ ${INSTANCE} läuft jetzt auf ${REMOTE:0:9}"
