/**
 * Werdegang – Karriere-Timeline · Prägende Ereignisse · Hintergrund · Favoriten
 */
const CareerPage = {

  // ── State ─────────────────────────────────────────────────────────────────
  _selectedTermId:  null,
  _sortImportance:  false,
  _expandedEventId: null,
  _editTermId:      undefined,  // undefined=kein Modal, null=neu, string=bearbeiten
  _editEventId:     undefined,
  _modalImportance: 2,
  _secretsRevealed: false,

  // ── Konstanten ────────────────────────────────────────────────────────────
  BRANCHES: {
    Navy:     { color: '#1a6ec0', light: '#dce8ff', label: 'Navy'      },
    Marine:   { color: '#c0392b', light: '#fde8e7', label: 'Marine'    },
    Scout:    { color: '#c09a00', light: '#fff8dc', label: 'Scout'     },
    Merchant: { color: '#27ae60', light: '#dcf5e7', label: 'Merchant'  },
    Army:     { color: '#7d3c98', light: '#f0e6f6', label: 'Armee'     },
    Agent:    { color: '#2c3e50', light: '#e8ecef', label: 'Agent'     },
    Rogue:    { color: '#e67e22', light: '#fdebd0', label: 'Schurke'   },
    Other:    { color: '#95a5a6', light: '#f0f2f3', label: 'Sonstiges' },
  },

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
  _career(char) { return char.career || (char.career = { terms:[], keyEvents:[], background:{ appearance:'',personality:'',goals:'',motivation:'',secrets:'',secretsHidden:true,quotes:[] } }); },
  _branch(service) { return this.BRANCHES[service] || this.BRANCHES.Other; },

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

  // ── Haupt-Render ──────────────────────────────────────────────────────────
  render(character) {
    const career = this._career(character);
    let html = `<div class="cr-page">
      ${this._block1(career)}
      ${this._block2(career, character)}
      ${this._block3(career)}
      ${this._block4(character)}
    </div>
    ${this._editTermId !== undefined ? this._termModal(career, character) : ''}
    ${this._editEventId !== undefined ? this._eventModal(career, character) : ''}`;
    return html;
  },

  // ── Block 1: Karriere-Timeline ────────────────────────────────────────────
  _block1(career) {
    const terms = career.terms.filter(t => !t._deleted);

    let dots = '';
    terms.forEach((t, i) => {
      const br    = this._branch(t.service);
      const last  = i === terms.length - 1;
      const sel   = this._selectedTermId === t.id;
      dots += `<div class="cr-term-dot-wrap${sel?' selected':''}">
        <button class="cr-term-dot${last?' last':''}${sel?' sel':''}"
          data-termid="${t.id}"
          style="background:${br.color};${sel?'box-shadow:0 0 0 4px '+br.color+'44;':''}">
          ${i + 1}
        </button>
        <div class="cr-term-label">
          <span class="cr-term-svc" style="color:${br.color}">${this._esc(br.label)}</span>
          ${t.rank ? `<span class="cr-term-rank">${this._esc(t.rank)}</span>` : ''}
        </div>
      </div>`;
    });

    // Detail-Karte
    let detail = '';
    if (this._selectedTermId) {
      const t = terms.find(x => x.id === this._selectedTermId);
      if (t) detail = this._termDetail(t);
    }

    return `<div class="cr-block cr-block-full">
      <h3 class="cr-block-title">Karriere-Timeline</h3>
      <div class="cr-timeline-scroll">
        <div class="cr-timeline">
          ${dots || '<span class="cr-empty-inline">Noch keine Terms.</span>'}
          <button class="cr-add-term-btn" id="addTermBtn">+ Term</button>
        </div>
      </div>
      ${detail}
    </div>`;
  },

  _termDetail(t) {
    const br = this._branch(t.service);
    const skills = (t.skills || []).map(s => `<span class="cr-skill-tag">${this._esc(s)}</span>`).join('');
    return `<div class="cr-term-detail" style="border-color:${br.color}">
      <div class="cr-term-detail-header">
        <span class="cr-detail-svc" style="background:${br.color}">${this._esc(br.label)}</span>
        ${t.rank ? `<span class="cr-detail-rank">${this._esc(t.rank)}</span>` : ''}
        ${t.musteredOut ? `<span class="cr-detail-muster">Ausgemustert${t.musterOutReason ? ': '+this._esc(t.musterOutReason) : ''}</span>` : ''}
        <div class="cr-detail-actions">
          <button class="cr-detail-edit" data-termid="${t.id}">✎ Bearbeiten</button>
          <button class="cr-detail-del"  data-termid="${t.id}">🗑</button>
        </div>
      </div>
      ${t.events    ? `<div class="cr-detail-section"><strong>Ereignisse</strong><p>${this._esc(t.events)}</p></div>` : ''}
      ${skills      ? `<div class="cr-detail-section"><strong>Skills</strong><div class="cr-skill-tags">${skills}</div></div>` : ''}
      ${t.benefits  ? `<div class="cr-detail-section"><strong>Benefits</strong><p>${this._esc(t.benefits)}</p></div>` : ''}
    </div>`;
  },

  // ── Block 2: Prägende Ereignisse ──────────────────────────────────────────
  _block2(career, character) {
    const events = [...career.keyEvents].filter(e => !e._deleted).sort((a, b) =>
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
      const realIdx  = career.keyEvents.indexOf(ev);
      const expanded = this._expandedEventId === ev.id;
      const linkedP  = (ev.linkedPersonIds  || []).map(id => persons.find(p => p.id===id)?.name).filter(Boolean);
      const linkedL  = (ev.linkedLocationIds|| []).map(id => locations.find(l => l.id===id)?.name).filter(Boolean);

      rows += `<div class="cr-event-row${expanded?' expanded':''}">
        <div class="cr-event-header" data-eventid="${ev.id}">
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

  // ── Block 3: Hintergrund & Persönlichkeit ─────────────────────────────────
  _block3(career) {
    const bg = career.background || {};
    const secretsBlurred = bg.secretsHidden && !this._secretsRevealed;

    const field = (key, label, placeholder) => `
      <div class="cr-bg-group">
        <label class="cr-bg-label">${label} <span class="cr-save-feedback" data-field="${key}">✓</span></label>
        <textarea class="cr-bg-field" data-field="${key}" placeholder="${placeholder}" rows="3">${this._esc(bg[key] || '')}</textarea>
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
          <textarea class="cr-bg-field" data-field="secrets" placeholder="Verdeckte Informationen …" rows="3">${this._esc(bg.secrets || '')}</textarea>
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

  // ── Block 4: Favoriten-Kontakte ───────────────────────────────────────────
  _block4(character) {
    const persons  = character.notes?.persons || [];
    const favs     = persons.filter(p => p.isFavorite).slice(-4).reverse();
    const rel      = this.RELATIONS;

    let rows = '';
    if (!favs.length) {
      rows = `<p class="cr-empty">Noch keine Favoriten. Markiere Kontakte in der Personen-Datenbank als Favorit.</p>`;
    } else {
      favs.forEach(p => {
        const r   = rel[p.relation] || rel.neutral;
        rows += `<div class="cr-fav-row" data-personid="${p.id}">
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

  // ── Term Modal ────────────────────────────────────────────────────────────
  _termModal(career, character) {
    const isNew = this._editTermId === null;
    const t     = isNew ? {} : (career.terms.find(x => x.id === this._editTermId) || {});
    const branchOpts = Object.entries(this.BRANCHES).map(([k, v]) =>
      `<option value="${k}"${(t.service||'Other')===k?' selected':''}>${v.label}</option>`).join('');

    return `<div class="cr-modal-overlay open" id="termModal">
      <div class="cr-modal">
        <h3>${isNew ? 'Neuer Term' : 'Term bearbeiten'}</h3>
        <div class="cr-modal-row">
          <label>Dienst</label>
          <select id="tmService" class="cr-modal-field">${branchOpts}</select>
        </div>
        <div class="cr-modal-row">
          <label>Rang / Titel</label>
          <input id="tmRank"     type="text" class="cr-modal-field" value="${this._esc(t.rank||'')}" placeholder="z.B. Leutnant">
        </div>
        <div class="cr-modal-row">
          <label>Ereignisse</label>
          <textarea id="tmEvents" class="cr-modal-field" rows="3" placeholder="Was geschah in diesem Term?">${this._esc(t.events||'')}</textarea>
        </div>
        <div class="cr-modal-row">
          <label>Skills <small>(kommasepariert)</small></label>
          <input id="tmSkills"   type="text" class="cr-modal-field" value="${this._esc((t.skills||[]).join(', '))}" placeholder="z.B. Pilot, Waffen, Taktik">
        </div>
        <div class="cr-modal-row">
          <label>Benefits</label>
          <input id="tmBenefits" type="text" class="cr-modal-field" value="${this._esc(t.benefits||'')}" placeholder="z.B. +1 EDU, Cr 10.000">
        </div>
        <div class="cr-modal-row cr-modal-check">
          <label><input type="checkbox" id="tmMusteredOut" ${t.musteredOut?'checked':''}> Ausgemustert</label>
        </div>
        <div class="cr-modal-row" id="musterReasonRow" style="${t.musteredOut?'':'display:none'}">
          <label>Grund</label>
          <input id="tmMusterReason" type="text" class="cr-modal-field" value="${this._esc(t.musterOutReason||'')}" placeholder="Grund der Ausmusterung">
        </div>
        ${!isNew && t.createdAt ? `<div class="cr-modal-row"><label>Erstellt am</label><span class="ts-display">${new Date(t.createdAt).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span></div>` : ''}
        <div class="cr-modal-actions">
          <button id="tmSaveBtn"   class="cr-btn-save">Speichern</button>
          <button id="tmCancelBtn" class="cr-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  // ── Event Modal ───────────────────────────────────────────────────────────
  _eventModal(career, character) {
    const isNew    = this._editEventId === null;
    const ev       = isNew ? {} : (career.keyEvents[this._editEventId] || {});
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
          <textarea id="evDesc" class="cr-modal-field" rows="4" placeholder="Beschreibung des Ereignisses …">${this._esc(ev.description||'')}</textarea>
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

  // ── Save ──────────────────────────────────────────────────────────────────
  save(character) { /* alles wird sofort gespeichert */ },

  // ── Listener ──────────────────────────────────────────────────────────────
  attachListeners() {
    const char    = window.currentCharacter;
    const career  = this._career(char);
    const rerender = () => {
      document.getElementById('career-page').innerHTML = this.render(char);
      this.attachListeners();
    };

    // ── Timeline: Term-Punkt anklicken ───────────────────────────────────
    document.querySelectorAll('.cr-term-dot').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.termid;
        this._selectedTermId = (this._selectedTermId === id) ? null : id;
        rerender();
      });
    });

    // ── Term Detail: Bearbeiten / Löschen ────────────────────────────────
    document.querySelector('.cr-detail-edit')?.addEventListener('click', function() {
      CareerPage._editTermId = this.dataset.termid;
      CareerPage._modalImportance = 2;
      rerender();
    });
    document.querySelector('.cr-detail-del')?.addEventListener('click', function() {
      if (!window.confirm('Term löschen?')) return;
      const t = career.terms.find(t => t.id === this.dataset.termid);
      if (t) {
        const now = new Date().toISOString();
        t._deleted  = true;
        t.deletedAt = now;
        t.updatedAt = now;
      }
      CareerPage._selectedTermId = null;
      Storage.saveCharacter(char);
      rerender();
    });

    // ── Term hinzufügen ──────────────────────────────────────────────────
    document.getElementById('addTermBtn')?.addEventListener('click', () => {
      this._editTermId = null;
      this._modalImportance = 2;
      rerender();
    });

    // ── Term Modal ───────────────────────────────────────────────────────
    document.getElementById('tmMusteredOut')?.addEventListener('change', function() {
      document.getElementById('musterReasonRow').style.display = this.checked ? '' : 'none';
    });
    document.getElementById('tmCancelBtn')?.addEventListener('click', () => {
      this._editTermId = undefined;
      rerender();
    });
    document.getElementById('tmSaveBtn')?.addEventListener('click', () => {
      const service = document.getElementById('tmService').value;
      const rank    = document.getElementById('tmRank').value.trim();
      const events  = document.getElementById('tmEvents').value.trim();
      const skills  = document.getElementById('tmSkills').value.split(',').map(s=>s.trim()).filter(Boolean);
      const benefits= document.getElementById('tmBenefits').value.trim();
      const mo      = document.getElementById('tmMusteredOut').checked;
      const moR     = document.getElementById('tmMusterReason').value.trim();

      const isNew = this._editTermId === null;
      if (isNew) {
        career.terms.push({ id: this._uid(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), service, rank, events, skills, benefits, musteredOut: mo, musterOutReason: moR });
        this._selectedTermId = career.terms[career.terms.length-1].id;
      } else {
        const t = career.terms.find(x => x.id === this._editTermId);
        if (t) Object.assign(t, { service, rank, events, skills, benefits, musteredOut: mo, musterOutReason: moR, updatedAt: new Date().toISOString() });
      }
      this._editTermId = undefined;
      Storage.saveCharacter(char);
      rerender();
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
        const ev = career.keyEvents.find(x => x.id === btn.dataset.eventid);
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
        this._modalImportance = career.keyEvents[idx]?.importance || 2;
        rerender();
      });
    });

    document.querySelectorAll('.cr-event-del').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (!window.confirm('Ereignis löschen?')) return;
        const ev = career.keyEvents[parseInt(btn.dataset.idx)];
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
      const existingEv = this._editEventId !== null ? career.keyEvents[this._editEventId] : null;
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
        career.keyEvents.push(entry);
      } else {
        career.keyEvents[this._editEventId] = entry;
      }
      this._editEventId = undefined;
      Storage.saveCharacter(char);
      rerender();
    });

    // ── Hintergrund: Auto-Save on Blur ───────────────────────────────────
    document.querySelectorAll('.cr-bg-field').forEach(field => {
      field.addEventListener('blur', () => {
        career.background[field.dataset.field] = field.value;
        Storage.saveCharacter(char);
        const fb = document.querySelector(`.cr-save-feedback[data-field="${field.dataset.field}"]`);
        if (fb) { fb.style.opacity = '1'; setTimeout(() => fb.style.opacity = '0', 1200); }
      });
    });

    document.getElementById('secretsHiddenCb')?.addEventListener('change', function() {
      career.background.secretsHidden = this.checked;
      CareerPage._secretsRevealed = false;
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
        career.background.quotes.splice(parseInt(btn.dataset.idx), 1);
        Storage.saveCharacter(char);
        rerender();
      });
    });

    document.getElementById('addQuoteBtn')?.addEventListener('click', () => {
      const input = document.getElementById('newQuoteInput');
      const val   = input?.value.trim();
      if (!val) return;
      career.background.quotes.push(val);
      Storage.saveCharacter(char);
      rerender();
    });

    document.getElementById('newQuoteInput')?.addEventListener('keydown', e => {
      if (e.key === 'Enter') document.getElementById('addQuoteBtn')?.click();
    });

    // ── Favoriten: Kontakte anklicken ────────────────────────────────────
    document.querySelectorAll('.cr-fav-row').forEach(row => {
      row.addEventListener('click', () => {
        NotesPage._activeTab  = 'persons';
        NotesPage._detailId   = row.dataset.personid;
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
