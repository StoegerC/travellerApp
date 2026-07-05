# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [Unreleased]

### Neu
- **Phase 3 der Backend-Migration: Nutzerverwaltung mit Login statt geteiltem API-Key** — bisher teilten sich alle Geräte einen einzigen Bearer-Token ohne Identität, jede Route vertraute der `:id` im Pfad blind (jeder mit dem Schlüssel konnte jeden Charakter/jede Kampagne lesen/schreiben/löschen). Jetzt: E-Mail+Passwort-Login (`backend/routes/auth.js`, Session-Tokens in neuer `sessions`-Tabelle statt JWT, Passwort-Hashing via eingebautes `crypto.scrypt` — keine neue Abhängigkeit). Registrierung ist Admin-getrieben: Admin legt nur eine E-Mail an, der Nutzer setzt sein Passwort selbst beim ersten Login; ein Admin-Reset zwingt beim nächsten Login ein neues Passwort. Rollen sind additive Zusatzrechte auf einer gemeinsamen Basis (`users.roles`-JSON-Array): jeder eingeloggte Nutzer hat volle Rechte auf eigene Charaktere/Kampagnen, `gm` erlaubt zusätzlich lesenden (nicht schreibenden) Zugriff auf **alle** Charaktere aller Nutzer, `admin` erlaubt Nutzerverwaltung + Server-Statistiken (bewusst nicht automatisch mit `gm` kombiniert). `characters.owner_id`/`campaigns.owner_id` werden jetzt tatsächlich durchgesetzt statt nur vorbereitet zu sein. Kampagnen-Inhalte (Notizen, Personen, Orte, Quests) bleiben gemeinschaftlich: jedes Kampagnen-Mitglied darf jeden geteilten Eintrag bearbeiten/löschen, nicht nur seine eigenen (`frontend/js/pages/notes.js`, `App._mergeCampaignNotesBack()` gleicht fremd bearbeitete eigene Einträge nach dem Sync wieder lokal ab). Neue eigenständige Admin-Oberfläche (`frontend/admin.html`) für Nutzer anlegen/löschen, Rollen vergeben, Passwort zurücksetzen, Server-Übersicht (Charaktere, Dateien, Speicherplatz, Uptime). Sauberer Cutover: der alte geteilte `API_KEY` ist komplett abgeschaltet, jedes Gerät braucht einmalig den neuen Login.
- **Klick auf das Traveller-Logo lädt die Seite neu** — schneller manueller Reload, falls z.B. ein hartnäckiger Service-Worker-Cache umgangen werden soll
- **Phase 2 der Backend-Migration: echte Datei-Uploads statt eingebetteter Base64-Bilder** — Schiffsbild, Ausrüstungs-Merkmal-Bild, Charakter-Portraits und Notizen-Personenbild werden nicht mehr als Base64 im Charakter-JSON gespeichert, sondern als echte Dateien auf den Server hochgeladen (`backend/routes/files.js`, `backend/uploads/`) und nur per kurzer ID referenziert (`ship.imageFileId`, `details.imageFileId`, `metadata.portraits[]`-Einträge, `person.imageFileId`). Das hält das Charakter-JSON klein und behebt damit strukturell die hängenden Syncs bei großen Charakteren (siehe Timeout-Fix weiter unten). `GET /files/:id` ist öffentlich (nicht erratbare Zufalls-ID, da `<img src="...">` keinen Authorization-Header mitschicken kann), Hochladen/Löschen bleibt wie gewohnt durch den Bearer-Token geschützt. Additiv: bereits vorhandene, eingebettete Base64-Bilder bleiben unverändert anzeigbar, kein Zwangs-Migrationsschritt. Optionales Wartungsscript `backend/convert-embedded-images.js` (`--dry-run` zur Vorschau) wandelt vorhandene Base64-Bilder nachträglich in echte Dateien um — einmal gegen die echte Produktivdatenbank gefahren: der Charakter, der zuvor 5,4 MB groß war, liegt jetzt bei 32 KB.
- **Zuletzt geöffneter Charakter wird gemerkt** — App-Neustart bzw. Neuladen der Seite öffnet wieder den zuletzt aktiven Charakter statt immer den alphabetisch ersten (`localStorage`-Schlüssel `traveller_last_character_id`, aktualisiert bei jedem Charakterwechsel/-Anlegen). Die zuletzt gewählte Schiffs-Auswahl (`character.activeShipId`) war bereits Teil der Charakterdaten und blieb dadurch schon vorher über Neustarts erhalten
- **Geburtsdatum** im Metadaten-Tab neben dem Alter-Feld (Freitext, z.B. `1100-001` für Imperialkalender)
- **Weiterbildung: Wochen-Dialog** — `+` öffnet einen Dialog mit Anzahl Wochen + Von/Bis-Datum; Einträge erscheinen als Log unter der Fortschrittsleiste; `−` entfernt den letzten Eintrag
- **Schiff: Finanzen-Tab** — eigene Kasse pro Schiff (`ship.finances.cashCredits` + Transaktionsliste), getrennt vom persönlichen Geld des Charakters. Einnahmen/Ausgaben mit Betrag, Beschreibung und Ingame-Datum erfassen, Transaktionen löschbar mit automatischer Kassenstand-Korrektur
- **Schiff-Finanzen: Wiederkehrende Posten** — analog zum Charakter-Finanzen-Tab: Posten mit Intervall (monatlich, alle 2/6 Monate, wöchentlich, jährlich) anlegen, per Schalter aktivieren/deaktivieren, „📅 Abrechnen"-Dialog verbucht alle aktiven Posten gesammelt als Transaktionen und aktualisiert den Kassenstand (`ship.finances.recurringItems`)
- **Schiff-Finanzen: Schulden** — analog zum Charakter-Finanzen-Tab: Schulden mit Gesamtbetrag, Monatsrate und Gläubiger anlegen, Fortschrittsbalken, „Rate zahlen"-Button verbucht Zahlung als Transaktion und reduziert Kassenstand + Restschuld (`ship.finances.debts`)
- **Finanzen-Tabs: Layout & Reihenfolge vereinheitlicht** — Charakter- und Schiff-Finanzen zeigen die Blöcke jetzt in derselben Reihenfolge (Kontostand, Wiederkehrende Posten, Schulden, Transaktionen) und beide einspaltig untereinander statt der bisherigen 2-Spalten-Anordnung beim Charakter-Tab ab 1024px Breite
- **Kampagnen-Sync für Schiffe** — `isCampaign`-Schiffe werden jetzt tatsächlich per `PUT /campaign/:id/ships` hochgeladen (analog zur Notes-Sync): bei Schiff anlegen/löschen, Kampagnen-Toggle, Sub-Tab-Wechsel (Formularfelder), Status-Tracks, Krit. Treffer, Munition und Finanz-Transaktionen. Damit werden auch Schiffskasse und -Transaktionen mitsynchronisiert, sobald das Schiff als Kampagnen-geteilt markiert ist
- **Krit. Treffer: Notiz je System** — „Details"-Button (zentriert in eigener Spalte) pro System öffnet ein Markdown-Modal zum Festhalten defekter Teile (analog zu den Merkmalen bei Ausrüstung), Button zeigt einen Punkt „•", sobald eine Notiz hinterlegt ist (`ship.critNotes[system]`). Der Dialog hat einen eigenen „✎ Bearbeiten"-Button, unabhängig vom globalen Bearbeitungsmodus der Seite
- **Bewaffnung: Merkmale je Waffe** — analog zu den Krit-Treffer-Notizen jetzt auch bei Schiffswaffen ein „Merkmale"-Button (Markdown-Modal, `weapon.details`) für ausführliche Beschreibungen jenseits des kurzen Traits-Felds
- **Schiffsauswahl in Übersicht-Tab integriert** — der Selektor (Dropdown + Neu/Löschen/Kampagnen-Toggle) erscheint nicht mehr auf allen Sub-Tabs, sondern nur noch im Übersicht-Tab (analog zur Charakterauswahl auf dem Charakter-Tab). Der Schiffsname steht jetzt als Subtitel unter der „Schiff"-Überschrift, sichtbar auf allen Sub-Tabs
- **Geteilte Kampagnen-Schiffe auswählbar & automatische Mannschaft** — die Schiffsauswahl zeigt jetzt auch Kampagnen-Schiffe an, die man selbst noch nicht lokal hat („🏕 Name (Kampagne)"); Auswahl übernimmt eine Kopie zur eigenen Bearbeitung. Die Rollenwahl unter „Meine Rollen an Bord" lebt jetzt auf dem Schiff (`ship.crewRoles[charId]`) statt am Charakter und wird mitsynchronisiert. „Mannschaft" zeigt automatisch eine Zeile pro Rolle jedes Charakters der Kampagne, kombiniert mit weiterhin manuell eintragbaren NPC-Positionen. Beim Hochladen wird `crewRoles` gezielt pro Charakter gemergt, um gleichzeitige Rollenwahl mehrerer Spieler nicht gegenseitig zu überschreiben
- **Selbst gehostetes Sync-Backend (Phase 1, noch nicht scharf geschaltet)** — `backend/server.js` von leerem Grundgerüst zu vollständigem Ersatz für den Cloudflare Worker ausgebaut: SQLite (`node:sqlite`, kein natives Compile nötig) statt KV, 1:1 dieselben Endpunkte wie `cloudflare/worker.js` (Frontend braucht dadurch keine Code-Änderung, nur neue Server-URL/Key im Cloud-Config-Modal). Dazu `backend/migrate-from-kv.js` für die einmalige Datenübernahme, `backend/systemd/` und `backend/cloudflared/` als Vorlagen für den späteren Dauerbetrieb (PC → Raspberry Pi) hinter einem Cloudflare Tunnel statt offener Router-Ports. Datei-Uploads (Bilder/PDFs statt Base64-im-JSON) folgen als Phase 2

### Behoben
- **Verwaiste Dateien beim Löschen eines Charakters/einer Kampagne** — `deleteCharacter()`/`deleteCampaign()` löschten bisher nur die `files`-DB-Zeilen, nicht die tatsächlichen Dateien auf der Platte (seit Anlage der `files`-Tabelle in Phase 1 unbenutzt, jetzt mit den echten Datei-Uploads relevant geworden).
- **Cloud-Sync konnte bei großen Charakteren lautlos für immer hängen bleiben** — `CloudSync.pullCharacter()`/`pushCharacter()` und die meisten `CampaignSync`-Aufrufe hatten (anders als `test()`/`listCharacters()`) kein Timeout. Charaktere mit mehreren eingebetteten Base64-Bildern können mehrere MB groß werden; ein PUT/GET dieser Größe über den Tailscale Funnel (öffentliches Internet, insbesondere von Cross-Origin-Zugriffen wie der GitHub-Page-Version) konnte hängen bleiben, ohne dass `fetch()` je resolved oder rejected — der Sync-Status blieb dauerhaft auf „syncing" stehen, ohne Fehlermeldung, und die Änderung kam nie beim Server an. Alle Cloud-/Kampagnen-Aufrufe haben jetzt ein Timeout (30s für Charakter/Kampagnen-Dokument-Transfers, 5s für kleine Aktionen wie Beitreten/Verlassen), damit ein Hänger wenigstens sichtbar fehlschlägt statt für immer stumm zu bleiben.
- **Kampagnen-Sync: last-write-wins konnte Mitspieler-Änderungen verlieren** — `_syncMyCampaignEntries()`/`_syncMyCampaignShips()` machten bisher ein Lesen-dann-Schreiben über zwei getrennte Requests (`GET /campaign/:id`, dann eigene Einträge anhängen und das komplette Ergebnis per `PUT` zurückschreiben) ohne jede Versionsprüfung — pushten zwei Spieler nah beieinander, konnte der zweite den ersten vollständig überschreiben. Merge läuft jetzt serverseitig atomar innerhalb derselben SQLite-Transaktion wie die bestehenden `/join`/`/leave`-Routen (`backend/db.js` `updateCampaignNotes`/`updateCampaignShips`, wiederverwendet `frontend/js/sync-merge.js` per `require()` aus dem Backend), dadurch entfällt das Race-Fenster komplett und der Client braucht vor dem Push kein `GET` mehr.
  - Nebenbei behoben: externe Kampagnen-Einträge/-Schiffe (`NotesPage._extEntries`, `ShipPage._externalShips`) blendeten gelöschte (`_deleted`) fremde Einträge nicht aus — eine Löschung durch einen Mitspieler blieb bei anderen Spielern dauerhaft sichtbar.
  - Pull-to-refresh aktualisiert jetzt zusätzlich zu den persönlichen Charakterdaten auch die Kampagne, falls der Charakter einer beigetreten ist. Kampagnen-Poll-Intervall von 30s auf 15s gesenkt (gleich wie beim persönlichen Sync).
- **Sync-Konflikt: Änderungen wurden von anderem Gerät zurückgesetzt** — Bei zwei gleichzeitig offenen Geräten mit aktivem Cloud-Sync pushte bisher jedes `_doSave()` (u.a. jeder Tab-Wechsel, auch im reinen Lese-Modus) den kompletten Charakter ungefragt und ohne Prüfung, ob sich wirklich etwas geändert hatte — ein Gerät mit veralteter Kopie im Speicher konnte so beim bloßen Tab-Wechsel die frische Änderung des anderen Geräts überschreiben. Jetzt:
  - **Dirty-Check** vor jedem Push (`Storage.saveCharacter`) — es wird nur noch gepusht, wenn sich der Charakter seit dem letzten Speichern inhaltlich tatsächlich geändert hat.
  - **Item-Level-Merge statt Last-Write-Wins** (`frontend/js/sync-merge.js`): Notizen, Ausrüstung, Finanzen, Werdegang, Training und Schiffe (inkl. Waffen/Schiffsfinanzen) bekommen `updatedAt`/`_deleted`/`deletedAt` pro Eintrag; unterschiedliche Änderungen auf beiden Geräten werden beim Sync zusammengeführt statt dass eine Seite komplett verworfen wird. Löschungen werden als Tombstone übertragen (propagieren korrekt, werden nach 90 Tagen aufgeräumt) statt Einträge einfach zu entfernen.
  - **Optimistische Sperre** zwischen Client und Backend (`If-Unmodified-Since-Version`-Header, `409`-Antwort bei Konflikt) löst bei einem echten Wettlauf automatisch einen Merge-Retry aus (bis zu 3 Versuche), statt stillschweigend zu überschreiben.
  - Nebenbei behoben: `Character.toJSON()` gab verschachtelte Objekte/Arrays bisher per Referenz zurück statt als Kopie — dadurch überschrieben spätere Mutationen des Charakters (z.B. eine neue Session) unbemerkt auch den im Sync-Cache gehaltenen „alten" Stand, wodurch der Dirty-Check nie einen Unterschied erkennen konnte. `toJSON()` liefert jetzt einen echten Deep-Clone (behebt nebenbei auch, dass die Undo-Historie bislang live mitmutierte statt echte Schnappschüsse zu sein).
  - Nebenbei behoben: Ausrüstungs- und Schiffswaffen-Tabellen setzten bei jedem Speichern (auch bei reiner Navigation im Bearbeitungsmodus ohne echte Änderung) einen frischen `updatedAt`-Zeitstempel auf jede Zeile — das hätte den neuen Dirty-Check ausgehebelt und ständig unnötige Pushes ausgelöst. Zeitstempel werden jetzt nur noch bei tatsächlicher Inhaltsänderung gebumpt.
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
