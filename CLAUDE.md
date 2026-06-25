# Claude Code – Projektregeln

## Git-Workflow: Feature Branches

Jede neue Funktion oder größere Änderung wird in einem eigenen Branch entwickelt.

**Pflichtablauf bei jeder Feature-Implementierung:**

1. Vor Beginn der Arbeit: `git checkout -b feature/<kurzer-name>` anlegen
2. Änderungen in diesem Branch committen (sinnvolle Zwischencommits, nicht alles auf einmal)
3. Wenn fertig: den User fragen, ob gemergt werden soll (`git merge` in `main`)
4. Branch nach dem Merge löschen: `git branch -d feature/<name>`

**Branch-Namenskonvention:** `feature/<kebab-case-beschreibung>`
Beispiele: `feature/dark-mode`, `feature/session-suche`, `feature/undo-verlauf`

**Ausnahmen** (direkt auf `main` ohne Branch):
- Tippfehler-Fixes
- Kleine CSS-Korrekturen (1–3 Zeilen)
- Explizite Anweisung des Users

## Projekt-Kontext

- Vanilla JS SPA, kein Framework, Tablet-optimiert (iPad)
- Ziel-Gerät: Tablet im Querformat, touch-bedienbar
- Sprache der UI: Deutsch
- Alle Commits auf Englisch

## Code-Stil

- Keine unnötigen Kommentare
- Kein Refactoring über den Task hinaus
- Keine neuen Abhängigkeiten ohne Rückfrage
