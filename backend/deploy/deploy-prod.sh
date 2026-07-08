#!/usr/bin/env bash
#
# Manuelles PROD-Deploy. Bewusst von Hand ausgelöst (kein Timer): Prod-Neustart
# fährt die Migrationen scharf und unterbricht kurz laufende Syncs — das soll
# nie überraschend am Spieltisch passieren.
#
# Ablauf: DB-Snapshot -> Code auf Ziel-Ref -> ggf. npm ci -> Neustart ->
# Health-Check. Schlägt der Health-Check fehl, liegt der Snapshot bereit.
#
# Aufruf:  deploy-prod.sh <tag-oder-commit>     z.B.:  deploy-prod.sh v3.5.1
#
# Empfohlener Ablauf davor: denselben Stand erst auf Test laufen lassen (holt
# der Test-Auto-Update ohnehin automatisch), dort prüfen, dann hier promoten.
set -euo pipefail

REF="${1:?Aufruf: deploy-prod.sh <tag-oder-commit>, z.B. v3.5.1}"
REPO_DIR=/srv/traveller-prod
ENV_FILE=/etc/traveller/prod.env

# DB_PATH und PORT aus der Prod-Env holen.
# shellcheck disable=SC1090
set -a; source "$ENV_FILE"; set +a
: "${DB_PATH:?DB_PATH fehlt in $ENV_FILE}"
: "${PORT:?PORT fehlt in $ENV_FILE}"

# 1. DB-Snapshot VOR jeder Änderung. sqlite3 .backup ist auch bei laufendem
#    Dienst konsistent (Online-Backup-API, verrechnet WAL korrekt) — anders als
#    ein einfaches cp der .db-Datei.
SNAP_DIR="$(dirname "$DB_PATH")/snapshots"
mkdir -p "$SNAP_DIR"
STAMP="$(date +%Y%m%d-%H%M%S)"
SNAP="$SNAP_DIR/traveller-$STAMP.db"
sqlite3 "$DB_PATH" ".backup '$SNAP'"
echo "DB-Snapshot: $SNAP"

# 2. Code auf Ziel-Ref.
cd "$REPO_DIR"
git fetch --quiet --tags origin
LOCK_BEFORE="$(sha1sum backend/package-lock.json | awk '{print $1}')"
git checkout --quiet "$REF"
LOCK_AFTER="$(sha1sum backend/package-lock.json | awk '{print $1}')"
if [ "$LOCK_BEFORE" != "$LOCK_AFTER" ]; then
  echo "package-lock.json geändert — npm ci"
  ( cd backend && npm ci )
fi

# 3. Neustart (fährt Schema-/Daten-Migrationen aus server.js/startup-tasks.js).
sudo /usr/bin/systemctl restart traveller@prod.service

# 4. Health-Check.
sleep 2
if curl -fsS "http://127.0.0.1:${PORT}/health" >/dev/null; then
  echo "✓ Prod läuft auf $REF"
else
  echo "✗ Health-Check fehlgeschlagen!" >&2
  echo "  Journal:  sudo journalctl -u traveller@prod -n 50 --no-pager" >&2
  echo "  Snapshot zum Zurückspielen: $SNAP" >&2
  exit 1
fi
