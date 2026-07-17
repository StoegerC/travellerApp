/**
 * NotesChronicle – automatische Chronik auf den Detailkarten von Personen,
 * Orten und Quests (Journal-Paket Teil 3, K5 — siehe Todo.txt).
 *
 * Zeigt unter dem kuratierten Steckbrief die VOLLSTÄNDIGEN Absätze aller
 * Journal-Einträge, in denen der Eintrag per @-Erwähnung vorkommt —
 * chronologisch aufsteigend nach In-Game-Datum (Fallback: Session-Datum),
 * mit Sprung zur Originalstelle. Es wird nichts kopiert: die Absätze werden
 * zur Renderzeit aus den Berichten eingesammelt. Erwähnungen innerhalb der
 * Chronik bleiben anklickbar (Md.render erzeugt .mention-chip → öffnet das
 * Popover über den bestehenden Link-Chip-Handler in NotesPage).
 *
 * Bewusste Grenze: gefunden wird nur, was als @[Name](typ:id) erwähnt ist —
 * reiner Namenstext ohne Erwähnung erscheint nicht (siehe Konzept K5).
 */
const NotesChronicle = {

  _SINGULAR: { persons: 'person', locations: 'location', quests: 'quest' },

  // HTML der Chronik-Sektion, oder '' wenn es keine Erwähnungen gibt.
  render(pluralType, entryId) {
    const char = App.currentCharacter;
    const singular = this._SINGULAR[pluralType];
    if (!char || !singular || !entryId) return '';

    // Der Marker steht literal im Berichtstext: @[Name](person:p123…)
    const marker = `(${singular}:${entryId})`;

    // Eigene sichtbare Sessions plus die geteilten aus dem Kampagnen-Pool,
    // die lokal (noch) nicht vorhanden sind.
    const own = (char.notes?.sessions || []).filter(s => !s._deleted);
    const sessions = [...own, ...NotesPage._extEntries('sessions')];

    const sortKey = (s) => String(s.inGameDate || s.sessionDate || '');
    const items = sessions
      .filter(s => (s.content || '').includes(marker))
      .sort((a, b) => sortKey(a).localeCompare(sortKey(b)))
      .map(s => ({
        session: s,
        // Absatz = durch Leerzeile getrennter Block. Jeder Absatz erscheint
        // nur einmal, auch wenn er den Eintrag mehrfach erwähnt.
        paragraphs: s.content.split(/\n\s*\n/).filter(p => p.includes(marker)),
      }))
      .filter(it => it.paragraphs.length);

    if (!items.length) return '';

    const e = (x) => NotesPage._esc(x);
    return `
      <div class="chron-section">
        <h4 class="chron-title">Chronik</h4>
        ${items.map(({ session: s, paragraphs }) => `
          <div class="chron-item">
            <span class="chron-src" data-tab="sessions" data-id="${e(s.id)}">
              ${e(s.title || 'Ohne Titel')}${sortKey(s) ? ` · ${e(sortKey(s))}` : ''} ↗
            </span>
            ${paragraphs.map(p => `<div class="md-content chron-text">${Md.render(p)}</div>`).join('')}
          </div>`).join('')}
      </div>`;
  },
};
