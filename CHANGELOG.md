# Changelog

Alle wesentlichen Änderungen an diesem Projekt werden hier dokumentiert.
Format basiert auf [Keep a Changelog](https://keepachangelog.com/de/1.0.0/).

---

## [Unreleased]

---

## [3.5.1] – 2026-07-08

### Geändert (Code-Qualität)
- **Erste Tests für die Merge-/Autorisierungs-Kernlogik** (`backend/test/authz.test.js`, `backend/test/sync-merge.test.js`, 23 neue Tests über `node --test`, weiterhin ohne neue Abhängigkeit). Genau dort lagen die letzten ernsten Bugs (Kampagnen-Autorisierungslücke, verlorene Mitspieler-Änderungen, Tombstone-Handling). Dabei einen latenten Fallstrick in `backend/authz.js` gefunden und behoben: `ownsCharacter()` gab bei einem besitzerlosen Charakter (`owner_id` NULL) und einem `null`-`userId` über `null === null` fälschlich `true` zurück — greift in der Praxis nicht (die `userId` kommt immer aus der Session), aber eine Zugriffskontroll-Funktion soll sich nicht darauf verlassen; jetzt mit expliziter Null-Prüfung.
- **`notes.js` verkleinert** (2.274 → 1.994 Zeilen): der in sich geschlossene Travellermap-/Imperialkalender-Cluster (Datums-Formatierung, UWP-Dekodierung, Ortssuche) liegt jetzt in `frontend/js/pages/notes-travellermap.js` und wird per `Object.assign` auf dasselbe `NotesPage`-Objekt gemischt — reine Verlagerung ohne Verhaltensänderung (über einen Byte-Vergleich des gerenderten HTML aller vier Tabs inkl. Detailansichten gegen den vorherigen Stand abgesichert). Ein Per-Sub-Tab-Split wäre kein sauberer Schnitt, weil `save()`/`attachListeners()` alle vier Tabs in je einem monolithischen Methodenkörper verweben — als offener Punkt in `Todo.txt` festgehalten.

---

## [3.5.0] – 2026-07-08

### Sicherheit
- **Backend-Härtung (Fortsetzung des Code-Reviews 2026-07-08).** Sieben Punkte aus dem Review umgesetzt, alle end-to-end gegen einen laufenden Server geprüft und durch eine erste Backend-Test-Suite abgesichert (`backend/test/`, 16 Tests über Nodes eingebautes `node --test`, kein neues Paket):
  - **Konto-Übernahmefenster geschlossen.** Bisher galt „hat ein Nutzer noch kein Passwort, wird das erste übermittelte einfach übernommen" — wer die E-Mail kannte und vor dem echten Nutzer da war, übernahm das Konto, und nach jedem Admin-Reset ging dieses Fenster erneut auf. Stattdessen vergibt der Admin (bzw. `create-admin.js`) jetzt einen einmaligen **Setup-Token**, mit dem sich der Nutzer genau einmal anmeldet und dabei sofort ein eigenes Passwort setzen muss (`must_change_password`, neue Middleware `requirePasswordSet` lässt eine solche Session nur an `/auth/me`, `/auth/password`, `/auth/logout`). Der Token steht nur einmalig in der Server-Antwort/im Log, gespeichert ist nur sein Hash.
  - **Passwort selbst ändern** (`POST /auth/password`) — gab es vorher gar nicht, nur den Admin-Reset. Deckt zugleich den Erst-Login-Fall ab.
  - **Login-Rate-Limit** (5 Fehlversuche pro E-Mail+IP, dann 15 Min. Sperre) + **`scrypt` asynchron** statt `scryptSync`, das bei jedem Login-Versuch den Event-Loop blockierte — zusammen war `/auth/login` der billigste DoS-Hebel und ein offenes Brute-Force-Ziel.
  - **Session-Ablauf**: `last_seen_at` wurde gepflegt, aber nie geprüft — eine Session galt ewig. Jetzt Idle-Ablauf nach `SESSION_IDLE_DAYS` (Default 90), Aufräumen beim Serverstart.
  - **Kampagnen-Beitritt braucht einen Beitritts-Code.** Vorher konnte jeder eingeloggte Nutzer jeder Kampagne beitreten und danach ihre Notizen/Schiffe/Dateien schreiben — die Mitgliedschaftsprüfungen aus 3.4.1 liefen damit ins Leere. Der Code wird serverseitig erzeugt, ist nur für Mitglieder sichtbar (Kampagnen-Panel) und zeitkonstant verglichen.
  - **Admin-Lockout verhindert**: der letzte Administrator kann sich die Admin-Rolle nicht entziehen und sich nicht löschen; das eigene Konto ist generell nicht löschbar.
  - **Speicher-Quota pro Nutzer** (Default 2 GiB, über `USER_QUOTA_BYTES` einstellbar, 0 = unbegrenzt) auf `PUT /char/:id` und `POST /files` — vorher konnte ein Nutzer unbegrenzt 100-MB-PDFs hochladen und die Platte des selbst gehosteten Servers füllen.
  - Nebenbei: `/admin/backup-snapshots` validiert `type`/`id`/`commit` jetzt streng (verhindert Pfad-Traversal ins Backup-Repo und als `git`-Optionen interpretierte Werte); Bestandsdaten (passwortlose Nutzer, Kampagnen ohne Code) werden beim ersten Start dieser Version automatisch migriert und die dabei erzeugten Tokens/Codes einmalig ins Server-Log geschrieben.

---

## [3.4.2] – 2026-07-08

### Sicherheit
- **Gespeichertes XSS über HTML-Attribute behoben** — der Fix aus 3.4.1 escapte Namen/Beschreibungen im Textinhalt, aber IDs, Enum-Felder (`status`, `relation`) und Datei-IDs wurden weiterhin ungeescaped in HTML-**Attribute** interpoliert (`data-id="${p.id}"`, `<img src="${...imageFileId}">`, `class="rel-${p.relation}"` u.a., allein ~40 Stellen in `notes.js`, dazu `ship.js`, `career.js`, `equipment.js`, `metadata.js`, `attributes.js`). Ein Eintrag mit `imageFileId: 'x" onerror="…'` brach aus dem `src`-Attribut aus und führte Code aus — nachgestellt und bestätigt: gegen den alten Stand feuern vier von vier Payloads, gegen den neuen keiner. Relevant, weil diese Felder nicht nur aus eigener Eingabe stammen, sondern über den Kampagnen-Pool von Mitspielern und über den JSON-Import ins Gerät kommen; der Session-Token liegt in `localStorage` und wäre damit auslesbar gewesen. Zusätzlich: `FileSync.getUrl()`/`.remove()` validieren die Datei-ID jetzt zentral gegen das Server-Format (Hex, 16–64 Zeichen) statt sie blind in eine URL zu setzen — eine manipulierte „ID" wie `../char/<id>` hätte sonst per Pfad-Traversal einen anderen Endpunkt getroffen. `KartePage._esc()` fehlte als einziger `_esc()`-Variante das `"`-Escaping und wurde angeglichen.

---

## [3.4.1] – 2026-07-07

### Sicherheit
- **Kampagnen-Autorisierungslücke behoben** — `PUT /campaign/:id/notes` und `PUT /campaign/:id/ships` prüften bisher nur, ob der jeweilige Charakter dem Aufrufer gehört, nicht aber, ob dieser überhaupt Mitglied der Ziel-Kampagne ist. Dadurch konnte jeder authentifizierte Nutzer beliebige Inhalte (NPCs, Orte, Schiffe) in **jede** Kampagne auf dem Server schreiben, solange er deren ID kannte — mit zwei echten Test-Accounts nachgestellt und bestätigt. Neue gemeinsame Helfer `ownsCharacter`/`isCampaignMember` (`backend/authz.js`, vorher lokal in `routes/campaigns.js` dupliziert) schließen die Lücke.
- **`POST /files` und `DELETE /files/:id` vertrauten der clientseitig angegebenen `ownerId` blind** — ein Nutzer konnte eine Datei behaupten lassen, sie gehöre zu einem fremden Charakter/einer fremden Kampagne (POST), bzw. jede Datei per bekannter ID löschen, ohne Zugriffsrecht auf deren Owner zu haben (DELETE). Beide Endpunkte prüfen jetzt über dieselben `authz.js`-Helfer, dass der Aufrufer den behaupteten/gespeicherten Owner tatsächlich besitzt bzw. Mitglied davon ist.
- **Gespeichertes XSS über benutzerdefinierte Skill-Namen behoben** (`frontend/js/pages/attributes.js`) — `skill.name` wurde in Bearbeitungs- und Leseansicht ungeescaped gerendert; ein per `prompt()` eingegebener Skill-Name mit HTML/JS wurde bei jedem Öffnen des Attribute-Tabs ausgeführt (auch nach Sync auf andere Geräte/Kampagnen-Mitglieder). Zusätzlich `App._esc()` (fehlte `"`-Escaping, anders als alle Seiten-`_esc()`) und eine unescapte Rollen-Anzeige in `admin.js` gehärtet.

---

## [3.4.0] – 2026-07-07

### Neu
- **Mehrfach-Verknüpfungen bei Personen/Quests + Event-Tag-Filter im Journal.** Personen können jetzt mehrere Aufenthaltsorte haben (`locationIds[]` statt einem einzelnen `locationId`), Quests können mehrere Auftraggeber (`questGiverIds[]`, ersetzt den bisherigen Einzel-Auftraggeber-Suchpicker) und neu auch mehrere Orte (`locationIds[]`) zugewiesen bekommen. Alle drei nutzen denselben, dafür generalisierten Tag-Picker (Chip-Liste + Such-Dropdown + Inline-„Neu anlegen"), der bisher nur für die Personen-/Orte-/Quests-Verknüpfungen einer Journal-Session verfügbar war. Zusätzlich: ein Filter-Dropdown für Event-Tags im Journal (bisher wurden die frei vergebenen Event-Tags einer Session nur in der Session selbst angezeigt, aber nirgends aggregiert durchsuchbar) — analog zu den bestehenden Personen-/Orte-Filtern der Session-Liste. Altbestand mit den vorherigen Einzel-Feldern (`locationId`, `questgiverId`) wird beim Laden automatisch in die neuen Mehrfach-Felder übernommen, ohne die alten Felder zu entfernen.

---

## [3.3.0] – 2026-07-07

### Neu
- **Server-Daten-Backup: Git-Versionierung + Medien-Wiederherstellung.** Bisher gab es keine echte Versionierung der Server-Inhalte — jetzt ein täglicher Snapshot aller Charaktere/Kampagnen als JSON in ein separates, privates GitHub-Repo (`backend/backup-to-git.js`, neuer LaunchAgent `com.traveller.backup.plist.example`), committed und gepusht per SSH-Deploy-Key. Medien-Dateien (Bilder, PDFs) werden beim Ersetzen/Entfernen nicht mehr sofort von Platte/DB gelöscht (`FileSync.remove()`-Aufrufe aus `metadata.js`, `equipment.js`, `ship.js`, `notes.js` entfernt) — stattdessen listet die Admin-Oberfläche verwaiste (nicht mehr referenzierte, mindestens 30 Tage alte) Dateien und erlaubt manuelles Löschen oder automatisches Wiederherstellen an die ursprüngliche Stelle im Charakter-JSON (`backend/orphan-scan.js`, neue Endpunkte in `backend/routes/admin.js`). Zusätzlich: gezielter Rollback eines einzelnen Charakters oder einer einzelnen Kampagne auf einen älteren Git-Snapshot direkt aus der Admin-Oberfläche.

---

## [3.2.2] – 2026-07-06

### Behoben
- **Schiffs-Bild/PDF-Upload bei Kampagnen-geteilten Schiffen konnte spurlos verloren gehen** — `shipImgUpload`/`shipAttachmentUpload` hielten das Schiff-Objekt in einer Variable fest, die vor dem (bei großen Dateien potenziell mehrere Sekunden dauernden) Upload ausgelesen wurde. Lief währenddessen ein Kampagnen-Poll (`App._mergeCampaignShipsBack`, alle 15s, seit 3.1.2), wurde das Objekt in `char.ships[]` durch eine frisch gemergte Kopie ersetzt — die alte Variable zeigte danach ins Leere, die neu hochgeladene Datei landete in einem nirgends mehr referenzierten Schiff-Objekt und verschwand beim nächsten Speichern. Betraf in der Praxis vor allem größere PDFs (siehe 3.2.1, 100-MB-Limit), die durch die Übertragungsdauer über Tailscale Funnel eher in dieses Zeitfenster fielen. Fix: Schiff-Objekt wird nach dem Upload frisch nachgeschlagen statt der vor dem Upload gefangenen Referenz.

---

## [3.2.1] – 2026-07-06

### Geändert
- **PDF-Größenlimit von 10 MB auf 100 MB angehoben** — betrifft Journal-Anhänge und Schiffs-Dokumente, serverseitig (`backend/routes/files.js`) und in den client-seitigen Vorab-Prüfungen. Der Upload-Timeout in `FileSync.upload()` wurde von 30s auf 5 Minuten erhöht, da 100-MB-Dateien auf langsameren Verbindungen (Tailscale Funnel, mobiles Netz) deutlich länger brauchen.

---

## [3.2.0] – 2026-07-06

### Neu
- **Schiffs-Übersicht: mehrere Bilder + mehrere PDF-Dokumente** — analog zum Charakter-Portrait können jetzt beliebig viele Bilder pro Schiff hochgeladen und per Pfeil-Navigation durchgeblättert werden (`ship.images[]` + `ship.imageIndex`, ersetzt das bisherige einzelne `ship.image`/`ship.imageFileId` — Altbestand wird beim Laden automatisch in die neue Liste übernommen). Bilder werden vor dem Hochladen client-seitig verkleinert/komprimiert wie beim Portrait. Zusätzlich: beliebig viele PDF-Dokumente pro Schiff (`ship.attachments[]`, gleiches Muster wie die bestehenden Journal-Anhänge), in der Leseansicht als anklickbare Links.

---

## [3.1.2] – 2026-07-06

### Behoben
- **Kampagne: bereits übernommene ("adoptierte") Schiffe/Einträge bekamen ein Zurücknehmen von „In Kampagne teilen" nie mit** — Ergänzung zu 3.1.1: dort wurde nur verhindert, dass ein unshare-tes Item für neu hinzukommende Mitspieler weiter sichtbar bleibt. Wer ein geteiltes Schiff aber bereits einmal aus der Kampagnen-Dropdown-Liste ausgewählt hatte, besaß ab dann eine eigene, komplett unabhängige lokale Kopie (`char.ships[]`) — die bekam von einem späteren Unshare/Löschen durch den ursprünglichen Besitzer nichts mit, weil es dafür (anders als bei Notiz-Einträgen) noch keinen Rückabgleich gab. Neue Funktion `App._mergeCampaignShipsBack()` (Pendant zu `_mergeCampaignNotesBack`) holt das nach. Dabei einen zweiten, durch den 3.1.1-Fix eingeschleppten Bug behoben: der Rückabgleich lief bisher nur im Speicher und wurde nie in `Storage` persistiert — ein Reload vor der nächsten Autosave-Aktion hätte sowohl diesen als auch den bestehenden Notizen-Rückabgleich (`_mergeCampaignNotesBack`) wieder verworfen. Zusätzlich bekamen beide Rückabgleich-Funktionen eine `isCampaign`-Bedingung: ohne die hätte der eigene, gerade erst auf privat gestellte Eintrag durch den kurz zuvor gepushten Unshare-Tombstone (minimal neuerer Zeitstempel) versehentlich überschrieben werden können.

---

## [3.1.1] – 2026-07-06

### Behoben
- **Kampagne: Zurücknehmen von „In Kampagne teilen" hatte serverseitig nie einen Effekt** — ein einmal geteilter Personen-/Orte-/Quest-/Journal-Eintrag oder ein einmal geteiltes Schiff blieb für andere Mitspieler dauerhaft sichtbar, selbst nachdem der Haken lokal wieder entfernt wurde (`isCampaign` zurück auf privat), weil der Push-Schritt (`App._syncMyCampaignEntries`/`_syncMyCampaignShips`) nicht mehr geteilte Einträge einfach aus dem Batch wegließ statt sie aktiv zu entfernen — der serverseitige Merge kennt aber nur „hinzufügen/aktualisieren", kein „fehlt jetzt, also löschen". Betraf z.B. neu angelegte Schiffe: die werden in einer Kampagne automatisch als geteilt angelegt, ein nachträgliches Umschalten auf „🔒 Privat" nahm die Freigabe serverseitig nie zurück. Fix: unshare-Fälle senden jetzt einen minimalen Tombstone mit, der die veraltete Pool-Kopie ersetzt, ohne den eigenen lokalen Eintrag anzutasten.

---

## [3.1.0] – 2026-07-06

### Neu
- **„@"-Erwähnungen auf viele weitere Felder ausgeweitet, Journal-Einträge als vierter Typ** — die bisher nur im Journal-Bericht verfügbare Erwähnungsfunktion gibt es jetzt auch bei Personen-/Orte-/Quest-Beschreibungen, Finanzen (Schulden-Notizen + Transaktionsbeschreibung, Charakter und Schiff), Werdegang (Ereignis-Beschreibung + Hintergrundfelder Aussehen/Persönlichkeit/Ziele/Motivation/Geheimnisse) und Schiffs-Krit.-Treffer-Notizen. Zusätzlich erwähnbar: Journal-Einträge selbst (`session`-Typ, rendert als derselbe Link wie die bestehenden Rückverlinkungen zu Sessions). Die Logik ist in ein neues, seitenunabhängiges Modul `frontend/js/mention-autocomplete.js` ausgelagert (vorher fest an das Journal-Textfeld gebunden), das eigene + in einer Kampagne geteilte Personen/Orte/Quests/Sessions durchsucht.
  - Nebenbei sichtbar gemacht: `debt.notes` (Schulden-Notizfeld, Charakter und Schiff) wurde bisher erfasst, aber nirgends angezeigt — erscheint jetzt in der Schulden-Karte, sonst wäre eine Erwähnung darin nie klickbar gewesen.
  - Die Werdegang-Hintergrundfelder haben keine eigene Lese-/Bearbeitungsunterscheidung (immer editierbar, unabhängig vom Bearbeitungsmodus) — bekommen deshalb eine immer sichtbare, kompakte Vorschau unter dem jeweiligen Textfeld, die bei „Geheimnisse" nur erscheint, wenn das Feld gerade nicht verdeckt ist.
- **Personenvorschlag bei Schiffs-Mannschaft** — beim Eintragen eines NPC-Mannschaftsmitglieds (`.sp-pos-person`) schlägt eine Tippen-→-Vorschlagsliste-→-Klick-Suche (wie bei der Orts-Suche) eigene und in der Kampagne geteilte Personen vor, analog zur „@"-Suche. Dabei einen Bug behoben: der „+ Weiteres Mitglied"-Button fügte eine neue Zeile per direkter DOM-Einfügung ein, ohne die Erwähnungs-/Vorschlags-Anhänge der bereits vorhandenen Zeilen zu duplizieren oder die neue Zeile selbst anzuschließen.

---

## [3.0.2] – 2026-07-06

### Neu
- **Versionsverlauf zeigt die Seite beim Verlassen des Bearbeitungsmodus** — Einträge, die durch „✓ Fertig" entstehen, tragen jetzt zusätzlich ein Tab-Label (z.B. „Kampf"), damit auf einen Blick erkennbar ist, wo bearbeitet wurde. Reine Tab-Wechsel-Einträge bleiben bewusst ohne dieses Label, um den Verlauf nicht zu überladen. Nebenbei behoben: die 30-Sekunden-Drossel (max. eine Version pro Zeitfenster) konnte eine getaggte „Fertig"-Version stillschweigend verschlucken, wenn kurz zuvor ein reiner Tab-Wechsel gespeichert hatte — die Drossel gilt jetzt nur noch für ungetaggte Versionen.

---

## [3.0.1] – 2026-07-06

### Neu
- **"@"-Erwähnungen im Journal-Bericht** — im Bericht-Textfeld einer Session öffnet die Eingabe von „@" gefolgt von Zeichen eine Trefferliste über Personen, Orte und Quests (Substring-Suche auf Name/Titel). Das Dropdown erscheint direkt unter der Eingabestelle statt pauschal unter dem ganzen Textfeld (Caret-Position wird über einen unsichtbaren Spiegel-`<div>` gemessen, da `<textarea>` selbst keine Cursor-Koordinaten liefert). Auswahl fügt an der Cursor-Position `@[Name](typ:id)` ein; der Markdown-Renderer (`frontend/js/markdown.js`) stellt das in der Leseansicht als anklickbaren, farblich nach Typ codierten Link ohne das „@"-Präfix dar, mit knappem statt dem für freistehende Chip-Listen gedachten großzügigen Padding, damit sich die Erwähnung in den Fließtext einfügt statt wie eine eigenständige Pille zu wirken (dieselbe Farbcodierung wie die bestehenden Verlinkungen unter „Personen/Orte/Quests" am Sessionende, die ihre größere Chip-Optik dort behalten) — ein Klick springt direkt zum jeweiligen Eintrag. Erwähnte Personen/Orte/Quests werden beim Speichern automatisch zusätzlich ins bestehende Tag-System der Session übernommen (erscheinen dadurch auch in der „Personen:/Orte:/Quests:"-Übersicht am Sessionende und in der Rückverlinkung bei der Person/dem Ort/der Quest selbst) — rein additiv, Entfernen einer Erwähnung aus dem Text entfernt einen zusätzlich manuell gesetzten Tag nicht wieder. Der Name wird beim Einfügen eingebettet statt live nachgeschlagen, damit der Renderer weiterhin ohne Abhängigkeit von den Notizdaten auskommt (wird z.B. auch für Schiffs-/Ausrüstungsnotizen ohne solche Daten genutzt) — spätere Umbenennungen der referenzierten Person/des Orts/der Quest spiegeln sich daher nicht rückwirkend in bereits geschriebenen Journal-Einträgen wider.
- **PDF-Anhänge bei Journal-Einträgen** — Sessions im Log-Tab können jetzt beliebig viele PDFs (Handouts, Karten, Briefe) anhängen, analog zu den bestehenden Bild-Uploads: echte Datei statt Base64-Einbettung (`session.attachments[]`, `field: 'sessionAttachment'`), sofortiger Upload beim Auswählen, Übernahme ins Charakter-JSON erst beim Speichern (wie beim Personenbild). In der Leseansicht erscheinen Anhänge als anklickbare Links, die die PDF in einem neuen Tab öffnen. Serverseitig akzeptiert `POST /files` jetzt zusätzlich zu Bildern `application/pdf`, geprüft anhand der tatsächlichen Magic Bytes (`%PDF-`) statt nur des vom Client behaupteten mimetype — eine als PDF getarnte, aber inhaltlich andere Datei wird abgelehnt. `GET /files/:id` sendet zusätzlich `X-Content-Type-Options: nosniff`, damit der Browser den deklarierten Content-Type nicht eigenmächtig umdeutet. Entfernte Anhänge werden beim Speichern serverseitig mitgelöscht (Abgleich alter/neuer Anhangsliste, analog zum Bild-Austausch bei Personen).

### Entfernt
- **Orte-Leiste am unteren Rand des Karten-Tabs** — zeigte bisher alle mit der Karte verknüpften Orte als Chip-Liste unterhalb der Travellermap-Ansicht. Redundant zur Verlinkung im Orte-Tab („📝 Log" → „🌍 Orte" → „Auf Karte zeigen") und wäre mit wachsender Orte-Zahl unübersichtlich geworden. Karte und Weltinfo-Panel füllen jetzt den freigewordenen Platz.

### Behoben
- **Abmelden ließ fremde Charaktere auf geteilten Geräten weiterhin lokal sichtbar/ladbar** — `Storage` (IndexedDB) ist ein einziger, gerätweiter Cache ohne jeden Nutzerbezug, unabhängig vom aktuell per Login angemeldeten Cloud-Account. Meldete sich auf demselben Gerät nach Nutzer A Nutzer B an, blieben As Cloud-Charaktere im Charakter-Selector sichtbar und über `Storage.loadCharacter()` vollständig lesbar/bearbeitbar — komplett am Server vorbei, also unabhängig von der eigentlich korrekten serverseitigen Zugriffskontrolle aus Phase 3. `AuthAPI.logout()` entfernt jetzt beim Abmelden alle lokal gecachten Cloud-Charaktere (`Storage.purgeCloudCharacters()`, inkl. Versionsverlauf) und die Kampagnen-Lokalkopie; rein lokale, nie synchronisierte Charaktere bleiben unangetastet, da sie an keinen Account gebunden sind. War der gerade aktive Charakter betroffen, wechselt die App automatisch zu einem verbleibenden lokalen Charakter oder zeigt den Willkommen-Dialog. Damit erneutes Einloggen nicht wieder lange dauert (Bilder sind oft der Großteil der Datenmenge): `GET /files/:id` sendet jetzt `Cache-Control: public, max-age=31536000, immutable` (Datei-IDs sind zufällig und werden nie wiederverwendet/überschrieben) — nur das kleine Charakter-JSON muss neu vom Server geholt werden, referenzierte Bilder liegen bereits unverändert im Browser-Cache.
- **Kampagnen-Besitzer in Admin-Übersicht falsch als „ohne zugeordneten Nutzer" geführt** — `db.updateCampaign()` (genutzt von Join/Leave/Kick, Notes-/Schiffs-Merge und dem `create-admin.js --claim-existing`-Migrationsscript) schrieb den neuen `ownerId` bisher nur in den JSON-Blob (`campaign.ownerId`, die tatsächlich für Zugriffskontrolle in `routes/campaigns.js` maßgebliche Quelle), nie aber in die separate SQL-Spalte `campaigns.owner_id` — die blieb dadurch nach der Phase-3-Migration auf ihrem alten Wert (einer Charakter-ID statt einer Nutzer-ID) stehen. Zugriffsrechte waren davon nicht betroffen, aber die neue Admin-Speicherübersicht (`getAdminOverview()`) liest genau diese SQL-Spalte für die schnelle Aggregation und zeigte die Kampagne deshalb fälschlich als besitzerlos. `UPDATE` schreibt die Spalte jetzt mit, bestehende Kampagnen wurden per Korrekturlauf einmalig nachgezogen.
- **Cloud-Einstellungen: „Weiter" ließ sich ohne Verbindungstest nicht anklicken** — sowohl im „Neuer Charakter"-Dialog als auch in den Cloud-Einstellungen war der „Weiter"-Button standardmäßig deaktiviert und wurde nur nach einem erfolgreichen „Verbindung testen" wieder freigegeben. Der Test bleibt als optionale Diagnose verfügbar, blockiert den Login-Schritt aber nicht mehr.

### Neu
- **Cloud-Einstellungen zeigen den angemeldeten Zustand** — beim Öffnen des Cloud-Menüs mit bereits aktiver Anmeldung erscheint statt der Login-Maske eine Übersicht: automatischer Verbindungstest (neuer Endpunkt `GET /auth/me`, dient gleichzeitig als Session-Check — ein 401 zeigt eine abgelaufene/vom Admin zurückgesetzte Sitzung und fällt automatisch auf die Login-Maske zurück), der angemeldete Nutzer mit Rollen-Badges, sowie ein „Abmelden"-Button (`AuthAPI.logout()`), der die Cloud-Verbindung trennt.
- **Admin-Seite: Besitz &amp; Speicher pro Nutzer** — neue Tabelle zeigt pro Nutzer, wie viele Charaktere/Kampagnen er angelegt hat (mit Name + Größe, aufklappbar über „Details") und wie viel Speicher das insgesamt belegt, aufgeschlüsselt in Charakter-Daten (JSON) und Medien (hochgeladene Bilder). Neuer Endpunkt `GET /admin/overview` (`db.getAdminOverview()`) löst dafür Datei-Uploads (die an einem Charakter/einer Kampagne hängen, nicht direkt am Nutzer) über deren `owner_id` auf den jeweiligen Nutzer auf. Inhalte ohne (mehr) existierenden Owner — z.B. nach Löschen eines Nutzers, dessen Charaktere/Kampagnen bewusst erhalten bleiben — erscheinen gesammelt unter „Ohne zugeordneten Nutzer" statt unsichtbar zu werden.

---

## [3.0.0] – 2026-07-06

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
- **Kampagnen-geteilter Journal-Eintrag (Session/Person/Ort/Quest) wurde nicht synchronisiert** — `App._doSave()` synchronisierte Kampagnen-Schiffe (`ship.isCampaign`) bei jedem Speichern der Schiffs-Seite, hatte aber kein Äquivalent für die Notizen-Seite. `App._syncMyCampaignEntries()` wurde bisher ausschließlich aus expliziten Handlern in `frontend/js/pages/notes.js` aufgerufen (⁠„← Zurück", Speichern-Button, Löschen, Session aktiv setzen) — Autosave (1,5s-Debounce) und ein Tab-Wechsel über die obere Navigation (statt über den „← Zurück"-Button im Eintrag) liefen dagegen nur über `App._doSave()` und pushten den geteilten Eintrag dadurch nie zur Kampagne, obwohl er lokal korrekt gespeichert war. `_doSave()` synchronisiert Notizen-Seite jetzt nach demselben Muster wie die Schiffs-Seite.
- **E-Mail-/Passwort-Felder im Dark Mode kaum lesbar** — die neuen Login-Felder (Cloud-Konfiguration, „Neuer Charakter"-Dialog) waren weder in der Basis-Formularstyling-Regel noch im Dark-Mode-Override für `input[type="email"]`/`input[type="password"]` erfasst und fielen dadurch auf unstyled Browser-Vorgaben gegen den dunklen Modal-Hintergrund zurück.
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
