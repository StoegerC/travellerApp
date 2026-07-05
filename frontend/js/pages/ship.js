/**
 * Schiff-Seite – MGT2 Raumschiff-Verwaltung
 */
const ShipPage = {
  _activeTab: 'info',

  _CRIT_SYSTEMS: [
    { key: 'armour',      label: 'Panzerung'  },
    { key: 'bridge',      label: 'Brücke'     },
    { key: 'cargo',       label: 'Fracht'     },
    { key: 'crew',        label: 'Besatzung'  },
    { key: 'fuel',        label: 'Treibstoff' },
    { key: 'hull',        label: 'Rumpf'      },
    { key: 'j-drive',     label: 'J-Antrieb'  },
    { key: 'm-drive',     label: 'M-Antrieb'  },
    { key: 'power-plant', label: 'Kraftwerk'  },
    { key: 'sensors',     label: 'Sensoren'   },
    { key: 'weapons',     label: 'Bewaffnung' },
  ],

  _ROLES: ['Pilot', 'Co-Pilot', 'Schütze', 'Ingenieur', 'Sensor-Operator', 'Medic', 'Kapitän'],

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _finFmt(n) {
    return 'Cr ' + Math.abs(Math.round(n)).toLocaleString('de-DE');
  },

  _finFmtSigned(n) {
    return (n >= 0 ? '+' : '−') + this._finFmt(n);
  },

  _ship(character) {
    if (!character.activeShipId) return null;
    return (character.ships || []).find(s => s.id === character.activeShipId && !s._deleted) || null;
  },

  // Bumpt updatedAt nur, wenn sich der Inhalt gegenueber dem vorherigen Stand
  // wirklich geaendert hat. save() liest bei JEDEM _doSave() (auch reinen
  // Tab-Wechseln im Edit-Modus) die komplette Tabelle neu ein - ohne diesen
  // Vergleich wuerde jede Zeile bei jedem Aufruf einen frischen Zeitstempel
  // bekommen und den Dirty-Check dauerhaft "changed" melden.
  _stampUpdatedAt(item, existing) {
    if (!existing) return { ...item, updatedAt: new Date().toISOString() };
    const { updatedAt: _u1, _deleted: _d1, deletedAt: _da1, ...itemRest } = item;
    const { updatedAt: _u2, _deleted: _d2, deletedAt: _da2, ...existingRest } = existing;
    const changed = JSON.stringify(itemRest) !== JSON.stringify(existingRest);
    return { ...item, updatedAt: changed ? new Date().toISOString() : existing.updatedAt };
  },

  // ── Render ───────────────────────────────────────────────────────────────

  render(character) {
    const ships = (character.ships || []).filter(s => !s._deleted);
    const ship  = this._ship(character);

    let html = `<div class="ship-page-title">
      <h2>Schiff</h2>
      ${ship ? `<span class="ship-name-subtitle">${this._esc(ship.name)}</span>` : ''}
    </div>`;

    if (!ship) {
      html += this._renderSelector(character, ships, ship);
      const hint = this._externalShips(character, ships).length
        ? 'Kein Schiff ausgewählt. Wähle oben ein geteiltes Kampagnen-Schiff oder füge über das <strong>+</strong> ein neues hinzu.'
        : 'Kein Schiff vorhanden. Füge über das <strong>+</strong> ein neues hinzu.';
      return html + `<p class="ship-empty">${hint}</p>`;
    }

    const tabs = [
      { id: 'info',     label: 'Übersicht'    },
      { id: 'status',   label: 'Status'       },
      { id: 'crits',    label: 'Krit. Treffer' },
      { id: 'weapons',  label: 'Bewaffnung'   },
      { id: 'crew',     label: 'Crew & Rollen' },
      { id: 'finances', label: 'Finanzen'     },
    ];

    html += '<div class="ship-subtabs">';
    tabs.forEach(t => {
      html += `<button class="ship-subtab${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`;
    });
    html += '</div>';

    if      (this._activeTab === 'info')     html += this._renderInfo(ship, character, ships);
    else if (this._activeTab === 'status')   html += this._renderStatus(ship);
    else if (this._activeTab === 'crits')    html += this._renderCrits(ship);
    else if (this._activeTab === 'weapons')  html += this._renderWeapons(ship);
    else if (this._activeTab === 'crew')     html += this._renderCrew(ship, character);
    else                                     html += this._renderFinances(ship);

    return html;
  },

  // Kampagnen-Schiffe, die geteilt sind aber lokal noch nicht übernommen wurden
  _externalShips(character, ships) {
    const campaignShips = App._campaignData?.ships;
    if (!Array.isArray(campaignShips)) return [];
    const localIds = new Set(ships.map(s => s.id));
    return campaignShips.filter(s => s.isCampaign && !s._deleted && !localIds.has(s.id));
  },

  _renderSelector(character, ships, ship) {
    const opts = ships.map(s =>
      `<option value="${this._esc(s.id)}"${s.id === character.activeShipId ? ' selected' : ''}>${this._esc(s.name || 'Unbenannt')}</option>`
    ).join('');

    const external = this._externalShips(character, ships);
    const extOpts = external.map(s =>
      `<option value="ext:${this._esc(s.id)}">🏕 ${this._esc(s.name || 'Unbenannt')} (Kampagne)</option>`
    ).join('');

    const inCampaign = !!character.campaignId;
    const campaignBadge = ship && inCampaign
      ? `<button class="ship-campaign-toggle${ship.isCampaign ? ' on' : ''}" id="shipCampaignToggle">
           ${ship.isCampaign ? '🏕 Geteilt' : '🔒 Privat'}
         </button>`
      : '';

    return `<div class="ship-selector-bar">
      <select class="ship-selector-select" id="shipSelect"${!ships.length && !external.length ? ' disabled' : ''}>
        ${ships.length ? opts : (external.length ? '' : '<option value="">– Kein Schiff –</option>')}
        ${extOpts}
      </select>
      <div class="ship-selector-btns">
        <button id="shipNewBtn" class="btn-success ship-sel-btn" title="Neues Schiff">＋</button>
        ${ship ? `<button id="shipDelBtn" class="btn-danger ship-sel-btn" title="Schiff löschen">✕</button>` : ''}
        ${campaignBadge}
      </div>
    </div>`;
  },

  // ── Info ─────────────────────────────────────────────────────────────────

  _renderInfo(ship, character, ships) {
    const selector = this._renderSelector(character, ships, ship);
    const imgHtml = ship.image
      ? `<img src="${ship.image}" class="ship-portrait" alt="Schiff">`
      : `<div class="ship-portrait-placeholder">🚀</div>`;

    if (App.editMode) {
      return selector + `<div class="ship-section">
        <div class="ship-info-layout">
          <div class="ship-portrait-col">
            ${imgHtml}
            <label class="ship-img-label" for="shipImgInput">
              <span class="ship-img-btn">📷 Bild wählen</span>
            </label>
            <input type="file" id="shipImgInput" accept="image/*" style="display:none">
            ${ship.image ? '<button id="shipImgDelBtn" class="ship-img-del">✕ Bild löschen</button>' : ''}
          </div>
          <div class="ship-info-fields">
            <div class="ship-field-group">
              <label class="ship-field-lbl">Name</label>
              <input id="si-name"  class="ship-input" value="${this._esc(ship.name)}">
              <label class="ship-field-lbl">Klasse</label>
              <input id="si-class" class="ship-input" value="${this._esc(ship.class || '')}">
              <label class="ship-field-lbl">TL</label>
              <input id="si-tl"    class="ship-input" value="${this._esc(ship.tl || '')}" type="number" min="0" max="25">
              <label class="ship-field-lbl">Tonnage</label>
              <input id="si-ton"   class="ship-input" value="${this._esc(ship.tonnage || '')}" type="number" min="0">
              <label class="ship-field-lbl">Besitzer</label>
              <input id="si-owner" class="ship-input" value="${this._esc(ship.owner || '')}">
            </div>
          </div>
        </div>

        <h3 class="ship-section-title">Antriebe &amp; Systeme</h3>
        <div class="ship-drives-grid">
          <label class="ship-field-lbl">M-Antrieb</label><input id="si-mdrive" class="ship-input" value="${this._esc(ship.mDrive || '')}" placeholder="z.B. 2G">
          <label class="ship-field-lbl">J-Antrieb</label><input id="si-jdrive" class="ship-input" value="${this._esc(ship.jDrive || '')}" placeholder="z.B. J-2">
          <label class="ship-field-lbl">Kraftwerk</label><input id="si-pp"     class="ship-input" value="${this._esc(ship.powerPlant || '')}" placeholder="z.B. A">
          <label class="ship-field-lbl">Computer</label><input id="si-comp"    class="ship-input" value="${this._esc(ship.computer || '')}"    placeholder="z.B. Model/2">
          <label class="ship-field-lbl">Sensoren</label><input id="si-sens"    class="ship-input" value="${this._esc(ship.sensors || '')}"     placeholder="z.B. Standard">
          <label class="ship-field-lbl">Treibstoff max. (T)</label><input id="si-fuel" class="ship-input" value="${ship.fuelMax || 0}" type="number" min="0">
        </div>

        <h3 class="ship-section-title">Betriebskosten</h3>
        <div class="ship-drives-grid">
          <label class="ship-field-lbl">Kosten / Monat (Cr)</label>
          <input id="si-cost" class="ship-input" value="${ship.operatingCost || 0}" type="number" min="0">
        </div>

        <h3 class="ship-section-title">Notizen</h3>
        <textarea id="si-notes" class="ship-notes">${this._esc(ship.notes || '')}</textarea>
      </div>`;
    }

    // View mode
    const row = (lbl, val) => val
      ? `<div class="ship-info-row"><span class="ship-info-lbl">${lbl}</span><span class="ship-info-val">${this._esc(String(val))}</span></div>`
      : '';

    return selector + `<div class="ship-section">
      <div class="ship-info-layout">
        <div class="ship-portrait-col">${imgHtml}</div>
        <div class="ship-info-fields">
          ${row('Klasse',   ship.class)}
          ${row('TL',       ship.tl)}
          ${row('Tonnage',  ship.tonnage ? ship.tonnage + ' T' : '')}
          ${row('Besitzer', ship.owner)}
        </div>
      </div>

      <h3 class="ship-section-title">Antriebe &amp; Systeme</h3>
      <div class="ship-info-2col">
        ${row('M-Antrieb', ship.mDrive)}
        ${row('J-Antrieb', ship.jDrive)}
        ${row('Kraftwerk', ship.powerPlant)}
        ${row('Computer',  ship.computer)}
        ${row('Sensoren',  ship.sensors)}
        ${row('Treibstoff max.', ship.fuelMax ? ship.fuelMax + ' T' : '')}
        ${row('Betriebskosten', ship.operatingCost ? 'Cr ' + Number(ship.operatingCost).toLocaleString('de-DE') + ' / Monat' : '')}
      </div>

      ${ship.notes ? `<h3 class="ship-section-title">Notizen</h3><p class="ship-notes-view">${this._esc(ship.notes)}</p>` : ''}
    </div>`;
  },

  // ── Status ────────────────────────────────────────────────────────────────

  _renderStatus(ship) {
    const hMax  = parseInt(ship.hullMax)          || 0;
    const hCur  = parseInt(ship.hullCurrent)      ?? hMax;
    const sMax  = parseInt(ship.structureMax)     || 0;
    const sCur  = parseInt(ship.structureCurrent) ?? sMax;
    const aBase = parseInt(ship.armorBase)        || 0;
    const aCur  = parseInt(ship.armor)            || 0;
    const fMax  = parseInt(ship.fuelMax)          || 0;
    const fCur  = parseInt(ship.fuelCurrent)      ?? fMax;

    const track = (id, cur, max, cls) => {
      const pct = max > 0 ? Math.round((cur / max) * 100) : 0;
      return `<div class="ship-track-wrap">
        <div class="ship-track-bar"><div class="ship-track-fill ${cls}" style="width:${Math.min(100,pct)}%"></div></div>
        <div class="ship-track-nums">
          <span class="ship-track-cur">${cur}</span><span class="ship-track-sep">/</span><span class="ship-track-max">${max}</span>
        </div>
        <div class="ship-track-btns">
          <button class="ship-track-btn" data-track="${id}" data-delta="-1">−</button>
          <button class="ship-track-btn" data-track="${id}" data-delta="1">+</button>
        </div>
      </div>`;
    };

    const hCls = hCur === 0 ? 'ship-track-red' : hCur < hMax ? 'ship-track-yellow' : 'ship-track-green';
    const sCls = sCur === 0 ? 'ship-track-red' : sCur < sMax ? 'ship-track-yellow' : 'ship-track-green';

    return `<div class="ship-section">
      <div class="ship-status-grid">

        <div class="ship-status-card">
          <div class="ship-status-label">Rumpf (Hull)</div>
          ${App.editMode
            ? `<div class="ship-status-edit-row">
                 <span class="ship-status-sub">Aktuell</span><input class="ship-input ship-status-inp" id="ss-hcur"  type="number" min="0" value="${hCur}">
                 <span class="ship-status-sub">Max</span>    <input class="ship-input ship-status-inp" id="ss-hmax"  type="number" min="0" value="${hMax}">
               </div>`
            : track('hull', hCur, hMax, hCls)}
        </div>

        <div class="ship-status-card">
          <div class="ship-status-label">Struktur</div>
          ${App.editMode
            ? `<div class="ship-status-edit-row">
                 <span class="ship-status-sub">Aktuell</span><input class="ship-input ship-status-inp" id="ss-scur"  type="number" min="0" value="${sCur}">
                 <span class="ship-status-sub">Max</span>    <input class="ship-input ship-status-inp" id="ss-smax"  type="number" min="0" value="${sMax}">
               </div>`
            : track('structure', sCur, sMax, sCls)}
        </div>

        <div class="ship-status-card">
          <div class="ship-status-label">Panzerung</div>
          ${App.editMode
            ? `<div class="ship-status-edit-row">
                 <span class="ship-status-sub">Aktuell</span><input class="ship-input ship-status-inp" id="ss-acur"  type="number" min="0" value="${aCur}">
                 <span class="ship-status-sub">Basis</span>  <input class="ship-input ship-status-inp" id="ss-abase" type="number" min="0" value="${aBase}">
               </div>`
            : `<div class="ship-armor-display">
                 <span class="ship-armor-val">${aCur}</span>
                 ${aBase !== aCur ? `<span class="ship-armor-base">/ ${aBase} Basis</span>` : ''}
               </div>`}
        </div>

        <div class="ship-status-card">
          <div class="ship-status-label">Treibstoff</div>
          ${App.editMode
            ? `<div class="ship-status-edit-row">
                 <span class="ship-status-sub">Aktuell</span><input class="ship-input ship-status-inp" id="ss-fcur"  type="number" min="0" value="${fCur}">
                 <span class="ship-status-sub">Max</span>    <input class="ship-input ship-status-inp" id="ss-fmax"  type="number" min="0" value="${fMax}">
               </div>`
            : track('fuel', fCur, fMax, 'ship-track-blue')}
        </div>

      </div>
    </div>`;
  },

  // ── Kritische Treffer ─────────────────────────────────────────────────────

  _renderCrits(ship) {
    const hits  = ship.critHits  || {};
    const notes = ship.critNotes || {};
    let rows = '';
    this._CRIT_SYSTEMS.forEach(sys => {
      const sysHits = hits[sys.key] || [false,false,false,false,false,false];
      let cells = '';
      for (let i = 0; i < 6; i++) {
        const on = !!(sysHits[i]);
        cells += `<td class="ship-crit-cell"><button class="ship-crit-box${on ? ' hit' : ''}" data-sys="${sys.key}" data-lvl="${i}">${on ? '✕' : ''}</button></td>`;
      }
      const hasNote = !!(notes[sys.key] && notes[sys.key].trim());
      cells += `<td class="ship-crit-note-cell"><button class="btn-info ship-crit-note-btn${hasNote ? ' has-note' : ''}" data-sys="${sys.key}">Details${hasNote ? ' •' : ''}</button></td>`;
      rows += `<tr><td class="ship-crit-label">${sys.label}</td>${cells}</tr>`;
    });

    return `<div class="ship-section">
      <div class="ship-crits-scroll">
        <table class="ship-crits-table">
          <thead><tr>
            <th class="ship-crit-sys-hdr">System</th>
            <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
            <th class="ship-crit-note-hdr">Notiz</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="ship-crits-hint">Box antippen zum Markieren / Aufheben</p>
    </div>`;
  },

  // Generisches Markdown-Notiz-Modal (Krit-Treffer, Waffen-Merkmale, …)
  // getText() liefert den aktuellen Text, onSave(value) schreibt ihn zurück + persistiert.
  _showNoteModal(title, label, getText, onSave) {
    const modal = document.createElement('div');
    modal.className = 'traits-modal-overlay';
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    let editing = App.editMode;

    const renderModal = () => {
      const current = getText() || '';
      modal.innerHTML = `
        <div class="traits-modal">
          <h3>${this._esc(title)}</h3>
          ${editing
            ? `<label class="traits-label">${this._esc(label)}</label>
               <textarea id="noteModalText" class="traits-textarea">${this._esc(current)}</textarea>
               <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>`
            : `<div class="traits-desc-view md-content">${Md.render(current) || '<p class="md-p" style="color:#999">Keine Notiz.</p>'}</div>`}
          <div class="traits-actions">
            <button id="noteModalCancelBtn" class="btn-secondary">Schließen</button>
            ${editing
              ? '<button id="noteModalSaveBtn" class="btn-primary">Speichern</button>'
              : '<button id="noteModalEditBtn" class="btn-primary">✎ Bearbeiten</button>'}
          </div>
        </div>`;

      modal.querySelector('#noteModalCancelBtn').addEventListener('click', () => modal.remove());

      if (editing) {
        modal.querySelector('#noteModalSaveBtn').addEventListener('click', () => {
          onSave(modal.querySelector('#noteModalText').value);
          modal.remove();
          App.renderCurrentPage();
        });
      } else {
        modal.querySelector('#noteModalEditBtn').addEventListener('click', () => {
          editing = true;
          renderModal();
        });
      }
    };

    renderModal();
  },

  _showCritNote(sysKey) {
    const char = window.currentCharacter;
    const ship = this._ship(char);
    if (!ship) return;
    if (!ship.critNotes) ship.critNotes = {};
    const sysLabel = (this._CRIT_SYSTEMS.find(s => s.key === sysKey) || {}).label || sysKey;

    this._showNoteModal(`${sysLabel} – Notiz`, 'Defekte Teile / Notiz',
      () => ship.critNotes[sysKey],
      (value) => {
        ship.critNotes[sysKey] = value;
        this._saveAndSync(char);
      });
  },

  _showWeaponNote(idx) {
    const char   = window.currentCharacter;
    const ship   = this._ship(char);
    if (!ship) return;
    const weapon = (ship.weapons || []).filter(w => !w._deleted)[idx];
    if (!weapon) return;

    this._showNoteModal(`${weapon.name || 'Waffe'} – Merkmale`, 'Merkmale',
      () => weapon.details,
      (value) => {
        weapon.details = value;
        weapon.updatedAt = new Date().toISOString();
        this._saveAndSync(char);
      });
  },

  // ── Bewaffnung ────────────────────────────────────────────────────────────

  _renderWeapons(ship) {
    const weapons = (ship.weapons || []).filter(w => !w._deleted);

    if (App.editMode) {
      let rows = weapons.map((w, i) => {
        const hasNote = !!(w.details && w.details.trim());
        return `<tr>
        <td><input class="sw-name"    value="${this._esc(w.name)}"></td>
        <td><select class="sw-type">
          <option value="turret"   ${w.type==='turret'   ?'selected':''}>Turret</option>
          <option value="barbette" ${w.type==='barbette' ?'selected':''}>Barbette</option>
          <option value="bay"      ${w.type==='bay'      ?'selected':''}>Bay</option>
          <option value="spinal"   ${w.type==='spinal'   ?'selected':''}>Spinal</option>
        </select></td>
        <td><input class="sw-dmg"     value="${this._esc(w.damage   ||'')}" placeholder="1D6"></td>
        <td><input class="sw-range"   value="${this._esc(w.range    ||'')}" placeholder="Nah/Mittel"></td>
        <td><input class="sw-traits"  value="${this._esc(w.traits   ||'')}" placeholder="AP 5 …"></td>
        <td><input class="sw-ammo"    value="${w.ammo    != null ? w.ammo    : ''}" type="number" min="0" placeholder="–"></td>
        <td><input class="sw-ammomax" value="${w.ammoMax != null ? w.ammoMax : ''}" type="number" min="0" placeholder="–"></td>
        <td class="ship-weapon-note-cell"><button class="btn-info sw-details${hasNote ? ' has-note' : ''}" data-idx="${i}">Merkmale${hasNote ? ' •' : ''}</button></td>
        <td><button class="btn-danger sw-rm" data-idx="${i}">✕</button></td>
      </tr>`;
      }).join('');

      if (!rows) rows = `<tr><td colspan="9" class="ship-empty-cell">Keine Waffen eingetragen.</td></tr>`;

      return `<div class="ship-section">
        <div class="ship-add-row"><button id="shipAddWeaponBtn" class="btn-success">+ Waffe hinzufügen</button></div>
        <div class="ship-weapon-scroll">
          <table class="ship-weapon-table">
            <thead><tr><th>Name</th><th>Typ</th><th>Schaden</th><th>Reichweite</th><th>Traits</th><th>Mun.</th><th>Max</th><th>Merkmale</th><th></th></tr></thead>
            <tbody id="shipWeaponBody">${rows}</tbody>
          </table>
        </div>
      </div>`;
    }

    // View mode
    let rows = weapons.map((w, i) => {
      const hasMag  = w.ammoMax != null && w.ammoMax !== '';
      const hasNote = !!(w.details && w.details.trim());
      return `<tr>
        <td class="sw-nm">${this._esc(w.name||'–')}</td>
        <td>${this._esc(w.type||'–')}</td>
        <td>${this._esc(w.damage||'–')}</td>
        <td>${this._esc(w.range||'–')}</td>
        <td class="sw-traits-cell">${this._esc(w.traits||'–')}</td>
        <td>${hasMag
          ? `<div class="ship-ammo-ctrl">
               <button class="ship-ammo-btn" data-idx="${i}" data-delta="-1">−</button>
               <span class="ship-ammo-disp" data-idx="${i}">${parseInt(w.ammo)||0}</span>
               <button class="ship-ammo-btn" data-idx="${i}" data-delta="1">+</button>
               <span class="ship-ammo-max">/ ${w.ammoMax}</span>
             </div>`
          : '–'}
        </td>
        <td class="ship-weapon-note-cell"><button class="btn-info sw-details${hasNote ? ' has-note' : ''}" data-idx="${i}">Merkmale${hasNote ? ' •' : ''}</button></td>
      </tr>`;
    }).join('');

    if (!rows) rows = `<tr><td colspan="7" class="ship-empty-cell">Keine Waffen eingetragen.</td></tr>`;

    return `<div class="ship-section">
      <div class="ship-weapon-scroll">
        <table class="ship-weapon-table">
          <thead><tr><th>Name</th><th>Typ</th><th>Schaden</th><th>Reichweite</th><th>Traits</th><th>Munition</th><th>Merkmale</th></tr></thead>
          <tbody id="shipWeaponBody">${rows}</tbody>
        </table>
      </div>
    </div>`;
  },

  // ── Crew & Rollen ─────────────────────────────────────────────────────────

  _renderCrew(ship, character) {
    if (!ship.crewRoles) ship.crewRoles = {};
    // Einmalige Migration alter, charakter-lokaler Rollenauswahl
    const legacyRoles = (character.shipRoles || {})[ship.id];
    if (legacyRoles && legacyRoles.length && !ship.crewRoles[character.id]) {
      ship.crewRoles[character.id] = { name: character.metadata?.name || 'Unbenannt', roles: legacyRoles.slice() };
    }

    const myRoles   = ship.crewRoles[character.id]?.roles || [];
    const positions = ship.crewPositions || [];
    const costVal   = parseInt(ship.operatingCost) || 0;

    const rolesHtml = `<div class="ship-roles-grid">${
      this._ROLES.map(r =>
        `<button class="ship-role-btn${myRoles.includes(r) ? ' active' : ''}" data-role="${r}">${r}</button>`
      ).join('')
    }</div>`;

    const autoRows = Object.values(ship.crewRoles).flatMap(entry =>
      (entry.roles || []).map(role => ({ role, person: entry.name || 'Unbenannt' }))
    );
    const autoHtml = autoRows.length
      ? autoRows.map(r => `<div class="ship-pos-view-row ship-pos-auto">
          <span class="ship-pos-role">${this._esc(r.role)}</span>
          <span class="ship-pos-name">${this._esc(r.person)}</span>
        </div>`).join('')
      : '<p class="ship-empty">Noch keine Rollen von Crew-Mitgliedern gewählt.</p>';

    let posHtml;
    if (App.editMode) {
      const posRows = positions.map((p, i) => `
        <div class="ship-pos-row">
          <input class="ship-input sp-pos-name"   value="${this._esc(p.position||'')}" placeholder="Position (z.B. Koch)">
          <input class="ship-input sp-pos-person"  value="${this._esc(p.person||'')}"   placeholder="Name (optional)">
          <button class="btn-danger sp-pos-rm" data-idx="${i}">✕</button>
        </div>`).join('') || '<p class="ship-empty" id="shipCrewEmpty">Keine weiteren Besatzungsmitglieder eingetragen.</p>';

      posHtml = `<div id="shipCrewPositions">${posRows}</div>
        <button id="shipAddPosBtn" class="btn-success" style="margin-top:8px">+ Weiteres Mitglied hinzufügen</button>`;
    } else {
      posHtml = positions.length
        ? positions.map(p => `<div class="ship-pos-view-row">
            <span class="ship-pos-role">${this._esc(p.position||'–')}</span>
            <span class="ship-pos-name">${this._esc(p.person||'–')}</span>
          </div>`).join('')
        : '';
    }

    return `<div class="ship-section">
      <h3 class="ship-section-title">Meine Rollen an Bord</h3>
      <p class="ship-roles-hint">Tippe auf eine Rolle um sie zu aktivieren / deaktivieren</p>
      ${rolesHtml}

      <h3 class="ship-section-title">Mannschaft</h3>
      ${costVal ? `<p class="ship-cost-display">Betriebskosten: <strong>Cr ${costVal.toLocaleString('de-DE')}</strong> / Monat</p>` : ''}
      <div class="ship-crew-auto">${autoHtml}</div>
      ${posHtml}
    </div>`;
  },

  // ── Finanzen (eigene Schiffskasse) ──────────────────────────────────────────

  _renderFinances(ship) {
    const f      = ship.finances || { cashCredits: 0, transactions: [], recurringItems: [], debts: [] };
    if (!f.recurringItems) f.recurringItems = [];
    if (!f.debts)          f.debts          = [];
    const balCls = f.cashCredits >= 0 ? 'fin-pos' : 'fin-neg';

    const visibleTx = f.transactions.filter(t => !t._deleted);
    const list = visibleTx.slice().sort((a, b) => b.createdAt - a.createdAt);
    let rows = '';
    if (!list.length) {
      rows = `<p class="fin-empty">Noch keine Transaktionen.</p>`;
    } else {
      list.forEach(t => {
        const realIdx = f.transactions.indexOf(t);
        const amtCls  = t.amount >= 0 ? 'fin-pos' : 'fin-neg';
        rows += `<div class="fin-tx-row">
          <span class="fin-tx-date">${this._esc(t.ingameDate || '–')}</span>
          <span class="fin-tx-desc">${this._esc(t.description || '')}</span>
          <span class="fin-tx-amt ${amtCls}">${this._finFmtSigned(t.amount)}</span>
          <button class="ship-fin-tx-del" data-idx="${realIdx}">✕</button>
        </div>`;
      });
    }

    let recRows = '';
    f.recurringItems.forEach((item, i) => {
      if (item._deleted) return; // Index i bleibt roh (siehe data-idx-Nutzung)
      const amtCls      = item.amount >= 0 ? 'fin-pos' : 'fin-neg';
      const intervalLbl = { monthly: 'Monatlich', bimonthly: 'Alle 2 Monate', semiannual: 'Alle 6 Monate', weekly: 'Wöchentlich', yearly: 'Jährlich' }[item.interval] || item.interval;
      recRows += `<div class="fin-rec-row">
        <span class="fin-rec-desc">${this._esc(item.description)}</span>
        <span class="fin-rec-interval">${intervalLbl}</span>
        <span class="fin-rec-amt ${amtCls}">${this._finFmtSigned(item.amount)}</span>
        <label class="fin-switch">
          <input type="checkbox" class="ship-fin-rec-toggle" data-idx="${i}" ${item.isActive ? 'checked' : ''}>
          <span class="fin-switch-slider"></span>
        </label>
        <button class="ship-fin-rec-del" data-idx="${i}">✕</button>
      </div>`;
    });
    if (!recRows) recRows = `<p class="fin-empty">Keine wiederkehrenden Posten.</p>`;

    let debtCards = '';
    f.debts.forEach((d, i) => {
      if (d._deleted) return; // Index i bleibt roh (siehe data-idx-Nutzung)
      const paid = (d.totalAmount || 0) - (d.remainingAmount || 0);
      const pct  = d.totalAmount > 0 ? Math.min(100, Math.max(0, Math.round((paid / d.totalAmount) * 100))) : 0;
      const done = (d.remainingAmount || 0) <= 0;

      debtCards += `<div class="fin-debt-card">
        <div class="fin-debt-header">
          <div>
            <span class="fin-debt-name">${this._esc(d.name)}</span>
            ${d.creditor ? `<span class="fin-debt-creditor">${this._esc(d.creditor)}</span>` : ''}
          </div>
          <button class="ship-fin-debt-del" data-idx="${i}">✕</button>
        </div>
        <div class="fin-progress-track">
          <div class="fin-progress-fill" style="width:${pct}%"></div>
        </div>
        <div class="fin-debt-info">
          <span>${pct}% abbezahlt</span>
          <span class="fin-debt-numbers">
            <span class="fin-neg">${this._finFmt(d.remainingAmount || 0)} verbleibend</span>
            &nbsp;|&nbsp;${this._finFmt(d.monthlyPayment || 0)} / Monat
          </span>
        </div>
        ${done
          ? `<div class="fin-debt-done">✅ Abbezahlt</div>`
          : `<button class="ship-fin-debt-pay" data-idx="${i}" data-payment="${d.monthlyPayment || 0}">
               Rate zahlen (${this._finFmt(d.monthlyPayment || 0)})
             </button>`
        }
      </div>`;
    });
    if (!debtCards) debtCards = `<p class="fin-empty">Keine Schulden eingetragen.</p>`;

    return `<div class="ship-section">
      <div class="fin-block fin-block-balance">
        <div class="fin-balance ${balCls}">${this._finFmt(f.cashCredits)}</div>
        <div class="fin-main-btns">
          <button id="shipFinIncomeBtn"  class="fin-btn-income">+ Einnahme</button>
          <button id="shipFinExpenseBtn" class="fin-btn-expense">− Ausgabe</button>
        </div>
      </div>
      <div class="fin-block">
        <h3 class="fin-block-title">Wiederkehrende Posten</h3>
        <div class="fin-rec-list">${recRows}</div>
        <div class="fin-rec-footer">
          <button id="shipAddRecurringBtn"  class="fin-btn-secondary">+ Posten hinzufügen</button>
          <button id="shipMonthlySettleBtn" class="fin-btn-settle">📅 Abrechnen</button>
        </div>
      </div>
      <div class="fin-block">
        <h3 class="fin-block-title">Schulden</h3>
        <div class="fin-debt-list">${debtCards}</div>
        <button id="shipAddDebtBtn" class="fin-btn-secondary">+ Schuld hinzufügen</button>
      </div>
      <div class="fin-block">
        <h3 class="fin-block-title">Transaktionen</h3>
        <div class="fin-tx-list">${rows}</div>
      </div>
      ${this._modalShipTx()}
      ${this._modalShipRec()}
      ${this._modalShipDebt()}
    </div>`;
  },

  _modalShipTx() {
    return `<div class="fin-modal-overlay" id="shipTxModal">
      <div class="fin-modal">
        <h3 id="shipTxModalTitle">Einnahme</h3>
        <input id="shipTxAmount" type="number" min="0" placeholder="Betrag (Cr)" class="fin-modal-field">
        <input id="shipTxDesc"   type="text"   placeholder="Beschreibung"        class="fin-modal-field">
        <input id="shipTxDate"   type="text"   placeholder="Ingame-Datum (z.B. 1105-234)" class="fin-modal-field">
        <div class="fin-modal-actions">
          <button id="shipTxSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="shipTxCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  _modalShipRec() {
    return `<div class="fin-modal-overlay" id="shipRecModal">
      <div class="fin-modal">
        <h3>Wiederkehrender Posten</h3>
        <input  id="shipRecDesc"     type="text"   placeholder="Beschreibung" class="fin-modal-field">
        <input  id="shipRecAmount"   type="number" min="0" placeholder="Betrag (Cr)" class="fin-modal-field">
        <select id="shipRecSign"     class="fin-modal-field">
          <option value="1">Einnahme (+)</option>
          <option value="-1">Ausgabe (−)</option>
        </select>
        <select id="shipRecInterval" class="fin-modal-field">
          <option value="monthly">Monatlich</option>
          <option value="bimonthly">Alle 2 Monate</option>
          <option value="semiannual">Alle 6 Monate</option>
          <option value="yearly">Jährlich</option>
          <option value="weekly">Wöchentlich</option>
        </select>
        <div class="fin-modal-actions">
          <button id="shipRecSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="shipRecCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  _modalShipDebt() {
    return `<div class="fin-modal-overlay" id="shipDebtModal">
      <div class="fin-modal">
        <h3>Schuld hinzufügen</h3>
        <input    id="shipDebtName"     type="text"   placeholder="Name (z.B. Schiffsdarlehen MCr 1,0)" class="fin-modal-field">
        <input    id="shipDebtCreditor" type="text"   placeholder="Gläubiger (optional)"                 class="fin-modal-field">
        <input    id="shipDebtTotal"    type="number" min="0" placeholder="Gesamtbetrag (Cr)"            class="fin-modal-field">
        <input    id="shipDebtMonthly"  type="number" min="0" placeholder="Monatsrate (Cr)"              class="fin-modal-field">
        <textarea id="shipDebtNotes"    placeholder="Notizen (optional)" class="fin-modal-field fin-modal-textarea"></textarea>
        <div class="fin-modal-actions">
          <button id="shipDebtSaveBtn"   class="fin-btn-save">Speichern</button>
          <button id="shipDebtCancelBtn" class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>
    </div>`;
  },

  _finIntervalLabel(interval) {
    return { monthly: 'Monatlich', bimonthly: 'Alle 2 Monate', semiannual: 'Alle 6 Monate', weekly: 'Wöchentlich', yearly: 'Jährlich' }[interval] || interval;
  },

  _showShipSettleModal(char, f) {
    const activeCount = f.recurringItems.filter(r => !r._deleted).length;
    if (!activeCount) { window.alert('Keine wiederkehrenden Posten vorhanden.'); return; }

    const overlay = document.createElement('div');
    overlay.className = 'fin-settle-overlay';

    const rows = f.recurringItems.map((r, i) => {
      if (r._deleted) return ''; // Index i bleibt roh (siehe data-idx-Nutzung)
      const lbl    = this._finIntervalLabel(r.interval);
      const amtCls = r.amount >= 0 ? 'fin-pos' : 'fin-neg';
      return `<label class="fin-settle-item${r.isActive ? '' : ' fin-settle-inactive'}">
        <input type="checkbox" class="fin-settle-cb" data-idx="${i}" ${r.isActive ? 'checked' : ''}>
        <span class="fin-settle-desc">${this._esc(r.description)}</span>
        <span class="fin-settle-interval">${lbl}</span>
        <span class="fin-settle-amt ${amtCls}">${this._finFmtSigned(r.amount)}</span>
      </label>`;
    }).join('');

    overlay.innerHTML = `
      <div class="fin-settle">
        <h3>Abrechnung</h3>
        <input id="shipSettleDate" type="text" placeholder="Ingame-Datum (z.B. 1105-034)" class="fin-modal-field">
        <div class="fin-settle-list">${rows}</div>
        <div class="fin-settle-total" id="shipSettleTotal"></div>
        <div class="fin-modal-actions">
          <button id="shipSettleConfirmBtn" class="fin-btn-save">Abrechnen</button>
          <button id="shipSettleCancelBtn"  class="fin-btn-cancel">Abbrechen</button>
        </div>
      </div>`;

    document.body.appendChild(overlay);

    const updateTotal = () => {
      let income = 0, expense = 0;
      overlay.querySelectorAll('.fin-settle-cb:checked').forEach(cb => {
        const r = f.recurringItems[parseInt(cb.dataset.idx)];
        if (!r) return;
        if (r.amount >= 0) income += r.amount; else expense += Math.abs(r.amount);
      });
      const saldo = income - expense;
      overlay.querySelector('#shipSettleTotal').innerHTML =
        `<span class="fin-pos">+${this._finFmt(income)}</span> Einnahmen &nbsp;|&nbsp; ` +
        `<span class="fin-neg">−${this._finFmt(expense)}</span> Ausgaben &nbsp;|&nbsp; ` +
        `Saldo: <strong class="${saldo >= 0 ? 'fin-pos' : 'fin-neg'}">${this._finFmtSigned(saldo)}</strong>`;
    };

    updateTotal();
    overlay.querySelectorAll('.fin-settle-cb').forEach(cb => cb.addEventListener('change', updateTotal));

    overlay.querySelector('#shipSettleCancelBtn').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#shipSettleConfirmBtn').addEventListener('click', () => {
      const checked = Array.from(overlay.querySelectorAll('.fin-settle-cb:checked'));
      if (!checked.length) { window.alert('Keine Posten ausgewählt.'); return; }
      const ingameDate = overlay.querySelector('#shipSettleDate').value.trim();
      const now = Date.now();
      checked.forEach(cb => {
        const r = f.recurringItems[parseInt(cb.dataset.idx)];
        if (!r) return;
        f.transactions.push({
          id: 'stx-' + now + Math.random(),
          ingameDate,
          description: r.description,
          amount:      r.amount,
          createdAt:   now,
          updatedAt:   new Date(now).toISOString(),
        });
        f.cashCredits += r.amount;
      });
      this._saveAndSync(char);
      overlay.remove();
      App.renderCurrentPage();
    });
  },

  // ── Save ──────────────────────────────────────────────────────────────────

  save(character) {
    const ship = this._ship(character);
    if (!ship) return;
    // Ship-weites updatedAt: nur bumpen wenn sich am Ende wirklich etwas
    // geaendert hat (Vergleich schliesst nur das updatedAt-Feld selbst aus -
    // verschachtelte Aenderungen wie neue/geaenderte Waffen zaehlen mit, weil
    // deren eigenes _stampUpdatedAt bereits korrekt zwischen echten und
    // unveraenderten Zeilen unterscheidet). Noetig fuer die Tombstone-vs-Edit
    // Entscheidung in SyncMerge._mergeShip.
    const _before = JSON.stringify({ ...ship, updatedAt: undefined });

    if (this._activeTab === 'info' && App.editMode) {
      ship.name         = document.getElementById('si-name')?.value?.trim()   || ship.name;
      ship.class        = document.getElementById('si-class')?.value?.trim()  || '';
      ship.tl           = document.getElementById('si-tl')?.value             || '';
      ship.tonnage      = document.getElementById('si-ton')?.value            || '';
      ship.owner        = document.getElementById('si-owner')?.value?.trim()  || '';
      ship.mDrive       = document.getElementById('si-mdrive')?.value?.trim() || '';
      ship.jDrive       = document.getElementById('si-jdrive')?.value?.trim() || '';
      ship.powerPlant   = document.getElementById('si-pp')?.value?.trim()     || '';
      ship.computer     = document.getElementById('si-comp')?.value?.trim()   || '';
      ship.sensors      = document.getElementById('si-sens')?.value?.trim()   || '';
      ship.fuelMax      = parseInt(document.getElementById('si-fuel')?.value)    || 0;
      ship.operatingCost= parseInt(document.getElementById('si-cost')?.value)    || 0;
      ship.notes        = document.getElementById('si-notes')?.value          || '';
    } else if (this._activeTab === 'status' && App.editMode) {
      ship.hullCurrent      = parseInt(document.getElementById('ss-hcur')?.value)  || 0;
      ship.hullMax          = parseInt(document.getElementById('ss-hmax')?.value)  || 0;
      ship.structureCurrent = parseInt(document.getElementById('ss-scur')?.value)  || 0;
      ship.structureMax     = parseInt(document.getElementById('ss-smax')?.value)  || 0;
      ship.armor            = parseInt(document.getElementById('ss-acur')?.value)  || 0;
      ship.armorBase        = parseInt(document.getElementById('ss-abase')?.value) || 0;
      ship.fuelCurrent      = parseInt(document.getElementById('ss-fcur')?.value)  || 0;
      ship.fuelMax          = parseInt(document.getElementById('ss-fmax')?.value)  || 0;
    } else if (this._activeTab === 'weapons' && App.editMode) {
      const body = document.getElementById('shipWeaponBody');
      if (body) {
        // existing = exakt die Liste, aus der die Tabellenzeilen gerendert wurden
        // (Tombstones ausgeblendet, siehe _renderWeapons) — nötig, damit der
        // Zeilenindex i korrekt auf existing[i] passt.
        const existing = (ship.weapons || []).filter(w => !w._deleted);
        const now = new Date().toISOString();
        const updated = Array.from(body.querySelectorAll('tr')).flatMap((tr, i) => {
          const name = tr.querySelector('.sw-name')?.value?.trim();
          if (!name) return [];
          const ammoRaw    = tr.querySelector('.sw-ammo')?.value;
          const ammoMaxRaw = tr.querySelector('.sw-ammomax')?.value;
          const item = {
            id:      existing[i]?.id || ('swp-' + Date.now() + i),
            name,
            type:    tr.querySelector('.sw-type')?.value   || 'turret',
            damage:  tr.querySelector('.sw-dmg')?.value    || '',
            range:   tr.querySelector('.sw-range')?.value  || '',
            traits:  tr.querySelector('.sw-traits')?.value || '',
            ammo:    ammoRaw    !== '' && ammoRaw    != null ? parseInt(ammoRaw)    : undefined,
            ammoMax: ammoMaxRaw !== '' && ammoMaxRaw != null ? parseInt(ammoMaxRaw) : undefined,
            details: existing[i]?.details || '',
            _deleted: false,
            deletedAt: null,
          };
          return [this._stampUpdatedAt(item, existing[i])];
        });
        // Zeilen, die aus der Tabelle entfernt wurden (✕-Button), als Tombstone
        // erhalten statt komplett zu löschen, damit die Löschung über den
        // Sync-Merge propagiert.
        const survivingIds = new Set(updated.map(u => u.id));
        const tombstoned = existing
          .filter(w => !survivingIds.has(w.id))
          .map(w => ({ ...w, _deleted: true, deletedAt: now, updatedAt: now }));
        ship.weapons = [...updated, ...tombstoned];
      }
    } else if (this._activeTab === 'crew' && App.editMode) {
      ship.crewPositions = Array.from(document.querySelectorAll('.ship-pos-row')).flatMap(row => {
        const pos = row.querySelector('.sp-pos-name')?.value?.trim();
        if (!pos) return [];
        return [{ position: pos, person: row.querySelector('.sp-pos-person')?.value?.trim() || '' }];
      });
    }

    const _after = JSON.stringify({ ...ship, updatedAt: undefined });
    if (_before !== _after) ship.updatedAt = new Date().toISOString();
  },

  // ── Kampagnen-Sync ────────────────────────────────────────────────────────

  _saveAndSync(char) {
    Storage.saveCharacter(char);
    if (char.campaignId) App._syncMyCampaignShips();
  },

  // ── Listeners ─────────────────────────────────────────────────────────────

  attachListeners() {
    const char = window.currentCharacter;
    if (!char) return;
    // Schiff wechseln (inkl. Übernahme geteilter Kampagnen-Schiffe)
    document.getElementById('shipSelect')?.addEventListener('change', e => {
      this.save(char);
      const val = e.target.value;
      if (val.startsWith('ext:')) {
        const extId  = val.slice(4);
        const extRaw = (App._campaignData?.ships || []).find(s => s.id === extId);
        if (extRaw) {
          const adopted = Character._migrateShip(JSON.parse(JSON.stringify(extRaw)));
          if (!char.ships) char.ships = [];
          char.ships.push(adopted);
          char.activeShipId = adopted.id;
        }
      } else {
        char.activeShipId = val || null;
      }
      this._saveAndSync(char);
      App.renderCurrentPage();
    });

    // Neues Schiff
    document.getElementById('shipNewBtn')?.addEventListener('click', () => {
      const name = window.prompt('Name des neuen Schiffes:', 'Neues Schiff');
      if (name === null) return;
      const now  = new Date().toISOString();
      const ship = Character._migrateShip({ name: name.trim() || 'Neues Schiff', createdAt: now, updatedAt: now });
      ship.isCampaign = !!char.campaignId;
      if (!char.ships) char.ships = [];
      char.ships.push(ship);
      char.activeShipId = ship.id;
      this._saveAndSync(char);
      App.renderCurrentPage();
    });

    // Schiff löschen
    document.getElementById('shipDelBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      if (!window.confirm(`Schiff „${ship.name}" wirklich löschen?`)) return;
      const now = new Date().toISOString();
      ship._deleted  = true;
      ship.deletedAt = now;
      ship.updatedAt = now;
      const remaining = char.ships.filter(s => !s._deleted);
      char.activeShipId = remaining[0]?.id || null;
      this._saveAndSync(char);
      App.renderCurrentPage();
    });

    // Kampagnen-Toggle
    document.getElementById('shipCampaignToggle')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      ship.isCampaign = !ship.isCampaign;
      ship.updatedAt  = new Date().toISOString();
      this._saveAndSync(char);
      App.renderCurrentPage();
    });

    // Sub-Tab wechseln
    document.querySelectorAll('.ship-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.save(char);
        this._saveAndSync(char);
        this._activeTab = btn.dataset.tab;
        App.renderCurrentPage();
      });
    });

    // Bild hochladen
    document.getElementById('shipImgInput')?.addEventListener('change', e => {
      const file = e.target.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const ship = this._ship(char);
        if (!ship) return;
        ship.image = ev.target.result;
        this._saveAndSync(char);
        App.renderCurrentPage();
      };
      reader.readAsDataURL(file);
    });

    // Bild löschen
    document.getElementById('shipImgDelBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      ship.image = null;
      this._saveAndSync(char);
      App.renderCurrentPage();
    });

    // Status: Track-Buttons (Ansichtsmodus)
    document.querySelectorAll('.ship-track-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship  = this._ship(char);
        if (!ship) return;
        const track = btn.dataset.track;
        const delta = parseInt(btn.dataset.delta);
        if (track === 'hull') {
          ship.hullCurrent = Math.max(0, Math.min(ship.hullMax || 0, (parseInt(ship.hullCurrent) || 0) + delta));
        } else if (track === 'structure') {
          ship.structureCurrent = Math.max(0, Math.min(ship.structureMax || 0, (parseInt(ship.structureCurrent) || 0) + delta));
        } else if (track === 'fuel') {
          ship.fuelCurrent = Math.max(0, Math.min(ship.fuelMax || 0, (parseInt(ship.fuelCurrent) || 0) + delta));
        }
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });

    // Kritische Treffer: Box-Toggle (sofort speichern, kein Re-Render)
    document.querySelectorAll('.ship-crit-box').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        const sys = btn.dataset.sys;
        const lvl = parseInt(btn.dataset.lvl);
        if (!ship.critHits) ship.critHits = {};
        if (!ship.critHits[sys]) ship.critHits[sys] = [false,false,false,false,false,false];
        ship.critHits[sys][lvl] = !ship.critHits[sys][lvl];
        btn.classList.toggle('hit', ship.critHits[sys][lvl]);
        btn.textContent = ship.critHits[sys][lvl] ? '✕' : '';
        this._saveAndSync(char);
      });
    });

    // Kritische Treffer: Notiz je System (defekte Teile) – öffnet Markdown-Detail-Modal
    document.querySelectorAll('.ship-crit-note-btn').forEach(btn => {
      btn.addEventListener('click', () => this._showCritNote(btn.dataset.sys));
    });

    // Bewaffnung: Waffe hinzufügen (Bearbeitungsmodus)
    document.getElementById('shipAddWeaponBtn')?.addEventListener('click', () => {
      const body = document.getElementById('shipWeaponBody');
      if (!body) return;
      body.querySelector('.ship-empty-cell')?.closest('tr')?.remove();
      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><input class="sw-name"    placeholder="Name"></td>
        <td><select class="sw-type">
          <option value="turret">Turret</option>
          <option value="barbette">Barbette</option>
          <option value="bay">Bay</option>
          <option value="spinal">Spinal</option>
        </select></td>
        <td><input class="sw-dmg"     placeholder="1D6"></td>
        <td><input class="sw-range"   placeholder="Nah/Mittel"></td>
        <td><input class="sw-traits"  placeholder="AP 5 …"></td>
        <td><input class="sw-ammo"    type="number" min="0" placeholder="–"></td>
        <td><input class="sw-ammomax" type="number" min="0" placeholder="–"></td>
        <td class="ship-weapon-note-cell"></td>
        <td><button class="btn-danger sw-rm">✕</button></td>`;
      body.appendChild(tr);
      tr.querySelector('.sw-rm').addEventListener('click', () => tr.remove());
    });

    // Bewaffnung: Waffe entfernen (bestehende Zeilen)
    document.querySelectorAll('.sw-rm').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('tr')?.remove());
    });

    // Bewaffnung: Merkmale-Modal (Markdown, analog Krit-Notizen)
    document.querySelectorAll('.sw-details').forEach(btn => {
      btn.addEventListener('click', () => this._showWeaponNote(parseInt(btn.dataset.idx)));
    });

    // Bewaffnung: Munition +/− (Ansichtsmodus)
    document.querySelectorAll('.ship-ammo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship  = this._ship(char);
        if (!ship) return;
        const idx   = parseInt(btn.dataset.idx);
        const delta = parseInt(btn.dataset.delta);
        const w     = (ship.weapons || []).filter(x => !x._deleted)[idx];
        if (!w) return;
        const max = parseInt(w.ammoMax) || Infinity;
        w.ammo = Math.max(0, Math.min(max, (parseInt(w.ammo) || 0) + delta));
        w.updatedAt = new Date().toISOString();
        const disp = document.querySelector(`.ship-ammo-disp[data-idx="${idx}"]`);
        if (disp) disp.textContent = w.ammo;
        this._saveAndSync(char);
      });
    });

    // Crew-Rollen: Toggle (lebt auf dem Schiff, damit Mannschaft campaign-weit sichtbar ist)
    document.querySelectorAll('.ship-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        if (!ship.crewRoles)          ship.crewRoles = {};
        if (!ship.crewRoles[char.id]) ship.crewRoles[char.id] = { name: char.metadata?.name || 'Unbenannt', roles: [] };
        const entry = ship.crewRoles[char.id];
        entry.name  = char.metadata?.name || 'Unbenannt';
        const role  = btn.dataset.role;
        const idx   = entry.roles.indexOf(role);
        if (idx >= 0) entry.roles.splice(idx, 1);
        else          entry.roles.push(role);
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });

    // Crew-Positionen: hinzufügen
    document.getElementById('shipAddPosBtn')?.addEventListener('click', () => {
      const container = document.getElementById('shipCrewPositions');
      if (!container) return;
      document.getElementById('shipCrewEmpty')?.remove();
      const row = document.createElement('div');
      row.className = 'ship-pos-row';
      row.innerHTML = `
        <input class="ship-input sp-pos-name"   placeholder="Position (z.B. Pilot)">
        <input class="ship-input sp-pos-person"  placeholder="Name (optional)">
        <button class="btn-danger sp-pos-rm">✕</button>`;
      row.querySelector('.sp-pos-rm').addEventListener('click', () => row.remove());
      container.appendChild(row);
    });

    // Crew-Positionen: entfernen (bestehende)
    document.querySelectorAll('.sp-pos-rm').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('.ship-pos-row')?.remove());
    });

    // ── Finanzen (Schiffskasse) ──────────────────────────────────────────
    const showModal = id => document.getElementById(id)?.classList.add('open');
    const hideModal = id => document.getElementById(id)?.classList.remove('open');
    let shipTxSign = 1;

    document.getElementById('shipFinIncomeBtn')?.addEventListener('click', () => {
      shipTxSign = 1;
      document.getElementById('shipTxModalTitle').textContent = 'Einnahme';
      showModal('shipTxModal');
    });
    document.getElementById('shipFinExpenseBtn')?.addEventListener('click', () => {
      shipTxSign = -1;
      document.getElementById('shipTxModalTitle').textContent = 'Ausgabe';
      showModal('shipTxModal');
    });
    document.getElementById('shipTxCancelBtn')?.addEventListener('click', () => hideModal('shipTxModal'));
    document.getElementById('shipTxModal')?.addEventListener('click', e => {
      if (e.target.id === 'shipTxModal') hideModal('shipTxModal');
    });
    document.getElementById('shipTxSaveBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      const amount = parseFloat(document.getElementById('shipTxAmount').value);
      if (!amount || amount <= 0) return;
      const tx = {
        id:          'stx-' + Date.now(),
        ingameDate:  document.getElementById('shipTxDate').value.trim(),
        description: document.getElementById('shipTxDesc').value.trim(),
        amount:      shipTxSign * amount,
        createdAt:   Date.now(),
        updatedAt:   new Date().toISOString(),
      };
      ship.finances.transactions.push(tx);
      ship.finances.cashCredits += tx.amount;
      this._saveAndSync(char);
      hideModal('shipTxModal');
      App.renderCurrentPage();
    });

    // Transaktion löschen
    document.querySelectorAll('.ship-fin-tx-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        if (!window.confirm('Transaktion löschen und Kassenstand korrigieren?')) return;
        const idx = parseInt(btn.dataset.idx);
        const tx  = ship.finances.transactions[idx];
        if (tx) {
          ship.finances.cashCredits -= tx.amount;
          const now = new Date().toISOString();
          tx._deleted  = true;
          tx.deletedAt = now;
          tx.updatedAt = now;
        }
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });

    // Wiederkehrende Posten: Modal
    document.getElementById('shipAddRecurringBtn')?.addEventListener('click', () => showModal('shipRecModal'));
    document.getElementById('shipRecCancelBtn')?.addEventListener('click',   () => hideModal('shipRecModal'));
    document.getElementById('shipRecModal')?.addEventListener('click', e => {
      if (e.target.id === 'shipRecModal') hideModal('shipRecModal');
    });
    document.getElementById('shipRecSaveBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      const desc   = document.getElementById('shipRecDesc').value.trim();
      const amount = parseFloat(document.getElementById('shipRecAmount').value);
      if (!desc || !amount || amount <= 0) return;
      ship.finances.recurringItems.push({
        id:          'srec-' + Date.now(),
        description: desc,
        amount:      parseInt(document.getElementById('shipRecSign').value) * amount,
        interval:    document.getElementById('shipRecInterval').value,
        isActive:    true,
        updatedAt:   new Date().toISOString(),
      });
      this._saveAndSync(char);
      hideModal('shipRecModal');
      App.renderCurrentPage();
    });

    // Wiederkehrende Posten: Toggle
    document.querySelectorAll('.ship-fin-rec-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const ship = this._ship(char);
        if (!ship) return;
        const item = ship.finances.recurringItems[parseInt(cb.dataset.idx)];
        item.isActive  = cb.checked;
        item.updatedAt = new Date().toISOString();
        this._saveAndSync(char);
      });
    });

    // Wiederkehrende Posten: Löschen
    document.querySelectorAll('.ship-fin-rec-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        if (!window.confirm('Posten löschen?')) return;
        const item = ship.finances.recurringItems[parseInt(btn.dataset.idx)];
        if (item) {
          const now = new Date().toISOString();
          item._deleted  = true;
          item.deletedAt = now;
          item.updatedAt = now;
        }
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });

    // Wiederkehrende Posten: Abrechnen
    document.getElementById('shipMonthlySettleBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      this._showShipSettleModal(char, ship.finances);
    });

    // Schulden: Modal
    document.getElementById('shipAddDebtBtn')?.addEventListener('click',    () => showModal('shipDebtModal'));
    document.getElementById('shipDebtCancelBtn')?.addEventListener('click', () => hideModal('shipDebtModal'));
    document.getElementById('shipDebtModal')?.addEventListener('click', e => {
      if (e.target.id === 'shipDebtModal') hideModal('shipDebtModal');
    });
    document.getElementById('shipDebtSaveBtn')?.addEventListener('click', () => {
      const ship  = this._ship(char);
      if (!ship) return;
      const name  = document.getElementById('shipDebtName').value.trim();
      const total = parseFloat(document.getElementById('shipDebtTotal').value);
      if (!name || !total || total <= 0) return;
      ship.finances.debts.push({
        id:              'sdebt-' + Date.now(),
        name,
        creditor:        document.getElementById('shipDebtCreditor').value.trim(),
        totalAmount:     total,
        remainingAmount: total,
        monthlyPayment:  parseFloat(document.getElementById('shipDebtMonthly').value) || 0,
        notes:           document.getElementById('shipDebtNotes').value.trim(),
        updatedAt:       new Date().toISOString(),
      });
      this._saveAndSync(char);
      hideModal('shipDebtModal');
      App.renderCurrentPage();
    });

    // Schulden: Rate zahlen
    document.querySelectorAll('.ship-fin-debt-pay').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship    = this._ship(char);
        if (!ship) return;
        const idx     = parseInt(btn.dataset.idx);
        const payment = parseFloat(btn.dataset.payment);
        const debt    = ship.finances.debts[idx];
        if (!debt) return;
        const actual = Math.min(payment, debt.remainingAmount);
        debt.remainingAmount = Math.max(0, debt.remainingAmount - actual);
        debt.updatedAt = new Date().toISOString();
        ship.finances.cashCredits -= actual;
        ship.finances.transactions.push({ id: 'stx-' + Date.now(), ingameDate: '', description: `Rate: ${debt.name}`, amount: -actual, createdAt: Date.now(), updatedAt: new Date().toISOString() });
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });

    // Schulden löschen
    document.querySelectorAll('.ship-fin-debt-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        if (!window.confirm('Schuld löschen?')) return;
        const debt = ship.finances.debts[parseInt(btn.dataset.idx)];
        if (debt) {
          const now = new Date().toISOString();
          debt._deleted  = true;
          debt.deletedAt = now;
          debt.updatedAt = now;
        }
        this._saveAndSync(char);
        App.renderCurrentPage();
      });
    });
  },

  reset() {
    document.getElementById('ship-page').innerHTML = '';
  }
};
