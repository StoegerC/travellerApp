# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [Unreleased]

---

## [1.8.0] – 2026-07-01

### Geändert
- Kampagnen-Notizen: Sync auf geteilten Pool umgestellt (shared pool, last-write-wins)
- Alle Kampagnenmitglieder können geteilte Einträge jetzt sehen **und bearbeiten**
- Merge-Logik: Einträge werden per ID identifiziert statt per ownerId — einfacher
  und konsistent mit dem geplanten Schiffs-Sync
- `_extEntries()`: zeigt Kampagnen-Einträge die lokal noch nicht vorhanden sind
  (statt nur Einträge anderer anhand ownerId zu filtern)

---

## [1.7.0] – 2026-07-01

### Neu
- Update-Banner: Bei verfügbarer neuer Version erscheint ein Banner mit „Neu laden"-Button (keine automatischen Reloads am Spieltisch)

---

## [1.6.1] – 2026-07-01

### Fixes
- Karte auf iPhone unsichtbar: Container-Höhe für Karte-Seite auf `100dvh` gesetzt, damit die Flex-Höhenkette bis zum iframe-Slot durchgreift

---

## [1.6.0] – 2026-07-01

### Infrastruktur
- Lizenz von MIT auf Mongoose Publishing Traveller Fair Use Policy (2025) umgestellt
- GitHub Issue-Template für Feature Requests angelegt

---

## [1.5.0] – 2026-06-27

### Kampagnensystem
- Kampagne erstellen mit selbstgewählter kurzer ID (z.B. `spinward26`) und Name
- Kampagne beitreten: auswählbare Liste aller verfügbaren Kampagnen + manuelle ID-Eingabe
- Owner-Konzept: nur Ersteller kann Mitglieder entfernen oder Kampagne löschen
- Mitgliederverwaltung: Kick-Button pro Mitglied (nur für Owner sichtbar)
- Kampagne verlassen

### Kampagnen-Notizen (isCampaign-Flag)
- Alle Eintragstypen (Sessions, Personen, Orte, Quests) haben ein isCampaign-Flag
- Geteilte Einträge werden im Log-Tab für alle Kampagnenmitglieder angezeigt
- Camp-Share-Badge (🏕) kennzeichnet geteilte Einträge in der Übersicht
- Checkbox in allen Edit-Formularen; default `true` bei neuen Einträgen in Kampagnen-Chars
- Auto-Sync beim Speichern: eigene geteilten Einträge werden in Kampagnendaten gemergt
- Background-Poll für Kampagnendaten (analog zu Cloud-Sync-Poll)

### Fixes
- Begrüßungsdialog beim ersten Start statt automatischer Charaktererstellung
- Dark Mode: URL- und Passwort-Eingabefelder
- Verbesserte Fehlermeldung bei Cloud-Charakterliste (HTTP-Statuscode)
- URL-Validierung im Verbindungstest (verhindert false positives)
- ☁-Button für Cloud-Einstellungen immer im Header sichtbar

---

## [1.4.0] – 2026-06-26

### Neu
- Cloud-Sync-Toggle für bestehende Charaktere (local ↔ cloud umschalten)
- Laden-Dialog: Charakter aus JSON oder aus Cloud laden (ersetzt separaten Import-Button)
- Cloud-Einstellungen: Worker-URL und API-Key über ⚙-Button nachträglich ändern

### Fixes
- HTTP 405 bei Cloud-Sync behoben (Content-Type-Header aus GET/DELETE entfernt)
- Fehlermeldung beim Push zeigt HTTP-Statuscode

---

## [1.3.1] – 2026-06-26

### Neu
- App-Version im Header angezeigt
- Cache-Busting-Query-Strings auf alle Asset-Imports (verhindert veraltete Caches nach Deploy)

---

## [1.3.0] – 2026-06-26

### Cloud-Sync (Cloudflare)
- Cloudflare Worker: GET / PUT / DELETE für `char:{id}`, Auth via Bearer-Key
- CloudSync-Modul: push/pull, API-Key + Worker-URL in localStorage
- Neuer-Charakter-Dialog: Auswahl local oder cloud bei Erstellung
- Push / Pull im Metadaten-Tab, Sync-Badge mit letztem Sync-Zeitpunkt und Fehlerstatus
- Background-Poll alle 30 s wenn Cloud-Charakter aktiv
- Pull-to-Refresh auf Mobile
- Cloud-Charakterliste: Charaktere aus Cloud auf neues Gerät laden

---

## [1.0.0] – 2026-06-25

### Datenhaltung & Persistenz
- Autosave mit 1,5 s Debounce nach jeder Eingabe
- IndexedDB statt localStorage (kein Speicherlimit)
- JSON-Export / Import (Backup & Geräte-Transfer)

### Charakterverwaltung
- Undo / Versionsverlauf: In-Memory-Undo (↩ + Cmd/Strg+Z) + persistente Versionen in IndexedDB
- Mehrere Porträts mit Pfeil-Navigation (‹ ›), Upload, Löschen

### Kampf
- Physische Attribute und Aktive Rüstung als getrennte Kacheln
- 2×2-Grid: Initiative | Bewaffnung / Attribute | Rüstung / Strahlungsdosis
- Dark Mode für Statusanzeige, Initiative-Buttons, Munition, Erste Hilfe

### Notizen / Log
- Kreuzverweise Session ↔ Person / Ort / Quest (bidirektionale Link-Chips)
- Personen: Rasse-Feld, Status-Default „Lebend", Filter, Bearbeitungsflow
- Orte: Travellermap-Integration, UWP-Dekodierung, Imperialkalender (YYYY-DDD)
- Sessions: Markdown-Editor, Volltext-Suche, Filter, Aktiv-Markierung
- Zeitstempel (createdAt) überall; Sortierung nach Datum / Name / Besuchsdatum
- Fix: `_editTags` wurde nach Autosave genullt

### Karte
- Eigener Karte-Tab mit Travellermap-Iframe (persistent, Safari-kompatibel)
- Vollbild-Karte mit sichtbarer Seitenleisten-Navigation
- Orte direkt aus Log auf Karte verknüpfbar

### UI / UX
- Favicon (Traveller-Stern, Canvas-generiert, Safari-kompatibel)
- Responsives Layout: kompakter Header mobil, Sidebar-Navigation ≥ 1280 px
- Dark Mode (🌙/☀️ Toggle + automatische Erkennung via `prefers-color-scheme`)
- PWA: installierbar auf iOS / iPad / Mac, vollständig offline-fähig
- GitHub Pages: automatisches Deployment bei Push auf main
