/**
 * MentionPopover – kompakte, direkt editierbare Karte für Personen, Orte und
 * Quests, die über der aktuellen Seite aufgeht statt dorthin zu springen
 * (Journal-Paket K2, siehe Todo.txt).
 *
 * Einstiege (verdrahtet in pages/notes.js):
 *   - Lesemodus: Tipp auf eine @-Erwähnung im Fließtext
 *   - Bearbeitungsmodus: Tipp auf einen Tag-Chip
 *   - automatisch nach Neuanlage über das Tag-Picker-Formular (isNew)
 *
 * Semantik (Konzept-Entscheidungen):
 *   - „Übernehmen" schreibt die Felder in den Eintrag (Autosave + Sync),
 *     „Abbrechen" verwirft sie. Tipp auf den Hintergrund/Escape = Abbrechen,
 *     mit Rückfrage nur wenn Feldänderungen vorliegen.
 *   - Nach einer Neuanlage verwirft Abbrechen NUR die Feldeingaben — der
 *     Eintrag selbst (samt Tag/Erwähnung) bleibt bestehen.
 *   - iPad/Desktop: öffnet unter dem Anker, flippt nach oben wenn unten zu
 *     wenig Platz ist. Schmale Screens (< 640 px): Bottom-Sheet.
 *
 * Während das Popover offen ist, überspringt der Sync-Poll Re-Renders
 * (App._isBusyEditing() prüft auf .mention-popover-backdrop).
 */
const MentionPopover = {
  _backdrop: null,
  _panel:    null,
  _ctx:      null,   // { type, id }
  _initial:  null,   // Feldwerte beim Öffnen (Dirty-Check)
  _onKey:    null,

  isOpen() { return !!this._backdrop; },

  _esc(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  open({ type, id, anchorEl = null, isNew = false }) {
    if (!['persons', 'locations', 'quests'].includes(type)) return;
    const char = App.currentCharacter;
    if (!char) return;
    const entry = NotesPage._findEntry(type, id, NotesPage._d(char));
    if (!entry || entry._deleted) return;

    this.close(); // evtl. offenes Popover still verwerfen

    const backdrop = document.createElement('div');
    backdrop.className = 'mention-popover-backdrop';
    const panel = document.createElement('div');
    panel.className = 'mention-popover';
    panel.innerHTML = this._formHtml(type, entry, char);
    backdrop.appendChild(panel);
    document.body.appendChild(backdrop);

    this._backdrop = backdrop;
    this._panel    = panel;
    this._ctx      = { type, id };
    this._initial  = JSON.stringify(this._readFields());

    // Orts-Popover: Besuchsdatum nur bei Status "Besucht" zeigen; beim
    // Umstellen auf "Besucht" leeres Datum vom aktiven Journal vorbelegen
    // (gleiche Regel wie im Orts-Formular, siehe CHANGELOG 3.10.0).
    const statusSel = panel.querySelector('#mpLocStatus');
    if (statusSel) {
      const syncVisited = (prefill) => {
        const row   = panel.querySelector('#mpVisitedRow');
        const input = panel.querySelector('#mpVisited');
        const on    = statusSel.value === 'visited';
        if (row) row.style.display = on ? '' : 'none';
        if (on && prefill && input && !input.value.trim()) {
          input.value = char.activeJournalDate() || '';
        }
      };
      syncVisited(false);
      statusSel.addEventListener('change', () => syncVisited(true));
    }

    panel.querySelector('.mp-apply').addEventListener('click', () => this._apply());
    panel.querySelector('.mp-cancel').addEventListener('click', () => this.close());
    backdrop.addEventListener('click', (e) => {
      if (e.target === backdrop) this._requestCancel();
    });
    this._onKey = (e) => { if (e.key === 'Escape') this._requestCancel(); };
    document.addEventListener('keydown', this._onKey);

    this._position(anchorEl);

    // Neuanlage: Fokus ins erste leere Feld, sonst kein Auto-Fokus (am iPad
    // würde sonst sofort die Tastatur aufgehen, obwohl man nur lesen will).
    if (isNew) {
      const empty = [...panel.querySelectorAll('input[type=text], textarea')]
        .find(el => !el.value.trim());
      (empty || panel.querySelector('input, select, textarea'))?.focus();
    }
  },

  close() {
    if (!this._backdrop) return;
    document.removeEventListener('keydown', this._onKey);
    this._backdrop.remove();
    this._backdrop = this._panel = this._ctx = this._initial = this._onKey = null;
  },

  _requestCancel() {
    const dirty = JSON.stringify(this._readFields()) !== this._initial;
    if (dirty && !confirm('Änderungen verwerfen?')) return;
    this.close();
  },

  // ── Formular ──────────────────────────────────────────────────────────────

  _formHtml(type, entry, char) {
    const e = (s) => this._esc(s);
    const opt = (val, cur, label) =>
      `<option value="${val}"${cur === val ? ' selected' : ''}>${label}</option>`;

    let fields = '';
    if (type === 'persons') {
      const race = entry.race || 'Mensch';
      fields = `
        <div class="form-group"><label>Name</label>
          <input type="text" id="mpName" value="${e(entry.name)}"></div>
        <div class="mp-row">
          <div class="form-group"><label>Rasse</label>
            <select id="mpRace">
              ${['Mensch','Vargr','Aslan','Zhodani','Droyne','Hiver',"K'kree",'Sonstige']
                .map(r => opt(r, race, r)).join('')}
            </select></div>
          <div class="form-group"><label>Rolle</label>
            <input type="text" id="mpRole" value="${e(entry.role)}" placeholder="z.B. Händler, Informant"></div>
        </div>
        <div class="mp-row">
          <div class="form-group"><label>Beziehung</label>
            <select id="mpRelation">
              ${opt('friendly', entry.relation || 'neutral', 'Freundlich')}
              ${opt('neutral',  entry.relation || 'neutral', 'Neutral')}
              ${opt('hostile',  entry.relation || 'neutral', 'Feindlich')}
            </select></div>
          <div class="form-group"><label>Status</label>
            <select id="mpStatus">
              ${opt('alive',   entry.status || 'alive', 'Lebendig')}
              ${opt('dead',    entry.status || 'alive', 'Tot')}
              ${opt('unknown', entry.status || 'alive', 'Unbekannt')}
            </select></div>
        </div>
        <div class="form-group"><label>Beschreibung</label>
          <textarea id="mpDesc" rows="4" placeholder="Aussehen, Eigenheiten, wichtige Infos …">${e(entry.description)}</textarea></div>`;
    } else if (type === 'locations') {
      fields = `
        <div class="form-group"><label>Name</label>
          <input type="text" id="mpName" value="${e(entry.name)}"></div>
        <div class="mp-row">
          <div class="form-group"><label>Sektor / Subsektor</label>
            <input type="text" id="mpSector" value="${e(entry.sector)}" placeholder="z.B. Trojan Reach"></div>
          <div class="form-group"><label>UWP</label>
            <input type="text" id="mpUwp" value="${e(entry.uwp)}" placeholder="z.B. A867954-B" style="font-family:monospace;"></div>
        </div>
        <div class="mp-row">
          <div class="form-group"><label>Status</label>
            <select id="mpLocStatus">
              ${opt('visited', entry.status || 'known', 'Besucht')}
              ${opt('known',   entry.status || 'known', 'Bekannt')}
              ${opt('rumor',   entry.status || 'known', 'Gerücht')}
            </select></div>
          <div class="form-group" id="mpVisitedRow"><label>Besucht am (In-Game)</label>
            <input type="text" id="mpVisited" value="${e(entry.visitedDate)}" placeholder="z.B. 1105-03"></div>
        </div>
        <div class="form-group"><label>Beschreibung</label>
          <textarea id="mpDesc" rows="4" placeholder="Was macht diesen Ort aus?">${e(entry.description)}</textarea></div>`;
    } else {
      fields = `
        <div class="form-group"><label>Titel</label>
          <input type="text" id="mpName" value="${e(entry.title)}"></div>
        <div class="form-group"><label>Ziel</label>
          <textarea id="mpObjective" rows="2" placeholder="Was muss erreicht werden?">${e(entry.objective)}</textarea></div>
        <div class="mp-row">
          <div class="form-group"><label>Belohnung</label>
            <input type="text" id="mpReward" value="${e(entry.reward)}" placeholder="z.B. 10.000 Cr"></div>
          <div class="form-group"><label>Status</label>
            <select id="mpStatus">
              ${opt('active',    entry.status || 'active', 'Aktiv')}
              ${opt('backlog',   entry.status || 'active', 'Backlog')}
              ${opt('completed', entry.status || 'active', 'Abgeschlossen')}
              ${opt('failed',    entry.status || 'active', 'Gescheitert')}
            </select></div>
        </div>`;
    }

    return `
      <div class="mp-arrow"></div>
      ${fields}
      <div class="mp-actions">
        <button class="mp-apply btn-success">Übernehmen</button>
        <button class="mp-cancel btn-secondary">Abbrechen</button>
      </div>`;
  },

  _readFields() {
    const p = this._panel;
    if (!p) return {};
    const val = (sel) => p.querySelector(sel)?.value;
    const { type } = this._ctx || {};
    if (type === 'persons') {
      return {
        name:        val('#mpName')?.trim() || '',
        race:        val('#mpRace'),
        role:        val('#mpRole')?.trim() || '',
        relation:    val('#mpRelation'),
        status:      val('#mpStatus'),
        description: val('#mpDesc') || '',
      };
    }
    if (type === 'locations') {
      return {
        name:        val('#mpName')?.trim() || '',
        sector:      val('#mpSector')?.trim() || '',
        uwp:         val('#mpUwp')?.trim() || '',
        status:      val('#mpLocStatus'),
        visitedDate: val('#mpVisited')?.trim() || '',
        description: val('#mpDesc') || '',
      };
    }
    return {
      title:     val('#mpName')?.trim() || '',
      objective: val('#mpObjective') || '',
      reward:    val('#mpReward')?.trim() || '',
      status:    val('#mpStatus'),
    };
  },

  _apply() {
    const char = App.currentCharacter;
    const { type, id } = this._ctx || {};
    if (!char || !type) { this.close(); return; }

    const data = NotesPage._d(char);
    let entry = (data[type] || []).find(x => String(x.id) === String(id));
    if (!entry) {
      // Fremder Kampagnen-Eintrag: unter derselben id lokal übernehmen —
      // gleiches Muster wie NotesPage.save() beim Bearbeiten fremder Einträge.
      const foreign = NotesPage._findEntry(type, id, data);
      if (!foreign) { this.close(); return; }
      entry = { ...foreign };
      delete entry._fromCampaign;
      data[type].push(entry);
    }

    const values  = this._readFields();
    const nameKey = type === 'quests' ? 'title' : 'name';
    if (!values[nameKey]) delete values[nameKey]; // leerer Name überschreibt nicht
    Object.assign(entry, values);
    entry.updatedAt = new Date().toISOString();
    char.notes = data;
    NotesPage._saveAndSync(char);
    this.close();

    if (App.editMode) {
      // Kein Full-Rerender: der würde offene Formulareingaben (Bericht!)
      // wegwerfen. Nur sichtbare Chip-Beschriftungen nachziehen.
      document.querySelectorAll(`.tp-chip[data-type="${type}"]`).forEach(chip => {
        if (String(chip.dataset.id) !== String(id)) return;
        const rm = chip.querySelector('.chip-rm');
        chip.textContent = '';
        chip.append(entry[nameKey] || '');
        if (rm) chip.appendChild(rm);
      });
    } else {
      App.renderCurrentPage();
    }
    App.showStatus('Gespeichert ✓', 'success');
  },

  // ── Positionierung ────────────────────────────────────────────────────────

  _position(anchorEl) {
    const panel = this._panel;

    // Schmale Screens: Bottom-Sheet statt Popover.
    if (window.innerWidth < 640) {
      panel.classList.add('mp-sheet');
      return;
    }

    const w = panel.offsetWidth;
    const h = panel.offsetHeight;
    const margin = 8;

    if (!anchorEl || !anchorEl.getBoundingClientRect) {
      panel.style.left = `${Math.max(margin, (window.innerWidth - w) / 2)}px`;
      panel.style.top  = `${Math.max(margin, (window.innerHeight - h) / 2)}px`;
      return;
    }

    const r = anchorEl.getBoundingClientRect();
    const spaceBelow = window.innerHeight - r.bottom;
    const openBelow  = spaceBelow >= h + margin * 2 || spaceBelow >= r.top;

    const left = Math.min(Math.max(margin, r.left), Math.max(margin, window.innerWidth - w - margin));
    const top  = openBelow
      ? Math.min(r.bottom + margin, window.innerHeight - h - margin)
      : Math.max(margin, r.top - h - margin);

    panel.style.left = `${left}px`;
    panel.style.top  = `${Math.max(margin, top)}px`;
    panel.classList.add(openBelow ? 'mp-below' : 'mp-above');

    // Pfeilspitze horizontal auf die Anker-Mitte ausrichten.
    const arrow = panel.querySelector('.mp-arrow');
    if (arrow) {
      const ax = Math.min(Math.max(r.left + r.width / 2 - left - 6, 14), w - 26);
      arrow.style.left = `${ax}px`;
    }
  },
};
