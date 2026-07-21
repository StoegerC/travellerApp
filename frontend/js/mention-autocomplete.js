/**
 * MentionAutocomplete – "@"-Autovervollständigung für Personen/Orte/Quests/
 * Journal-Einträge, anhängbar an ein beliebiges <textarea> oder <input>.
 * Ursprünglich nur im Journal-Bericht (NotesPage), jetzt als eigenständiges
 * Modul herausgelöst, damit jede Seite (Notizen, Finanzen, Werdegang, Schiff)
 * dieselbe Logik ohne Kopie nutzen kann.
 *
 * Erwähnungs-Syntax @[Name](typ:id) wird von Md._mentions()
 * (frontend/js/markdown.js) als klickbarer Link gerendert.
 *
 * Journal-Paket Teil 2 (K1/@-Mechanik, siehe Todo.txt):
 *  - Typ-Filter: getippt als Kürzel "@p:…" / "@o:…" / "@q:…" (Doppelpunkt
 *    macht die Absicht eindeutig — "@pearson" ohne Doppelpunkt ist eine
 *    normale Suche über alles) ODER per antippbarer Filter-Chip-Zeile im
 *    Dropdown-Kopf. Beides setzt denselben Filter.
 *  - Volltextsuche ohne Groß-/Kleinschreibung (Substring, nicht Namensanfang).
 *  - Sortierung: im aktuellen Eintrag bereits verknüpfte Einträge (Erwähnung
 *    im Text oder Session-Tag) zuerst, danach nach createdAt absteigend.
 *  - Kein Treffer nötig: "+ ‚X' als Person/Ort/Quest anlegen" legt einen Stub
 *    an, fügt die Erwähnung ein und öffnet das Popover (K2) zum Befüllen.
 */
const MentionAutocomplete = {
  _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  },

  // Sucht Personen/Orte/Quests/Sessions: eigene (character.notes) plus,
  // falls einer Kampagne beigetreten, die dort geteilten (App._campaignData).
  // Bei gleicher id gewinnt die eigene (aktuellere) Kopie.
  _entities(character) {
    const own      = character?.notes || {};
    const campaign = (character?.campaignId && App._campaignData?.notes) || {};
    const merge = (ownList, campList) => {
      const map = new Map();
      (campList || []).forEach(item => { if (item && !item._deleted) map.set(item.id, item); });
      (ownList  || []).forEach(item => { if (item && !item._deleted) map.set(item.id, item); });
      return [...map.values()];
    };
    return {
      persons:   merge(own.persons,   campaign.persons),
      locations: merge(own.locations, campaign.locations),
      quests:    merge(own.quests,    campaign.quests),
      sessions:  merge(own.sessions,  campaign.sessions),
    };
  },

  // Pixel-Position einer Zeichen-Position in einem <textarea>/<input>
  // relativ zu dessen eigener Position (top-left = 0,0) - baut dafür einen
  // unsichtbaren "Spiegel"-div mit identischer Schrift/Breite/Umbruch auf,
  // misst darin die Position eines Marker-Spans und räumt danach wieder auf.
  // Gängige Technik, da <textarea>/<input> selbst keine Caret-Koordinaten anbieten.
  _caretCoords(el, position) {
    const style = getComputedStyle(el);
    const mirror = document.createElement('div');
    ['boxSizing', 'width', 'fontFamily', 'fontSize', 'fontWeight', 'lineHeight',
     'paddingTop', 'paddingRight', 'paddingBottom', 'paddingLeft',
     'borderTopWidth', 'borderRightWidth', 'borderBottomWidth', 'borderLeftWidth',
     'letterSpacing', 'wordSpacing'].forEach(p => { mirror.style[p] = style[p]; });
    Object.assign(mirror.style, {
      position: 'absolute', top: '0', left: '-9999px',
      visibility: 'hidden', whiteSpace: 'pre-wrap', wordWrap: 'break-word',
    });
    mirror.textContent = el.value.slice(0, position);
    const marker = document.createElement('span');
    marker.textContent = el.value.slice(position) || '.';
    mirror.appendChild(marker);
    document.body.appendChild(mirror);
    const coords = {
      top:    marker.offsetTop  - el.scrollTop,
      left:   marker.offsetLeft - el.scrollLeft,
      height: parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.2,
    };
    document.body.removeChild(mirror);
    return coords;
  },

  // Ids, die im aktuellen Eintrag schon verknüpft sind: Erwähnungen im
  // Feldtext selbst plus (auf der Notizen-Seite) die Session-Tags des offenen
  // Formulars. Diese Einträge stehen in den Vorschlägen zuerst.
  _linkedIds(fieldValue) {
    const ids = new Set();
    for (const m of fieldValue.matchAll(/\((?:person|location|quest|session):([\w-]+)\)/g)) {
      ids.add(m[1]);
    }
    if (App.currentPage === 'notes' && NotesPage._editTags) {
      for (const list of Object.values(NotesPage._editTags)) {
        (list || []).forEach(id => ids.add(id));
      }
    }
    return ids;
  },

  // Neuen Stub-Eintrag anlegen — gleiche Defaults wie das Anlegen über das
  // Tag-Picker-Formular (NotesPage._attachTagPicker/doCreate).
  _createEntry(pluralType, name, character) {
    const data    = NotesPage._d(character);
    const nameKey = pluralType === 'quests' ? 'title' : 'name';
    const prefix  = { persons: 'p', locations: 'l', quests: 'q' }[pluralType] || 'x';
    const item    = { id: prefix + Date.now(), [nameKey]: name, createdAt: new Date().toISOString() };
    if (pluralType === 'persons')   { item.status = 'alive'; item.relation = 'neutral'; }
    if (pluralType === 'locations') { item.status = 'known'; }
    if (pluralType === 'quests')    { item.status = 'active'; }
    Object.assign(item, App._extraFieldDefaults(pluralType));
    data[pluralType].push(item);
    character.notes = data;
    NotesPage._saveAndSync(character);
    return item;
  },

  // Haengt "@"-Autovervollstaendigung an ein Feld an. fieldId/suggestionsId
  // sind Element-IDs (siehe HTML-Muster: <div class="loc-name-wrap"><textarea
  // id="..."></textarea><div id="..." class="loc-suggestions
  // mention-suggestions" style="display:none"></div></div>).
  attach(fieldId, suggestionsId, character) {
    const field     = document.getElementById(fieldId);
    const suggestEl = document.getElementById(suggestionsId);
    if (!field || !suggestEl) return;

    let range = null;        // { start, end } des "@query" im Text, das ersetzt wird
    let manualFilter = null; // per Filter-Chip gewählt; gewinnt über das Kürzel

    const closeSuggestions = () => {
      suggestEl.style.display = 'none';
      suggestEl.innerHTML = '';
      range = null;
      manualFilter = null;
    };

    const TYPE_LABEL   = { person: '👤 Person', location: '🌍 Ort', quest: '🎯 Quest', session: '📖 Journal' };
    const CREATE_LABEL = { person: 'Person', location: 'Ort', quest: 'Quest' };
    const PLURAL       = { person: 'persons', location: 'locations', quest: 'quests' };
    const SHORTCUT     = { p: 'person', o: 'location', q: 'quest' };
    const FILTERS      = [['all', 'Alle'], ['person', 'Personen'], ['location', 'Orte'], ['quest', 'Quests']];

    // Anker unter dem "@" für das Popover nach einer Neuanlage: dieselbe
    // Schnittstelle wie ein DOM-Element (getBoundingClientRect), nur eben an
    // der Einfügestelle im Text statt an einem Element.
    const caretAnchor = (pos) => {
      const f = field.getBoundingClientRect();
      const c = this._caretCoords(field, pos);
      const rect = {
        left: f.left + c.left, top: f.top + c.top,
        width: 8, height: c.height,
      };
      rect.right  = rect.left + rect.width;
      rect.bottom = rect.top + rect.height;
      return { getBoundingClientRect: () => rect };
    };

    const update = () => {
      const value = field.value;
      const pos   = field.selectionStart;
      const match = value.slice(0, pos).match(/@([^\s@[\]]*)$/);
      if (!match) { closeSuggestions(); return; }

      // Typ-Kürzel "@p:" / "@o:" / "@q:" abtrennen (nur MIT Doppelpunkt —
      // "@pearson" bleibt eine normale Suche über alles).
      let rawQuery = match[1];
      let shortcutFilter = null;
      const sc = rawQuery.match(/^([poqPOQ]):(.*)$/);
      if (sc) {
        shortcutFilter = SHORTCUT[sc[1].toLowerCase()];
        rawQuery = sc[2];
      }
      const filter = manualFilter || shortcutFilter || 'all';
      const query  = rawQuery.toLowerCase();
      range = { start: pos - match[0].length, end: pos };

      // Dropdown unter das "@" (Start der Erwähnung) setzen statt unter das
      // ganze Feld - .loc-suggestions' Standard-CSS (top:100%;left:0;right:0)
      // wird dafür per Inline-Style überschrieben.
      const coords = this._caretCoords(field, range.start);
      Object.assign(suggestEl.style, {
        top: `${coords.top + coords.height}px`,
        left: `${coords.left}px`,
        right: 'auto',
      });

      // Entities bei jedem Update frisch mergen (statt einmalig beim attach):
      // Neuanlagen aus diesem Dropdown und Popover-Umbenennungen sind so
      // sofort sichtbar, ohne dass die Seite neu rendern muss.
      const entities = this._entities(character);
      const pool = [];
      if (filter === 'all' || filter === 'person')
        pool.push(...entities.persons.map(p   => ({ type: 'person',   id: p.id, label: p.name,  createdAt: p.createdAt })));
      if (filter === 'all' || filter === 'location')
        pool.push(...entities.locations.map(l => ({ type: 'location', id: l.id, label: l.name,  createdAt: l.createdAt })));
      if (filter === 'all' || filter === 'quest')
        pool.push(...entities.quests.map(q    => ({ type: 'quest',    id: q.id, label: q.title, createdAt: q.createdAt })));
      if (filter === 'all')
        pool.push(...entities.sessions.map(s  => ({ type: 'session',  id: s.id, label: s.title, createdAt: s.createdAt })));

      // Volltextsuche (Substring, case-insensitiv) + Sortierung: bereits im
      // Eintrag Verknüpftes zuerst, danach die zuletzt erstellten Einträge.
      const linked  = this._linkedIds(value);
      const created = (r) => Date.parse(r.createdAt || 0) || 0;
      const results = pool
        .filter(r => r.label && r.label.toLowerCase().includes(query))
        .sort((a, b) =>
          ((linked.has(b.id) ? 1 : 0) - (linked.has(a.id) ? 1 : 0)) ||
          (created(b) - created(a)))
        .slice(0, 8);

      // Anlegen-Zeilen: bei aktivem Filter nur der eine Typ, sonst alle drei.
      // Sessions entstehen nie aus einer Erwähnung heraus.
      const createTypes = rawQuery.trim()
        ? (filter === 'all' ? ['person', 'location', 'quest'] : [filter]).filter(t => t !== 'session')
        : [];

      const chipRow = `
        <div class="mention-filter-row">
          ${FILTERS.map(([val, label]) => `
            <button type="button" class="mention-filter-chip${filter === val ? ' active' : ''}" data-filter="${val}">${label}</button>`).join('')}
        </div>`;

      const resultRows = results.map((r, i) => `
        <div class="loc-suggest-item mention-suggest-item" data-idx="${i}">
          <strong>${this._esc(r.label)}</strong>
          <span>${linked.has(r.id) ? '<em class="mention-linked-flag">im Eintrag</em> ' : ''}${TYPE_LABEL[r.type]}</span>
        </div>`).join('');

      const createRows = createTypes.map(t => `
        <div class="mention-suggest-item mention-create-item mention-create--${t}" data-ctype="${t}">
          ✚ „${this._esc(rawQuery.trim())}" als ${CREATE_LABEL[t]} anlegen
        </div>`).join('');

      const emptyRow = (!results.length && !createRows)
        ? '<div class="loc-suggest-empty">Kein Treffer</div>' : '';

      suggestEl.innerHTML = chipRow + resultRows + createRows + emptyRow;
      suggestEl.style.display = '';

      // Filter-Chips: mousedown statt click, damit das Feld den Fokus behält.
      suggestEl.querySelectorAll('.mention-filter-chip').forEach(chip => {
        chip.addEventListener('mousedown', (e) => {
          e.preventDefault();
          manualFilter = chip.dataset.filter === 'all' ? 'all' : chip.dataset.filter;
          update();
        });
      });

      const insertMention = (label, type, id) => {
        const before = field.value.slice(0, range.start);
        const after  = field.value.slice(range.end);
        const insertion = `@[${label}](${type}:${id}) `;
        field.value = before + insertion + after;
        const newPos = before.length + insertion.length;
        field.focus();
        field.setSelectionRange(newPos, newPos);
        // Synthetisches input-Event statt eines vollen Re-Renders: loest
        // den bestehenden Autosave-Mechanismus aus, ohne das Feld (und
        // damit Fokus/Cursor) zu ersetzen.
        field.dispatchEvent(new Event('input', { bubbles: true }));
      };

      suggestEl.querySelectorAll('.mention-suggest-item:not(.mention-create-item)').forEach(item => {
        // mousedown statt click: feuert vor dem blur des Feldes, damit der
        // Cursor/Fokus beim Einfügen erhalten bleibt.
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const r = results[parseInt(item.dataset.idx)];
          if (!r || !range) return;
          insertMention(r.label, r.type, r.id);
          closeSuggestions();
        });
      });

      // Neuanlage: Stub anlegen, Erwähnung einfügen, Popover (K2) zum
      // Befüllen öffnen — der Session-Tag kommt wie bei jeder Erwähnung
      // automatisch beim Speichern dazu (Mention-Scan in NotesPage.save()).
      suggestEl.querySelectorAll('.mention-create-item').forEach(item => {
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          if (!range) return;
          const type   = item.dataset.ctype;
          const name   = rawQuery.trim();
          const anchorPos = range.start;
          const entry  = this._createEntry(PLURAL[type], name, character);
          insertMention(name, type, entry.id);
          closeSuggestions();
          MentionPopover.open({
            type: PLURAL[type], id: entry.id,
            anchorEl: caretAnchor(anchorPos), isNew: true,
          });
        });
      });
    };

    field.addEventListener('input', update);
    field.addEventListener('click', update);
    field.addEventListener('keyup', (e) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') update();
    });
    field.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeSuggestions();
    });
    field.addEventListener('blur', () => setTimeout(closeSuggestions, 200));
  },
};
