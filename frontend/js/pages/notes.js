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

  // ─────────────────────────────── Datenzugriff ────────────────────────────
  _d(char) {
    const n = char.notes || {};
    return {
      sessions:  Array.isArray(n.sessions)  ? n.sessions  : [],
      persons:   Array.isArray(n.persons)   ? n.persons   : [],
      locations: Array.isArray(n.locations) ? n.locations : [],
      quests:    Array.isArray(n.quests)    ? n.quests    : []
    };
  },

  // Einträge aus dem geteilten Kampagnen-Pool die lokal noch nicht vorhanden sind
  _extEntries(tab) {
    const char = App.currentCharacter;
    if (!char?.campaignId || !App._campaignData) return [];
    const campNotes = App._campaignData.notes || {};
    const localIds  = new Set((char.notes?.[tab] || []).map(e => e.id));
    return (campNotes[tab] || [])
      .filter(e => !localIds.has(e.id))
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

  // ─────────────────────────────── Haupt-Render ────────────────────────────
  render(character) {
    const data = this._d(character);
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
      html += `<button class="notes-subtab-btn${active}" data-tab="${t.id}">
        ${t.label}${t.count !== null ? `<span class="subtab-count">${t.count}</span>` : ''}
      </button>`;
    });
    html += '</div>';
    return html;
  },

  // ─────────────────────────── SESSION JOURNAL ─────────────────────────────
  _sessionList(data) {
    const usedPersonIds   = new Set(data.sessions.flatMap(s => s.tags?.persons   || []));
    const usedLocationIds = new Set(data.sessions.flatMap(s => s.tags?.locations || []));
    const filterPersons   = data.persons.filter(p => usedPersonIds.has(p.id));
    const filterLocations = data.locations.filter(l => usedLocationIds.has(l.id));

    let html = `<div class="notes-list-header">
      <div class="person-search-row">
        <input type="text" id="sessionSearch" class="notes-search" placeholder="Sessions durchsuchen …">
        <button id="addSessionBtn" class="btn-success">+ Session</button>
      </div>
      ${filterPersons.length || filterLocations.length ? `
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
        </div>
      </div>` : ''}
      <div class="pf-row">
        ${this._sortChips('sessions', [{ value: 'createdAt', label: 'Erstellungsdatum' }, { value: 'name', label: 'Name' }])}
      </div>
    </div><div class="notes-list" id="sessionList">`;

    if (data.sessions.length === 0) {
      html += '<p class="notes-empty">Noch keine Session eingetragen. Tippe auf „+ Session".</p>';
    } else {
      this._sortedList(data.sessions, 'sessions').forEach(s => {
        const tagCount = (s.tags?.persons?.length || 0) + (s.tags?.locations?.length || 0) + (s.tags?.quests?.length || 0);
        const events = (s.tags?.events || []).map(e => `<span class="tag-chip event-chip">${this._esc(e)}</span>`).join('');
        const personIds   = (s.tags?.persons   || []).join(' ');
        const locationIds = (s.tags?.locations || []).join(' ');
        html += `
          <div class="notes-list-item"
               data-id="${s.id}"
               data-personids="${this._esc(personIds)}"
               data-locationids="${this._esc(locationIds)}">
            <div class="nli-meta">
              ${s.isActive ? '<span class="session-active-badge">Aktiv</span>' : ''}
              ${s.isCampaign ? '<span class="camp-share-badge" title="In Kampagne geteilt">🏕</span>' : ''}
              ${s.sessionDate ? `<span class="nli-date">${this._esc(s.sessionDate)}</span>` : ''}
              ${s.inGameDate  ? `<span class="nli-ingame">🗓 ${this._esc(s.inGameDate)}</span>` : ''}
            </div>
            <div class="nli-title">${this._esc(s.title || 'Ohne Titel')}</div>
            <div class="nli-tags">${events}${tagCount ? `<span class="nli-tagcount">+${tagCount} Verknüpfungen</span>` : ''}</div>
          </div>`;
      });
      const extSessions = this._extEntries('sessions');
      if (extSessions.length) {
        html += `<div class="camp-ext-section"><span class="camp-ext-label">🏕 Von Mitspielern</span>`;
        extSessions.forEach(s => {
          html += `<div class="camp-ext-entry">
            <span class="nli-title">${this._esc(s.title || 'Ohne Titel')}</span>
            ${s.sessionDate ? `<span class="nli-date">${this._esc(s.sessionDate)}</span>` : ''}
          </div>`;
        });
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  },

  _sessionDetail(id, data) {
    const isNew = id === 'new';
    const s = isNew
      ? { id: 'new', title: '', sessionDate: '', inGameDate: '', content: '', tags: { persons: [], locations: [], quests: [], events: [] } }
      : data.sessions.find(x => x.id === id);
    if (!s) return '<p class="notes-empty">Session nicht gefunden.</p>';

    // Init edit tags when entering edit for first time
    if (App.editMode && !this._editTags) {
      this._editTags = JSON.parse(JSON.stringify(s.tags || { persons: [], locations: [], quests: [], events: [] }));
    }

    const tags = App.editMode ? this._editTags : (s.tags || {});
    const taggedPersons   = (tags.persons   || []).map(pid => data.persons.find(p => p.id === pid)).filter(Boolean);
    const taggedLocations = (tags.locations || []).map(lid => data.locations.find(l => l.id === lid)).filter(Boolean);
    const taggedQuests    = (tags.quests    || []).map(qid => data.quests.find(q => q.id === qid)).filter(Boolean);
    const taggedEvents    = tags.events || [];

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew ? `<button class="btn-session-active${s.isActive ? ' is-active' : ''}" id="setActiveSessionBtn" data-id="${s.id}">
          ${s.isActive ? '● Aktiv' : 'Aktiv schalten'}
        </button>` : ''}
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${s.id}">🗑</button>` : ''}
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
              <label>In-Game-Datum (Imperialkalender)</label>
              <div class="trav-date-simple">
                <div class="trav-date-fields">
                  <div class="trav-date-field-wrap">
                    <span class="trav-date-sub-label">Jahr</span>
                    <input type="number" id="sessionDateYear" class="trav-date-num-inp"
                           value="${s.inGameDate ? s.inGameDate.split('-')[0] : ''}"
                           min="0" max="9999" placeholder="z.B. 1106">
                  </div>
                  <div class="trav-date-field-wrap">
                    <span class="trav-date-sub-label">Tag (1–365)</span>
                    <input type="number" id="sessionDateDay" class="trav-date-num-inp"
                           value="${s.inGameDate ? String(parseInt(s.inGameDate.split('-')[1] || '0')) : ''}"
                           min="1" max="365" placeholder="z.B. 190">
                  </div>
                </div>
                <input type="hidden" id="sessionIngameDate" value="${this._esc(s.inGameDate || '')}">
                <div class="trav-date-preview" id="sessionDatePreview"${s.inGameDate ? '' : ' style="display:none"'}>${s.inGameDate || ''}</div>
              </div>
            </div>
            <div class="form-group">
              <label>Erstellt am</label>
              <input type="datetime-local" id="entryCreatedAt" value="${s.createdAt ? s.createdAt.slice(0,16) : new Date().toISOString().slice(0,16)}">
            </div>
          </div>
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="sessionTitle" value="${this._esc(s.title)}" placeholder="Sessionsname">
          </div>

          <div class="form-group">
            <label>Bericht</label>
            <textarea id="sessionContent" rows="14" placeholder="Bericht …">${this._esc(s.content || '')}</textarea>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · - Liste · | Tabelle |</span>
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
          ${taggedEvents.length ? `<div class="session-events">${taggedEvents.map(e => `<span class="tag-chip event-chip">${this._esc(e)}</span>`).join('')}</div>` : ''}
          ${taggedPersons.length || taggedLocations.length || taggedQuests.length ? `
            <div class="session-links">
              ${taggedPersons.length ? `<div class="session-link-group"><strong>Personen:</strong>
                ${taggedPersons.map(p => `<span class="link-chip person-link" data-tab="persons" data-id="${p.id}">${this._esc(p.name)}</span>`).join('')}
              </div>` : ''}
              ${taggedLocations.length ? `<div class="session-link-group"><strong>Orte:</strong>
                ${taggedLocations.map(l => `<span class="link-chip location-link" data-tab="locations" data-id="${l.id}">${this._esc(l.name)}</span>`).join('')}
              </div>` : ''}
              ${taggedQuests.length ? `<div class="session-link-group"><strong>Quests:</strong>
                ${taggedQuests.map(q => `<span class="link-chip quest-link" data-tab="quests" data-id="${q.id}">${this._esc(q.title)}</span>`).join('')}
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

    if (data.persons.length === 0) {
      html += '<p class="notes-empty">Noch keine Personen eingetragen.</p>';
    } else {
      html += '<div class="person-card-grid" id="personList">';
      this._sortedList(data.persons, 'persons').forEach(p => {
        const sessCount = data.sessions.filter(s => s.tags?.persons?.includes(p.id)).length;
        const loc = p.locationId ? data.locations.find(l => l.id === p.locationId) : null;
        const meta = [
          loc       ? `📍 ${this._esc(loc.name)}` : '',
          sessCount ? `${sessCount} Session${sessCount !== 1 ? 's' : ''}` : ''
        ].filter(Boolean).join(' · ');

        html += `
          <div class="person-card notes-list-item person-list-item"
               data-id="${p.id}"
               data-name="${this._esc(p.name).toLowerCase()}"
               data-status="${p.status || ''}"
               data-relation="${p.relation || ''}"
               data-locationid="${p.locationId || ''}">
            <button class="pcard-fav person-fav-btn${p.isFavorite ? ' active' : ''}" data-personid="${p.id}" title="Favorit">
              ${p.isFavorite ? '⭐' : '☆'}
            </button>
            <div class="pcard-img">
              ${p.image
                ? `<img src="${p.image}" class="pcard-avatar-img">`
                : `<span class="pcard-avatar-ph">👤</span>`}
            </div>
            <div class="pcard-body">
              <div class="pcard-name">${this._esc(p.name || '(Kein Name)')}</div>
              ${p.role ? `<div class="pcard-role">${this._esc(p.role)}</div>` : ''}
              <div class="pcard-badges">
                <span class="status-badge status-${p.status || 'unknown'}">${this._statusLabel(p.status)}</span>
                <span class="relation-badge rel-${p.relation || 'neutral'}">${this._relationLabel(p.relation)}</span>
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
          html += `<div class="camp-ext-entry pcard-ext">
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
      ? { id: 'new', name: '', role: '', race: 'Mensch', description: '', status: 'alive', relation: 'neutral', image: null }
      : data.persons.find(x => x.id === id);
    if (!p) return '<p class="notes-empty">Person nicht gefunden.</p>';

    window._personCurrentImage = undefined; // undefined = unverändert; null = explizit entfernt; string = neu gesetzt

    const linkedSessions = data.sessions.filter(s => s.tags?.persons?.includes(p.id));

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${p.id}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      html += `
        <div class="detail-form">
          <div class="person-edit-layout">
            <div class="person-edit-image">
              <div id="personImgPreview" class="person-img-wrap">
                ${p.image
                  ? `<img src="${p.image}" class="person-img-edit">`
                  : `<div class="person-img-placeholder">👤</div>`}
              </div>
              <label for="personImgUpload" class="person-img-upload-btn">Bild wählen</label>
              <input type="file" id="personImgUpload" accept="image/*" style="display:none;">
              ${p.image ? `<button id="personImgRemove" class="person-img-remove-btn">Bild entfernen</button>` : ''}
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
                <div class="form-group">
                  <label>Rasse</label>
                  <select id="personRace">
                    <option value="Mensch"   ${(p.race || 'Mensch') === 'Mensch'   ? 'selected' : ''}>Mensch</option>
                    <option value="Vargr"    ${p.race === 'Vargr'    ? 'selected' : ''}>Vargr</option>
                    <option value="Aslan"    ${p.race === 'Aslan'    ? 'selected' : ''}>Aslan</option>
                    <option value="Zhodani"  ${p.race === 'Zhodani'  ? 'selected' : ''}>Zhodani</option>
                    <option value="Droyne"   ${p.race === 'Droyne'   ? 'selected' : ''}>Droyne</option>
                    <option value="Hiver"    ${p.race === 'Hiver'    ? 'selected' : ''}>Hiver</option>
                    <option value="K'kree"   ${p.race === "K'kree"   ? 'selected' : ''}>K'kree</option>
                    <option value="Sonstige" ${p.race === 'Sonstige' ? 'selected' : ''}>Sonstige</option>
                  </select>
                </div>
              </div>
              <div class="form-group"><label>Aufenthaltsort</label>
                <select id="personLocation">
                  <option value="">– Kein Ort –</option>
                  ${data.locations.map(loc => `<option value="${loc.id}" ${p.locationId === loc.id ? 'selected' : ''}>${this._esc(loc.name || '(Kein Name)')}</option>`).join('')}
                </select>
              </div>
            </div>
          </div>
          <div class="form-group"><label>Beschreibung</label>
            <textarea id="personDescription" rows="5" placeholder="Aussehen, Eigenheiten, wichtige Infos …">${this._esc(p.description)}</textarea>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${p.createdAt ? p.createdAt.slice(0,16) : new Date().toISOString().slice(0,16)}">
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
      const viewLoc = p.locationId ? data.locations.find(l => l.id === p.locationId) : null;
      html += `
        <div class="person-view">
          <div class="person-view-header">
            ${p.image ? `<img src="${p.image}" class="person-img-view">` : ''}
            <div class="person-view-meta">
              <h3>${this._esc(p.name || '(Kein Name)')}</h3>
              <div class="person-view-badges">
                <span class="status-badge status-${p.status || 'unknown'}">${this._statusLabel(p.status)}</span>
                <span class="relation-badge rel-${p.relation || 'neutral'}">${this._relationLabel(p.relation)}</span>
                ${viewLoc ? `<span class="link-chip location-link" data-tab="locations" data-id="${viewLoc.id}">📍 ${this._esc(viewLoc.name)}</span>` : ''}
              </div>
              ${p.role ? `<p class="person-role"><em>${this._esc(p.role)}</em></p>` : ''}
              ${p.race && p.race !== 'Mensch' ? `<p class="person-race">${this._esc(p.race)}</p>` : ''}
            </div>
          </div>
          ${p.description ? `<div class="detail-desc md-content">${Md.render(p.description)}</div>` : ''}
          ${linkedSessions.length ? `
            <h4>Erscheint in Sessions</h4>
            <div class="linked-items">
              ${linkedSessions.map(s => `
                <span class="link-chip session-link" data-tab="sessions" data-id="${s.id}">
                  ${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}
                </span>`).join('')}
            </div>` : ''}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ─────────────────── IMPERIALKALENDER HELPERS ────────────────────────────
  // Format: "YYYY-DDD" (z.B. "1105-032" = Jahr 1105, Tag 32 = Monat 2, Tag 2)
  // 12 Monate × 30 Tage = 360 Tage + 5 Feiertage am Jahresende (361-365)
  _formatTravDate(str) {
    if (!str) return '';
    const m = str.match(/^(\d+)-(\d{3})$/);
    if (!m) return str;
    const year = parseInt(m[1]);
    const doy  = parseInt(m[2]);
    if (doy > 360) return `Feiertag ${doy - 360}, Jahr ${year}`;
    const month = Math.ceil(doy / 30);
    const day   = doy - (month - 1) * 30;
    return `Tag ${day}, Monat ${month}, Jahr ${year}`;
  },

  _formatTravDateShort(str) {
    if (!str) return '';
    const m = str.match(/^(\d+)-(\d{3})$/);
    if (!m) return str;
    const year = parseInt(m[1]);
    const doy  = parseInt(m[2]);
    if (doy > 360) return `FT${doy - 360}/${year}`;
    const month = Math.ceil(doy / 30);
    const day   = doy - (month - 1) * 30;
    return `${day}/${month}/${year}`;
  },

  _attachTravDatePicker(yearId = 'travDateYear', dayId = 'travDateDay', hiddenId = 'locVisitedDate', previewId = 'travDatePreview') {
    const yearInp = document.getElementById(yearId);
    const dayInp  = document.getElementById(dayId);
    const hidden  = document.getElementById(hiddenId);
    const preview = document.getElementById(previewId);
    if (!yearInp || !dayInp || !hidden) return;

    const update = () => {
      const year = parseInt(yearInp.value);
      const day  = parseInt(dayInp.value);
      if (!yearInp.value || !dayInp.value || isNaN(year) || isNaN(day) || day < 1 || day > 365) {
        hidden.value = '';
        if (preview) { preview.textContent = ''; preview.style.display = 'none'; }
        return;
      }
      const dateStr = `${year}-${String(day).padStart(3, '0')}`;
      hidden.value = dateStr;
      if (preview) {
        preview.textContent = dateStr;
        preview.style.display = '';
      }
    };

    yearInp.addEventListener('input', update);
    dayInp.addEventListener('input', update);
  },

  _decodeUWP(uwp) {
    if (!uwp || uwp.length < 7) return null;
    const STARPORT = { A: 'Exzellent (A)', B: 'Gut (B)', C: 'Standard (C)', D: 'Gering (D)', E: 'Grenze (E)', X: 'Kein Raumhafen' };
    const ATMO = ['Keine', 'Spur', 'Sehr dünn (verg.)', 'Sehr dünn', 'Dünn (verg.)', 'Dünn', 'Standard', 'Standard (verg.)', 'Dicht', 'Dicht (verg.)', 'Exotisch', 'Korrosiv', 'Tödlich', 'Tödlich', 'Tödlich', 'Sonderform'];
    const GOV = ['Keine Reg.', 'Firmenherrschaft', 'Partizip. Demo.', 'Selbstverwaltung', 'Repräsent. Demo.', 'Feudal-Technokr.', 'Gefangenenwelt', 'Balkanisiert', 'Bürokratie', 'Imperialer Gouv.', 'Charismat. Dikt.', 'Charismat. Olig.', 'Totemist. Dikt.', 'Religiöse Dikt.', 'Religiöse Autokr.', 'Totalitäre Olig.'];
    const POP = ['Unbewohnt', 'Dutzende', 'Hunderte', 'Tausende', 'Zehntausende', 'Hunderttausende', 'Millionen', 'Zehnmillionen', 'Hundertmillionen', 'Milliarden+', 'Zig-Milliarden+'];
    const sp = uwp[0];
    const sz = parseInt(uwp[1], 16);
    const at = parseInt(uwp[2], 16);
    const hy = parseInt(uwp[3], 16);
    const pp = parseInt(uwp[4], 16);
    const gv = parseInt(uwp[5], 16);
    const ll = parseInt(uwp[6], 16);
    const tech = uwp.split('-')[1] || '';
    return {
      starport:    STARPORT[sp] || `Typ ${sp}`,
      size:        (isNaN(sz) || sz === 0) ? 'Asteroid' : `~${(sz * 1600).toLocaleString('de')} km Ø`,
      atmosphere:  ATMO[at] ?? `Code ${uwp[2]}`,
      hydrosphere: hy === 0 ? 'Wüste (0%)' : hy >= 10 ? 'Wasserreich (100%)' : `${hy * 10}% Wasser`,
      population:  POP[pp] || `Code ${uwp[4]}`,
      government:  GOV[gv] || `Code ${uwp[5]}`,
      lawLevel:    `${ll} / 9`,
      techLevel:   `TL-${parseInt(tech, 16) || tech}`,
    };
  },

  // Normalisiert einen Travellermap-API-Treffer (World / Sector / Subsector) in ein einheitliches Objekt
  _parseTravellermapHit(item) {
    if (item.World) {
      const w   = item.World;
      const hex = String(w.HexX).padStart(2,'0') + String(w.HexY).padStart(2,'0');
      return { type: 'world',     icon: '🌐', name: w.Name, sector: w.Sector || '', hex, uwp: w.Uwp || '',
               sublabel: `${w.Sector || ''} · ${hex}${w.Uwp ? ' · ' + w.Uwp : ''}`,
               navScale: 64 };
    }
    if (item.Sector) {
      const s    = item.Sector;
      const name = s.Names?.[0]?.Text || s.Name || '(Unbekannter Sektor)';
      return { type: 'sector',    icon: '🗺️', name, sector: name, hex: null, uwp: null,
               sublabel: 'Sektor', navScale: 8 };
    }
    if (item.Subsector) {
      const ss   = item.Subsector;
      const name = ss.Names?.[0]?.Text || ss.Name || '(Unbekannter Teilsektor)';
      return { type: 'subsector', icon: '📍', name, sector: ss.Sector || '', hex: null, uwp: null,
               sublabel: `Teilsektor · ${ss.Sector || ''}`, navScale: 16 };
    }
    return null;
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
      <div class="loc-filter-row">
        ${this._sortChips('locations', [{ value: 'name', label: 'Name' }, { value: 'createdAt', label: 'Erstellungsdatum' }, { value: 'visitedDate', label: 'Besuchsdatum' }])}
      </div>
    </div><div class="notes-list" id="locationList">`;

    if (data.locations.length === 0) {
      html += '<p class="notes-empty">Noch keine Orte eingetragen.</p>';
    } else {
      this._sortedList(data.locations, 'locations').forEach(l => {
        html += `
          <div class="notes-list-item location-list-item"
               data-id="${l.id}"
               data-name="${this._esc(l.name).toLowerCase()}"
               data-locstatus="${l.status || ''}">
            <div class="loc-li-content">
              <div class="nli-row">
                <span class="nli-title">${this._esc(l.name || '(Kein Name)')}</span>
                ${l.isCampaign ? '<span class="camp-share-badge" title="In Kampagne geteilt">🏕</span>' : ''}
                ${l.status === 'visited' && l.visitedDate
                  ? `<span class="loc-status-badge loc-visited">✓ ${this._esc(l.visitedDate)}</span>`
                  : `<span class="loc-status-badge loc-${l.status || 'known'}">${this._locStatusLabel(l.status)}</span>`}
              </div>
              ${l.sector ? `<div class="nli-sub">${this._esc(l.sector)}</div>` : ''}
            </div>
            ${l.mapX != null ? `
              <button class="loc-list-map-btn" data-locid="${l.id}" title="Auf Karte zeigen">🗺</button>` : ''}
          </div>`;
      });
      const extLocs = this._extEntries('locations');
      if (extLocs.length) {
        html += `<div class="camp-ext-section"><span class="camp-ext-label">🏕 Von Mitspielern</span>`;
        extLocs.forEach(l => {
          html += `<div class="camp-ext-entry">
            <span class="nli-title">${this._esc(l.name || '(Kein Name)')}</span>
            ${l.sector ? `<span class="nli-sub">${this._esc(l.sector)}</span>` : ''}
          </div>`;
        });
        html += '</div>';
      }
    }
    html += '</div>';
    return html;
  },

  _locationDetail(id, data) {
    const isNew = id === 'new';
    const prefill = isNew && this._prefillLocation ? this._prefillLocation : null;
    this._prefillLocation = null;
    const l = isNew
      ? { id: 'new', name: prefill?.name || '', sector: prefill?.sector || '', uwp: prefill?.uwp || '',
          description: '', notes: '', status: 'visited', visitedDate: '',
          mapX: prefill?.mapX ?? null, mapY: prefill?.mapY ?? null,
          mapSector: prefill?.mapSector || null, mapHex: prefill?.mapHex || null }
      : data.locations.find(x => x.id === id);
    if (!l) return '<p class="notes-empty">Ort nicht gefunden.</p>';

    const linkedSessions = data.sessions.filter(s => s.tags?.locations?.includes(l.id));
    const directPersons  = data.persons.filter(p => p.locationId === l.id);
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
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${l.id}">🗑</button>` : ''}
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
            <input type="hidden" id="locMapX"      value="${l.mapX      ?? ''}">
            <input type="hidden" id="locMapY"      value="${l.mapY      ?? ''}">
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
              <label>Besuchsdatum (Imperialkalender)</label>
              <div class="trav-date-simple">
                <div class="trav-date-fields">
                  <div class="trav-date-field-wrap">
                    <span class="trav-date-sub-label">Jahr</span>
                    <input type="number" id="travDateYear" class="trav-date-num-inp"
                           value="${l.visitedDate ? l.visitedDate.split('-')[0] : ''}"
                           min="0" max="9999" placeholder="z.B. 1106">
                  </div>
                  <div class="trav-date-field-wrap">
                    <span class="trav-date-sub-label">Tag (1–365)</span>
                    <input type="number" id="travDateDay" class="trav-date-num-inp"
                           value="${l.visitedDate ? String(parseInt(l.visitedDate.split('-')[1] || '0')) : ''}"
                           min="1" max="365" placeholder="z.B. 190">
                  </div>
                </div>
                <input type="hidden" id="locVisitedDate" value="${this._esc(l.visitedDate || '')}">
                <div class="trav-date-preview" id="travDatePreview"${l.visitedDate ? '' : ' style="display:none"'}>${l.visitedDate || ''}</div>
              </div>
            </div>
          </div>
          <div class="form-group"><label>Beschreibung</label>
            <textarea id="locDescription" rows="4" placeholder="Atmosphäre, Regierung, wichtige Orte …">${this._esc(l.description)}</textarea>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>
          </div>
          <div class="form-group"><label>Notizen</label>
            <textarea id="locNotes" rows="3" placeholder="Persönliche Anmerkungen, Gerüchte, Kontakte …">${this._esc(l.notes)}</textarea>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${l.createdAt ? l.createdAt.slice(0,16) : new Date().toISOString().slice(0,16)}">
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
            <span class="loc-status-badge loc-${l.status || 'known'}">${this._locStatusLabel(l.status)}</span>
          </div>
          <div class="loc-meta">
            ${l.sector ? `<span>📍 ${this._esc(l.sector)}</span>` : ''}
            ${l.visitedDate ? `<span>📅 ${this._esc(l.visitedDate)}</span>` : ''}
            ${l.mapX != null
              ? `<button class="btn-map-show" id="showOnMapBtn" data-locid="${l.id}">🗺 Auf Karte zeigen</button>`
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
              ${linkedSessions.map(s => `<span class="link-chip session-link" data-tab="sessions" data-id="${s.id}">${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}</span>`).join('')}
            </div>` : ''}
          ${directPersons.length ? `
            <h4>Personen hier</h4>
            <div class="linked-items">
              ${directPersons.map(p => `<span class="link-chip person-link" data-tab="persons" data-id="${p.id}">📍 ${this._esc(p.name)}</span>`).join('')}
            </div>` : ''}
          ${sessionPersons.length ? `
            <h4>Aus Sessions bekannt</h4>
            <div class="linked-items">
              ${sessionPersons.map(p => `<span class="link-chip person-link" data-tab="persons" data-id="${p.id}">${this._esc(p.name)}</span>`).join('')}
            </div>` : ''}
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
      <div class="loc-filter-row">
        ${this._sortChips('quests', [{ value: 'createdAt', label: 'Erstellungsdatum' }, { value: 'name', label: 'Name' }])}
      </div>
    </div><div class="notes-list" id="questList">`;

    const filtered = this._sortedList(data.quests, 'quests')
      .filter(q => !f || (q.status || 'active') === f);

    if (data.quests.length === 0) {
      html += '<p class="notes-empty">Noch keine Quests eingetragen.</p>';
    } else if (filtered.length === 0) {
      html += '<p class="notes-hint">Keine Quests in dieser Kategorie.</p>';
    }

    filtered.forEach(q => {
      const giver = data.persons.find(p => p.id === q.questgiverId);
      html += `
        <div class="notes-list-item quest-list-item"
             data-id="${q.id}" data-qstatus="${q.status || 'active'}" data-name="${this._esc((q.title || '').toLowerCase())}">
          <div class="nli-row">
            <span class="nli-title">${this._esc(q.title || 'Ohne Titel')}</span>
            ${q.isCampaign ? '<span class="camp-share-badge" title="In Kampagne geteilt">🏕</span>' : ''}
            <span class="quest-status-badge qst-${q.status || 'active'}">${this._questStatusLabel(q.status)}</span>
          </div>
          <div class="nli-sub">
            ${giver  ? `Auftraggeber: ${this._esc(giver.name)} · ` : ''}
            ${q.reward ? `Belohnung: ${this._esc(q.reward)}` : ''}
          </div>
        </div>`;
    });

    const extQuests = this._extEntries('quests');
    if (extQuests.length) {
      html += `<div class="camp-ext-section"><span class="camp-ext-label">🏕 Von Mitspielern</span>`;
      extQuests.forEach(q => {
        html += `<div class="camp-ext-entry">
          <div class="nli-row">
            <span class="nli-title">${this._esc(q.title || 'Ohne Titel')}</span>
            <span class="quest-status-badge qst-${q.status || 'active'}">${this._questStatusLabel(q.status)}</span>
          </div>
        </div>`;
      });
      html += '</div>';
    }
    html += '</div>';
    return html;
  },

  _questDetail(id, data) {
    const isNew = id === 'new';
    const q = isNew
      ? { id: 'new', title: '', description: '', objective: '', reward: '', questgiverId: '', status: 'active' }
      : data.quests.find(x => x.id === id);
    if (!q) return '<p class="notes-empty">Quest nicht gefunden.</p>';

    const giver = data.persons.find(p => p.id === q.questgiverId);
    const linkedSessions = data.sessions.filter(s => s.tags?.quests?.includes(q.id));

    let html = `<div class="notes-detail">
      <div class="notes-detail-header">
        <button class="btn-back" id="backBtn">← Zurück</button>
        ${!isNew && App.editMode ? `<button class="btn-danger btn-icon" id="deleteItemBtn" data-id="${q.id}">🗑</button>` : ''}
      </div>`;

    if (App.editMode) {
      html += `
        <div class="detail-form">
          <div class="form-group"><label>Titel</label>
            <input type="text" id="questTitle" value="${this._esc(q.title)}" placeholder="Questname">
          </div>
          <div class="detail-form-row">
            <div class="form-group"><label>Status</label>
              <select id="questStatus">
                <option value="active"    ${q.status === 'active'    ? 'selected' : ''}>Aktiv</option>
                <option value="backlog"   ${q.status === 'backlog'   ? 'selected' : ''}>Backlog</option>
                <option value="completed" ${q.status === 'completed' ? 'selected' : ''}>Abgeschlossen</option>
                <option value="failed"    ${q.status === 'failed'    ? 'selected' : ''}>Gescheitert</option>
              </select>
            </div>
            <div class="form-group"><label>Auftraggeber</label>
              <div class="person-picker">
                <div class="person-picker-field">
                  <input type="text"   id="questGiverSearch"
                         class="person-picker-input"
                         value="${giver ? this._esc(giver.name) : ''}"
                         placeholder="Person suchen …"
                         autocomplete="off">
                  <button type="button" class="person-picker-clear" id="questGiverClear"
                          style="${giver ? '' : 'display:none'}">×</button>
                </div>
                <input type="hidden" id="questGiverId" value="${this._esc(q.questgiverId)}">
                <div class="person-picker-dropdown" id="questGiverDropdown">
                  ${data.persons.map(p => `
                    <div class="person-picker-option" data-id="${this._esc(p.id)}" data-name="${this._esc(p.name)}">
                      <span class="pp-name">${this._esc(p.name)}</span>
                      ${p.role ? `<span class="pp-role">${this._esc(p.role)}</span>` : ''}
                    </div>`).join('')}
                  ${data.persons.length === 0 ? '<div class="pp-empty">Noch keine Personen angelegt</div>' : ''}
                </div>
              </div>
            </div>
          </div>
          <div class="form-group"><label>Ziel / Aufgabe</label>
            <textarea id="questObjective" rows="3" placeholder="Was muss erreicht werden?">${this._esc(q.objective)}</textarea>
            <span class="md-hint">**fett** · *kursiv* · - Liste · | Tabelle |</span>
          </div>
          <div class="form-group"><label>Belohnung</label>
            <input type="text" id="questReward" value="${this._esc(q.reward)}" placeholder="z.B. 50.000 Cr, Passage, Information">
          </div>
          <div class="form-group"><label>Beschreibung / Hintergrund</label>
            <textarea id="questDescription" rows="4" placeholder="Kontext, Hinweise, offene Fragen …">${this._esc(q.description)}</textarea>
            <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>
          </div>
          <div class="form-group form-group-ts">
            <label>Erstellt am</label>
            <input type="datetime-local" id="entryCreatedAt" value="${q.createdAt ? q.createdAt.slice(0,16) : new Date().toISOString().slice(0,16)}">
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
            <span class="quest-status-badge qst-${q.status || 'active'}">${this._questStatusLabel(q.status)}</span>
          </div>
          ${giver ? `<p class="quest-giver">Auftraggeber: <span class="link-chip person-link" data-tab="persons" data-id="${giver.id}">${this._esc(giver.name)}</span></p>` : ''}
          ${q.objective ? `<div class="detail-section"><strong>Ziel</strong><div class="md-content">${Md.render(q.objective)}</div></div>` : ''}
          ${q.reward ? `<div class="detail-section"><strong>Belohnung:</strong> ${this._esc(q.reward)}</div>` : ''}
          ${q.description ? `<div class="detail-desc md-content">${Md.render(q.description)}</div>` : ''}
          ${linkedSessions.length ? `
            <h4>Erwähnt in Sessions</h4>
            <div class="linked-items">
              ${linkedSessions.map(s => `<span class="link-chip session-link" data-tab="sessions" data-id="${s.id}">${s.sessionDate ? this._esc(s.sessionDate) + ' – ' : ''}${this._esc(s.title || 'Ohne Titel')}</span>`).join('')}
            </div>` : ''}
        </div>`;
    }

    html += '</div>';
    return html;
  },

  // ────────────────────────── TAG-PICKER HELPER ────────────────────────────
  _tagPicker(type, selected, all, label) {
    const selectedIds = selected.map(x => x.id);
    const available   = all.filter(x => !selectedIds.includes(x.id));
    const nameKey     = type === 'quests' ? 'title' : 'name';

    return `
      <div class="tag-picker" data-type="${type}">
        <label>${label}</label>
        <div class="tag-chips" id="chips-${type}">
          ${selected.map(x => `
            <span class="tag-chip tp-chip" data-type="${type}" data-id="${x.id}">
              ${this._esc(x[nameKey])}
              <button class="chip-rm" data-type="${type}" data-id="${x.id}">×</button>
            </span>`).join('')}
          <button class="chip-add-btn" data-type="${type}">+ ${label}</button>
        </div>
        <div class="tag-picker-dropdown" id="tpd-${type}" style="display:none">
          <input type="text" class="tp-search" data-type="${type}" placeholder="${label} suchen …">
          <button class="tp-create-btn" data-type="${type}">✚ ${this._newItemLabel(type)}</button>
          <div class="tp-create-form" id="tpcf-${type}" style="display:none">
            <input type="text" class="tp-create-input" data-type="${type}" placeholder="Name …">
            <button class="tp-create-save btn-primary" data-type="${type}">Erstellen</button>
          </div>
          <div class="tp-options" id="tpo-${type}">
            ${available.map(x => `
              <label class="tp-option">
                <input type="checkbox" data-type="${type}" data-id="${x.id}">
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
      const existing = isNew ? null : data.sessions.find(s => s.id === id);
      const entry = {
        id:          isNew ? ('s' + Date.now()) : id,
        title:       document.getElementById('sessionTitle')?.value?.trim() || '',
        sessionDate: document.getElementById('sessionDate')?.value || '',
        inGameDate:  document.getElementById('sessionIngameDate')?.value || '',
        content:     document.getElementById('sessionContent')?.value || '',
        tags:        this._editTags || { persons: [], locations: [], quests: [], events: [] },
        isActive:    existing?.isActive || false,
        isCampaign:  !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:   existing?.createdAt || createdAt,
      };
      if (isNew) {
        if (entry.title) { data.sessions.push(entry); this._detailId = entry.id; }
      } else {
        const idx = data.sessions.findIndex(s => s.id === id);
        if (idx >= 0) data.sessions[idx] = entry;
      }
      // _editTags intentionally NOT cleared here: autosave calls save() without
      // re-rendering, so clearing _editTags would corrupt the picker state and
      // lose tags on the next manual save. Navigation handlers clear it instead.
      this._editTags = JSON.parse(JSON.stringify(entry.tags));

    } else if (this._activeTab === 'persons') {
      const existing = isNew ? null : data.persons.find(p => p.id === id);
      const entry = {
        id:          isNew ? ('p' + Date.now()) : id,
        name:        document.getElementById('personName')?.value?.trim() || '',
        role:        document.getElementById('personRole')?.value?.trim() || '',
        race:        document.getElementById('personRace')?.value || 'Mensch',
        description: document.getElementById('personDescription')?.value || '',
        status:      document.getElementById('personStatus')?.value || 'alive',
        relation:    document.getElementById('personRelation')?.value || 'neutral',
        locationId:  document.getElementById('personLocation')?.value || null,
        image:       window._personCurrentImage !== undefined ? window._personCurrentImage : (existing?.image ?? null),
        isFavorite:  existing?.isFavorite || false,
        isCampaign:  !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:   existing?.createdAt || createdAt,
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
        const idx = data.persons.findIndex(p => p.id === id);
        if (idx >= 0) data.persons[idx] = entry;
      }

    } else if (this._activeTab === 'locations') {
      const existing = isNew ? null : data.locations.find(l => l.id === id);
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
        const idx = data.locations.findIndex(l => l.id === id);
        if (idx >= 0) data.locations[idx] = entry;
      }

    } else if (this._activeTab === 'quests') {
      const existing = isNew ? null : data.quests.find(q => q.id === id);
      const entry = {
        id:           isNew ? ('q' + Date.now()) : id,
        title:        document.getElementById('questTitle')?.value?.trim() || '',
        status:       document.getElementById('questStatus')?.value || 'active',
        questgiverId: document.getElementById('questGiverId')?.value || '',
        objective:    document.getElementById('questObjective')?.value || '',
        reward:       document.getElementById('questReward')?.value?.trim() || '',
        description:  document.getElementById('questDescription')?.value || '',
        isCampaign:   !!(document.getElementById('entryCampaignToggle')?.checked ?? existing?.isCampaign),
        createdAt:    existing?.createdAt || createdAt,
      };
      if (isNew) {
        if (entry.title) { data.quests.push(entry); this._detailId = entry.id; }
      } else {
        const idx = data.quests.findIndex(q => q.id === id);
        if (idx >= 0) data.quests[idx] = entry;
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

    // Sortier-Chips
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
        if (wasNew && (tab === 'persons' || tab === 'sessions')) App.editMode = false;
        App.renderCurrentPage();
      }
    });

    // Löschen
    document.getElementById('deleteItemBtn')?.addEventListener('click', (e) => {
      if (!confirm('Eintrag wirklich löschen?')) return;
      const id = e.currentTarget.dataset.id;
      const data = this._d(App.currentCharacter);
      const key = { sessions: 'sessions', persons: 'persons', locations: 'locations', quests: 'quests' }[this._activeTab];
      data[key] = data[key].filter(x => x.id !== id);
      App.currentCharacter.notes = data;
      this._saveAndSync(App.currentCharacter);
      this._detailId = null;
      this._editTags = null;
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

    // Listen-Items → Detail-Ansicht
    document.querySelectorAll('.notes-list-item').forEach(item => {
      item.addEventListener('click', () => {
        this._detailId = item.dataset.id;
        this._editTags = null;
        App.renderCurrentPage();
      });
    });

    // Verlinkungen (Link-Chips) → zu dem betreffenden Tab + Eintrag springen
    document.querySelectorAll('.link-chip[data-tab]').forEach(chip => {
      chip.addEventListener('click', () => {
        const tab = chip.dataset.tab;
        const id  = chip.dataset.id;
        if (tab && id) {
          if (App.currentCharacter) {
            this.save(App.currentCharacter);
          }
          this._activeTab = tab;
          this._detailId  = id;
          this._editTags  = null;
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
      App.renderCurrentPage();
    });
    document.getElementById('addLocationBtn')?.addEventListener('click', () => {
      if (!App.editMode) App.editMode = true;
      this._detailId = 'new';
      App.renderCurrentPage();
    });
    document.getElementById('addQuestBtn')?.addEventListener('click',    () => { this._detailId = 'new'; App.renderCurrentPage(); });

    // Person-Bild Upload (komprimiert auf max 320×320, JPEG 0.75)
    document.getElementById('personImgUpload')?.addEventListener('change', e => {
      const file = e.target.files[0];
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
          const compressed = canvas.toDataURL('image/jpeg', 0.75);
          window._personCurrentImage = compressed;
          const preview = document.getElementById('personImgPreview');
          if (preview) preview.innerHTML = `<img src="${compressed}" class="person-img-edit">`;
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
        };
        img.src = ev.target.result;
      };
      reader.readAsDataURL(file);
    });

    const _removePersonImg = (preview, btn) => {
      window._personCurrentImage = null;
      if (preview) preview.innerHTML = '<div class="person-img-placeholder">👤</div>';
      btn?.remove();
    };
    document.getElementById('personImgRemove')?.addEventListener('click', () => {
      const preview = document.getElementById('personImgPreview');
      const btn     = document.getElementById('personImgRemove');
      _removePersonImg(preview, btn);
    });

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

    // Auftraggeber-Picker
    this._attachQuestGiverPicker();

    // In-Game-Datum im Journal
    this._attachTravDatePicker('sessionDateYear', 'sessionDateDay', 'sessionIngameDate', 'sessionDatePreview');

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
    App.renderCurrentPage();
  },

  _attachTagPicker() {
    if (!this._editTags) return;

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
        if (!this._editTags[type]) this._editTags[type] = [];
        if (!this._editTags[type].includes(id)) {
          this._editTags[type].push(id);
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
        chip.innerHTML = `${this._esc(item[nameKey])}<button class="chip-rm" data-type="${type}" data-id="${id}">×</button>`;
        chip.querySelector('.chip-rm').addEventListener('click', (e) => {
          e.stopPropagation();
          this._removeTag(type, id, chip);
        });
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
    const doCreate = (type) => {
      const input = document.querySelector(`.tp-create-input[data-type="${type}"]`);
      const name  = input?.value?.trim();
      if (!name) return;

      const char    = App.currentCharacter;
      const data    = this._d(char);
      const nameKey = type === 'quests' ? 'title' : 'name';
      const prefix  = { persons: 'p', locations: 'l', quests: 'q' }[type] || 'x';
      const newItem = { id: prefix + Date.now(), [nameKey]: name, createdAt: new Date().toISOString() };

      if (type === 'persons')   { newItem.status = 'alive';   newItem.race = 'Mensch'; newItem.relation = 'neutral'; }
      if (type === 'locations') { newItem.status = 'known'; }
      if (type === 'quests')    { newItem.status = 'active'; newItem.title = name; }

      data[type].push(newItem);
      char.notes = data;

      if (!this._editTags[type]) this._editTags[type] = [];
      this._editTags[type].push(newItem.id);

      // Chip in DOM einfügen
      const chipsEl = document.getElementById(`chips-${type}`);
      const addBtn  = chipsEl?.querySelector('.chip-add-btn');
      const chip    = document.createElement('span');
      chip.className = 'tag-chip tp-chip';
      chip.dataset.type = type;
      chip.dataset.id   = newItem.id;
      chip.innerHTML = `${this._esc(name)}<button class="chip-rm" data-type="${type}" data-id="${newItem.id}">×</button>`;
      chip.querySelector('.chip-rm').addEventListener('click', (e) => {
        e.stopPropagation();
        this._removeTag(type, newItem.id, chip);
      });
      if (addBtn) chipsEl.insertBefore(chip, addBtn);

      // Dropdown schließen, Formular zurücksetzen
      document.getElementById(`tpd-${type}`).style.display = 'none';
      document.getElementById(`tpcf-${type}`).style.display = 'none';
      if (input) input.value = '';

      this._saveAndSync(char);
    };

    document.querySelectorAll('.tp-create-save').forEach(btn => {
      btn.addEventListener('click', () => doCreate(btn.dataset.type));
    });

    document.querySelectorAll('.tp-create-input').forEach(input => {
      input.addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); doCreate(input.dataset.type); }
      });
    });

    // Bestehende Chips: Remove-Button
    document.querySelectorAll('.chip-rm').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const type = btn.dataset.type;
        const id   = btn.dataset.id;
        const chip = btn.closest('.tp-chip');
        this._removeTag(type, id, chip);
      });
    });
  },

  _removeTag(type, id, chipEl) {
    if (!this._editTags || !this._editTags[type]) return;
    this._editTags[type] = this._editTags[type].filter(x => x !== id);
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
    opt.innerHTML = `<input type="checkbox" data-type="${type}" data-id="${id}">${this._esc(item[nameKey])}`;
    opt.querySelector('input').addEventListener('change', (e) => {
      if (!e.target.checked) return;
      e.target.closest('label').style.display = 'none';
      if (!this._editTags[type]) this._editTags[type] = [];
      this._editTags[type].push(id);
      const chipsEl = document.getElementById(`chips-${type}`);
      const addBtn  = chipsEl?.querySelector('.chip-add-btn');
      const chip    = document.createElement('span');
      chip.className = 'tag-chip tp-chip';
      chip.dataset.type = type; chip.dataset.id = id;
      chip.innerHTML = `${this._esc(item[nameKey])}<button class="chip-rm" data-type="${type}" data-id="${id}">×</button>`;
      chip.querySelector('.chip-rm').addEventListener('click', (ev) => {
        ev.stopPropagation();
        this._removeTag(type, id, chip);
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
        const locationMatch = !location || item.dataset.locationid === location;
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

  _attachLocAutocomplete() {
    const nameInput   = document.getElementById('locName');
    const suggestEl   = document.getElementById('locNameSuggestions');
    const mapXInput   = document.getElementById('locMapX');
    const mapYInput   = document.getElementById('locMapY');
    const mapSecInput = document.getElementById('locMapSector');
    const mapHexInput = document.getElementById('locMapHex');
    const badgeEl     = document.getElementById('locMapBadge');
    if (!nameInput || !suggestEl) return;

    let timer = null;

    const clearLink = () => {
      if (mapXInput)   mapXInput.value   = '';
      if (mapYInput)   mapYInput.value   = '';
      if (mapSecInput) mapSecInput.value = '';
      if (mapHexInput) mapHexInput.value = '';
      if (badgeEl)     badgeEl.remove();
    };

    const closeSuggestions = () => { suggestEl.innerHTML = ''; };

    nameInput.addEventListener('input', () => {
      clearLink();
      closeSuggestions();
      const q = nameInput.value.trim();
      clearTimeout(timer);
      if (q.length < 2) return;

      suggestEl.innerHTML = '<div class="loc-suggest-loading">⏳ Suche in Travellermap …</div>';

      timer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(q)}`, { mode: 'cors' });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const json = await res.json();

          // API gibt Results.Items[].World zurück (alles kapitalisiert)
          const raw  = json.Results?.Items || [];
          const hits = raw.map(i => i.World).filter(Boolean).slice(0, 8);

          if (!hits.length) {
            suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer im Traveller-Universum</div>';
            return;
          }

          // Hex-String aus HexX + HexY zusammensetzen (z.B. 17,29 → "1729")
          const hexStr = h => String(h.HexX).padStart(2,'0') + String(h.HexY).padStart(2,'0');

          suggestEl.innerHTML = hits.map(h => `
            <div class="loc-suggest-item"
                 data-name="${this._esc(h.Name)}"
                 data-sector="${this._esc(h.Sector || '')}"
                 data-uwp="${this._esc(h.Uwp || '')}"
                 data-hex="${hexStr(h)}"
                 data-sectorx="${h.SectorX ?? ''}"
                 data-sectory="${h.SectorY ?? ''}">
              <strong>${this._esc(h.Name)}</strong>
              <span>${this._esc(h.Sector || '')} · ${hexStr(h)}${h.Uwp ? ' · ' + this._esc(h.Uwp) : ''}</span>
            </div>`).join('');

          suggestEl.querySelectorAll('.loc-suggest-item').forEach(item => {
            item.addEventListener('mousedown', (e) => {
              e.preventDefault();
              nameInput.value = item.dataset.name;
              const sectorEl = document.getElementById('locSector');
              const uwpEl    = document.getElementById('locUwp');
              if (sectorEl) sectorEl.value = item.dataset.sector;
              if (uwpEl)    uwpEl.value    = item.dataset.uwp;
              if (mapXInput)   mapXInput.value   = item.dataset.sectorx;
              if (mapYInput)   mapYInput.value   = item.dataset.sectory;
              if (mapSecInput) mapSecInput.value = item.dataset.sector;
              if (mapHexInput) mapHexInput.value = item.dataset.hex;
              closeSuggestions();

              const existing = document.getElementById('locMapBadge');
              if (existing) existing.remove();
              const badge = document.createElement('div');
              badge.id        = 'locMapBadge';
              badge.className = 'loc-map-badge';
              badge.innerHTML = `🗺 Verknüpft: ${this._esc(item.dataset.sector)} ${this._esc(item.dataset.hex)}
                <button class="loc-map-unlink" id="locMapUnlink">× Entfernen</button>`;
              nameInput.closest('.form-group').appendChild(badge);
              document.getElementById('locMapUnlink')?.addEventListener('click', clearLink);
            });
          });
        } catch (e) {
          suggestEl.innerHTML = `<div class="loc-suggest-empty">⚠️ Travellermap nicht erreichbar – bitte Internetverbindung prüfen</div>`;
        }
      }, 350);
    });

    nameInput.addEventListener('blur', () => setTimeout(closeSuggestions, 200));

    document.getElementById('locMapUnlink')?.addEventListener('click', clearLink);
  },

  _attachLocTravSearch() {
    const input     = document.getElementById('locTravSearch');
    const suggestEl = document.getElementById('locTravSuggestions');
    if (!input || !suggestEl) return;

    const savedSet = new Set(JSON.parse(suggestEl.dataset.saved || '[]'));
    let timer = null;

    input.addEventListener('input', () => {
      const q = input.value.trim();
      clearTimeout(timer);
      suggestEl.innerHTML = '';
      if (q.length < 2) return;
      suggestEl.innerHTML = '<div class="loc-suggest-loading">⏳ Suche in Travellermap …</div>';
      timer = setTimeout(async () => {
        try {
          const res  = await fetch(`https://travellermap.com/api/search?q=${encodeURIComponent(q)}`, { mode: 'cors' });
          if (!res.ok) throw new Error();
          const json = await res.json();
          const raw  = json.Results?.Items || [];
          const hits = raw.map(i => this._parseTravellermapHit(i)).filter(Boolean).slice(0, 8);
          if (!hits.length) {
            suggestEl.innerHTML = '<div class="loc-suggest-empty">Kein Treffer</div>';
            return;
          }
          suggestEl.innerHTML = hits.map((h, i) => {
            const key      = `${h.sector}|${h.hex}`;
            const isSaved  = h.type === 'world' && savedSet.has(key);
            const actionHtml = App.editMode
              ? `<button class="loc-trav-action ${isSaved ? 'saved' : 'add'}" data-idx="${i}">
                   ${isSaved ? '→ Anzeigen' : '+ Hinzufügen'}
                 </button>`
              : (isSaved ? `<span class="loc-trav-saved-badge">✓ Gespeichert</span>` : '');
            return `<div class="loc-suggest-item loc-trav-item" data-idx="${i}">
              <div class="loc-trav-item-info">
                <strong>${h.icon} ${this._esc(h.name)}</strong>
                <span>${this._esc(h.sublabel)}</span>
              </div>
              ${actionHtml}
            </div>`;
          }).join('');
          suggestEl._hits = hits;

          // Action buttons
          suggestEl.querySelectorAll('.loc-trav-action').forEach(btn => {
            btn.addEventListener('mousedown', (e) => {
              e.preventDefault();
              e.stopPropagation();
              const hit  = suggestEl._hits?.[parseInt(btn.dataset.idx)];
              if (!hit) return;
              suggestEl.innerHTML = '';
              input.value = '';

              if (btn.classList.contains('saved')) {
                // Navigate to the existing saved location
                const data = this._d(App.currentCharacter);
                const key  = `${hit.sector}|${hit.hex}`;
                const loc  = data.locations.find(l => l.mapSector === hit.sector && l.mapHex === hit.hex);
                if (loc) { this._detailId = loc.id; App.renderCurrentPage(); }
              } else {
                // Pre-fill new location form
                this._prefillLocation = {
                  name: hit.name, sector: hit.sector, uwp: hit.uwp || '',
                  mapSector: hit.sector, mapHex: hit.hex,
                  mapX: null, mapY: null,
                };
                this._detailId = 'new';
                App.renderCurrentPage();
              }
            });
          });
        } catch {
          suggestEl.innerHTML = '<div class="loc-suggest-empty">⚠️ Travellermap nicht erreichbar</div>';
        }
      }, 320);
    });

    input.addEventListener('blur', () => setTimeout(() => { suggestEl.innerHTML = ''; }, 200));
  },

  _attachLocationFilter() {
    // Datum-Feld ein-/ausblenden je nach Status-Auswahl
    const locStatusSel = document.getElementById('locStatus');
    if (locStatusSel) {
      locStatusSel.addEventListener('change', () => {
        const dateGroup = document.getElementById('visitedDateGroup');
        if (dateGroup) dateGroup.style.display = locStatusSel.value === 'visited' ? '' : 'none';
      });
    }

    this._attachTravDatePicker();
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
    if (!search) return;

    const applyFilter = () => {
      const term       = search.value.toLowerCase();
      const personId   = personSel?.value   || '';
      const locationId = locationSel?.value || '';
      const sessions   = App.currentCharacter?.notes?.sessions || [];
      document.querySelectorAll('#sessionList .notes-list-item').forEach(item => {
        const s = sessions.find(x => x.id === item.dataset.id);
        if (!s) return;
        const textMatch     = !term ||
          (s.title   || '').toLowerCase().includes(term) ||
          (s.content || '').toLowerCase().includes(term);
        const personMatch   = !personId   || (s.tags?.persons   || []).includes(personId);
        const locationMatch = !locationId || (s.tags?.locations || []).includes(locationId);
        item.style.display = (textMatch && personMatch && locationMatch) ? '' : 'none';
      });
    };

    search.addEventListener('input', applyFilter);
    personSel?.addEventListener('change', applyFilter);
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

  _attachQuestGiverPicker() {
    const searchEl   = document.getElementById('questGiverSearch');
    const idEl       = document.getElementById('questGiverId');
    const dropdown   = document.getElementById('questGiverDropdown');
    const clearBtn   = document.getElementById('questGiverClear');
    if (!searchEl || !idEl || !dropdown) return;

    const show = () => { dropdown.style.display = 'block'; };
    const hide = () => { dropdown.style.display = 'none'; };

    const filter = () => {
      const q = searchEl.value.toLowerCase();
      dropdown.querySelectorAll('.person-picker-option').forEach(opt => {
        opt.style.display = opt.dataset.name.toLowerCase().includes(q) ? '' : 'none';
      });
      show();
    };

    searchEl.addEventListener('focus', () => filter());
    searchEl.addEventListener('input', () => filter());
    searchEl.addEventListener('blur',  () => setTimeout(hide, 200));

    dropdown.querySelectorAll('.person-picker-option').forEach(opt => {
      opt.addEventListener('mousedown', e => {
        e.preventDefault(); // keep focus on input so blur fires after selection
        searchEl.value    = opt.dataset.name;
        idEl.value        = opt.dataset.id;
        if (clearBtn) clearBtn.style.display = '';
        hide();
      });
    });

    clearBtn?.addEventListener('click', () => {
      searchEl.value  = '';
      idEl.value      = '';
      clearBtn.style.display = 'none';
      filter();
    });
  },

};
