# Claude Code – Projektregeln

## Was ist dieses Projekt?

Digitales Charakterdatenblatt für das Pen-&-Paper-Rollenspiel **Traveller Classic**.
Wird am Spieltisch eingesetzt — der Spieler hat das Gerät vor sich liegen während die Runde läuft.

**Kernfunktionen:** Attribute & Skills, Ausrüstung, Werdegang, Kampfwerte, Finanzen,
Notizen (Session-Journal, Personen, Orte, Quests).

## Zielhardware (Priorität)

1. **Tablet (iPad)** — Primärgerät, Querformat, Touch-Bedienung. Alles muss hier einwandfrei funktionieren.
2. **Smartphone** — sekundär, Hochformat, kleinere Touch-Targets. Grundfunktionen müssen nutzbar sein.
3. **Laptop/Desktop** — tertiär, Maus + Tastatur. Kein verschwendeter Leerraum.

Touch-Targets mindestens 44px. Kein Hover-only UX. Scrollbare Listen statt Pagination.

## Technischer Stack

- **Vanilla JS** — kein Framework, kein Build-Tool, kein npm
- `frontend/index.html` + `frontend/styles.css` + `frontend/js/`
- Läuft vollständig offline im Browser — keine externen Abhängigkeiten einführen
- **IndexedDB** für Persistenz (via `Storage` Objekt mit synchronem In-Memory-Cache)

## Architektur & Render-Modell

```
App                    – Haupt-Controller (app.js)
├── pages/             – Je ein Page-Objekt pro Tab
│   ├── render(char)   – Gibt HTML-String zurück
│   └── save(char)     – Liest DOM → schreibt ins character-Objekt
├── Storage            – IndexedDB + Cache (storage.js)
└── Character          – Datenmodell mit toJSON() / fromJSON() (models/character.js)
```

**Render-Zyklus:** `App.renderCurrentPage()` → `page.render(character)` → `container.innerHTML = html` → `page.attachListeners()`

Kein virtuelles DOM, kein State-Diffing — bei Änderungen wird die gesamte Seite neu gerendert.
Deshalb: Event-Listener immer in `attachListeners()` setzen, nie direkt nach `innerHTML`.

## Schlüsselmuster

**Edit-Modus:** `App.editMode` (boolean) trennt Lese- von Bearbeitungsansicht.
Viele Komponenten branchen darauf — nie direkt DOM-Elemente toggeln, immer `App.renderCurrentPage()` aufrufen.

**Speichern:** `Storage.saveCharacter(character)` — ruft intern `character.toJSON()` auf.
`_doSave(saveVersion?)` in App ist der zentrale Speicher-Einstiegspunkt.

**NotesPage `_editTags`:** Darf während eines laufenden Autosaves NICHT gecleart werden.
Nur in Navigations-Handlern clearen (bekannter Bug wenn falsch gemacht).

**Autosave:** 1,5s Debounce nach jedem `input`/`change` Event im Content-Bereich.
Zusätzlich: beim Tab-Wechsel und bei „✓ Fertig" wird sofort gespeichert + eine persistente Version angelegt.

## Datenmodell (character.notes)

```js
notes: {
  sessions:  [{ id, title, sessionDate, inGameDate, content, tags: {persons[], locations[], quests[], events[]}, isActive, createdAt }]
  persons:   [{ id, name, race, role, status, relation, locationId, description, isFavorite, createdAt }]
  locations: [{ id, name, sector, uwp, status, visitedDate, description, notes, createdAt }]
  quests:    [{ id, title, objective, reward, questGiverId, status, createdAt }]
}
```

Feldnamen exakt so verwenden — z.B. `title` (nicht `name`) bei Quests, `visitedDate` (nicht `date`) bei Orten.

## CSS-Konventionen

- Alle Styles in `frontend/styles.css`, keine Inline-Styles
- **Dark Mode:** `body.dark-mode` Klasse — jede neue CSS-Klasse mit sichtbarer Farbe braucht einen
  entsprechenden Override-Block am Ende der Datei unter `/* ===== DARK MODE ===== */`
- Neue Sektionen mit `/* ===== ABSCHNITTSNAME ===== */` kennzeichnen

## Git-Workflow: Feature Branches

Jede neue Funktion oder größere Änderung wird in einem eigenen Branch entwickelt.

**Pflichtablauf:**
1. Vor Beginn: `git checkout -b feature/<kurzer-name>`
2. Sinnvolle Zwischencommits im Branch
3. Wenn fertig: User fragen ob gemergt werden soll
4. Nach Merge: `git branch -d feature/<name>`

**Namenskonvention:** `feature/<kebab-case>` — z.B. `feature/dark-mode`, `feature/session-suche`

**Ausnahmen** (direkt auf `main`): Tippfehler, 1–3 Zeilen CSS, explizite Anweisung des Users.

## Todo-Liste

Die offene Aufgabenliste liegt in **`Todo.txt`** im Projekt-Root.

**Markierungen:**
- `[ ]` — offen
- `[x]` — erledigt
- `[c]` — cancelled

**Regeln für Claude:**
- Nach Abschluss eines Features den entsprechenden Eintrag auf `[x]` setzen
- Neue Ideen oder entdeckte Probleme eigenständig als `[ ]` eintragen
- Erledigte Einträge nie löschen — sie dienen als Dokumentation
- Die Liste ist nach Themenbereichen gruppiert; neue Einträge in den passenden Abschnitt einfügen

## Sprache

- UI-Texte: **Deutsch**
- Commit-Messages: **Englisch**
- Code (Variablen, Funktionen): **Englisch**
