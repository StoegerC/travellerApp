# Prod/Test-Architektur auf dem Raspberry Pi

Zwei Instanzen desselben Servers auf einer Kiste: **Prod** (das Live-Spiel) und
**Test** (Generalprobe für Deploys und DB-Migrationen). Der eigentliche Zweck ist
nicht „zwei Umgebungen", sondern: neue Versionen und Schema-Änderungen erst gegen
eine Kopie echter Daten prüfen, bevor Prod neu startet — es gibt kein
Migrations-Framework und kein Rollback, der Test-Lauf ist die Sicherung.

## Das eine Prinzip: Datenisolation

Prod und Test teilen **DB, Uploads und Git-Backup niemals**. Deshalb liegen die
Daten außerhalb des Git-Checkouts, in getrennten Verzeichnissen:

```
/srv/traveller-prod/            ← Checkout (Release-Tag),   git-ignoriert: data/, uploads/
/srv/traveller-test/            ← Checkout (main HEAD)
/var/lib/traveller/prod/        ← traveller.db, uploads/, git-backup/, snapshots/
/var/lib/traveller/test/        ← traveller.db, uploads/
/etc/traveller/prod.env         ← Port 3000, DB_PATH, Backup-Konfig
/etc/traveller/test.env         ← Port 3001, DB_PATH, KEIN Backup
```

Der Code kann das ohne Änderung: `DB_PATH`, `UPLOAD_DIR`, `PORT`, `HOST` und die
`BACKUP_*`-Werte sind alle env-überschreibbar.

## Wer aktualisiert sich wie

- **Test: automatisch.** `traveller-autoupdate@test.timer` pollt alle 5 Minuten
  `main`, zieht neue Commits und startet Test neu. Jeder Merge landet so binnen
  Minuten auf Test.
- **Prod: manuell.** `deploy-prod.sh <tag>` — bewusst ausgelöst, mit DB-Snapshot
  davor und Health-Check danach. Kein Timer, kein Update am Spieltisch.

## Erstinstallation (einmalig)

```bash
# 0. Systempakete (Node 22+ für node:sqlite; sqlite3-CLI für die Deploy-Skripte)
sudo apt update && sudo apt install -y git sqlite3
# Node 22+ separat installieren (NodeSource oder nvm) — die Raspberry-Pi-OS-
# Paketquelle ist oft zu alt für node:sqlite. Prüfen: node --version

# 1. Dienst-User + Verzeichnisse
sudo useradd --system --home /srv --shell /usr/sbin/nologin traveller
sudo mkdir -p /srv /var/lib/traveller/{prod,test} /etc/traveller
sudo chown -R traveller:traveller /srv /var/lib/traveller

# 2. Zwei Checkouts
sudo -u traveller git clone https://github.com/<du>/traveller-charsheet /srv/traveller-prod
sudo -u traveller git clone https://github.com/<du>/traveller-charsheet /srv/traveller-test
( cd /srv/traveller-prod/backend && sudo -u traveller npm ci )
( cd /srv/traveller-test/backend && sudo -u traveller npm ci )

# 3. Env-Dateien aus den Vorlagen
sudo cp /srv/traveller-prod/backend/deploy/prod.env.example /etc/traveller/prod.env
sudo cp /srv/traveller-prod/backend/deploy/test.env.example /etc/traveller/test.env
sudo chmod 600 /etc/traveller/*.env && sudo chown traveller:traveller /etc/traveller/*.env
# → beide Dateien prüfen/anpassen

# 4. systemd-Units
sudo cp /srv/traveller-prod/backend/systemd/traveller@.service /etc/systemd/system/
sudo cp /srv/traveller-prod/backend/systemd/traveller-autoupdate@.{service,timer} /etc/systemd/system/
sudo cp /srv/traveller-prod/backend/systemd/traveller-backup.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload

# 5. sudoers für die Skripte (Neustart ohne Passwort, least privilege)
sudo cp /srv/traveller-prod/backend/deploy/sudoers.d-traveller.example /etc/sudoers.d/traveller
sudo chmod 440 /etc/sudoers.d/traveller && sudo visudo -c

# 6. Admin-Account je Instanz anlegen (getrennte DBs → getrennte Konten).
#    Die Env-Datei wird gesourct (robust gegenüber Kommentarzeilen), damit
#    create-admin.js dieselbe DB_PATH wie der Dienst trifft. Der ausgegebene
#    Setup-Token wird beim ersten Login gegen ein eigenes Passwort getauscht.
sudo -u traveller bash -c 'set -a; . /etc/traveller/prod.env; set +a; node /srv/traveller-prod/backend/create-admin.js du@example.com'
sudo -u traveller bash -c 'set -a; . /etc/traveller/test.env; set +a; node /srv/traveller-test/backend/create-admin.js du@example.com'

# 7. Backup-Deploy-Key ablegen (nur Prod; SSH-Key mit Push-Recht aufs
#    private Backup-Repo, Pfad wie in prod.env → BACKUP_SSH_KEY)
sudo -u traveller mkdir -p /var/lib/traveller/prod/.ssh && sudo chmod 700 /var/lib/traveller/prod/.ssh
# → privaten Deploy-Key nach /var/lib/traveller/prod/.ssh/traveller_backup_deploy kopieren, chmod 600

# 8. Starten
sudo systemctl enable --now traveller@prod traveller@test
sudo systemctl enable --now traveller-autoupdate@test.timer   # NUR test!
sudo systemctl enable --now traveller-backup.timer            # prod-Backup
```

## Tunnel

- **Prod** öffentlich über Tailscale Funnel (wie bisher): `tailscale funnel --bg 3000`
- **Test** nur im Tailnet, nicht öffentlich: `tailscale serve --bg --https=8443 http://127.0.0.1:3001`
  → erreichbar unter `https://<pi>.<tailnet>.ts.net:8443/`, nur für eigene Geräte.

Beide binden weiterhin auf `127.0.0.1`, der Tunnel reicht durch.

## Täglicher Betrieb

```bash
# Neue Version live nehmen (nachdem Test sie automatisch gezogen und du sie
# geprüft hast):
/srv/traveller-prod/backend/deploy/deploy-prod.sh v3.5.1

# Einen Bug gegen echte Daten reproduzieren:
/srv/traveller-test/backend/deploy/copy-prod-to-test.sh
```

## Regeln, die man nicht brechen darf

1. **`traveller-autoupdate@prod` niemals aktivieren.** Das Skript verweigert sich
   ohnehin, aber der Timer gehört gar nicht erst scharf.
2. **`node backup-to-git.js` nie auf Test ausführen.** `git-backup-config.js` hat
   einen hartkodierten Default auf das Prod-Repo — Test würde dort hineinpushen.
   Test hat deshalb keinen Backup-Timer und keine `BACKUP_*`-Env.
3. **Test nie vom echten Spielgerät aus öffnen.** Der `localStorage` hält Session-
   Token und gecachte Cloud-Charaktere; getrennte Accounts + Logout-/Purge-Logik
   würden den lokalen Cache durcheinanderbringen. Separates Browser-Profil nehmen.
4. **Daten fließen nur Prod → Test**, nie umgekehrt.

## Rollback im Notfall

`deploy-prod.sh` legt vor jedem Deploy einen Snapshot unter
`/var/lib/traveller/prod/snapshots/` an. Zurückspielen:

```bash
sudo systemctl stop traveller@prod
sudo -u traveller cp /var/lib/traveller/prod/snapshots/traveller-<stamp>.db /var/lib/traveller/prod/traveller.db
sudo rm -f /var/lib/traveller/prod/traveller.db-wal /var/lib/traveller/prod/traveller.db-shm
# Code zusätzlich auf den vorherigen Tag zurück: deploy-prod.sh <vorheriger-tag>
sudo systemctl start traveller@prod
```

Zusätzlich existiert das tägliche Git-Backup (`traveller-backup.timer`) mit dem
gezielten Snapshot-Rollback aus der Admin-Oberfläche.
