#!/usr/bin/env bash
#
# Status-Übersicht der Traveller-Instanzen auf dem Pi: für prod und test je
# Dienststatus (systemd), ob der Server antwortet (Health-Endpunkt) und ob der
# Port hört; dazu der Zustand der Timer (Test-Auto-Update, Prod-Backup).
#
# Braucht kein sudo (reine Leseabfragen). Aufruf:
#   ./status.sh              # prüft prod und test
#   ./status.sh prod         # nur eine Instanz
#
# Exit-Code 0 = alles gesund, 1 = mindestens eine Prüfung fehlgeschlagen
# (praktisch für Monitoring/Cron).
set -uo pipefail

INSTANCES=("$@")
[ ${#INSTANCES[@]} -eq 0 ] && INSTANCES=(prod test)

# Farben nur wenn die Ausgabe ein Terminal ist (nicht in Logs/Pipes).
if [ -t 1 ]; then
  G=$'\033[32m'; R=$'\033[31m'; Y=$'\033[33m'; DIM=$'\033[2m'; B=$'\033[1m'; X=$'\033[0m'
else
  G=''; R=''; Y=''; DIM=''; B=''; X=''
fi

overall=0
ok()   { echo "  ${G}✓${X} $1"; }
bad()  { echo "  ${R}✗${X} $1"; overall=1; }
note() { echo "  ${DIM}$1${X}"; }

check_instance() {
  local inst="$1"
  local unit="traveller@${inst}.service"
  local env_file="/etc/traveller/${inst}.env"
  echo "${B}── ${inst} ──${X}"

  # 1. Ist die Unit überhaupt installiert?
  if ! systemctl cat "$unit" >/dev/null 2>&1; then
    bad "Dienst: Unit ${unit} nicht installiert"
    echo
    return
  fi

  # 2. Dienststatus
  local active enabled
  active="$(systemctl is-active "$unit" 2>/dev/null || true)"
  enabled="$(systemctl is-enabled "$unit" 2>/dev/null || true)"
  if [ "$active" = "active" ]; then
    ok "Dienst: active (Autostart: ${enabled:-?})"
  else
    bad "Dienst: ${active:-unbekannt} (Autostart: ${enabled:-?})"
  fi

  # 3. Port aus der Env-Datei lesen (nicht hartkodieren)
  local port=""
  [ -r "$env_file" ] && port="$(grep -E '^PORT=' "$env_file" | tail -1 | cut -d= -f2 | tr -d ' \r')"

  if [ -z "$port" ]; then
    bad "PORT nicht in ${env_file} gefunden"
  else
    # 4. Health-Endpunkt (bestätigt, dass Node hochkam, nicht nur der Dienst)
    if curl -fsS --max-time 3 "http://127.0.0.1:${port}/health" >/dev/null 2>&1; then
      ok "Health: antwortet auf 127.0.0.1:${port}"
    else
      bad "Health: keine Antwort auf 127.0.0.1:${port}"
    fi
    # 5. Hört der Port?
    if ss -tlnH 2>/dev/null | grep -qE "127\.0\.0\.1:${port}\b"; then
      ok "Port ${port}: hört"
    else
      bad "Port ${port}: hört nicht"
    fi
  fi

  # 6. Bei Problemen auf das Log verweisen
  if [ "$active" != "active" ]; then
    note "→ Log ansehen:  journalctl -u ${unit} -n 50 --no-pager"
  fi
  echo
}

check_timer() {
  local timer="$1" label="$2"
  if ! systemctl cat "$timer" >/dev/null 2>&1; then
    note "$label: nicht installiert"
    return
  fi
  local active next
  active="$(systemctl is-active "$timer" 2>/dev/null || true)"
  next="$(systemctl show "$timer" -p NextElapseUSecRealtime --value 2>/dev/null)"
  if [ "$active" = "active" ]; then
    ok "$label: aktiv${next:+ (nächster Lauf: $next)}"
  else
    note "$label: ${active:-inaktiv}"
  fi
}

for inst in "${INSTANCES[@]}"; do
  check_instance "$inst"
done

echo "${B}── Timer ──${X}"
check_timer "traveller-autoupdate@test.timer" "Test-Auto-Update"
check_timer "traveller-backup.timer"          "Prod-Backup"
echo

if [ "$overall" -eq 0 ]; then
  echo "${G}${B}Alles gesund.${X}"
else
  echo "${R}${B}Mindestens eine Prüfung fehlgeschlagen (siehe ✗ oben).${X}"
fi
exit "$overall"
