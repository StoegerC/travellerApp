/**
 * MentionAutocomplete – "@"-Autovervollständigung für Personen/Orte/Quests/
 * Journal-Einträge, anhängbar an ein beliebiges <textarea> oder <input>.
 * Ursprünglich nur im Journal-Bericht (NotesPage), jetzt als eigenständiges
 * Modul herausgelöst, damit jede Seite (Notizen, Finanzen, Werdegang, Schiff)
 * dieselbe Logik ohne Kopie nutzen kann.
 *
 * Erwähnungs-Syntax @[Name](typ:id) wird von Md._mentions()
 * (frontend/js/markdown.js) als klickbarer Link gerendert.
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

  // Haengt "@"-Autovervollstaendigung an ein Feld an. fieldId/suggestionsId
  // sind Element-IDs (siehe HTML-Muster: <div class="loc-name-wrap"><textarea
  // id="..."></textarea><div id="..." class="loc-suggestions
  // mention-suggestions" style="display:none"></div></div>).
  attach(fieldId, suggestionsId, character) {
    const field     = document.getElementById(fieldId);
    const suggestEl = document.getElementById(suggestionsId);
    if (!field || !suggestEl) return;

    const entities = this._entities(character);
    let range = null; // { start, end } des "@query" im Text, das ersetzt wird

    const closeSuggestions = () => {
      suggestEl.style.display = 'none';
      suggestEl.innerHTML = '';
      range = null;
    };

    const TYPE_LABEL = { person: '👤 Person', location: '🌍 Ort', quest: '🎯 Quest', session: '📖 Journal' };

    const update = () => {
      const value = field.value;
      const pos   = field.selectionStart;
      const match = value.slice(0, pos).match(/@([^\s@[\]]*)$/);
      if (!match) { closeSuggestions(); return; }

      const query = match[1].toLowerCase();
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

      const results = [
        ...entities.persons.map(p   => ({ type: 'person',   id: p.id, label: p.name })),
        ...entities.locations.map(l => ({ type: 'location', id: l.id, label: l.name })),
        ...entities.quests.map(q    => ({ type: 'quest',    id: q.id, label: q.title })),
        ...entities.sessions.map(s  => ({ type: 'session',  id: s.id, label: s.title })),
      ].filter(r => r.label && r.label.toLowerCase().includes(query)).slice(0, 8);

      if (!results.length) {
        suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer</div>';
        suggestEl.style.display = '';
        return;
      }

      suggestEl.innerHTML = results.map((r, i) => `
        <div class="loc-suggest-item mention-suggest-item" data-idx="${i}">
          <strong>${this._esc(r.label)}</strong>
          <span>${TYPE_LABEL[r.type]}</span>
        </div>`).join('');
      suggestEl.style.display = '';

      suggestEl.querySelectorAll('.mention-suggest-item').forEach(item => {
        // mousedown statt click: feuert vor dem blur des Feldes, damit der
        // Cursor/Fokus beim Einfügen erhalten bleibt.
        item.addEventListener('mousedown', (e) => {
          e.preventDefault();
          const r = results[parseInt(item.dataset.idx)];
          if (!r || !range) return;
          const before = value.slice(0, range.start);
          const after  = field.value.slice(range.end);
          const insertion = `@[${r.label}](${r.type}:${r.id}) `;
          field.value = before + insertion + after;
          const newPos = before.length + insertion.length;
          field.focus();
          field.setSelectionRange(newPos, newPos);
          // Synthetisches input-Event statt eines vollen Re-Renders: loest
          // den bestehenden Autosave-Mechanismus aus, ohne das Feld (und
          // damit Fokus/Cursor) zu ersetzen.
          field.dispatchEvent(new Event('input', { bubbles: true }));
          closeSuggestions();
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
