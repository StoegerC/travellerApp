# Regelsystem-Module: Leitfaden

Die App besteht aus einem **systemunabhängigen Kern** (single source) und
**Regelsystem-Modulen** unter `frontend/js/systems/<id>/`. Der Kern kennt nie ein
konkretes System — er fragt die `SystemRegistry` mit `character.system` nach dem
**Manifest**, dem Vertrag des Systems. Architektur-Plan und Entscheidungen:
Todo.txt (CHARAKTERVERWALTUNG) bzw. das dort verlinkte Plan-Dokument.

**Stand:** Alle Phasen 0–5 des Plans umgesetzt (Kern-Modell/Registry/
Manifest-Vertrag/Mehrsystem-Betrieb/Universal-Template/systemreine
Kampagnen, siehe Todo.txt CHARAKTERVERWALTUNG). Der Manifest-Vertrag
umfasst `id`, `name`, `tabs`, `currency`, `financeCategories`,
`defaultDebtCategory`, `defaultSettleCategory`, `calendar`, `labels`,
`ageRange`, `entityExtraFields`, `metadataExtraFields`, `backgroundPath`,
`keyEventsPath`, `mergeSpec`. `systems/universal/` ist ein echtes,
registriertes zweites System (kein Platzhalter) — die einfachste
Kopiervorlage für ein neues System. Optional offen: Phase 6 (freiwillige
MGT2-Migration nach `systemData`), nur bei tatsächlichem Bedarf.

## Ein neues System anlegen (Kopie von `universal/`)

### 1. Ordner anlegen
`systems/<id>/` mit `manifest.js` (+ `pages/`, `data/` nach Bedarf).
**Die id ist für immer:** Sie wird in jeden Charakter geschrieben, synchronisiert
und exportiert — kurz, klein, ohne Sonderzeichen (`delta-green`), nie umbenennen.
MGT2 läuft aus historischen Gründen unter `traveller`.

### 2. Manifest ausfüllen
Jeden Vertragsschlüssel bewusst entscheiden. Bereits aktiv:

```js
const MySystem = {
  id:   'meine-id',
  name: 'Anzeigename',
  tabs: [
    { id: 'metadata', icon: '👤', label: 'Charakter', page: () => MetadataPage }, // Kern
    { id: 'stats',    icon: '📊', label: 'Werte',     page: () => MyStatsPage },  // System
    // Kern-Tabs sind ein Angebot, kein Pflichtprogramm — weglassen ist erlaubt.
  ],
};
SystemRegistry.register(MySystem);
```

Weitere Schlüssel nach Bedarf (siehe `systems/mgt2/manifest.js` für alle,
`systems/universal/manifest.js` fürs Minimalbeispiel): `calendar`
(Datumsformat **muss als String chronologisch sortieren**, z. B. `1105-032`
oder ISO — die Chronik vergleicht lexikografisch), `mergeSpec` (**jedes Array
in `systemData` deklarieren**, sonst gilt „lokal gewinnt komplett" und
Zwei-Geräte-Edits verlieren still Änderungen).

### 3. Daten-Bauordnung
Alle Regeldaten leben unter `character.systemData` — **nie neue Top-Level-Felder**
(die gehören dem Kern; nur MGT2 hat historisch flache Felder, Bestandsschutz).
Mergefähige Arrays: jedes Element trägt `id`, `createdAt`, `updatedAt`; gelöscht
wird per Tombstone (`_deleted: true` + `deletedAt`), nie per `splice`.
Verstöße werfen keinen Fehler — sie erzeugen leise falsche Merges am Spieltisch.

### 4. Seiten bauen (Seiten-Vertrag)
- `render(char)` → HTML-String; `save(char)` liest das DOM zurück ins
  Charakter-Objekt; `attachListeners()` hängt **alle** Listener an — nie direkt
  nach `innerHTML`.
- `App.editMode` respektieren; bei Änderungen `App.renderCurrentPage()` statt
  DOM-Toggles; Modals so bauen, dass `App._isBusyEditing()` sie erkennt
  (sonst wischt der Sync-Poll sie weg).
- Aus der Kern-Widget-Bibliothek (`core-widgets.js`, `CoreWidgets`) komponieren
  statt Zähler/Listen neu zu erfinden — bisher nur `renderValueList`/
  `attachValueList` (editierbare Name+Wert-Liste, siehe
  `systems/universal/pages/values.js`); weitere Widgets (Zähler, Tracker)
  entstehen bei Bedarf, nicht auf Vorrat.

### 5. Kampagnen: geteilte Inhalte
Kampagnen sind **systemrein** — eine Kampagne gehört ab dem Erstellen für
immer zu genau einem System (vom Gründungscharakter übernommen), Beitritt
mit einem Charakter eines anderen Systems lehnt der Server mit `409` ab
(`PUT /campaign/:id/join`). Der Kern-Teil einer Kampagne (geteiltes Journal,
Personen, Orte, Quests) ist für jedes System identisch und braucht keine
Systemarbeit.

Braucht das eigene System darüber hinaus geteilte Inhalte (z. B. eine
Delta-Green-Zelle mit gemeinsamen Beweisstücken), **keine eigene
Backend-Route bauen** — das generische Erweiterungs-API nutzen:
`CampaignSync.getExt(campaignId, key)` / `updateExt(campaignId, key, entries)`
(frontend/js/campaign.js), serverseitig `GET`/`PUT /campaign/:id/ext/:key`.
`key` ist ein selbst gewählter, kurzer Bezeichner (`a-z0-9_-`, muss mit einem
Buchstaben beginnen); `entries` folgt derselben Merge-Bauordnung wie überall
(`id`/`updatedAt`, Tombstone-Löschung). MGT2s Schiffe nutzen aus
Bestandsschutz-Gründen weiterhin ihre eigene `/ships`-Route — kein Vorbild für
neue Systeme, sondern ein historischer Sonderfall.

### 6. Registrieren — genau drei Stellen außerhalb des Ordners
1. `<script>`-Tags in `frontend/index.html` — Reihenfolge: eigene Seiten/Daten
   zuerst, dann das eigene `manifest.js` (nach `registry.js`), alles vor `app.js`,
2. Einträge in der `ASSETS`-Liste von `frontend/sw.js`,
3. der `SystemRegistry.register(...)`-Aufruf im eigenen `manifest.js`.

Mehr Kern-Berührung ist verboten. Fehlt dem Vertrag etwas: den Vertrag im Kern
erweitern (eigener Branch, nützt allen Systemen) — nicht im System hacken.

### 7. Verifizieren
- Playwright-Durchstich: Charakter im neuen System anlegen → alle Tabs rendern
  in Lese- und Bearbeitungsmodus → editieren, speichern, App neu laden → alles da.
- Merge-Roundtrip: zwei simulierte Geräte editieren verschiedene
  `systemData`-Bereiche → beide Änderungen überleben.
- Fremd-Check: MGT2-Charakter laden → nichts vom neuen System sichtbar; die neue
  System-id kommt außerhalb von `systems/` und den drei Registrierungsstellen
  nicht vor.

### 8. Release
Wie jedes Feature: `feature/system-<id>`-Branch, CHANGELOG, `bump-version.js`
(minor), Merge nach Freigabe.
