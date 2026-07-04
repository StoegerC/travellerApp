# Tailscale Funnel – Setup

Gewählte Tunnel-Lösung (statt Cloudflare Tunnel, siehe `backend/cloudflared/` als
dokumentierte Alternative — kein Lock-in, der Node-Server bindet ohnehin nur an
`127.0.0.1` und weiß nichts vom Tunnel).

## Einmalige Einrichtung (macOS, Homebrew)

```bash
brew install tailscale
sudo brew services start tailscale   # braucht Admin-Passwort, läuft danach dauerhaft
tailscale up                          # interaktiver Browser-Login, einmalig pro Gerät
```

Funnel muss zusätzlich einmalig pro Tailnet freigeschaltet werden — `tailscale funnel`
zeigt beim ersten Versuch einen Freischalt-Link an (`https://login.tailscale.com/f/funnel?node=...`),
falls es noch nicht aktiv ist.

## Backend exponieren

```bash
cd backend
npm start &            # oder: node server.js
tailscale funnel --bg 3000
```

`--bg` sorgt dafür, dass die Freigabe unabhängig vom aufrufenden Terminal bestehen
bleibt (in `tailscaled`s eigenem State, nicht an den `tailscale`-Prozess gebunden).

Ausgabe zeigt die öffentliche URL, z.B.:

```
https://<gerätename>.<tailnet>.ts.net/
|-- proxy http://127.0.0.1:3000
```

Diese URL trägt man im Cloud-Config-Modal der App als „Server-URL" ein (plus den
`API_KEY` aus `backend/.env`).

## Nützliche Befehle

```bash
tailscale funnel status          # aktuelle Freigabe anzeigen
tailscale funnel --https=443 off # Freigabe beenden
tailscale status                 # Geräte im Tailnet, eigene IP
```

## Hinweise für den späteren Pi-Umzug

- `tailscale up` (Login) und `tailscale funnel --bg 3000` müssen auf dem Pi einmalig
  erneut ausgeführt werden — das Gerät bekommt eine eigene Identität im Tailnet.
- Die `.ts.net`-URL ändert sich dabei (neuer Gerätename) — im Cloud-Config-Modal aller
  Geräte einmalig nachziehen. Alternativ vorher den Gerätenamen im Tailscale-Admin-Panel
  passend umbenennen.
- `tailscaled` sollte auf dem Pi über die von Tailscale mitgelieferte systemd-Unit laufen
  (wird bei der Linux-Installation automatisch eingerichtet, siehe offizielle
  Tailscale-Doku für Linux) — analog zu `backend/systemd/traveller-backend.service` für
  den Node-Server selbst.

## Sicherheitshinweis

Die Funnel-URL ist öffentlich erreichbar (wie bei jedem Tunnel-Anbieter) — Zugriffsschutz
kommt ausschließlich vom `API_KEY`/Bearer-Token der App selbst, nicht von Tailscale. Bei
Verdacht auf Kompromittierung: `API_KEY` in `backend/.env` rotieren, Server neu starten,
alle Geräte im Cloud-Config-Modal aktualisieren.
