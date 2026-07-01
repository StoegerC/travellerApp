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

  _ship(character) {
    if (!character.activeShipId) return null;
    return (character.ships || []).find(s => s.id === character.activeShipId) || null;
  },

  // ── Render ───────────────────────────────────────────────────────────────

  render(character) {
    const ships = character.ships || [];
    const ship  = this._ship(character);

    let html = '<h2>Schiff</h2>';
    html += this._renderSelector(character, ships, ship);

    if (!ship) {
      return html + '<p class="ship-empty">Kein Schiff vorhanden. Füge über das <strong>+</strong> ein neues hinzu.</p>';
    }

    const tabs = [
      { id: 'info',    label: 'Übersicht'    },
      { id: 'status',  label: 'Status'       },
      { id: 'crits',   label: 'Krit. Treffer' },
      { id: 'weapons', label: 'Bewaffnung'   },
      { id: 'crew',    label: 'Crew & Rollen' },
    ];

    html += '<div class="ship-subtabs">';
    tabs.forEach(t => {
      html += `<button class="ship-subtab${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">${t.label}</button>`;
    });
    html += '</div>';

    if      (this._activeTab === 'info')    html += this._renderInfo(ship);
    else if (this._activeTab === 'status')  html += this._renderStatus(ship);
    else if (this._activeTab === 'crits')   html += this._renderCrits(ship);
    else if (this._activeTab === 'weapons') html += this._renderWeapons(ship);
    else                                    html += this._renderCrew(ship, character);

    return html;
  },

  _renderSelector(character, ships, ship) {
    const opts = ships.map(s =>
      `<option value="${this._esc(s.id)}"${s.id === character.activeShipId ? ' selected' : ''}>${this._esc(s.name || 'Unbenannt')}</option>`
    ).join('');

    const inCampaign = !!character.campaignId;
    const campaignBadge = ship && inCampaign
      ? `<button class="ship-campaign-toggle${ship.isCampaign ? ' on' : ''}" id="shipCampaignToggle">
           ${ship.isCampaign ? '🏕 Geteilt' : '🔒 Privat'}
         </button>`
      : '';

    return `<div class="ship-selector-bar">
      <select class="ship-selector-select" id="shipSelect"${!ships.length ? ' disabled' : ''}>
        ${ships.length ? opts : '<option value="">– Kein Schiff –</option>'}
      </select>
      <div class="ship-selector-btns">
        <button id="shipNewBtn" class="btn-success ship-sel-btn" title="Neues Schiff">＋</button>
        ${ship ? `<button id="shipDelBtn" class="btn-danger ship-sel-btn" title="Schiff löschen">✕</button>` : ''}
        ${campaignBadge}
      </div>
    </div>`;
  },

  // ── Info ─────────────────────────────────────────────────────────────────

  _renderInfo(ship) {
    const imgHtml = ship.image
      ? `<img src="${ship.image}" class="ship-portrait" alt="Schiff">`
      : `<div class="ship-portrait-placeholder">🚀</div>`;

    if (App.editMode) {
      return `<div class="ship-section">
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

    return `<div class="ship-section">
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
    const hits = ship.critHits || {};
    let rows = '';
    this._CRIT_SYSTEMS.forEach(sys => {
      const sysHits = hits[sys.key] || [false,false,false,false,false,false];
      let cells = '';
      for (let i = 0; i < 6; i++) {
        const on = !!(sysHits[i]);
        cells += `<td class="ship-crit-cell"><button class="ship-crit-box${on ? ' hit' : ''}" data-sys="${sys.key}" data-lvl="${i}">${on ? '✕' : ''}</button></td>`;
      }
      rows += `<tr><td class="ship-crit-label">${sys.label}</td>${cells}</tr>`;
    });

    return `<div class="ship-section">
      <div class="ship-crits-scroll">
        <table class="ship-crits-table">
          <thead><tr>
            <th class="ship-crit-sys-hdr">System</th>
            <th>1</th><th>2</th><th>3</th><th>4</th><th>5</th><th>6</th>
          </tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      <p class="ship-crits-hint">Box antippen zum Markieren / Aufheben</p>
    </div>`;
  },

  // ── Bewaffnung ────────────────────────────────────────────────────────────

  _renderWeapons(ship) {
    const weapons = ship.weapons || [];

    if (App.editMode) {
      let rows = weapons.map((w, i) => `<tr>
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
        <td><button class="btn-danger sw-rm" data-idx="${i}">✕</button></td>
      </tr>`).join('');

      if (!rows) rows = `<tr><td colspan="8" class="ship-empty-cell">Keine Waffen eingetragen.</td></tr>`;

      return `<div class="ship-section">
        <div class="ship-add-row"><button id="shipAddWeaponBtn" class="btn-success">+ Waffe hinzufügen</button></div>
        <div class="ship-weapon-scroll">
          <table class="ship-weapon-table">
            <thead><tr><th>Name</th><th>Typ</th><th>Schaden</th><th>Reichweite</th><th>Traits</th><th>Mun.</th><th>Max</th><th></th></tr></thead>
            <tbody id="shipWeaponBody">${rows}</tbody>
          </table>
        </div>
      </div>`;
    }

    // View mode
    let rows = weapons.map((w, i) => {
      const hasMag = w.ammoMax != null && w.ammoMax !== '';
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
      </tr>`;
    }).join('');

    if (!rows) rows = `<tr><td colspan="6" class="ship-empty-cell">Keine Waffen eingetragen.</td></tr>`;

    return `<div class="ship-section">
      <div class="ship-weapon-scroll">
        <table class="ship-weapon-table">
          <thead><tr><th>Name</th><th>Typ</th><th>Schaden</th><th>Reichweite</th><th>Traits</th><th>Munition</th></tr></thead>
          <tbody id="shipWeaponBody">${rows}</tbody>
        </table>
      </div>
    </div>`;
  },

  // ── Crew & Rollen ─────────────────────────────────────────────────────────

  _renderCrew(ship, character) {
    const myRoles     = (character.shipRoles || {})[ship.id] || [];
    const positions   = ship.crewPositions || [];
    const costVal     = parseInt(ship.operatingCost) || 0;

    const rolesHtml = `<div class="ship-roles-grid">${
      this._ROLES.map(r =>
        `<button class="ship-role-btn${myRoles.includes(r) ? ' active' : ''}" data-role="${r}">${r}</button>`
      ).join('')
    }</div>`;

    let posHtml;
    if (App.editMode) {
      const posRows = positions.map((p, i) => `
        <div class="ship-pos-row">
          <input class="ship-input sp-pos-name"   value="${this._esc(p.position||'')}" placeholder="Position (z.B. Pilot)">
          <input class="ship-input sp-pos-person"  value="${this._esc(p.person||'')}"   placeholder="Name (optional)">
          <button class="btn-danger sp-pos-rm" data-idx="${i}">✕</button>
        </div>`).join('') || '<p class="ship-empty" id="shipCrewEmpty">Keine Crew-Positionen eingetragen.</p>';

      posHtml = `<div id="shipCrewPositions">${posRows}</div>
        <button id="shipAddPosBtn" class="btn-success" style="margin-top:8px">+ Position hinzufügen</button>`;
    } else {
      posHtml = positions.length
        ? positions.map(p => `<div class="ship-pos-view-row">
            <span class="ship-pos-role">${this._esc(p.position||'–')}</span>
            <span class="ship-pos-name">${this._esc(p.person||'–')}</span>
          </div>`).join('')
        : '<p class="ship-empty">Keine Crew-Positionen eingetragen.</p>';
    }

    return `<div class="ship-section">
      <h3 class="ship-section-title">Meine Rollen an Bord</h3>
      <p class="ship-roles-hint">Tippe auf eine Rolle um sie zu aktivieren / deaktivieren</p>
      ${rolesHtml}

      <h3 class="ship-section-title">Mannschaft</h3>
      ${costVal ? `<p class="ship-cost-display">Betriebskosten: <strong>Cr ${costVal.toLocaleString('de-DE')}</strong> / Monat</p>` : ''}
      ${posHtml}
    </div>`;
  },

  // ── Save ──────────────────────────────────────────────────────────────────

  save(character) {
    const ship = this._ship(character);
    if (!ship) return;

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
        ship.weapons = Array.from(body.querySelectorAll('tr')).flatMap((tr, i) => {
          const name = tr.querySelector('.sw-name')?.value?.trim();
          if (!name) return [];
          const ammoRaw    = tr.querySelector('.sw-ammo')?.value;
          const ammoMaxRaw = tr.querySelector('.sw-ammomax')?.value;
          return [{
            id:      ship.weapons[i]?.id || ('swp-' + Date.now() + i),
            name,
            type:    tr.querySelector('.sw-type')?.value   || 'turret',
            damage:  tr.querySelector('.sw-dmg')?.value    || '',
            range:   tr.querySelector('.sw-range')?.value  || '',
            traits:  tr.querySelector('.sw-traits')?.value || '',
            ammo:    ammoRaw    !== '' && ammoRaw    != null ? parseInt(ammoRaw)    : undefined,
            ammoMax: ammoMaxRaw !== '' && ammoMaxRaw != null ? parseInt(ammoMaxRaw) : undefined,
          }];
        });
      }
    } else if (this._activeTab === 'crew' && App.editMode) {
      ship.crewPositions = Array.from(document.querySelectorAll('.ship-pos-row')).flatMap(row => {
        const pos = row.querySelector('.sp-pos-name')?.value?.trim();
        if (!pos) return [];
        return [{ position: pos, person: row.querySelector('.sp-pos-person')?.value?.trim() || '' }];
      });
    }
  },

  // ── Listeners ─────────────────────────────────────────────────────────────

  attachListeners() {
    const char = window.currentCharacter;
    if (!char) return;
    // Schiff wechseln
    document.getElementById('shipSelect')?.addEventListener('change', e => {
      this.save(char);
      char.activeShipId = e.target.value || null;
      Storage.saveCharacter(char);
      App.renderCurrentPage();
    });

    // Neues Schiff
    document.getElementById('shipNewBtn')?.addEventListener('click', () => {
      const name = window.prompt('Name des neuen Schiffes:', 'Neues Schiff');
      if (name === null) return;
      const ship = Character._migrateShip({ name: name.trim() || 'Neues Schiff', createdAt: new Date().toISOString() });
      ship.isCampaign = !!char.campaignId;
      if (!char.ships) char.ships = [];
      char.ships.push(ship);
      char.activeShipId = ship.id;
      Storage.saveCharacter(char);
      App.renderCurrentPage();
    });

    // Schiff löschen
    document.getElementById('shipDelBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      if (!window.confirm(`Schiff „${ship.name}" wirklich löschen?`)) return;
      char.ships = char.ships.filter(s => s.id !== ship.id);
      char.activeShipId = char.ships[0]?.id || null;
      Storage.saveCharacter(char);
      App.renderCurrentPage();
    });

    // Kampagnen-Toggle
    document.getElementById('shipCampaignToggle')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      ship.isCampaign = !ship.isCampaign;
      Storage.saveCharacter(char);
      App.renderCurrentPage();
    });

    // Sub-Tab wechseln
    document.querySelectorAll('.ship-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        this.save(char);
        Storage.saveCharacter(char);
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
        Storage.saveCharacter(char);
        App.renderCurrentPage();
      };
      reader.readAsDataURL(file);
    });

    // Bild löschen
    document.getElementById('shipImgDelBtn')?.addEventListener('click', () => {
      const ship = this._ship(char);
      if (!ship) return;
      ship.image = null;
      Storage.saveCharacter(char);
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
        Storage.saveCharacter(char);
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
        Storage.saveCharacter(char);
      });
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
        <td><button class="btn-danger sw-rm">✕</button></td>`;
      body.appendChild(tr);
      tr.querySelector('.sw-rm').addEventListener('click', () => tr.remove());
    });

    // Bewaffnung: Waffe entfernen (bestehende Zeilen)
    document.querySelectorAll('.sw-rm').forEach(btn => {
      btn.addEventListener('click', () => btn.closest('tr')?.remove());
    });

    // Bewaffnung: Munition +/− (Ansichtsmodus)
    document.querySelectorAll('.ship-ammo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship  = this._ship(char);
        if (!ship) return;
        const idx   = parseInt(btn.dataset.idx);
        const delta = parseInt(btn.dataset.delta);
        const w     = ship.weapons[idx];
        if (!w) return;
        const max = parseInt(w.ammoMax) || Infinity;
        w.ammo = Math.max(0, Math.min(max, (parseInt(w.ammo) || 0) + delta));
        const disp = document.querySelector(`.ship-ammo-disp[data-idx="${idx}"]`);
        if (disp) disp.textContent = w.ammo;
        Storage.saveCharacter(char);
      });
    });

    // Crew-Rollen: Toggle
    document.querySelectorAll('.ship-role-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const ship = this._ship(char);
        if (!ship) return;
        if (!char.shipRoles)         char.shipRoles = {};
        if (!char.shipRoles[ship.id]) char.shipRoles[ship.id] = [];
        const role = btn.dataset.role;
        const idx  = char.shipRoles[ship.id].indexOf(role);
        if (idx >= 0) char.shipRoles[ship.id].splice(idx, 1);
        else          char.shipRoles[ship.id].push(role);
        btn.classList.toggle('active', idx < 0);
        Storage.saveCharacter(char);
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
  },

  reset() {
    document.getElementById('ship-page').innerHTML = '';
  }
};
