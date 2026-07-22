/**
 * Werdegang – Karriere-Timeline (MGT2-spezifisch). Prägende Ereignisse,
 * Hintergrund & Persönlichkeit und Favoriten-Kontakte sind spielunabhängig
 * und leben seit Multi-System Phase 2 (Feld-Audit F1) im Kern-Baustein
 * CareerBackground (siehe pages/career-background.js) — diese Seite bindet
 * ihn nur noch ein.
 */
const CareerPage = {

  // ── State ─────────────────────────────────────────────────────────────────
  _selectedTermId:  null,
  _editTermId:      undefined,  // undefined=kein Modal, null=neu, string=bearbeiten
  _modalImportance: 2,

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

  // ── Utilities ─────────────────────────────────────────────────────────────
  _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },
  _uid() { return 'c' + Date.now() + Math.random().toString(36).slice(2,6); },
  _career(char) { return char.career || (char.career = { terms: [] }); },
  _branch(service) { return this.BRANCHES[service] || this.BRANCHES.Other; },

  // ── Haupt-Render ──────────────────────────────────────────────────────────
  render(character) {
    const career = this._career(character);
    let html = `<div class="cr-page">
      ${this._block1(career)}
      ${CareerBackground.render(character)}
    </div>
    ${this._editTermId !== undefined ? this._termModal(career, character) : ''}`;
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
          data-termid="${this._esc(t.id)}"
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
          <button class="cr-detail-edit" data-termid="${this._esc(t.id)}">✎ Bearbeiten</button>
          <button class="cr-detail-del"  data-termid="${this._esc(t.id)}">🗑</button>
        </div>
      </div>
      ${t.events    ? `<div class="cr-detail-section"><strong>Ereignisse</strong><p>${this._esc(t.events)}</p></div>` : ''}
      ${skills      ? `<div class="cr-detail-section"><strong>Skills</strong><div class="cr-skill-tags">${skills}</div></div>` : ''}
      ${t.benefits  ? `<div class="cr-detail-section"><strong>Benefits</strong><p>${this._esc(t.benefits)}</p></div>` : ''}
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

    CareerBackground.attachListeners(char, rerender);
  },
};
