# Autostart auf macOS (launchd)

Übergangslösung, solange der Server auf dem Mac läuft (nicht nötig, sobald der Pi mit der
`systemd`-Unit unter `backend/systemd/` übernimmt).

## Einrichtung

`com.traveller.backend.plist.example` nach `~/Library/LaunchAgents/com.traveller.backend.plist`
kopieren, Platzhalter-Pfade durch den echten absoluten Pfad zum Repo ersetzen (Pfade in
`ProgramArguments`, `WorkingDirectory`, `StandardOutPath`, `StandardErrorPath`), dann:

```bash
launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.traveller.backend.plist
```

Läuft ab sofort automatisch (bei Login und nach Absturz — `KeepAlive` startet den Prozess
neu, egal warum er beendet wurde).

## Nützliche Befehle

```bash
launchctl list | grep traveller          # Status/PID prüfen
launchctl bootout gui/$(id -u)/com.traveller.backend   # stoppen + Autostart deaktivieren
tail -f backend/data/backend.log         # laufende Logs
tail -f backend/data/backend.error.log   # Fehler-Logs
```

## Hinweis

Das eigentliche Plist liegt bewusst außerhalb des Repos (`~/Library/LaunchAgents/`) — das ist
der von macOS vorgeschriebene Ort für User-LaunchAgents, kein Repo-Pfad. Diese `.example`-Datei
ist nur die Vorlage/Dokumentation.
