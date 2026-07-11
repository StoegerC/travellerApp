---
name: verify
description: App im Browser starten und Änderungen end-to-end verifizieren (Playwright gegen statisch serviertes frontend/)
---

# Verify: Traveller Charsheet im Browser fahren

Statische App, kein Build. Frontend servieren, mit Playwright treiben.

## Starten

```bash
cd frontend && python3 -m http.server 8123 --bind 127.0.0.1 &
```

## Playwright

Kein Playwright im Repo. Im Scratchpad `npm install playwright`, aber die
npm-Version passt meist nicht zum lokalen Browser-Cache — deshalb
`executablePath` explizit auf den Cache zeigen (Version ggf. per
`ls ~/Library/Caches/ms-playwright/` prüfen):

```js
const browser = await chromium.launch({
  executablePath: process.env.HOME +
    '/Library/Caches/ms-playwright/chromium-1223/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
});
```

## Gotchas beim Erststart (leere IndexedDB)

1. `#loadCharModal` erscheint → `#lcNewBtn` klicken (falls sichtbar), sonst `#loadCharClose`.
2. `#newCharModal` fragt Speicherort → `#ncLocalBtn` für lokalen Charakter.
3. **Ein neuer Charakter startet im Edit-Modus** (`App.editMode === true`) —
   für Lesemodus-Checks erst `#toggleEditBtn` klicken. Zustand prüfbar via
   `page.evaluate(() => App.editMode)`.

## Nützliche Anker

- Tabs: `page.click('[data-page="combat"]')` (metadata, attributes, equipment, ship, combat, career, notes, karte)
- Seiten-Container: `#metadata-page`, `#combat-page`, …
- Edit-Modus-Toggle: `#toggleEditBtn` („✎ Bearbeiten" / „✓ Fertig")
- Dark Mode für Screenshots: `page.evaluate(() => document.body.classList.add('dark-mode'))`
- App-Zustand: `window.App`, `window.currentCharacter` sind global erreichbar.
- `window.prompt`/`confirm` werden nativ genutzt (z.B. Erste Hilfe) → `page.on('dialog', …)` registrieren.
