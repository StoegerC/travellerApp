/**
 * CareerBackground – Kern-Baustein: Prägende Ereignisse, Hintergrund &
 * Persönlichkeit, Favoriten-Kontakte (Multi-System Phase 2, Feld-Audit F1).
 *
 * Spielunabhängig — jedes System bindet den Baustein aus seiner eigenen
 * Werdegang-/Karriere-Seite ein (MGT2: CareerPage, siehe
 * systems/mgt2/pages/career.js). Muster wie NotesChronicle: ein
 * eigenständiges Objekt, das seine Blöcke als HTML-Strings liefert und
 * explizit aufgerufen wird — kein Object.assign-Mixin, weil der Baustein
 * eigenen State (Sortierung, aufgeklapptes Ereignis, Event-Modal) und eigene
 * Listener mitbringt.
 *
 * Die aufrufende System-Seite übergibt bei attachListeners() eine rerender-
 * Funktion, statt dass dieser Baustein einen Container-Element-Id fest kennt
 * (z.B. "career-page") — so bleibt er von der Platzierung der System-Seite
 * unabhängig.
 *
 * Datenpfad konfigurierbar übers Manifest (App._backgroundPath()/
 * _keyEventsPath()) — Bestandsschutz für MGT2s career.background/
 * career.keyEvents, neue Systeme ohne eigene Angabe bekommen die
 * Kern-Felder character.background/character.keyEvents.
 */
const CareerBackground = {

  // ── State ─────────────────────────────────────────────────────────────────
  _sortImportance:  false,
  _expandedEventId: null,
  _editEventId:     undefined, // undefined=kein Modal, null=neu, number=Index
  _modalImportance: 2,
  _secretsRevealed: false,

  RELATIONS: {
    friendly: { dot: '#28a745', label: 'Verbündet'  },
    neutral:  { dot: '#6c757d', label: 'Neutral'    },
    hostile:  { dot: '#dc3545', label: 'Feindlich'  },
  },

  // ── Utilities ─────────────────────────────────────────────────────────────
  _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
  _uid() { return 'c' + Date.now() + Math.random().toString(36).slice(2,6); },

  _pathGet(obj, path) {
    return path.split('.').reduce((o, k) => o?.[k], obj);
  },
  _pathEnsure(obj, path, factory) {
    const parts = path.split('.');
    let o = obj;
    for (let i = 0; i < parts.length - 1; i++) o = o[parts[i]] || (o[parts[i]] = {});
    const last = parts[parts.length - 1];
    if (o[last] === undefined) o[last] = factory();
    return o[last];
  },

  _background(character) {
    return this._pathEnsure(character, App._backgroundPath(), () => (
      { appearance:'', personality:'', goals:'', motivation:'', secrets:'', secretsHidden:true, quotes:[] }
    ));
  },
  _keyEvents(character) {
    return this._pathEnsure(character, App._keyEventsPath(), () => []);
  },

  _stars(n, id, editable) {
    let out = '<span class="cr-stars">';
    for (let i = 1; i <= 3; i++) {
      const filled = i <= n;
      out += editable
        ? `<button class="cr-star${filled?' filled':''}" data-eventid="${id}" data-val="${i}">${filled?'⭐':'☆'}</button>`
        : `<span class="cr-star-static">${filled?'⭐':'☆'}</span>`;
    }
    return out + '</span>';
  },

  // ── Render (drei Blöcke, von der System-Seite frei anzuordnen) ────────────
  render(character) {
    return `
      ${this.renderEvents(character)}
      ${this.renderBackground(character)}
      ${this.renderFavorites(character)}
      ${this._editEventId !== undefined ? this._eventModal(character) : ''}`;
  },

  // ── Prägende Ereignisse ────────────────────────────────────────────────────
  renderEvents(character) {
    const keyEvents = this._keyEvents(character);
    const events = [...keyEvents].filter(e => !e._deleted).sort((a, b) =>
      this._sortImportance
        ? (b.importance || 1) - (a.importance || 1)
        : 0
    );

    const persons   = character.notes?.persons   || [];
    const locations = character.notes?.locations || [];

    const sortBtn = `<button class="cr-sort-btn${this._sortImportance?' active':''}" id="toggleSortBtn">
      ${this._sortImportance ? '★ Nach Wichtigkeit' : '# Chronologisch'}
    </button>`;

    let rows = '';
    events.forEach(ev => {
      const realIdx  = keyEvents.indexOf(ev);
      const expanded = this._expandedEventId === ev.id;
      const linkedP  = (ev.linkedPersonIds  || []).map(id => persons.find(p => p.id===id)?.name).filter(Boolean);
      const linkedL  = (ev.linkedLocationIds|| []).map(id => locations.find(l => l.id===id)?.name).filter(Boolean);

      rows += `<div class="cr-event-row${expanded?' expanded':''}">
        <div class="cr-event-header" data-eventid="${this._esc(ev.id)}">
          <div class="cr-event-main">
            ${this._stars(ev.importance || 1, ev.id, true)}
            <span class="cr-event-title">${this._esc(ev.title)}</span>
            ${ev.termReference ? `<span class="cr-event-term">${this._esc(ev.termReference)}</span>` : ''}
          </div>
          <div class="cr-event-actions">
            <button class="cr-event-edit" data-idx="${realIdx}">✎</button>
            <button class="cr-event-del"  data-idx="${realIdx}">🗑</button>
            <span class="cr-expand-arrow">${expanded?'▲':'▼'}</span>
          </div>
        </div>
        ${expanded ? `<div class="cr-event-body">
          ${ev.description ? `<div class="md-content">${Md.render(ev.description)}</div>` : ''}
          ${linkedP.length ? `<div class="cr-event-links">${linkedP.map(n=>`<span class="cr-link-tag cr-link-person">${this._esc(n)}</span>`).join('')}</div>` : ''}
          ${linkedL.length ? `<div class="cr-event-links">${linkedL.map(n=>`<span class="cr-link-tag cr-link-loc">${this._esc(n)}</span>`).join('')}</div>` : ''}
        </div>` : ''}
      </div>`;
    });

    return `<div class="cr-block">
      <div class="cr-block-header">
        <h3 class="cr-block-title">Prägende Ereignisse</h3>
        <div class="cr-block-actions">
          ${sortBtn}
          <button class="cr-btn-add" id="addEventBtn">+ Ereignis</button>
        </div>
      </div>
      <div class="cr-event-list">
        ${rows || '<p class="cr-empty">Noch keine Ereignisse eingetragen.</p>'}
      </div>
    </div>`;
  },

  // ── Hintergrund & Persönlichkeit ──────────────────────────────────────────
  renderBackground(character) {
    const bg = this._background(character);
    const secretsBlurred = bg.secretsHidden && !this._secretsRevealed;

    // Diese Felder kennen (anders als der Rest der App) keinen Edit-/Lese-
    // Modus-Unterschied - immer editierbar. Die Vorschau darunter ist daher
    // IMMER sichtbar (nicht an App.editMode gekoppelt), damit auch hier
    // "@"-Erwähnungen als klickbarer Link erscheinen.
    const field = (key, label, placeholder) => `
      <div class="cr-bg-group">
        <label class="cr-bg-label">${label} <span class="cr-save-feedback" data-field="${key}">✓</span></label>
        <div class="loc-name-wrap">
          <textarea id="crBg-${key}" class="cr-bg-field" data-field="${key}" placeholder="${placeholder} (@ verlinkt Personen/Orte/Quests/Journal)" rows="3">${this._esc(bg[key] || '')}</textarea>
          <div id="crBg-${key}-suggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
        </div>
        <div id="crBg-${key}-preview" class="cr-bg-preview md-content">${bg[key] ? Md.render(bg[key]) : ''}</div>
      </div>`;

    const quotes = (bg.quotes || []).map((q, i) => `
      <div class="cr-quote-row">
        <span class="cr-quote-text">${this._esc(q)}</span>
        <button class="cr-quote-del" data-idx="${i}">✕</button>
      </div>`).join('');

    return `<div class="cr-block">
      <h3 class="cr-block-title">Hintergrund & Persönlichkeit</h3>
      ${field('appearance',  'Aussehen',       'Körperbeschreibung, Kleidungsstil …')}
      ${field('personality', 'Persönlichkeit', 'Wie verhält sich der Charakter?')}
      ${field('goals',       'Ziele',          'Kurzfristige und langfristige Ziele …')}
      ${field('motivation',  'Motivation',     'Was treibt den Charakter an?')}
      <div class="cr-bg-group">
        <div class="cr-secrets-header">
          <label class="cr-bg-label">Geheimnisse <span class="cr-save-feedback" data-field="secrets">✓</span></label>
          <label class="cr-secrets-toggle">
            <input type="checkbox" id="secretsHiddenCb" ${bg.secretsHidden ? 'checked' : ''}>
            <span>Verdecken</span>
          </label>
        </div>
        <div class="cr-secrets-wrap${secretsBlurred ? ' blurred' : ''}" id="secretsWrap">
          <div class="loc-name-wrap">
            <textarea id="crBg-secrets" class="cr-bg-field" data-field="secrets" placeholder="Verdeckte Informationen … (@ verlinkt Personen/Orte/Quests/Journal)" rows="3">${this._esc(bg.secrets || '')}</textarea>
            <div id="crBg-secrets-suggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
          </div>
          <div id="crBg-secrets-preview" class="cr-bg-preview md-content">${!secretsBlurred && bg.secrets ? Md.render(bg.secrets) : ''}</div>
          ${secretsBlurred ? '<div class="cr-secrets-reveal" id="revealSecrets">Tippen zum Aufdecken</div>' : ''}
        </div>
      </div>
      <div class="cr-bg-group">
        <label class="cr-bg-label">Zitate & Phrasen</label>
        <div class="cr-quote-list">${quotes || '<p class="cr-empty">Keine Zitate.</p>'}</div>
        <div class="cr-quote-add">
          <input type="text" id="newQuoteInput" class="cr-quote-input" placeholder="Neues Zitat …">
          <button id="addQuoteBtn" class="cr-btn-add">+</button>
        </div>
      </div>
    </div>`;
  },

  // ── Favoriten-Kontakte ────────────────────────────────────────────────────
  renderFavorites(character) {
    const persons  = character.notes?.persons || [];
    const favs     = persons.filter(p => p.isFavorite).slice(-4).reverse();
    const rel      = this.RELATIONS;

    let rows = '';
    if (!favs.length) {
      rows = `<p class="cr-empty">Noch keine Favoriten. Markiere Kontakte in der Personen-Datenbank als Favorit.</p>`;
    } else {
      favs.forEach(p => {
        const r   = rel[p.relation] || rel.neutral;
        rows += `<div class="cr-fav-row" data-personid="${this._esc(p.id)}">
          <span class="cr-fav-dot" style="background:${r.dot}"></span>
          <span class="cr-fav-name">${this._esc(p.name)}</span>
          <span class="cr-fav-role">${this._esc(p.role || '')}</span>
          <span class="cr-fav-desc">${this._esc((p.description||'').slice(0,80))}${(p.description||'').length>80?'…':''}</span>
        </div>`;
      });
    }

    return `<div class="cr-block cr-block-full">
      <div class="cr-block-header">
        <h3 class="cr-block-title">Favoriten-Kontakte</h3>
        <button class="cr-btn-secondary" id="allContactsBtn">Alle Kontakte →</button>
      </div>
      <div class="cr-fav-list">${rows}</div>
    </div>`;
  },

  // ── Event Modal ───────────────────────────────────────────────────────────
  _eventModal(character) {
    const keyEvents = this._keyEvents(character);
    const isNew    = this._editEventId === null;
    const ev       = isNew ? {} : (keyEvents[this._editEventId] || {});
    const persons  = character.notes?.persons   || [];
    const locs     = character.notes?.locations || [];
    const linkedP  = ev.linkedPersonIds  || [];
    const linkedL  = ev.linkedLocationIds|| [];

    const personChecks = persons.map(p =>
      `<label class="cr-check-row"><input type="checkbox" class="ev-person-cb" value="${p.id}" ${linkedP.includes(p.id)?'checked':''}> ${this._esc(p.name)}</label>`).join('');
    const locChecks = locs.map(l =>
      `<label class="cr-check-row"><input type="checkbox" class="ev-loc-cb" value="${l.id}" ${linkedL.includes(l.id)?'checked':''}> ${this._esc(l.name)}</label>`).join('');

    return `<div class="cr-modal-overlay open" id="eventModal">
      <div class="cr-modal">
        <h3>${isNew ? 'Neues Ereignis' : 'Ereignis bearbeiten'}</h3>
        <div class="cr-modal-row">
          <label>Titel</label>
          <input id="evTitle" type="text" class="cr-modal-field" value="${this._esc(ev.title||'')}" placeholder="Kurztitel des Ereignisses">
        </div>
        <div class="cr-modal-row">
          <label>Term-Referenz</label>
          <input id="evTermRef" type="text" class="cr-modal-field" value="${this._esc(ev.termReference||'')}" placeholder="z.B. Term 2">
        </div>
        <div class="cr-modal-row">
          <label>Wichtigkeit</label>
          <div class="cr-modal-stars">
            ${[1,2,3].map(i => `<button class="cr-modal-star${(this._modalImportance>=i)?' filled':''}" data-val="${i}">${this._modalImportance>=i?'⭐':'☆'}</button>`).join('')}
          </div>
        </div>
        <div class="cr-modal-row">
          <label>Beschreibung</label>
          <div class="loc-name-wrap">
            <textarea id="evDesc" class="cr-modal-field" rows="4" placeholder="Beschreibung des Ereignisses … (@ verlinkt Personen/Orte/Quests/Journal)">${this._esc(ev.description||'')}</textarea>
            <div id="evDescSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
          </div>
        </div>
        ${persons.length ? `<div class="cr-modal-row"><label>Verknüpfte Personen</label><div class="cr-check-list">${personChecks}</div></div>` : ''}
        ${locs.length    ? `<div class="cr-modal-row"><label>Verknüpfte Orte</label><div class="cr-check-list">${locChecks}</div></div>` : ''}
        ${!isNew && ev.createdAt ? `<div class="cr-modal-row"><label>Erstellt am</label><span class="ts-display">${new Date(ev.createdAt).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>` : ''}
        <div class="cr-modal-actions">
          <button id="evSaveBtn"   class="cr-btn-save">Speichern</button>
          <button id="evCancelBtn" class="cr-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  // ── Listener ──────────────────────────────────────────────────────────────
  // rerender: von der aufrufenden System-Seite übergebene Funktion, die die
  // GESAMTE Seite neu rendert (Container-Id kennt nur die System-Seite).
  attachListeners(character, rerender) {
    const char       = character;
    const keyEvents  = this._keyEvents(char);
    const background = this._background(char);

    // "@"-Erwähnungen (Ereignis-Beschreibung + Hintergrund-Felder)
    MentionAutocomplete.attach('evDesc', 'evDescSuggestions', char);
    ['appearance', 'personality', 'goals', 'motivation', 'secrets'].forEach(key => {
      MentionAutocomplete.attach(`crBg-${key}`, `crBg-${key}-suggestions`, char);
    });

    // ── Ereignisse: Expand / Sort / Edit / Delete ────────────────────────
    document.querySelectorAll('.cr-event-header').forEach(h => {
      h.addEventListener('click', e => {
        if (e.target.closest('.cr-event-actions')) return;
        const id = h.dataset.eventid;
        this._expandedEventId = (this._expandedEventId === id) ? null : id;
        rerender();
      });
    });

    document.querySelectorAll('.cr-star').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const ev = keyEvents.find(x => x.id === btn.dataset.eventid);
        if (ev) { ev.importance = parseInt(btn.dataset.val); ev.updatedAt = new Date().toISOString(); Storage.saveCharacter(char); rerender(); }
      });
    });

    document.getElementById('toggleSortBtn')?.addEventListener('click', () => {
      this._sortImportance = !this._sortImportance;
      rerender();
    });

    document.querySelectorAll('.cr-event-edit').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const idx = parseInt(btn.dataset.idx);
        this._editEventId = idx;
        this._modalImportance = keyEvents[idx]?.importance || 2;
        rerender();
      });
    });

    document.querySelectorAll('.cr-event-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm('Ereignis löschen?')) return;
        const ev = keyEvents[parseInt(btn.dataset.idx)];
        if (ev) {
          const now = new Date().toISOString();
          ev._deleted  = true;
          ev.deletedAt = now;
          ev.updatedAt = now;
        }
        this._expandedEventId = null;
        Storage.saveCharacter(char);
        rerender();
      });
    });

    document.getElementById('addEventBtn')?.addEventListener('click', () => {
      this._editEventId = null;
      this._modalImportance = 2;
      rerender();
    });

    // ── Event Modal ──────────────────────────────────────────────────────
    document.querySelectorAll('.cr-modal-star').forEach(btn => {
      btn.addEventListener('click', () => {
        this._modalImportance = parseInt(btn.dataset.val);
        document.querySelectorAll('.cr-modal-star').forEach((b, i) => {
          const filled = i < this._modalImportance;
          b.classList.toggle('filled', filled);
          b.textContent = filled ? '⭐' : '☆';
        });
      });
    });

    document.getElementById('evCancelBtn')?.addEventListener('click', () => {
      this._editEventId = undefined;
      rerender();
    });
    document.getElementById('evSaveBtn')?.addEventListener('click', () => {
      const title   = document.getElementById('evTitle').value.trim();
      if (!title) return;
      const linkedP = [...document.querySelectorAll('.ev-person-cb:checked')].map(c=>c.value);
      const linkedL = [...document.querySelectorAll('.ev-loc-cb:checked')].map(c=>c.value);
      const existingEv = this._editEventId !== null ? keyEvents[this._editEventId] : null;
      const entry   = {
        id:                this._editEventId === null ? this._uid() : (existingEv?.id || this._uid()),
        createdAt:         existingEv?.createdAt || new Date().toISOString(),
        title,
        termReference:     document.getElementById('evTermRef').value.trim(),
        description:       document.getElementById('evDesc').value.trim(),
        importance:        this._modalImportance,
        linkedPersonIds:   linkedP,
        linkedLocationIds: linkedL,
        updatedAt:         new Date().toISOString(),
      };
      if (this._editEventId === null) {
        keyEvents.push(entry);
      } else {
        keyEvents[this._editEventId] = entry;
      }
      this._editEventId = undefined;
      Storage.saveCharacter(char);
      rerender();
    });

    // ── Hintergrund: Auto-Save on Blur ───────────────────────────────────
    document.querySelectorAll('.cr-bg-field').forEach(field => {
      field.addEventListener('blur', () => {
        const key = field.dataset.field;
        background[key] = field.value;
        Storage.saveCharacter(char);
        const fb = document.querySelector(`.cr-save-feedback[data-field="${key}"]`);
        if (fb) { fb.style.opacity = '1'; setTimeout(() => fb.style.opacity = '0', 1200); }
        // Vorschau direkt aktualisieren statt vollem Re-Render (würde Fokus/
        // Scrollposition der anderen Felder stören). Geheimnisse: Vorschau
        // nur befüllen, wenn gerade nicht verdeckt (siehe secretsBlurred).
        const preview = document.getElementById(`crBg-${key}-preview`);
        if (preview) {
          const blurred = key === 'secrets' && background.secretsHidden && !this._secretsRevealed;
          preview.innerHTML = (!blurred && field.value) ? Md.render(field.value) : '';
        }
      });
    });

    document.getElementById('secretsHiddenCb')?.addEventListener('change', function() {
      background.secretsHidden = this.checked;
      CareerBackground._secretsRevealed = false;
      Storage.saveCharacter(char);
      rerender();
    });

    document.getElementById('revealSecrets')?.addEventListener('click', () => {
      this._secretsRevealed = true;
      document.getElementById('secretsWrap')?.classList.remove('blurred');
      document.getElementById('revealSecrets')?.remove();
    });

    document.querySelectorAll('.cr-quote-del').forEach(btn => {
      btn.addEventListener('click', () => {
        background.quotes.splice(parseInt(btn.dataset.idx), 1);
        Storage.saveCharacter(char);
        rerender();
      });
    });

    document.getElementById('addQuoteBtn')?.addEventListener('click', () => {
      const input = document.getElementById('newQuoteInput');
      const val   = input?.value.trim();
      if (!val) return;
      background.quotes.push(val);
      Storage.saveCharacter(char);
      rerender();
    });

    document.getElementById('newQuoteInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('addQuoteBtn')?.click();
    });

    // ── Favoriten: Kontakte anklicken ────────────────────────────────────
    document.querySelectorAll('.cr-fav-row').forEach(row => {
      row.addEventListener('click', () => {
        NotesPage._activeTab = 'persons';
        NotesPage._detailId  = row.dataset.personid;
        App.switchPage('notes');
      });
    });

    document.getElementById('allContactsBtn')?.addEventListener('click', () => {
      NotesPage._activeTab = 'persons';
      NotesPage._detailId  = null;
      App.switchPage('notes');
    });
  },
};
