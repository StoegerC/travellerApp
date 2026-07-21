/**
 * Notizen – Session Journal · Personen · Orte · Quests
 *
 * Navigationsmodell:
 *   _activeTab   : 'sessions' | 'persons' | 'locations' | 'quests'
 *   _detailId    : null (Liste) | 'new' (Neu-Formular) | '<id>' (Detailansicht)
 *   _editTags    : { persons:[], locations:[], quests:[], events:[] }
 *                  temporärer Zustand während der Session-Bearbeitung
 */
const NotesPage = {
  _activeTab:       'sessions',
  _detailId:        null,
  _editTags:        null,
  _prefillLocation: null,
  _notesSort:       { sessions: 'createdAt', persons: 'name', locations: 'name', quests: 'createdAt' },
  _notesDir:        { sessions: 'desc', persons: 'asc', locations: 'asc', quests: 'desc' },
  _questFilterVal:  'active',

  // Wie in Metadata._portraitSrc: bevorzugt die hochgeladene Datei, faellt auf
  // ein altes eingebettetes Base64-Bild zurueck (Altbestand bleibt sichtbar).
  _personImgSrc(p) {
    if (p.imageFileId) return FileSync.getUrl(p.imageFileId);
    return p.image || null;
  },

  // ─────────────────────────────── Datenzugriff ────────────────────────────
  // Roh-Zugriff (inkl. Tombstones) – nötig für save(), damit gelöschte
  // Einträge beim Zurückschreiben nicht aus character.notes verschwinden.
  _d(char) {
    const n = char.notes || {};
    return {
      sessions:  Array.isArray(n.sessions)  ? n.sessions  : [],
      persons:   Array.isArray(n.persons)   ? n.persons   : [],
      locations: Array.isArray(n.locations) ? n.locations : [],
      quests:    Array.isArray(n.quests)    ? n.quests    : []
    };
  },

  // Für die Anzeige: Tombstones (_deleted) ausgeblendet. Wird nur beim
  // Rendern verwendet, nie beim Schreiben.
  _dVisible(char) {
    const raw = this._d(char);
    return {
      sessions:  raw.sessions.filter(x => !x._deleted),
      persons:   raw.persons.filter(x => !x._deleted),
      locations: raw.locations.filter(x => !x._deleted),
      quests:    raw.quests.filter(x => !x._deleted),
    };
  },

  // Sucht einen Eintrag zuerst lokal, sonst im geteilten Kampagnen-Pool -
  // Kampagnen-Inhalte sind gemeinschaftlich: jedes Mitglied darf auch fremde
  // Einträge öffnen/bearbeiten/löschen (nicht nur seine eigenen). Beim
  // Speichern übernimmt save() den fremden Eintrag unter derselben id in die
  // eigene lokale Liste, siehe dortigen Kommentar.
  _findEntry(tab, id, data) {
    const local = (data[tab] || []).find(x => String(x.id) === String(id));
    if (local) return local;
    const campNotes = App._campaignData?.notes || {};
    return (campNotes[tab] || []).find(x => String(x.id) === String(id)) || null;
  },

  // Einträge aus dem geteilten Kampagnen-Pool die lokal noch nicht vorhanden sind
  _extEntries(tab) {
    const char = App.currentCharacter;
    if (!char?.campaignId || !App._campaignData) return [];
    const campNotes = App._campaignData.notes || {};
    const localIds  = new Set((char.notes?.[tab] || []).map(e => e.id));
    return (campNotes[tab] || [])
      .filter(e => !localIds.has(e.id) && !e._deleted)
      .map(e => ({ ...e, _fromCampaign: true }));
  },

  _activeSession(data) {
    return data.sessions.find(s => s.isActive) || null;
  },

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  _fmtTs(iso) {
    if (!iso) return '';
    try { return new Date(iso).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
    catch { return iso; }
  },

  _sortedList(items, tab) {
    const sort = this._notesSort[tab] || 'createdAt';
    const mul  = (this._notesDir[tab] || 'desc') === 'asc' ? 1 : -1;
    return [...items].sort((a, b) => {
      if (sort === 'name') {
        return (a.name || a.title || '').localeCompare(b.name || b.title || '') * mul;
      }
      if (sort === 'visitedDate') {
        const da = a.visitedDate || '', db = b.visitedDate || '';
        if (!da && !db) return 0;
        if (!da) return 1; if (!db) return -1;
        return da.localeCompare(db) * mul;
      }
      if (sort === 'title') return (a.title || a.name || '').localeCompare(b.title || b.name || '') * mul;
      if (sort === 'inGameDate') {
        const da = a.inGameDate || a.visitedDate || '', db = b.inGameDate || b.visitedDate || '';
        if (!da && !db) return 0; if (!da) return mul; if (!db) return -mul;
        return da.localeCompare(db) * mul;
      }
      if (sort === 'sessionDate') {
        const da = a.sessionDate || '', db = b.sessionDate || '';
        if (!da && !db) return 0; if (!da) return mul; if (!db) return -mul;
        return da.localeCompare(db) * mul;
      }
      if (sort === 'isCampaign') return ((a.isCampaign ? 1 : 0) - (b.isCampaign ? 1 : 0)) * mul;
      const ca = a.createdAt || a.id || '', cb = b.createdAt || b.id || '';
      return (ca > cb ? 1 : ca < cb ? -1 : 0) * mul;
    });
  },

  _sortChips(tab, options) {
    const cur = this._notesSort[tab] || options[0].value;
    const dir = this._notesDir[tab] || 'desc';
    return `<div class="sort-row">
      ${options.map(o =>
        `<button class="sort-chip${cur === o.value ? ' active' : ''}" data-tab="${tab}" data-sort="${o.value}">${o.label}</button>`
      ).join('')}
      <div class="sort-dir-btns">
        <button class="sort-dir-btn${dir === 'asc' ? ' active' : ''}" data-tab="${tab}" data-dir="asc" title="Aufsteigend">↑</button>
        <button class="sort-dir-btn${dir === 'desc' ? ' active' : ''}" data-tab="${tab}" data-dir="desc" title="Absteigend">↓</button>
      </div>
    </div>`;
  },

  _th(tab, sort, label, cls = '') {
    if (!sort) return `<th class="nt-col-head${cls ? ' '+cls : ''}">${label}</th>`;
    const active = this._notesSort[tab] === sort;
    const dir    = active ? (this._notesDir[tab] || 'asc') : '';
    const arrow  = active ? (dir === 'asc' ? ' ↑' : ' ↓') : ' ↕';
    return `<th class="nt-col-head nt-sortable${active ? ' nt-sort-active' : ''}${cls ? ' '+cls : ''}" data-tab="${tab}" data-sort="${sort}">${label}${arrow}</th>`;
  },

  // ─────────────────────────────── Haupt-Render ────────────────────────────
  render(character) {
    const data = this._dVisible(character);
    let html = '<h2>Log</h2>';
    html += this._subTabs(data);

    switch (this._activeTab) {
      case 'sessions':
        html += this._detailId
          ? this._sessionDetail(this._detailId, data)
          : this._sessionList(data);
        break;
      case 'persons':
        html += this._detailId
          ? this._personDetail(this._detailId, data)
          : this._personList(data);
        break;
      case 'locations':
        html += this._detailId
          ? this._locationDetail(this._detailId, data)
          : this._locationList(data);
        break;
      case 'quests':
        html += this._detailId
          ? this._questDetail(this._detailId, data)
          : this._questList(data);
        break;
    }
    return html;
  },

  _subTabs(data) {
    const tabs = [
      { id: 'sessions',  label: '📜 Journal',  count: data.sessions.length  },
      { id: 'persons',   label: '👥 Personen', count: data.persons.length   },
      { id: 'locations', label: '🌍 Orte',     count: data.locations.length },
      { id: 'quests',    label: '⚔️ Quests',   count: data.quests.length    },
    ];
    let html = '<div class="notes-subtabs">';
    tabs.forEach(t => {
      const active = this._activeTab === t.id ? ' active' : '';
      html += `<button class="notes-subtab-btn${active}" data-tab="${this._esc(t.id)}">
        ${t.label}${t.count !== null ? `<span class="subtab-count">${t.count}</span>` : ''}
      </button>`;
    });
    html += '</div>';
    return html;
  },

  // ─────────────────────────── SESSION JOURNAL ─────────────────────────────
  // Case-insensitiv dedupliziert (Map nach Kleinschreibung), erste gesehene
  // Schreibweise wird als Anzeigetext/Filterwert verwendet - sonst zaehlen
  // "Kampf" und "kampf" als zwei getrennte Filter-Optionen.
  _usedEventTags(data) {
    const map = new Map();
    data.sessions.flatMap(s => s.tags?.events || []).forEach(e => {
      const key = e.toLowerCase();
      if (!map.has(key)) map.set(key, e);
    });
    return [...map.values()];
  },

  _sessionList(data) {
    const usedPersonIds   = new Set(data.sessions.flatMap(s => s.tags?.persons   || []));
    const usedLocationIds = new Set(data.sessions.flatMap(s => s.tags?.locations || []));
    const filterPersons   = data.persons.filter(p => usedPersonIds.has(p.id));
    const filterLocations = data.locations.filter(l => usedLocationIds.has(l.id));
    const filterEvents    = this._usedEventTags(data);

    let html = `<div class="notes-list-header">
      <div class="person-search-row">
        <input type="text" id="sessionSearch" class="notes-search" placeholder="Sessions durchsuchen …">
        <button id="addSessionBtn" class="btn-success">+ Session</button>
      </div>
      ${filterPersons.length || filterLocations.length || filterEvents.length ? `
      <div class="session-filter-group">
        <span class="session-filter-label">Filter</span>
        <div class="session-filter-fields">
          ${filterPersons.length ? `<select id="filterSessionPerson">
            <option value="">Alle Personen</option>
            ${filterPersons.map(p => `<option value="${this._esc(p.id)}">${this._esc(p.name)}</option>`).join('')}
          </select>` : ''}
          ${filterLocations.length ? `<select id="filterSessionLocation">
            <option value="">Alle Orte</option>
            ${filterLocations.map(l => `<option value="${this._esc(l.id)}">${this._esc(l.name)}</option>`).join('')}
          </select>` : ''}
          ${filterEvents.length ? `<select id="filterSessionEvent">
            <option value="">Alle Events</option>
            ${filterEvents.map(e => `<option value="${this._esc(e)}">${this._esc(e)}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>` : ''}
    </div><div class="notes-table-wrap"><table class="notes-table" id="sessionList">
      <thead><tr>
        ${this._th('sessions','inGameDate','In-Game','nt-date-col')}
        ${this._th('sessions','title','Titel')}
        <th class="nt-col-head nt-detail-head">Detail</th>
        ${this._th('sessions','isCampaign','🏕','nt-camp-col')}
        ${this._th('sessions','sessionDate','Real','nt-date-col')}
        ${this._th('sessions','createdAt','Erstellt','nt-date-col')}
      </tr></thead>
      <tbody>`;

    if (data.sessions.length === 0 && this._extEntries('sessions').length === 0) {
      html += `<tr><td colspan="6" class="nt-empty">Noch keine Session eingetragen. Tippe auf „+ Session".</td></tr>`;
    } else {
      this._sortedList(data.sessions, 'sessions').forEach(s => {
        const events   = (s.tags?.events || []).join(', ');
        const tagCount = (s.tags?.persons?.length||0)+(s.tags?.locations?.length||0)+(s.tags?.quests?.length||0);
        const detail   = [events, tagCount ? `+${tagCount} Verknüpf.` : ''].filter(Boolean).join(' · ');
        const personIds   = (s.tags?.persons   || []).join(' ');
        const locationIds = (s.tags?.locations || []).join(' ');
        html += `<tr class="notes-list-item" data-id="${this._esc(s.id)}"
                  data-personids="${this._esc(personIds)}"
                  data-locationids="${this._esc(locationIds)}">
          <td class="nt-date-col">${this._esc(s.inGameDate || '')}</td>
          <td><span class="nli-title-inline">${this._esc(s.title || 'Ohne Titel')}</span>${s.isActive ? ' <span class="session-active-badge">Aktiv</span>' : ''}</td>
          <td class="nt-detail-col">${this._esc(detail)}</td>
          <td class="nt-camp-col">${s.isCampaign ? '🏕' : ''}</td>
          <td class="nt-date-col">${this._esc(s.sessionDate || '')}</td>
          <td class="nt-date-col nt-created">${(s.createdAt||'').slice(0,10)}</td>
        </tr>`;
      });
      this._extEntries('sessions').forEach(s => {
        html += `<tr class="camp-ext-row notes-list-item" data-id="${this._esc(s.id)}">
          <td class="nt-date-col">${this._esc(s.inGameDate || '')}</td>
          <td><span class="nli-title-inline">${this._esc(s.title || 'Ohne Titel')}</span></td>
          <td class="nt-detail-col"></td>
          <td class="nt-camp-col">🏕</td>
          <td class="nt-date-col">${this._esc(s.sessionDate || '')}</td>
          <td></td>
        </tr>`;
      });
    }
    html += '</tbody></table></div>';
    return html;
  },

  _sessionDetail(id, data) {
    const isNew = id === 'new';
    const s = isNew
      ? { id: 'new', title: '', sessionDate: '', inGameDate: '', content: '', tags: { persons: [], locations: [], quests: [], events: [] } }
      : this._findEntry('sessions', id, data);
    if (!s) return '<p class="notes-empty">Session nicht gefunden.</p>';

    // Init edit tags when entering edit for first time
    if (App.editMode && !this._editTags) {
      this._editTags = JSON.parse(JSON.stringify(s.tags || { persons: [], locations: [], quests: [], events: [] }));
    }
    if (App.editMode && !this._editAttachments) {
      this._editAttachments = JSON.parse(JSON.stringify(s.attachments || []));
    }

    const tags = App.editMode ? this._editTags : (s.tags || {});
    const taggedPersons   = (tags.persons   || []).map(pid => data.persons.find(p => p.id === pid)).filter(Boolean);
    const taggedLocations = (tags.locations || []).map(lid => data.locations.find(l => l.id === lid)).filter(Boolean);
    const taggedQuests    = (tags.quests    || []).map(qid => data.quests.find(q => q.id === qid)).filter(Boolean);
    const taggedEvents    = tags.events || [];

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew ? `<button class="btn-session-active${s.isActive ? ' is-active' : ''}" id="setActiveSessionBtn" data-id="${this._esc(s.id)}">
          ${s.isActive ? '● Aktiv' : 'Aktiv schalten'}
        </button>` : ''}
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${this._esc(s.id)}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      // ── Edit-Formular ──
      html += `
        <div class="session-form">
          <div class="session-form-dates">
            <div class="form-group">
              <label>Datum der Session</label>
              <input type="date" id="sessionDate" value="${this._esc(s.sessionDate)}">
            </div>
            <div class="form-group">
              <label>In-Game-Datum${App._calendar().label ? ` (${this._esc(App._calendar().label)})` : ''}</label>
              ${App._calendar().renderInput('sessionIngameDate', s.inGameDate || '')}
            </div>
            <div class="form-group">
              <label>Erstellt am</label>
              <input type="datetime-local" id="entryCreatedAt" value="${s.createdAt ? this._esc(s.createdAt.slice(0,16)) : new Date().toISOString().slice(0,16)}">
            </div>
          </div>
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="sessionTitle" value="${this._esc(s.title)}" placeholder="Sessionsname">
          </div>

          <div class="form-group">
            <label>Bericht</label>
            <div class="loc-name-wrap">
              <textarea id="sessionContent" rows="14" placeholder="Bericht … ('@' verlinkt Personen/Orte/Quests)">${this._esc(s.content || '')}</textarea>
              <div id="sessionMentionSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · - Liste · | Tabelle | · @ verlinkt Personen/Orte/Quests</span>
          </div>

          <div class="form-group">
            <label>Anhänge (PDF)</label>
            <div id="sessionAttachmentsList" class="attachment-list">
              ${(this._editAttachments || []).length
                ? this._editAttachments.map(a => `
                    <span class="attachment-chip" data-id="${this._esc(a.id)}">
                      📄 ${this._esc(a.filename)}
                      <button class="attachment-rm-btn" data-id="${this._esc(a.id)}" title="Anhang entfernen">×</button>
                    </span>`).join('')
                : '<span class="attachments-empty-hint">Keine Anhänge</span>'}
            </div>
            <label for="sessionAttachmentUpload" class="btn-secondary attachment-upload-btn">+ PDF hinzufügen</label>
            <input type="file" id="sessionAttachmentUpload" accept="application/pdf" style="display:none;">
          </div>

          <div class="tag-section">
            <h4>Tags</h4>
            ${this._tagPicker('persons',   taggedPersons,   data.persons,   'Personen')}
            ${this._tagPicker('locations', taggedLocations, data.locations, 'Orte')}
            ${this._tagPicker('quests',    taggedQuests,    data.quests,    'Quests')}
            <div class="form-group" style="margin-top:10px;">
              <label>Ereignis-Tags</label>
              <div class="event-tags-chips" id="eventTagsChips">
                ${taggedEvents.map(e => `<span class="tag-chip event-chip">${this._esc(e)}<button class="chip-rm-event" data-event="${this._esc(e)}">×</button></span>`).join('')}
              </div>
              <div class="event-input-row">
                <input type="text" id="eventTagInput" placeholder="Tag eingeben + Enter (z.B. Kampf, Handel)">
                <button id="addEventTagBtn" class="btn-secondary">+</button>
              </div>
            </div>
          </div>

          ${App.currentCharacter?.campaignId ? `
          <div class="form-group">
            <label class="camp-share-label">
              <input type="checkbox" id="entryCampaignToggle" ${(isNew || s.isCampaign) ? 'checked' : ''}>
              <span>🏕 In Kampagne teilen</span>
            </label>
          </div>` : ''}
          <div class="detail-form-actions">
            <button id="saveDetailBtn" class="btn-primary">${isNew ? 'Erstellen' : 'Speichern'}</button>
            <button id="backBtn2" class="btn-secondary">Abbrechen</button>
          </div>
        </div>`;
    } else {
      // ── Leseansicht ──
      html += `
        <div class="session-view">
          <div class="session-view-header">
            <h3>${this._esc(s.title || 'Ohne Titel')}</h3>
            <div class="session-view-dates">
              ${s.sessionDate ? `<span>📅 ${this._esc(s.sessionDate)}</span>` : ''}
              ${s.inGameDate  ? `<span>🗓 ${this._esc(s.inGameDate)}</span>` : ''}
            </div>
          </div>
          <div class="md-content">${s.content ? Md.render(s.content) : '<em>Kein Inhalt</em>'}</div>
          ${s.attachments?.length ? `
            <div class="attachment-list">
              ${s.attachments.map(a => `
                <a href="${this._esc(FileSync.getUrl(a.id))}" target="_blank" rel="noopener" class="attachment-chip attachment-link">
                  📄 ${this._esc(a.filename)}
                </a>`).join('')}
            </div>` : ''}
          ${taggedEvents.length ? `<div class="session-events">${taggedEvents.map(e => `<span class="tag-chip event-chip">${this._esc(e)}</span>`).join('')}</div>` : ''}
          ${taggedPersons.length || taggedLocations.length || taggedQuests.length ? `
            <div class="session-links">
              ${taggedPersons.length ? `<div class="session-link-group"><strong>Personen:</strong>
                ${taggedPersons.map(p => `<span class="link-chip pop-chip person-link" data-tab="persons" data-id="${this._esc(p.id)}">${this._esc(p.name)}</span>`).join('')}
              </div>` : ''}
              ${taggedLocations.length ? `<div class="session-link-group"><strong>Orte:</strong>
                ${taggedLocations.map(l => `<span class="link-chip pop-chip location-link" data-tab="locations" data-id="${this._esc(l.id)}">${this._esc(l.name)}</span>`).join('')}
              </div>` : ''}
              ${taggedQuests.length ? `<div class="session-link-group"><strong>Quests:</strong>
                ${taggedQuests.map(q => `<span class="link-chip pop-chip quest-link" data-tab="quests" data-id="${this._esc(q.id)}">${this._esc(q.title)}</span>`).join('')}
              </div>` : ''}
            </div>` : ''}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ─────────────────────────── PERSONEN-DATENBANK ──────────────────────────
  _personList(data) {
    const locationOpts = [
      { v: '', l: 'Alle Orte' },
      ...data.locations.map(l => ({ v: l.id, l: l.name || '(Kein Name)' }))
    ];

    let html = `<div class="person-list-header">
      <div class="person-search-row">
        <input type="text" id="personSearch" class="notes-search" placeholder="Personen suchen …">
        <button id="addPersonBtn" class="btn-success">+ Person</button>
      </div>
      <div class="session-filter-group">
        <span class="session-filter-label">Filter</span>
        <div class="session-filter-fields">
          <select id="filterPersonRelation">
            <option value="">Alle Beziehungen</option>
            <option value="friendly">Freundlich</option>
            <option value="neutral">Neutral</option>
            <option value="hostile">Feindlich</option>
          </select>
          ${data.locations.length ? `<select id="filterLocation">
            ${locationOpts.map(o => `<option value="${this._esc(o.v)}">${this._esc(o.l)}</option>`).join('')}
          </select>` : ''}
        </div>
      </div>
      <div class="pf-row">
        ${this._sortChips('persons', [{ value: 'name', label: 'Name' }, { value: 'createdAt', label: 'Erstellungsdatum' }])}
      </div>
    </div>`;

    if (data.persons.length === 0 && this._extEntries('persons').length === 0) {
      html += '<p class="notes-empty">Noch keine Personen eingetragen.</p>';
    } else {
      html += '<div class="person-card-grid" id="personList">';
      this._sortedList(data.persons, 'persons').forEach(p => {
        const sessCount = data.sessions.filter(s => s.tags?.persons?.includes(p.id)).length;
        const personLocs = (p.locationIds || []).map(lid => data.locations.find(l => l.id === lid)).filter(Boolean);
        const meta = [
          personLocs.length ? `📍 ${personLocs.map(l => this._esc(l.name)).join(', ')}` : '',
          sessCount ? `${sessCount} Session${sessCount !== 1 ? 's' : ''}` : ''
        ].filter(Boolean).join(' · ');

        html += `
          <div class="person-card notes-list-item person-list-item"
               data-id="${this._esc(p.id)}"
               data-name="${this._esc(p.name).toLowerCase()}"
               data-status="${this._esc(p.status || '')}"
               data-relation="${this._esc(p.relation || '')}"
               data-locationids="${this._esc((p.locationIds || []).join(' '))}">
            <button class="pcard-fav person-fav-btn${p.isFavorite ? ' active' : ''}" data-personid="${this._esc(p.id)}" title="Favorit">
              ${p.isFavorite ? '⭐' : '☆'}
            </button>
            <div class="pcard-img">
              ${this._personImgSrc(p)
                ? `<img src="${this._esc(this._personImgSrc(p))}" class="pcard-avatar-img">`
                : `<span class="pcard-avatar-ph">👤</span>`}
            </div>
            <div class="pcard-body">
              <div class="pcard-name">${this._esc(p.name || '(Kein Name)')}</div>
              ${p.role ? `<div class="pcard-role">${this._esc(p.role)}</div>` : ''}
              <div class="pcard-badges">
                <span class="status-badge status-${this._esc(p.status || 'unknown')}">${this._statusLabel(p.status)}</span>
                <span class="relation-badge rel-${this._esc(p.relation || 'neutral')}">${this._relationLabel(p.relation)}</span>
              </div>
              ${meta ? `<div class="pcard-meta">${meta}</div>` : ''}
              ${p.isCampaign ? '<div class="pcard-meta"><span class="camp-share-badge" title="In Kampagne geteilt">🏕 Kampagne</span></div>' : ''}
            </div>
          </div>`;
      });
      html += '</div>';
      const extPersons = this._extEntries('persons');
      if (extPersons.length) {
        html += `<div class="camp-ext-section"><span class="camp-ext-label">🏕 Von Mitspielern</span><div class="person-card-grid">`;
        extPersons.forEach(p => {
          html += `<div class="camp-ext-entry pcard-ext person-card notes-list-item" data-id="${this._esc(p.id)}">
            <span class="pcard-name">${this._esc(p.name || '(Kein Name)')}</span>
            ${p.role ? `<span class="pcard-role">${this._esc(p.role)}</span>` : ''}
          </div>`;
        });
        html += '</div></div>';
      }
    }
    return html;
  },

  _personDetail(id, data) {
    const isNew = id === 'new';
    const p = isNew
      ? { id: 'new', name: '', role: '', description: '', status: 'alive', relation: 'neutral', image: null, locationIds: [],
          ...App._extraFieldDefaults('persons') }
      : this._findEntry('persons', id, data);
    if (!p) return '<p class="notes-empty">Person nicht gefunden.</p>';

    window._personCurrentImage       = undefined; // Altbestand-Bridge: undefined = unveraendert; null = entfernt; string = neu gesetzt (Base64, Fallback wenn Upload fehlschlaegt)
    window._personCurrentImageFileId = undefined; // gleiches Muster fuer die hochgeladene Datei-ID (Phase 2)

    // Init Orts-Verknuepfungs-Staging beim ersten Betreten des Bearbeitungsmodus
    if (App.editMode && !this._editPersonLinks) {
      this._editPersonLinks = { locations: [...(p.locationIds || [])] };
    }
    const linkedLocationIds = App.editMode ? (this._editPersonLinks?.locations || []) : (p.locationIds || []);
    const linkedLocationObjs = linkedLocationIds.map(lid => data.locations.find(l => l.id === lid)).filter(Boolean);

    const linkedSessions = data.sessions.filter(s => s.tags?.persons?.includes(p.id));

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${this._esc(p.id)}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      html += `
        <div class="detail-form">
          <div class="person-edit-layout">
            <div class="person-edit-image">
              <div id="personImgPreview" class="person-img-wrap">
                ${this._personImgSrc(p)
                  ? `<img src="${this._esc(this._personImgSrc(p))}" class="person-img-edit">`
                  : `<div class="person-img-placeholder">👤</div>`}
              </div>
              <label for="personImgUpload" class="person-img-upload-btn">Bild wählen</label>
              <input type="file" id="personImgUpload" accept="image/*" style="display:none;">
              ${this._personImgSrc(p) ? `<button id="personImgRemove" class="person-img-remove-btn">Bild entfernen</button>` : ''}
            </div>
            <div class="person-edit-fields">
              <div class="form-group"><label>Name</label>
                <input type="text" id="personName" value="${this._esc(p.name)}" placeholder="Name der Person">
              </div>
              <div class="form-group"><label>Rolle / Beruf</label>
                <input type="text" id="personRole" value="${this._esc(p.role)}" placeholder="z.B. Händler, Offizier, Informant">
              </div>
              <div class="detail-form-row">
                <div class="form-group">
                  <label>Status</label>
                  <select id="personStatus">
                    <option value="alive"   ${p.status === 'alive'   ? 'selected' : ''}>Lebendig</option>
                    <option value="dead"    ${p.status === 'dead'    ? 'selected' : ''}>Tot</option>
                    <option value="unknown" ${p.status === 'unknown' ? 'selected' : ''}>Unbekannt</option>
                  </select>
                </div>
                <div class="form-group">
                  <label>Beziehung</label>
                  <select id="personRelation">
                    <option value="friendly" ${p.relation === 'friendly' ? 'selected' : ''}>Freundlich</option>
                    <option value="neutral"  ${p.relation === 'neutral'  ? 'selected' : ''}>Neutral</option>
                    <option value="hostile"  ${p.relation === 'hostile'  ? 'selected' : ''}>Feindlich</option>
                  </select>
                </div>
                ${App._renderExtraFields('persons', p)}
              </div>
            </div>
          </div>
          ${this._tagPicker('locations', linkedLocationObjs, data.locations, 'Aufenthaltsorte', '_editPersonLinks')}
          <div class="form-group"><label>Beschreibung</label>
            <div class="loc-name-wrap">
              <textarea id="personDescription" rows="5" placeholder="Aussehen, Eigenheiten, wichtige Infos …">${this._esc(p.description)}</textarea>
              <div id="personDescriptionSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle | · @ verlinkt Personen/Orte/Quests/Journal</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${p.createdAt ? this._esc(p.createdAt.slice(0,16)) : new Date().toISOString().slice(0,16)}">
          </div>
          ${isNew ? (() => {
            const active = this._activeSession(data);
            return `<label class="link-session-row">
              <input type="checkbox" id="linkToSession"${active ? ' checked' : ' disabled'}>
              <span>Mit aktivem Journal verlinken${active
                ? ` <em class="link-session-name">${this._esc(active.title || 'Aktuelle Session')}</em>`
                : ' <em class="link-session-none">(keine aktive Session)</em>'}</span>
            </label>`;
          })() : ''}
          ${App.currentCharacter?.campaignId ? `
          <div class="form-group">
            <label class="camp-share-label">
              <input type="checkbox" id="entryCampaignToggle" ${(isNew || p.isCampaign) ? 'checked' : ''}>
              <span>🏕 In Kampagne teilen</span>
            </label>
          </div>` : ''}
          <div class="detail-form-actions">
            <button id="saveDetailBtn" class="btn-primary">${isNew ? 'Erstellen' : 'Speichern'}</button>
            <button id="backBtn2" class="btn-secondary">Abbrechen</button>
          </div>
        </div>`;
    } else {
      html += `
        <div class="person-view">
          <div class="person-view-header">
            ${this._personImgSrc(p) ? `<img src="${this._esc(this._personImgSrc(p))}" class="person-img-view">` : ''}
            <div class="person-view-meta">
              <h3>${this._esc(p.name || '(Kein Name)')}</h3>
              <div class="person-view-badges">
                <span class="status-badge status-${this._esc(p.status || 'unknown')}">${this._statusLabel(p.status)}</span>
                <span class="relation-badge rel-${this._esc(p.relation || 'neutral')}">${this._relationLabel(p.relation)}</span>
                ${linkedLocationObjs.map(loc => `<span class="link-chip location-link" data-tab="locations" data-id="${this._esc(loc.id)}">📍 ${this._esc(loc.name)}</span>`).join('')}
              </div>
              ${p.role ? `<p class="person-role"><em>${this._esc(p.role)}</em></p>` : ''}
              ${App._nonDefaultExtraFields('persons', p).map(f =>
                `<p class="entity-extra-badge">${this._esc(p[f.key])}</p>`).join('')}
            </div>
          </div>
          ${p.description ? `<div class="detail-desc md-content">${Md.render(p.description)}</div>` : ''}
          ${linkedSessions.length ? `
            <h4>Erscheint in Sessions</h4>
            <div class="linked-items">
              ${linkedSessions.map(s => `
                <span class="link-chip session-link" data-tab="sessions" data-id="${this._esc(s.id)}">
                  ${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}
                </span>`).join('')}
            </div>` : ''}
          ${NotesChronicle.render('persons', p.id)}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ─────────────────────────── ORTS-DATENBANK ──────────────────────────────
  _locationList(data) {
    // Saved worlds index for quick "already saved?" check in Travellermap results
    const savedIndex = new Set(
      data.locations.filter(l => l.mapSector && l.mapHex).map(l => `${l.mapSector}|${l.mapHex}`)
    );

    let html = `<div class="notes-list-header">
      <div class="person-search-row">
        <input type="text" id="locationSearch" class="notes-search" placeholder="Gespeicherte Orte filtern …">
        <button id="addLocationBtn" class="btn-success">+ Ort</button>
      </div>
      <div class="session-filter-group">
        <span class="session-filter-label">Filter</span>
        <div class="session-filter-fields">
          <select id="filterLocStatus">
            <option value="">Alle Status</option>
            <option value="visited">Besucht</option>
            <option value="known">Bekannt</option>
            <option value="rumor">Gerücht</option>
          </select>
        </div>
      </div>
    </div><div class="notes-table-wrap"><table class="notes-table" id="locationList">
      <thead><tr>
        ${this._th('locations','visitedDate','In-Game','nt-date-col')}
        ${this._th('locations','name','Name')}
        <th class="nt-col-head nt-detail-head">Sektor / UWP</th>
        ${this._th('locations','status','Status','nt-status-col')}
        ${this._th('locations','isCampaign','🏕','nt-camp-col')}
        ${this._th('locations','createdAt','Erstellt','nt-date-col')}
      </tr></thead>
      <tbody>`;

    if (data.locations.length === 0 && this._extEntries('locations').length === 0) {
      html += `<tr><td colspan="6" class="nt-empty">Noch keine Orte eingetragen.</td></tr>`;
    } else {
      this._sortedList(data.locations, 'locations').forEach(l => {
        const detail = [l.sector, l.uwp].filter(Boolean).join(' ');
        html += `<tr class="notes-list-item location-list-item" data-id="${this._esc(l.id)}"
                   data-name="${this._esc((l.name||'').toLowerCase())}"
                   data-locstatus="${this._esc(l.status || '')}">
          <td class="nt-date-col">${this._esc(l.visitedDate || '')}</td>
          <td>
            <span class="nli-title-inline">${this._esc(l.name || '(Kein Name)')}</span>
            ${l.mapX != null ? `<button class="loc-list-map-btn" data-locid="${this._esc(l.id)}" title="Auf Karte zeigen">🗺</button>` : ''}
          </td>
          <td class="nt-detail-col">${this._esc(detail)}</td>
          <td class="nt-status-col"><span class="loc-status-badge loc-${this._esc(l.status||'known')}">${this._locStatusLabel(l.status)}</span></td>
          <td class="nt-camp-col">${l.isCampaign ? '🏕' : ''}</td>
          <td class="nt-date-col nt-created">${(l.createdAt||'').slice(0,10)}</td>
        </tr>`;
      });
      this._extEntries('locations').forEach(l => {
        const detail = [l.sector, l.uwp].filter(Boolean).join(' ');
        html += `<tr class="camp-ext-row notes-list-item" data-id="${this._esc(l.id)}">
          <td></td>
          <td><span class="nli-title-inline">${this._esc(l.name || '(Kein Name)')}</span></td>
          <td class="nt-detail-col">${this._esc(detail)}</td>
          <td></td>
          <td class="nt-camp-col">🏕</td>
          <td></td>
        </tr>`;
      });
    }
    html += '</tbody></table></div>';
    return html;
  },

  _locationDetail(id, data) {
    const isNew = id === 'new';
    const prefill = isNew && this._prefillLocation ? this._prefillLocation : null;
    this._prefillLocation = null;
    const l = isNew
      ? { id: 'new', name: prefill?.name || '', sector: prefill?.sector || '', uwp: prefill?.uwp || '',
          description: '', notes: '', status: 'visited',
          visitedDate: App.currentCharacter?.activeJournalDate() || '',
          mapX: prefill?.mapX ?? null, mapY: prefill?.mapY ?? null,
          mapSector: prefill?.mapSector || null, mapHex: prefill?.mapHex || null }
      : this._findEntry('locations', id, data);
    if (!l) return '<p class="notes-empty">Ort nicht gefunden.</p>';

    const linkedSessions = data.sessions.filter(s => s.tags?.locations?.includes(l.id));
    const directPersons  = data.persons.filter(p => (p.locationIds || []).includes(l.id));
    const sessionPersonIds = data.sessions
      .filter(s => s.tags?.locations?.includes(l.id) && s.tags?.persons?.length)
      .flatMap(s => s.tags.persons)
      .filter((v, i, a) => a.indexOf(v) === i);
    const sessionPersons = sessionPersonIds
      .map(pid => data.persons.find(p => p.id === pid))
      .filter(Boolean)
      .filter(p => !directPersons.some(dp => dp.id === p.id));
    const linkedPersons = [...directPersons, ...sessionPersons];

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${this._esc(l.id)}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      const isLinked = l.mapX != null;
      html += `
        <div class="detail-form">
          <div class="form-group">
            <label>Ort</label>
            <div class="loc-name-wrap">
              <input type="search" id="locName" value="${this._esc(l.name)}" placeholder="Systemname suchen …" autocomplete="off" spellcheck="false">
              <div id="locNameSuggestions" class="loc-suggestions"></div>
            </div>
            ${isLinked ? `
              <div class="loc-map-badge" id="locMapBadge">
                🗺 Verknüpft: ${this._esc(l.mapSector || '')} ${this._esc(l.mapHex || '')}
                <button id="locMapUnlink" class="loc-map-unlink">× Entfernen</button>
              </div>` : ''}
            <input type="hidden" id="locMapX"      value="${this._esc(String(l.mapX ?? ''))}">
            <input type="hidden" id="locMapY"      value="${this._esc(String(l.mapY ?? ''))}">
            <input type="hidden" id="locMapSector" value="${this._esc(l.mapSector || '')}">
            <input type="hidden" id="locMapHex"    value="${this._esc(l.mapHex    || '')}">
          </div>
          <div class="detail-form-row">
            <div class="form-group"><label>Sektor / Subsector</label>
              <input type="text" id="locSector" value="${this._esc(l.sector)}" placeholder="z.B. Spinward Marches / Regina">
            </div>
            <div class="form-group"><label>UWP</label>
              <input type="text" id="locUwp" value="${this._esc(l.uwp)}" placeholder="z.B. A867954-B" style="font-family: monospace;">
            </div>
          </div>
          <div class="detail-form-row">
            <div class="form-group"><label>Status</label>
              <select id="locStatus">
                <option value="visited" ${l.status === 'visited' ? 'selected' : ''}>Besucht</option>
                <option value="known"   ${l.status === 'known'   ? 'selected' : ''}>Bekannt</option>
                <option value="rumor"   ${l.status === 'rumor'   ? 'selected' : ''}>Gerücht</option>
              </select>
            </div>
            <div class="form-group" id="visitedDateGroup" style="${l.status !== 'visited' ? 'display:none' : ''}">
              <label>Besuchsdatum${App._calendar().label ? ` (${this._esc(App._calendar().label)})` : ''}</label>
              ${App._calendar().renderInput('locVisitedDate', l.visitedDate || '')}
            </div>
          </div>
          <div class="form-group"><label>Beschreibung</label>
            <div class="loc-name-wrap">
              <textarea id="locDescription" rows="4" placeholder="Atmosphäre, Regierung, wichtige Orte …">${this._esc(l.description)}</textarea>
              <div id="locDescriptionSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle | · @ verlinkt Personen/Orte/Quests/Journal</span>
          </div>
          <div class="form-group"><label>Notizen</label>
            <div class="loc-name-wrap">
              <textarea id="locNotes" rows="3" placeholder="Persönliche Anmerkungen, Gerüchte, Kontakte …">${this._esc(l.notes)}</textarea>
              <div id="locNotesSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle | · @ verlinkt Personen/Orte/Quests/Journal</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${l.createdAt ? this._esc(l.createdAt.slice(0,16)) : new Date().toISOString().slice(0,16)}">
          </div>
          ${isNew ? (() => {
            const active = this._activeSession(data);
            return `<label class="link-session-row">
              <input type="checkbox" id="linkToSession"${active ? ' checked' : ' disabled'}>
              <span>Mit aktivem Journal verlinken${active
                ? ` <em class="link-session-name">${this._esc(active.title || 'Aktuelle Session')}</em>`
                : ' <em class="link-session-none">(keine aktive Session)</em>'}</span>
            </label>`;
          })() : ''}
          ${App.currentCharacter?.campaignId ? `
          <div class="form-group">
            <label class="camp-share-label">
              <input type="checkbox" id="entryCampaignToggle" ${(isNew || l.isCampaign) ? 'checked' : ''}>
              <span>🏕 In Kampagne teilen</span>
            </label>
          </div>` : ''}
          <div class="detail-form-actions">
            <button id="saveDetailBtn" class="btn-primary">${isNew ? 'Erstellen' : 'Speichern'}</button>
            <button id="backBtn2" class="btn-secondary">Abbrechen</button>
          </div>
        </div>`;
    } else {
      html += `
        <div class="location-view">
          <div class="location-view-header">
            <h3>${this._esc(l.name || '(Kein Name)')}</h3>
            <span class="loc-status-badge loc-${this._esc(l.status || 'known')}">${this._locStatusLabel(l.status)}</span>
          </div>
          <div class="loc-meta">
            ${l.sector ? `<span>📍 ${this._esc(l.sector)}</span>` : ''}
            ${l.visitedDate ? `<span>📅 ${this._esc(l.visitedDate)}</span>` : ''}
            ${l.mapX != null
              ? `<button class="btn-map-show" id="showOnMapBtn" data-locid="${this._esc(l.id)}">🗺 Auf Karte zeigen</button>`
              : ''}
          </div>
          ${l.uwp ? (() => {
            const uwp = this._decodeUWP(l.uwp);
            return `<div class="loc-uwp-block">
              <div class="loc-uwp-header">
                <span class="loc-uwp-label">Universal World Profile</span>
                <code class="loc-uwp-code">${this._esc(l.uwp)}</code>
              </div>
              ${uwp ? `<div class="loc-uwp-stats">
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">🚀</span><span class="loc-uwp-key">Raumhafen</span><span class="loc-uwp-val">${this._esc(uwp.starport)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">🌍</span><span class="loc-uwp-key">Größe</span><span class="loc-uwp-val">${this._esc(uwp.size)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">💨</span><span class="loc-uwp-key">Atmosphäre</span><span class="loc-uwp-val">${this._esc(uwp.atmosphere)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">💧</span><span class="loc-uwp-key">Hydrosphäre</span><span class="loc-uwp-val">${this._esc(uwp.hydrosphere)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">👥</span><span class="loc-uwp-key">Bevölkerung</span><span class="loc-uwp-val">${this._esc(uwp.population)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">🏛</span><span class="loc-uwp-key">Regierung</span><span class="loc-uwp-val">${this._esc(uwp.government)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">⚖️</span><span class="loc-uwp-key">Gesetzesstufe</span><span class="loc-uwp-val">${this._esc(uwp.lawLevel)}</span></div>
                <div class="loc-uwp-stat"><span class="loc-uwp-icon">🔧</span><span class="loc-uwp-key">Technologie</span><span class="loc-uwp-val">${this._esc(uwp.techLevel)}</span></div>
              </div>` : ''}
            </div>`;
          })() : ''}
          ${l.description ? `<div class="detail-desc md-content">${Md.render(l.description)}</div>` : ''}
          ${l.notes ? `<div class="detail-notes"><strong>Notizen</strong><div class="md-content">${Md.render(l.notes)}</div></div>` : ''}
          ${linkedSessions.length ? `
            <h4>Erwähnt in Sessions</h4>
            <div class="linked-items">
              ${linkedSessions.map(s => `<span class="link-chip session-link" data-tab="sessions" data-id="${this._esc(s.id)}">${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}</span>`).join('')}
            </div>` : ''}
          ${directPersons.length ? `
            <h4>Personen hier</h4>
            <div class="linked-items">
              ${directPersons.map(p => `<span class="link-chip person-link" data-tab="persons" data-id="${this._esc(p.id)}">📍 ${this._esc(p.name)}</span>`).join('')}
            </div>` : ''}
          ${sessionPersons.length ? `
            <h4>Aus Sessions bekannt</h4>
            <div class="linked-items">
              ${sessionPersons.map(p => `<span class="link-chip person-link" data-tab="persons" data-id="${this._esc(p.id)}">${this._esc(p.name)}</span>`).join('')}
            </div>` : ''}
          ${NotesChronicle.render('locations', l.id)}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ──────────────────────────── QUEST-TRACKER ──────────────────────────────
  _questList(data) {
    const counts = { active: 0, backlog: 0, completed: 0, failed: 0 };
    data.quests.forEach(q => { if (counts[q.status] !== undefined) counts[q.status]++; });

    const f = this._questFilterVal;
    let html = `<div class="notes-list-header">
      <div class="person-search-row">
        <input type="text" id="questSearch" class="notes-search" placeholder="Quests durchsuchen …">
        <button id="addQuestBtn" class="btn-success">+ Quest</button>
      </div>
      <div class="session-filter-group">
        <span class="session-filter-label">Filter</span>
        <div class="session-filter-fields">
          <select id="filterQuestStatus">
            <option value="active"    ${f==='active'    ?'selected':''}>Aktiv (${counts.active})</option>
            <option value="backlog"   ${f==='backlog'   ?'selected':''}>Backlog (${counts.backlog})</option>
            <option value="completed" ${f==='completed' ?'selected':''}>Erledigt (${counts.completed})</option>
            <option value="failed"    ${f==='failed'    ?'selected':''}>Gescheitert (${counts.failed})</option>
            <option value=""          ${f===''          ?'selected':''}>Alle</option>
          </select>
        </div>
      </div>
    </div><div class="notes-table-wrap"><table class="notes-table" id="questList">
      <thead><tr>
        <th class="nt-col-head nt-date-col">In-Game</th>
        ${this._th('quests','title','Titel')}
        <th class="nt-col-head nt-detail-head">Auftraggeber / Belohnung</th>
        ${this._th('quests','isCampaign','🏕','nt-camp-col')}
        <th class="nt-col-head nt-date-col">Real</th>
        ${this._th('quests','createdAt','Erstellt','nt-date-col')}
      </tr></thead>
      <tbody>`;

    const filtered = this._sortedList(data.quests, 'quests')
      .filter(q => !f || (q.status || 'active') === f);

    if (data.quests.length === 0 && this._extEntries('quests').length === 0) {
      html += `<tr><td colspan="6" class="nt-empty">Noch keine Quests eingetragen.</td></tr>`;
    } else if (filtered.length === 0) {
      html += `<tr><td colspan="6" class="nt-empty">Keine Quests in dieser Kategorie.</td></tr>`;
    }

    filtered.forEach(q => {
      const giverNames = (q.questGiverIds || []).map(pid => data.persons.find(p => p.id === pid)).filter(Boolean).map(p => p.name).join(', ');
      const detail = [giverNames, q.reward].filter(Boolean).join(' · ');
      html += `<tr class="notes-list-item quest-list-item" data-id="${this._esc(q.id)}"
                  data-qstatus="${this._esc(q.status || 'active')}"
                  data-name="${this._esc((q.title||'').toLowerCase())}">
        <td class="nt-date-col"></td>
        <td>
          <span class="nli-title-inline">${this._esc(q.title || 'Ohne Titel')}</span>
          <span class="quest-status-badge qst-${this._esc(q.status||'active')}">${this._questStatusLabel(q.status)}</span>
        </td>
        <td class="nt-detail-col">${this._esc(detail)}</td>
        <td class="nt-camp-col">${q.isCampaign ? '🏕' : ''}</td>
        <td></td>
        <td class="nt-date-col nt-created">${(q.createdAt||'').slice(0,10)}</td>
      </tr>`;
    });

    this._extEntries('quests').forEach(q => {
      html += `<tr class="camp-ext-row notes-list-item" data-id="${this._esc(q.id)}">
        <td></td>
        <td><span class="nli-title-inline">${this._esc(q.title || 'Ohne Titel')}</span>
          <span class="quest-status-badge qst-${this._esc(q.status||'active')}">${this._questStatusLabel(q.status)}</span></td>
        <td class="nt-detail-col"></td>
        <td class="nt-camp-col">🏕</td>
        <td></td><td></td>
      </tr>`;
    });
    html += '</tbody></table></div>';
    return html;
  },

  _questDetail(id, data) {
    const isNew = id === 'new';
    const q = isNew
      ? { id: 'new', title: '', description: '', objective: '', reward: '', questGiverIds: [], locationIds: [], status: 'active' }
      : this._findEntry('quests', id, data);
    if (!q) return '<p class="notes-empty">Quest nicht gefunden.</p>';

    // Init Auftraggeber-/Orts-Verknuepfungs-Staging beim ersten Betreten des Bearbeitungsmodus
    if (App.editMode && !this._editQuestLinks) {
      this._editQuestLinks = { persons: [...(q.questGiverIds || [])], locations: [...(q.locationIds || [])] };
    }
    const giverIds    = App.editMode ? (this._editQuestLinks?.persons   || []) : (q.questGiverIds || []);
    const questLocIds = App.editMode ? (this._editQuestLinks?.locations || []) : (q.locationIds   || []);
    const givers   = giverIds.map(pid => data.persons.find(p => p.id === pid)).filter(Boolean);
    const questLocs = questLocIds.map(lid => data.locations.find(l => l.id === lid)).filter(Boolean);
    const linkedSessions = data.sessions.filter(s => s.tags?.quests?.includes(q.id));

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${this._esc(q.id)}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      html += `
        <div class="detail-form">
          <div class="form-group"><label>Titel</label>
            <input type="text" id="questTitle" value="${this._esc(q.title)}" placeholder="Questname">
          </div>
          <div class="form-group"><label>Status</label>
            <select id="questStatus">
              <option value="active"    ${q.status === 'active'    ? 'selected' : ''}>Aktiv</option>
              <option value="backlog"   ${q.status === 'backlog'   ? 'selected' : ''}>Backlog</option>
              <option value="completed" ${q.status === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
              <option value="failed"    ${q.status === 'failed'    ? 'selected' : ''}>Gescheitert</option>
            </select>
          </div>
          ${this._tagPicker('persons',   givers,    data.persons,   'Auftraggeber', '_editQuestLinks')}
          ${this._tagPicker('locations', questLocs, data.locations, 'Orte',         '_editQuestLinks')}
          <div class="form-group"><label>Ziel / Aufgabe</label>
            <div class="loc-name-wrap">
              <textarea id="questObjective" rows="3" placeholder="Was muss erreicht werden?">${this._esc(q.objective)}</textarea>
              <div id="questObjectiveSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · - Liste · | Tabelle | · @ verlinkt Personen/Orte/Quests/Journal</span>
          </div>
          <div class="form-group"><label>Belohnung</label>
            <input type="text" id="questReward" value="${this._esc(q.reward)}" placeholder="z.B. 50.000 Cr, Passage, Information">
          </div>
          <div class="form-group"><label>Beschreibung / Hintergrund</label>
            <div class="loc-name-wrap">
              <textarea id="questDescription" rows="4" placeholder="Kontext, Hinweise, offene Fragen …">${this._esc(q.description)}</textarea>
              <div id="questDescriptionSuggestions" class="loc-suggestions mention-suggestions" style="display:none"></div>
            </div>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle | · @ verlinkt Personen/Orte/Quests/Journal</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${q.createdAt ? this._esc(q.createdAt.slice(0,16)) : new Date().toISOString().slice(0,16)}">
          </div>
          ${App.currentCharacter?.campaignId ? `
          <div class="form-group">
            <label class="camp-share-label">
              <input type="checkbox" id="entryCampaignToggle" ${(isNew || q.isCampaign) ? 'checked' : ''}>
              <span>🏕 In Kampagne teilen</span>
            </label>
          </div>` : ''}
          <div class="detail-form-actions">
            <button id="saveDetailBtn" class="btn-primary">${isNew ? 'Erstellen' : 'Speichern'}</button>
            <button id="backBtn2" class="btn-secondary">Abbrechen</button>
          </div>
        </div>`;
    } else {
      html += `
        <div class="quest-view">
          <div class="quest-view-header">
            <h3>${this._esc(q.title || 'Ohne Titel')}</h3>
            <span class="quest-status-badge qst-${this._esc(q.status || 'active')}">${this._questStatusLabel(q.status)}</span>
          </div>
          ${givers.length ? `<p class="quest-giver">Auftraggeber: ${givers.map(g => `<span class="link-chip person-link" data-tab="persons" data-id="${this._esc(g.id)}">${this._esc(g.name)}</span>`).join(' ')}</p>` : ''}
          ${questLocs.length ? `<p class="quest-locations">Orte: ${questLocs.map(l => `<span class="link-chip location-link" data-tab="locations" data-id="${this._esc(l.id)}">${this._esc(l.name)}</span>`).join(' ')}</p>` : ''}
          ${q.objective ? `<div class="detail-section"><strong>Ziel</strong><div class="md-content">${Md.render(q.objective)}</div></div>` : ''}
          ${q.reward ? `<div class="detail-section"><strong>Belohnung:</strong> ${this._esc(q.reward)}</div>` : ''}
          ${q.description ? `<div class="detail-desc md-content">${Md.render(q.description)}</div>` : ''}
          ${linkedSessions.length ? `
            <h4>Erwähnt in Sessions</h4>
            <div class="linked-items">
              ${linkedSessions.map(s => `<span class="link-chip session-link" data-tab="sessions" data-id="${this._esc(s.id)}">${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}</span>`).join('')}
            </div>` : ''}
          ${NotesChronicle.render('quests', q.id)}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ────────────────────────── TAG-PICKER HELPER ────────────────────────────
  // contextKey: Name der this[...]-Eigenschaft, in der die ausgewaehlten IDs pro
  // type gespeichert werden (this[contextKey][type] = string[]). Default
  // '_editTags' fuer den urspruenglichen Anwendungsfall (Session-Verknuepfungen).
  // Da pro gerenderter Seite immer nur EIN Detailformular aktiv ist, kollidiert
  // ein type (z.B. 'locations') nie zwischen zwei gleichzeitig sichtbaren
  // Pickern - deshalb reicht data-context neben dem bestehenden data-type,
  // ohne die IDs/Selektoren selbst um den Context erweitern zu muessen.
  _tagPicker(type, selected, all, label, contextKey = '_editTags') {
    const selectedIds = selected.map(x => x.id);
    const available   = all.filter(x => !selectedIds.includes(x.id));
    const nameKey     = type === 'quests' ? 'title' : 'name';

    return `
      <div class="tag-picker" data-type="${type}" data-context="${contextKey}">
        <label>${label}</label>
        <div class="tag-chips" id="chips-${type}">
          ${selected.map(x => `
            <span class="tag-chip tp-chip" data-type="${type}" data-id="${this._esc(x.id)}" data-context="${contextKey}">
              ${this._esc(x[nameKey])}
              <button class="chip-rm" data-type="${type}" data-id="${this._esc(x.id)}" data-context="${contextKey}">×</button>
            </span>`).join('')}
          <button class="chip-add-btn" data-type="${type}">+ ${label}</button>
        </div>
        <div class="tag-picker-dropdown" id="tpd-${type}" style="display:none">
          <input type="text" class="tp-search" data-type="${type}" placeholder="${label} suchen …">
          <button class="tp-create-btn" data-type="${type}">✚ ${this._newItemLabel(type)}</button>
          <div class="tp-create-form" id="tpcf-${type}" style="display:none">
            <input type="text" class="tp-create-input" data-type="${type}" data-context="${contextKey}" placeholder="Name …">
            <button class="tp-create-save btn-primary" data-type="${type}" data-context="${contextKey}">Erstellen</button>
          </div>
          <div class="tp-options" id="tpo-${type}">
            ${available.map(x => `
              <label class="tp-option">
                <input type="checkbox" data-type="${type}" data-id="${this._esc(x.id)}" data-context="${contextKey}">
                ${this._esc(x[nameKey])}
              </label>`).join('')}
            ${available.length === 0 ? '<p class="tp-empty">Keine weiteren Einträge</p>' : ''}
          </div>
        </div>
      </div>`;
  },

  // ───────────────────────────── LABEL HELPER ──────────────────────────────
  _statusLabel(s)      { return { alive: 'Lebendig', dead: 'Tot', unknown: 'Unbekannt' }[s] || 'Unbekannt'; },
  _relationLabel(r)    { return { friendly: 'Freundlich', neutral: 'Neutral', hostile: 'Feindlich' }[r] || 'Neutral'; },
  _locStatusLabel(s)   { return { visited: 'Besucht', known: 'Bekannt', rumor: 'Gerücht' }[s] || 'Bekannt'; },
  _questStatusLabel(s) { return { active: 'Aktiv', backlog: 'Backlog', completed: 'Abgeschlossen', failed: 'Gescheitert' }[s] || 'Aktiv'; },
  _newItemLabel(type)  { return { persons: 'Neue Person', locations: 'Neuen Ort', quests: 'Neue Quest' }[type] || 'Neu'; },

  // ──────────────────────────────── SAVE ───────────────────────────────────
  save(character) {
    const data = this._d(character);

    if (!this._detailId || !App.editMode) {
      character.notes = data;
      return;
    }

    const id = this._detailId;
    const isNew = id === 'new';

    const tsVal = document.getElementById('entryCreatedAt')?.value;
    const createdAt = tsVal ? new Date(tsVal).toISOString() : new Date().toISOString();

    if (this._activeTab === 'sessions') {
      const existing = isNew ? null : this._findEntry('sessions', id, data);
      const entry = {
        id:          isNew ? ('s' + Date.now()) : id,
        title:       document.getElementById('sessionTitle')?.value?.trim() || '',
        sessionDate: document.getElementById('sessionDate')?.value || '',
        inGameDate:  document.getElementById('sessionIngameDate')?.value || '',
        content:     document.getElementById('sessionContent')?.value || '',
        tags:        this._editTags || { persons: [], locations: [], quests: [], events: [] },
        attachments: this._editAttachments || existing?.attachments || [],
        isActive:    existing?.isActive || false,
        isCampaign:  !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:   existing?.createdAt || createdAt,
        updatedAt:   new Date().toISOString(),
      };
      // "@"-Erwähnungen im Bericht verlinken die referenzierte Person/den Ort/
      // die Quest automatisch auch über das normale Tag-System (erscheint dann
      // z.B. in der "Personen:/Orte:/Quests:"-Übersicht am Sessionende und in
      // der Rückverlinkung bei der Person selbst). Rein additiv: Entfernen einer
      // Erwähnung aus dem Text entfernt den Tag nicht wieder automatisch, falls
      // er zusätzlich manuell über den Tag-Picker gesetzt wurde.
      for (const [, name, type, mentionId] of entry.content.matchAll(Md._MENTION_RE)) {
        const key = type + 's';
        if (!entry.tags[key].includes(mentionId)) entry.tags[key].push(mentionId);
      }
      if (isNew) {
        if (entry.title) { data.sessions.push(entry); this._detailId = entry.id; }
      } else {
        // Gemeinschaftliche Kampagnen-Eintraege: existiert die id lokal noch
        // nicht (fremder, gerade zum ersten Mal bearbeiteter Eintrag), unter
        // derselben id uebernehmen statt zu verwerfen - der naechste
        // _syncMyCampaignEntries()-Push schliesst sie dann automatisch mit ein.
        const idx = data.sessions.findIndex(s => String(s.id) === String(id));
        if (idx >= 0) data.sessions[idx] = entry;
        else data.sessions.push(entry);
      }
      // Kein FileSync.remove() mehr fuer beim Bearbeiten entfernte Anhaenge
      // (Chip-"×"-Klick nimmt sie nur aus _editAttachments, siehe
      // attachListeners) - siehe Plan "Server-Daten-Backup": still entfernen,
      // Aufraeumen nur noch ueber die Admin-Seite.
      // _editTags/_editAttachments intentionally NOT cleared here: autosave calls
      // save() without re-rendering, so clearing wuerde den Picker-/Anhang-Zustand
      // korrumpieren und Aenderungen beim naechsten manuellen Speichern verlieren.
      // Navigations-Handler clearen stattdessen.
      this._editTags = JSON.parse(JSON.stringify(entry.tags));
      this._editAttachments = JSON.parse(JSON.stringify(entry.attachments));

    } else if (this._activeTab === 'persons') {
      const existing = isNew ? null : this._findEntry('persons', id, data);
      const entry = {
        id:          isNew ? ('p' + Date.now()) : id,
        name:        document.getElementById('personName')?.value?.trim() || '',
        role:        document.getElementById('personRole')?.value?.trim() || '',
        ...App._readExtraFields('persons'),
        description: document.getElementById('personDescription')?.value || '',
        status:      document.getElementById('personStatus')?.value || 'alive',
        relation:    document.getElementById('personRelation')?.value || 'neutral',
        locationIds: this._editPersonLinks?.locations || existing?.locationIds || [],
        image:       window._personCurrentImage       !== undefined ? window._personCurrentImage       : (existing?.image ?? null),
        imageFileId: window._personCurrentImageFileId !== undefined ? window._personCurrentImageFileId : (existing?.imageFileId ?? null),
        isFavorite:  existing?.isFavorite || false,
        isCampaign:  !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:   existing?.createdAt || createdAt,
        updatedAt:   new Date().toISOString(),
      };
      if (isNew) {
        if (entry.name) {
          data.persons.push(entry);
          this._detailId = entry.id;
          if (document.getElementById('linkToSession')?.checked) {
            const active = data.sessions.find(s => s.isActive);
            if (active) {
              if (!active.tags) active.tags = { persons: [], locations: [], quests: [], events: [] };
              if (!active.tags.persons) active.tags.persons = [];
              if (!active.tags.persons.includes(entry.id)) active.tags.persons.push(entry.id);
            }
          }
        }
      } else {
        const idx = data.persons.findIndex(p => String(p.id) === String(id));
        if (idx >= 0) data.persons[idx] = entry;
        else data.persons.push(entry); // fremder Eintrag, erstmalig uebernommen (siehe sessions-Kommentar oben)
      }
      // Kein FileSync.remove() mehr fuer das alte Personenbild - siehe Plan
      // "Server-Daten-Backup": still ersetzen, Aufraeumen nur noch ueber die
      // Admin-Seite.

    } else if (this._activeTab === 'locations') {
      const existing = isNew ? null : this._findEntry('locations', id, data);
      const rawX = document.getElementById('locMapX')?.value;
      const rawY = document.getElementById('locMapY')?.value;
      const entry = {
        id:          isNew ? ('l' + Date.now()) : id,
        name:        document.getElementById('locName')?.value?.trim() || '',
        sector:      document.getElementById('locSector')?.value?.trim() || '',
        uwp:         document.getElementById('locUwp')?.value?.trim() || '',
        status:      document.getElementById('locStatus')?.value || 'visited',
        visitedDate: document.getElementById('locVisitedDate')?.value || '',
        description: document.getElementById('locDescription')?.value || '',
        notes:       document.getElementById('locNotes')?.value || '',
        mapX:        rawX !== '' && rawX != null ? parseInt(rawX) : null,
        mapY:        rawY !== '' && rawY != null ? parseInt(rawY) : null,
        mapSector:   document.getElementById('locMapSector')?.value || null,
        mapHex:      document.getElementById('locMapHex')?.value    || null,
        isCampaign:  !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:   existing?.createdAt || createdAt,
        updatedAt:   new Date().toISOString(),
      };
      if (isNew) {
        if (entry.name) {
          data.locations.push(entry);
          this._detailId = entry.id;
          if (document.getElementById('linkToSession')?.checked) {
            const active = data.sessions.find(s => s.isActive);
            if (active) {
              if (!active.tags) active.tags = { persons: [], locations: [], quests: [], events: [] };
              if (!active.tags.locations) active.tags.locations = [];
              if (!active.tags.locations.includes(entry.id)) active.tags.locations.push(entry.id);
            }
          }
        }
      } else {
        const idx = data.locations.findIndex(l => String(l.id) === String(id));
        if (idx >= 0) data.locations[idx] = entry;
        else data.locations.push(entry); // fremder Eintrag, erstmalig uebernommen
      }

    } else if (this._activeTab === 'quests') {
      const existing = isNew ? null : this._findEntry('quests', id, data);
      const entry = {
        id:           isNew ? ('q' + Date.now()) : id,
        title:        document.getElementById('questTitle')?.value?.trim() || '',
        status:       document.getElementById('questStatus')?.value || 'active',
        questGiverIds: this._editQuestLinks?.persons   || existing?.questGiverIds || [],
        locationIds:   this._editQuestLinks?.locations || existing?.locationIds   || [],
        objective:    document.getElementById('questObjective')?.value || '',
        reward:       document.getElementById('questReward')?.value?.trim() || '',
        description:  document.getElementById('questDescription')?.value || '',
        isCampaign:   !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:    existing?.createdAt || createdAt,
        updatedAt:    new Date().toISOString(),
      };
      if (isNew) {
        if (entry.title) { data.quests.push(entry); this._detailId = entry.id; }
      } else {
        const idx = data.quests.findIndex(q => String(q.id) === String(id));
        if (idx >= 0) data.quests[idx] = entry;
        else data.quests.push(entry); // fremder Eintrag, erstmalig uebernommen
      }
    }

    character.notes = data;
  },

  _saveAndSync(char) {
    Storage.saveCharacter(char);
    if (char.campaignId) App._syncMyCampaignEntries();
  },

  // ─────────────────────────── EVENT LISTENER ──────────────────────────────
  attachListeners() {
    // Sub-Tab-Wechsel
    document.querySelectorAll('.notes-subtab-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (App.currentCharacter) {
          this.save(App.currentCharacter);
          this._saveAndSync(App.currentCharacter);
        }
        this._activeTab = btn.dataset.tab;
        this._detailId  = null;
        this._editTags  = null;
        App.renderCurrentPage();
      });
    });

    // Sortierbare Tabellen-Header (Journal, Orte, Quests)
    document.querySelectorAll('.nt-sortable').forEach(th => {
      th.addEventListener('click', () => {
        const tab  = th.dataset.tab;
        const sort = th.dataset.sort;
        if (this._notesSort[tab] === sort) {
          this._notesDir[tab] = this._notesDir[tab] === 'asc' ? 'desc' : 'asc';
        } else {
          this._notesSort[tab] = sort;
          this._notesDir[tab]  = 'asc';
        }
        App.renderCurrentPage();
      });
    });

    // Sortier-Chips (Personen)
    document.querySelectorAll('.sort-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        this._notesSort[chip.dataset.tab] = chip.dataset.sort;
        App.renderCurrentPage();
      });
    });

    document.querySelectorAll('.sort-dir-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        this._notesDir[btn.dataset.tab] = btn.dataset.dir;
        App.renderCurrentPage();
      });
    });

    // "← Zurück" und "Abbrechen"
    document.getElementById('backBtn')?.addEventListener('click', () => this._goBack());
    document.getElementById('backBtn2')?.addEventListener('click', () => this._goBack());

    // "Speichern / Erstellen" in Detail-Formularen
    document.getElementById('saveDetailBtn')?.addEventListener('click', () => {
      if (App.currentCharacter) {
        const wasNew = this._detailId === 'new';
        const tab    = this._activeTab;
        this.save(App.currentCharacter);
        this._saveAndSync(App.currentCharacter);
        if (tab === 'quests' || (wasNew && (tab === 'persons' || tab === 'sessions'))) App.editMode = false;
        App.renderCurrentPage();
      }
    });

    // Löschen (Tombstone statt Entfernen, damit die Löschung über Sync-Merge propagiert)
    document.getElementById('deleteItemBtn')?.addEventListener('click', (e) => {
      if (!confirm('Eintrag wirklich löschen?')) return;
      const id = e.currentTarget.dataset.id;
      const data = this._d(App.currentCharacter);
      const key = { sessions: 'sessions', persons: 'persons', locations: 'locations', quests: 'quests' }[this._activeTab];
      const item = data[key].find(x => String(x.id) === String(id));
      const now  = new Date().toISOString();
      if (item) {
        item._deleted  = true;
        item.deletedAt = now;
        item.updatedAt = now;
      } else {
        // Fremder, lokal noch nie uebernommener Eintrag - als Tombstone unter
        // derselben id neu anlegen, damit die Loeschung ueberhaupt gepusht
        // werden kann (gemeinschaftliche Kampagnen-Inhalte, siehe save()).
        const foreign = this._findEntry(key, id, data);
        if (foreign) data[key].push({ ...foreign, _deleted: true, deletedAt: now, updatedAt: now });
      }
      App.currentCharacter.notes = data;
      this._saveAndSync(App.currentCharacter);
      this._detailId = null;
      this._editTags = null;
      this._editAttachments = null;
      this._editPersonLinks = null;
      this._editQuestLinks = null;
      App.renderCurrentPage();
    });

    document.getElementById('showOnMapBtn')?.addEventListener('click', (e) => {
      KartePage._mapFocusId = e.currentTarget.dataset.locid;
      App.switchPage('karte');
    });

    document.querySelectorAll('.loc-list-map-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        KartePage._mapFocusId = btn.dataset.locid;
        App.switchPage('karte');
      });
    });

    this._attachLocAutocomplete();

    // Listen-Items → Detail-Ansicht (Event-Delegation für Tabellen-Rows)
    ['sessionList', 'locationList'].forEach(tableId => {
      document.getElementById(tableId)?.addEventListener('click', (e) => {
        const row = e.target.closest('tr.notes-list-item');
        if (row?.dataset.id) {
          this._detailId = row.dataset.id;
          this._editTags = null;
          this._editAttachments = null;
          App.renderCurrentPage();
        }
      });
    });
    // Quests: Klick öffnet direkt im Bearbeitungsmodus
    document.getElementById('questList')?.addEventListener('click', (e) => {
      const row = e.target.closest('tr.notes-list-item');
      if (row?.dataset.id) {
        if (!App.editMode) App.editMode = true;
        this._detailId = row.dataset.id;
        this._editTags = null;
        this._editAttachments = null;
        this._editQuestLinks = null;
        App.renderCurrentPage();
      }
    });
    // Personen-Karten (div-basiert, kein Table)
    document.querySelectorAll('.person-card.notes-list-item').forEach(item => {
      item.addEventListener('click', () => {
        this._detailId = item.dataset.id;
        this._editTags = null;
        this._editAttachments = null;
        this._editPersonLinks = null;
        App.renderCurrentPage();
      });
    });

    // Verlinkungen (Link-Chips) → zu dem betreffenden Tab + Eintrag springen.
    // Ausnahme: @-Erwähnungen im Fließtext (.mention-chip) öffnen für
    // Personen/Orte/Quests das editierbare Popover an Ort und Stelle, statt
    // die Leseposition zu verlassen (K2). Session-Erwähnungen und die
    // freistehenden Chip-Listen (Rückverlinkungen) springen weiterhin.
    // .chron-src: die Quellzeile eines Chronik-Absatzes — springt zur Session.
    document.querySelectorAll('.link-chip[data-tab], .chron-src[data-tab]').forEach(chip => {
      chip.addEventListener('click', () => {
        const tab = chip.dataset.tab;
        const id  = chip.dataset.id;
        // .pop-chip: die Zusammenfassungs-Chips unten im Journal-Eintrag —
        // öffnen ebenfalls das Popover; zur vollen Seite kommt man von dort
        // über dessen "Zur …-Seite ↗"-Link.
        if ((chip.classList.contains('mention-chip') || chip.classList.contains('pop-chip'))
            && ['persons', 'locations', 'quests'].includes(tab)) {
          MentionPopover.open({ type: tab, id, anchorEl: chip });
          return;
        }
        if (tab && id) {
          if (App.currentCharacter) {
            this.save(App.currentCharacter);
          }
          this._activeTab = tab;
          this._detailId  = id;
          this._editTags  = null;
          this._editAttachments = null;
          this._editPersonLinks = null;
          this._editQuestLinks = null;
          App.renderCurrentPage();
        }
      });
    });

    // "+" Buttons für neue Einträge
    document.getElementById('addSessionBtn')?.addEventListener('click', () => {
      if (!App.editMode) App.editMode = true;
      this._detailId = 'new';
      this._editTags = { persons: [], locations: [], quests: [], events: [] };
      App.renderCurrentPage();
    });
    document.getElementById('addPersonBtn')?.addEventListener('click', () => {
      if (!App.editMode) App.editMode = true;
      this._detailId = 'new';
      this._editPersonLinks = null;
      App.renderCurrentPage();
    });
    document.getElementById('addLocationBtn')?.addEventListener('click', () => {
      if (!App.editMode) App.editMode = true;
      this._detailId = 'new';
      App.renderCurrentPage();
    });
    document.getElementById('addQuestBtn')?.addEventListener('click', () => {
      if (!App.editMode) App.editMode = true;
      this._detailId = 'new';
      this._editQuestLinks = null;
      App.renderCurrentPage();
    });

    // Person-Bild Upload (komprimiert auf max 320×320, JPEG 0.75, dann als
    // echte Datei hochgeladen statt als Base64 im Charakter-JSON eingebettet)
    document.getElementById('personImgUpload')?.addEventListener('change', e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.size > 4 * 1024 * 1024) { alert('Bild zu groß! Maximum 4 MB'); return; }
      const reader = new FileReader();
      reader.onload = ev => {
        const img = new Image();
        img.onload = () => {
          const MAX = 320;
          const scale = Math.min(1, MAX / Math.max(img.width, img.height));
          const canvas = document.createElement('canvas');
          canvas.width  = Math.round(img.width  * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(async blob => {
            const char   = App.currentCharacter;
            // refId ermoeglicht das automatische Wiederherstellen ueber die
            // Admin-Seite (siehe backend/orphan-scan.js), analog zu
            // sessionAttachment weiter unten.
            const result = await FileSync.upload(blob, { ownerType: 'character', ownerId: char.id, field: 'personImage', refId: this._detailId });
            if (!result.ok) { App.showStatus('Bild-Upload fehlgeschlagen', 'error'); return; }
            window._personCurrentImage       = null;
            window._personCurrentImageFileId = result.data.id;
            const preview = document.getElementById('personImgPreview');
            if (preview) preview.innerHTML = `<img src="${this._esc(FileSync.getUrl(result.data.id))}" class="person-img-edit">`;
            const rmBtn = document.getElementById('personImgRemove');
            if (!rmBtn) {
              const uploadBtn = document.querySelector('.person-img-upload-btn');
              const btn = document.createElement('button');
              btn.id = 'personImgRemove';
              btn.className = 'person-img-remove-btn';
              btn.textContent = 'Bild entfernen';
              uploadBtn?.insertAdjacentElement('afterend', btn);
              btn.addEventListener('click', () => _removePersonImg(preview, btn));
            }
          }, 'image/jpeg', 0.75);
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    const _removePersonImg = (preview, btn) => {
      window._personCurrentImage       = null;
      window._personCurrentImageFileId = null;
      if (preview) preview.innerHTML = '<div class="person-img-placeholder">👤</div>';
      btn?.remove();
    };
    document.getElementById('personImgRemove')?.addEventListener('click', () => {
      const preview = document.getElementById('personImgPreview');
      const btn     = document.getElementById('personImgRemove');
      _removePersonImg(preview, btn);
    });

    // Session-Anhänge (PDF) - Upload direkt beim Auswählen, Übernahme in
    // character.notes erst beim nächsten save() (siehe _editAttachments,
    // analog zum Personen-Bild-Upload oben).
    document.getElementById('sessionAttachmentUpload')?.addEventListener('change', async e => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      if (file.type !== 'application/pdf') { alert('Bitte eine PDF-Datei wählen'); return; }
      if (file.size > 100 * 1024 * 1024) { alert('Datei zu groß! Maximum 100 MB'); return; }
      const char = App.currentCharacter;
      App.showStatus('Lade PDF hoch …', 'info');
      const result = await FileSync.upload(file, { ownerType: 'character', ownerId: char.id, field: 'sessionAttachment', refId: this._detailId });
      if (!result.ok) { App.showStatus('PDF-Upload fehlgeschlagen', 'error'); return; }
      if (!this._editAttachments) this._editAttachments = [];
      this._editAttachments.push({ id: result.data.id, filename: file.name, size: file.size });
      App.showStatus('PDF hochgeladen', 'success');
      App.renderCurrentPage();
    });

    document.querySelectorAll('.attachment-rm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.id;
        this._editAttachments = (this._editAttachments || []).filter(a => a.id !== id);
        App.renderCurrentPage();
      });
    });

    // "@"-Erwähnungen (No-op falls das jeweilige Feld gerade nicht im DOM ist -
    // immer alle aufzurufen ist einfacher als pro Sub-Tab zu unterscheiden).
    const char = App.currentCharacter;
    MentionAutocomplete.attach('sessionContent',      'sessionMentionSuggestions',      char);
    MentionAutocomplete.attach('personDescription',   'personDescriptionSuggestions',   char);
    MentionAutocomplete.attach('locDescription',       'locDescriptionSuggestions',      char);
    MentionAutocomplete.attach('locNotes',             'locNotesSuggestions',            char);
    MentionAutocomplete.attach('questObjective',       'questObjectiveSuggestions',      char);
    MentionAutocomplete.attach('questDescription',     'questDescriptionSuggestions',    char);

    // Tag-Picker
    this._attachTagPicker();

    // Event-Tags
    this._attachEventTags();

    // Person-Suche & Filter
    this._attachPersonFilter();

    // Location-Suche & Filter
    this._attachLocationFilter();

    // Session-Suche & Filter
    this._attachSessionFilter();

    // Quest-Filter-Tabs
    this._attachQuestFilter();

    // In-Game-Datum im Journal
    App._calendar().attachInput('sessionIngameDate');

    // Session aktiv schalten
    document.getElementById('setActiveSessionBtn')?.addEventListener('click', (e) => {
      const id   = e.currentTarget.dataset.id;
      const data = this._d(App.currentCharacter);
      const wasActive = data.sessions.find(s => s.id === id)?.isActive;
      data.sessions.forEach(s => { s.isActive = false; });
      if (!wasActive) {
        const session = data.sessions.find(s => s.id === id);
        if (session) session.isActive = true;
      }
      App.currentCharacter.notes = data;
      this._saveAndSync(App.currentCharacter);
      App.renderCurrentPage();
    });
  },

  _goBack() {
    if (App.currentCharacter) {
      this.save(App.currentCharacter);
      this._saveAndSync(App.currentCharacter);
    }
    this._detailId = null;
    this._editTags = null;
    this._editAttachments = null;
    this._editPersonLinks = null;
    this._editQuestLinks = null;
    App.renderCurrentPage();
  },

  // Tipp auf den Chip-Körper öffnet das editierbare Popover (K2) — das ×
  // (chip-rm) entfernt weiterhin nur die Verknüpfung und stoppt die
  // Propagation, die beiden Trefferflächen kommen sich nicht in die Quere.
  _attachChipPopover(chip) {
    chip.addEventListener('click', () => {
      MentionPopover.open({ type: chip.dataset.type, id: chip.dataset.id, anchorEl: chip });
    });
  },

  _attachTagPicker() {
    // Nicht mehr auf this._editTags pruefen - Tag-Picker koennen jetzt auch
    // von this._editPersonLinks/_editQuestLinks getrieben sein. Ob ueberhaupt
    // einer im aktuell gerenderten Formular vorkommt, zeigt sich direkt am DOM.
    if (!document.querySelector('.tag-picker')) return;

    document.querySelectorAll('.tp-chip').forEach(chip => this._attachChipPopover(chip));

    // Öffnen/Schließen der Dropdowns
    document.querySelectorAll('.chip-add-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const type    = btn.dataset.type;
        const dropdown = document.getElementById(`tpd-${type}`);
        if (!dropdown) return;
        const isOpen = dropdown.style.display !== 'none';
        // Alle Dropdowns schließen
        document.querySelectorAll('.tag-picker-dropdown').forEach(d => d.style.display = 'none');
        if (!isOpen) dropdown.style.display = 'block';
      });
    });

    // Suche innerhalb des Dropdowns
    document.querySelectorAll('.tp-search').forEach(input => {
      input.addEventListener('input', () => {
        const type = input.dataset.type;
        const term = input.value.toLowerCase();
        document.querySelectorAll(`#tpo-${type} .tp-option`).forEach(opt => {
          opt.style.display = opt.textContent.toLowerCase().includes(term) ? '' : 'none';
        });
      });
    });

    // Checkbox-Auswahl → Chip hinzufügen
    document.querySelectorAll('.tp-options input[type=checkbox]').forEach(cb => {
      cb.addEventListener('change', () => {
        if (!cb.checked) return;
        const type = cb.dataset.type;
        const id   = cb.dataset.id;
        const ctx  = cb.dataset.context || '_editTags';
        if (!this[ctx]) this[ctx] = {};
        if (!this[ctx][type]) this[ctx][type] = [];
        if (!this[ctx][type].includes(id)) {
          this[ctx][type].push(id);
        }
        document.getElementById(`tpd-${type}`).style.display = 'none';
        // Chip in DOM einfügen ohne Full-Rerender
        const data     = this._d(App.currentCharacter);
        const nameKey  = type === 'quests' ? 'title' : 'name';
        const allItems = data[type];
        const item     = allItems.find(x => x.id === id);
        if (!item) return;
        const chipsEl  = document.getElementById(`chips-${type}`);
        const addBtn   = chipsEl?.querySelector('.chip-add-btn');
        const chip     = document.createElement('span');
        chip.className = 'tag-chip tp-chip';
        chip.dataset.type = type;
        chip.dataset.id   = id;
        chip.dataset.context = ctx;
        chip.innerHTML = `${this._esc(item[nameKey])}<button class="chip-rm" data-type="${type}" data-id="${id}" data-context="${ctx}">×</button>`;
        chip.querySelector('.chip-rm').addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeTag(type, id, chip, ctx);
        });
        this._attachChipPopover(chip);
        if (addBtn) chipsEl.insertBefore(chip, addBtn);
        // Option aus Dropdown entfernen
        cb.closest('.tp-option').remove();
      });
    });

    // "Neue Person / Neuen Ort / Neue Quest" — Formular ein-/ausblenden
    document.querySelectorAll('.tp-create-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const form = document.getElementById(`tpcf-${btn.dataset.type}`);
        if (!form) return;
        const open = form.style.display !== 'none';
        form.style.display = open ? 'none' : 'block';
        if (!open) form.querySelector('.tp-create-input')?.focus();
      });
    });

    // Neuen Eintrag anlegen und als Chip hinzufügen
    const doCreate = (type, ctx) => {
      const input = document.querySelector(`.tp-create-input[data-type="${type}"]`);
      const name  = input?.value?.trim();
      if (!name) return;

      const char    = App.currentCharacter;
      const data    = this._d(char);
      const nameKey = type === 'quests' ? 'title' : 'name';
      const prefix  = { persons: 'p', locations: 'l', quests: 'q' }[type] || 'x';
      const newItem = { id: prefix + Date.now(), [nameKey]: name, createdAt: new Date().toISOString() };

      if (type === 'persons')   { newItem.status = 'alive';   newItem.relation = 'neutral'; }
      if (type === 'locations') { newItem.status = 'known'; }
      if (type === 'quests')    { newItem.status = 'active'; newItem.title = name; }
      Object.assign(newItem, App._extraFieldDefaults(type));

      data[type].push(newItem);
      char.notes = data;

      if (!this[ctx]) this[ctx] = {};
      if (!this[ctx][type]) this[ctx][type] = [];
      this[ctx][type].push(newItem.id);

      // Chip in DOM einfügen
      const chipsEl = document.getElementById(`chips-${type}`);
      const addBtn  = chipsEl?.querySelector('.chip-add-btn');
      const chip    = document.createElement('span');
      chip.className = 'tag-chip tp-chip';
      chip.dataset.type = type;
      chip.dataset.id   = newItem.id;
      chip.dataset.context = ctx;
      chip.innerHTML = `${this._esc(name)}<button class="chip-rm" data-type="${type}" data-id="${newItem.id}" data-context="${ctx}">×</button>`;
      chip.querySelector('.chip-rm').addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeTag(type, newItem.id, chip, ctx);
      });
      this._attachChipPopover(chip);
      if (addBtn) chipsEl.insertBefore(chip, addBtn);

      // Dropdown schließen, Formular zurücksetzen
      document.getElementById(`tpd-${type}`).style.display = 'none';
      document.getElementById(`tpcf-${type}`).style.display = 'none';
      if (input) input.value = '';

      this._saveAndSync(char);

      // K2: frisch angelegter Eintrag → Popover direkt zum Befüllen öffnen
      // (Name vorbefüllt, Fokus im ersten leeren Feld). Abbrechen verwirft
      // nur die Feldeingaben, der Eintrag samt Tag bleibt bestehen.
      MentionPopover.open({ type, id: newItem.id, anchorEl: chip, isNew: true });
    };

    document.querySelectorAll('.tp-create-save').forEach(btn => {
      btn.addEventListener('click', () => doCreate(btn.dataset.type, btn.dataset.context || '_editTags'));
    });

    document.querySelectorAll('.tp-create-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doCreate(input.dataset.type, input.dataset.context || '_editTags'); }
      });
    });

    // Bestehende Chips: Remove-Button
    document.querySelectorAll('.chip-rm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const id   = btn.dataset.id;
        const ctx  = btn.dataset.context || '_editTags';
        const chip = btn.closest('.tp-chip');
        this._removeTag(type, id, chip, ctx);
      });
    });
  },

  _removeTag(type, id, chipEl, ctx = '_editTags') {
    if (!this[ctx] || !this[ctx][type]) return;
    this[ctx][type] = this[ctx][type].filter(x => x !== id);
    chipEl?.remove();
    // Option zurück ins Dropdown setzen
    const data    = this._d(App.currentCharacter);
    const nameKey = type === 'quests' ? 'title' : 'name';
    const item    = data[type].find(x => x.id === id);
    if (!item) return;
    const optList = document.getElementById(`tpo-${type}`);
    if (!optList) return;
    const opt = document.createElement('label');
    opt.className = 'tp-option';
    opt.innerHTML = `<input type="checkbox" data-type="${type}" data-id="${id}" data-context="${ctx}">${this._esc(item[nameKey])}`;
    opt.querySelector('input').addEventListener('change', (e) => {
      if (!e.target.checked) return;
      e.target.closest('label').style.display = 'none';
      if (!this[ctx]) this[ctx] = {};
      if (!this[ctx][type]) this[ctx][type] = [];
      this[ctx][type].push(id);
      const chipsEl = document.getElementById(`chips-${type}`);
      const addBtn  = chipsEl?.querySelector('.chip-add-btn');
      const chip    = document.createElement('span');
      chip.className = 'tag-chip tp-chip';
      chip.dataset.type = type; chip.dataset.id = id; chip.dataset.context = ctx;
      chip.innerHTML = `${this._esc(item[nameKey])}<button class="chip-rm" data-type="${type}" data-id="${id}" data-context="${ctx}">×</button>`;
      chip.querySelector('.chip-rm').addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._removeTag(type, id, chip, ctx);
      });
      if (addBtn) chipsEl.insertBefore(chip, addBtn);
    });
    optList.appendChild(opt);
  },

  _attachEventTags() {
    const input  = document.getElementById('eventTagInput');
    const addBtn = document.getElementById('addEventTagBtn');
    if (!input || !this._editTags) return;

    const addTag = () => {
      const val = input.value.trim();
      if (!val) return;
      if (!this._editTags.events) this._editTags.events = [];
      if (this._editTags.events.includes(val)) { input.value = ''; return; }
      this._editTags.events.push(val);
      const chipsEl = document.getElementById('eventTagsChips');
      if (chipsEl) {
        const chip = document.createElement('span');
        chip.className = 'tag-chip event-chip';
        chip.innerHTML = `${this._esc(val)}<button class="chip-rm-event" data-event="${this._esc(val)}">×</button>`;
        chip.querySelector('.chip-rm-event').addEventListener('click', () => {
          this._editTags.events = this._editTags.events.filter(e => e !== val);
          chip.remove();
        });
        chipsEl.appendChild(chip);
      }
      input.value = '';
    };

    addBtn?.addEventListener('click', addTag);
    input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); addTag(); } });

    // Bestehende Event-Chips
    document.querySelectorAll('.chip-rm-event').forEach(btn => {
      btn.addEventListener('click', () => {
        const ev = btn.dataset.event;
        if (this._editTags?.events) {
          this._editTags.events = this._editTags.events.filter(e => e !== ev);
        }
        btn.closest('.event-chip')?.remove();
      });
    });
  },

  _attachPersonFilter() {
    const search      = document.getElementById('personSearch');
    const locationSel = document.getElementById('filterLocation');
    const relationSel = document.getElementById('filterPersonRelation');
    if (!search) return;

    const applyFilter = () => {
      const term     = (search?.value || '').toLowerCase();
      const location = locationSel?.value || '';
      const relation = relationSel?.value || '';
      document.querySelectorAll('.person-list-item').forEach(item => {
        const nameMatch     = (item.dataset.name || '').includes(term);
        const relationMatch = !relation || item.dataset.relation   === relation;
        const locationMatch = !location || (item.dataset.locationids || '').split(' ').includes(location);
        item.style.display = (nameMatch && relationMatch && locationMatch) ? '' : 'none';
      });
    };

    search?.addEventListener('input', applyFilter);
    locationSel?.addEventListener('change', applyFilter);
    relationSel?.addEventListener('change', applyFilter);

    document.querySelectorAll('.person-fav-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        const char   = window.currentCharacter;
        const person = (char?.notes?.persons || []).find(p => p.id === btn.dataset.personid);
        if (!person) return;
        person.isFavorite = !person.isFavorite;
        btn.classList.toggle('active', person.isFavorite);
        btn.textContent = person.isFavorite ? '⭐' : '☆';
        this._saveAndSync(char);
      });
    });
  },

  _attachLocationFilter() {
    // Datum-Feld ein-/ausblenden je nach Status-Auswahl. Beim Umstellen auf
    // "Besucht" wird ein noch leeres Datum mit dem In-Game-Datum des aktiven
    // Journal-Eintrags vorbelegt (nie ein vorhandenes Datum überschreiben).
    const locStatusSel = document.getElementById('locStatus');
    if (locStatusSel) {
      locStatusSel.addEventListener('change', () => {
        const dateGroup = document.getElementById('visitedDateGroup');
        if (dateGroup) dateGroup.style.display = locStatusSel.value === 'visited' ? '' : 'none';

        // Beim Umstellen auf "Besucht" ein noch leeres Datum mit dem aktiven
        // Journal vorbelegen (nie ein vorhandenes überschreiben) — über den
        // Kalender-Vertrag, das Format kennt nur das System.
        if (locStatusSel.value !== 'visited') return;
        if (document.getElementById('locVisitedDate')?.value.trim()) return;
        const d = App.currentCharacter?.activeJournalDate() || '';
        if (d) App._calendar().setInput('locVisitedDate', d);
      });
    }

    App._calendar().attachInput('locVisitedDate');
    this._attachLocTravSearch();

    const search    = document.getElementById('locationSearch');
    const statusSel = document.getElementById('filterLocStatus');

    const applyFilter = () => {
      const term   = (search?.value || '').toLowerCase();
      const status = statusSel?.value || '';
      document.querySelectorAll('.location-list-item').forEach(item => {
        const match = (item.dataset.name || '').includes(term) &&
                      (!status || item.dataset.locstatus === status);
        item.style.display = match ? '' : 'none';
      });
    };

    search?.addEventListener('input', applyFilter);
    statusSel?.addEventListener('change', applyFilter);
  },

  _attachSessionFilter() {
    const search     = document.getElementById('sessionSearch');
    const personSel  = document.getElementById('filterSessionPerson');
    const locationSel = document.getElementById('filterSessionLocation');
    const eventSel   = document.getElementById('filterSessionEvent');
    if (!search) return;

    const applyFilter = () => {
      const term       = search.value.toLowerCase();
      const personId   = personSel?.value   || '';
      const locationId = locationSel?.value || '';
      const event      = (eventSel?.value || '').toLowerCase();
      const sessions   = App.currentCharacter?.notes?.sessions || [];
      document.querySelectorAll('#sessionList .notes-list-item').forEach(item => {
        const s = sessions.find(x => x.id === item.dataset.id);
        if (!s) return;
        const textMatch     = !term ||
          (s.title   || '').toLowerCase().includes(term) ||
          (s.content || '').toLowerCase().includes(term);
        const personMatch   = !personId   || (s.tags?.persons   || []).includes(personId);
        const locationMatch = !locationId || (s.tags?.locations || []).includes(locationId);
        const eventMatch    = !event      || (s.tags?.events || []).some(e => e.toLowerCase() === event);
        item.style.display = (textMatch && personMatch && locationMatch && eventMatch) ? '' : 'none';
      });
    };

    search.addEventListener('input', applyFilter);
    personSel?.addEventListener('change', applyFilter);
    eventSel?.addEventListener('change', applyFilter);
    locationSel?.addEventListener('change', applyFilter);
  },

  _attachQuestFilter() {
    const search    = document.getElementById('questSearch');
    const statusSel = document.getElementById('filterQuestStatus');

    const applyFilter = () => {
      const term   = (search?.value || '').toLowerCase();
      const status = statusSel?.value || '';
      document.querySelectorAll('.quest-list-item').forEach(item => {
        const nameMatch   = (item.dataset.name || '').includes(term);
        const statusMatch = !status || item.dataset.qstatus === status;
        item.style.display = (nameMatch && statusMatch) ? '' : 'none';
      });
    };

    search?.addEventListener('input', applyFilter);
    statusSel?.addEventListener('change', e => {
      this._questFilterVal = e.target.value;
      App.renderCurrentPage();
    });
  },

};
