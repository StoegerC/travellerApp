# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [Unreleased]

### Neu
- **Geburtsdatum** im Metadaten-Tab neben dem Alter-Feld (Freitext, z.B. `1100-001` für Imperialkalender)
- **Weiterbildung: Wochen-Dialog** — `+` öffnet einen Dialog mit Anzahl Wochen + Von/Bis-Datum; Einträge erscheinen als Log unter der Fortschrittsleiste; `−` entfernt den letzten Eintrag

### Behoben
- **Notizen-Bearbeitung: Text durch Sync gelöscht** — Drei Ursachen behoben:
  1. `_syncCloud()` ersetzte `this.currentCharacter` auch wenn `editMode` während des Push/Pull-Awaits auf `true` wechselte. Jetzt wird nach jedem `await` nochmals geprüft.
  2. `renderCurrentPage()` sichert beim Re-Render den aktuellen Formularstand (DOM → character) bevor der neue HTML-String gesetzt wird, sofern ein Notiz-Formular offen ist.
  3. Service Worker cachte alle GET-Anfragen inklusive CloudSync/CampaignSync-API — Cloud-Pull lieferte dadurch veraltete Charakterdaten. Jetzt werden nur noch Same-Origin-Requests (App-Assets) gecacht; API-Aufrufe laufen direkt ans Netz.
- Diverse Orte-/Personen-/Quest-Tabellenfixes aus der vorherigen Session (Spalten-Layout, iOS-Klick-Delegation, Legacy-ID-Koercion, DM-Styling)

---

## [2.0.0] – 2026-07-01

### Neu — Schiff-Feature (MGT2)
- Neuer Tab „Schiff" mit fünf Sub-Tabs: Übersicht, Status, Krit. Treffer, Bewaffnung, Crew & Rollen
- Datenmodell: `character.ships[]`, `character.activeShipId`, `character.shipRoles[shipId]`
- Schiff anlegen, wechseln, löschen — analog zur Charakterverwaltung
- Schiffsbild: Upload als Base64 (nur lokal, nicht in Kampagnen-Sync)
- **Übersicht**: Name, Klasse, TL, Tonnage, Antriebe (M/J/PP), Computer, Sensoren, Betriebskosten, Notizen
- **Status**: Hull und Struktur als Fortschrittsbalken mit +/−, Panzerung, Treibstoff — alles persistiert
- **Krit. Treffer**: 11 MGT2-Systeme × 6 Schadensstufen als interaktives Grid (kein Re-Render bei Toggle)
- **Bewaffnung**: Turrets/Bays/Barbettes mit Munitionszähler
- **Crew & Rollen**: Character wählt Rollen (Pilot, Schütze, Ingenieur, …) für dieses Schiff; Crew-Positionen editierbar
- **Kampf-Tab**: Schiffskampf-Sektion erscheint automatisch wenn `activeShipId` gesetzt und Rollen zugewiesen:
  - Pilot: Entfernungsband (7 Reichweiten)
  - Schütze: Waffenliste mit Munition
  - Ingenieur: Krit-Treffer-Mini-Grid direkt im Kampf-Tab bearbeitbar
  - Sensor-Operator: Sensor Lock Toggle, EW-DM
  - Kapitän: Taktik-DM
- **Kampagnen-Sync**: Worker-Endpunkte `GET/PUT /campaign/:id/ships` bereitgestellt (Bilder werden serverseitig gestripped)
- isCampaign-Flag pro Schiff (Toggle im Schiff-Tab wenn Kampagne aktiv)
- `_migrateShip()` für Rückwärtskompatibilität

---

## [1.9.0] – 2026-07-01

### Geändert
- Ausrüstung- und Finanzen-Tab zu einem gemeinsamen Tab „Ausrüstung" zusammengeführt
- Finanzen erscheinen als eigener Abschnitt unterhalb der Ausrüstungslisten auf derselben Seite
- Ein Tab-Slot wird damit für den kommenden Schiff-Tab frei

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
