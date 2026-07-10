/**
 * Kampf (Combat) Seite – Mongoose Traveller 2e
 */
const CombatPage = {
  _initiative: null,
  _shipRangeBand: 3,
  _sensorLock: false,
  _ewDM: 0,
  _tacticsDM: 0,

  _RANGE_BANDS: ['Anliegend','Nah','Kurz','Mittel','Weit','Sehr Weit','Entfernt'],

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _calcDM(value) {
    value = parseInt(value) || 0;
    if (value === 0) return -3;
    if (value <= 2)  return -2;
    if (value <= 5)  return -1;
    if (value <= 8)  return  0;
    if (value <= 11) return  1;
    if (value <= 14) return  2;
    return 3;
  },

  _fmtDM(dm) { return dm >= 0 ? `+${dm}` : `${dm}`; },

  _getAttr(character, key) {
    const a   = character.attributes[key] || { value: 6, current: 6 };
    const max     = typeof a === 'number' ? a : (a.value   ?? 6);
    const current = typeof a === 'number' ? a : (a.current ?? max);
    return { max, current, dm: this._calcDM(current) };
  },

  _cardColor(a) {
    if (a.current === 0)      return 'red';
    if (a.current < a.max)    return 'yellow';
    return 'green';
  },

  _weaponMod(item, character) {
    let total = 0, hasValue = false;
    if (item.attribute && character.attributes?.[item.attribute]) {
      const dm = parseInt(character.attributes[item.attribute].dm);
      if (!isNaN(dm)) { total += dm; hasValue = true; }
    }
    if (item.skill) {
      const sk = (character.skills || []).find(s => s.name === item.skill);
      total += sk ? parseInt(sk.level) || 0 : 0;
      hasValue = true;
    }
    if (!hasValue) return '–';
    return total >= 0 ? `+${total}` : `${total}`;
  },

  _parseAuto(traits) {
    const m = String(traits || '').match(/Auto\s+(\d+)/i);
    return m ? parseInt(m[1]) : null;
  },

  _parseHeft(traits) {
    const m = String(traits || '').match(/Heft\s+(\d+)/i);
    return m ? parseInt(m[1]) : null;
  },

  // ── Block 1 ──────────────────────────────────────────────────────────────

  _attrCard(key, label, a) {
    return `
      <div class="combat-attr-card combat-attr-${this._cardColor(a)}" data-attr="${key}">
        <div class="combat-attr-label">${label}</div>
        <div class="combat-attr-dm">${this._fmtDM(a.dm)}</div>
        <div class="combat-attr-values">
          <span class="combat-attr-current">${a.current}</span>
          <span class="combat-attr-sep">/</span>
          <span class="combat-attr-max">${a.max}</span>
        </div>
        <div class="combat-attr-btns">
          <button class="combat-attr-btn combat-attr-minus" data-attr="${key}" data-max="${a.max}">−</button>
          <button class="combat-attr-btn combat-attr-plus"  data-attr="${key}" data-max="${a.max}">+</button>
        </div>
      </div>`;
  },

  _statusBanner(str, dex, end) {
    const zeros   = [str, dex, end].filter(a => a.current === 0).length;
    const wounded  = [str, dex, end].some(a => a.current < a.max);
    if (zeros >= 3) return { cls: 'dead',         icon: '💀', text: 'Tot'         };
    if (zeros >= 2) return { cls: 'unconscious',   icon: '🔴', text: 'Bewusstlos' };
    if (wounded)    return { cls: 'wounded',        icon: '🟡', text: 'Verwundet'  };
    return             { cls: 'fit',            icon: '🟢', text: 'Fit'        };
  },

  // ── Erste Hilfe (in Block 1) ─────────────────────────────────────────────

  _renderFirstAid(character) {
    const log     = Array.isArray(character.firstAidLog) ? character.firstAidLog : [];
    const last    = log.length ? log[log.length - 1].ts : null;
    const tooSoon = last && (Date.now() - last) < 10 * 60 * 1000;

    const entries = log.slice().reverse().map((entry, i) => {
      const realIdx = log.length - 1 - i;
      return `<div class="combat-fa-entry">
        <span class="combat-fa-label">${this._esc(entry.inGameTime || '–')}</span>
        <button class="combat-fa-del" data-idx="${realIdx}" title="Löschen">✕</button>
      </div>`;
    }).join('');

    return `<div class="combat-fa">
      <button id="firstAidBtn" class="combat-fa-btn">＋ Erste Hilfe anwenden</button>
      ${tooSoon ? `<div class="combat-fa-warn">⚠ Erste Hilfe bereits angewendet – kein weiterer Bonus</div>` : ''}
      ${entries ? `<div class="combat-fa-log">${entries}</div>` : ''}
    </div>`;
  },

  // ── Block 3 ──────────────────────────────────────────────────────────────

  _renderProtection(character) {
    const eq        = character.equipment || [];
    const armors    = eq.filter(e => e.type === 'armor' && e.equipped);
    const totalProt = armors.reduce((s, a) => s + (parseInt(a.protection) || 0), 0);
    if (!armors.length) return `<div class="combat-prot-empty">Kein Schutz aktiv</div>`;

    const rows = armors.map(a => `
      <div class="combat-armor-row">
        <span class="combat-armor-row-name">${this._esc(a.name)}</span>
        <span class="combat-armor-row-prot">+${parseInt(a.protection) || 0}</span>
        ${a.rad ? `<span class="combat-armor-rad">Rad ${a.rad}</span>` : ''}
      </div>`).join('');

    return `<div class="combat-prot">
      <div class="combat-prot-total">
        <span class="combat-prot-icon">🛡️</span>
        <span class="combat-prot-value">${totalProt}</span>
        <span class="combat-prot-label">Gesamtschutz</span>
      </div>
      <div class="combat-armor-list">${rows}</div>
    </div>`;
  },

  _renderBlock3(character) {
    const eq       = character.equipment || [];
    const melee    = eq.find(e => e.type === 'melee' && e.equipped);
    const ranged   = eq.find(e => (e.type === 'ranged' || e.type === 'weapon') && e.equipped);

    let inner = '';

    // Fernkampfwaffe
    if (ranged) {
      const eqIdx   = eq.indexOf(ranged);
      const autoVal = this._parseAuto(ranged.traits);
      const ammo    = parseInt(ranged.ammo)     || 0;
      const mag     = parseInt(ranged.magazine) || 0;
      const reserve = parseInt(ranged.reserveMags) || 0;

      inner += `<div class="combat-equip-item">
        <div class="combat-equip-header">
          <span class="combat-equip-icon">🔫</span>
          <span class="combat-equip-name">${this._esc(ranged.name)}</span>
          <span class="combat-equip-tag">Fernkampf</span>
        </div>
        <div class="combat-equip-stats">
          <span><strong>Mod:</strong> ${this._weaponMod(ranged, character)}</span>
          <span><strong>Schaden:</strong> ${this._esc(ranged.damage || '–')}</span>
          <span><strong>Reichweite:</strong> ${this._esc(ranged.range || '–')}</span>
        </div>
        ${ranged.traits ? `<div class="combat-equip-traits">${this._esc(ranged.traits)}</div>` : ''}
        <div class="combat-ammo-row">
          <span class="combat-ammo-count">
            <span class="combat-ammo-cur" data-eqidx="${eqIdx}">${ammo}</span>
            <span class="combat-ammo-sep"> / </span>
            <span class="combat-ammo-mag">${mag || '∞'}</span>
          </span>
          <div class="combat-ammo-btns">
            <button class="combat-ammo-btn" data-eqidx="${eqIdx}" data-action="minus1">−1</button>
            ${autoVal ? `<button class="combat-ammo-btn" data-eqidx="${eqIdx}" data-action="auto" data-auto="${autoVal}">−Auto ${autoVal}</button>` : ''}
            <span class="combat-reserve" title="Reservemagazine">Reserve: <span class="combat-reserve-cur" data-eqidx="${eqIdx}">${reserve}</span></span>
            <button class="combat-ammo-btn combat-ammo-reload" data-eqidx="${eqIdx}" data-mag="${mag}" data-action="reload"${reserve <= 0 ? ' disabled title="Keine Reservemagazine"' : ''}>↺ Nachladen</button>
          </div>
        </div>
      </div>`;
    }

    // Nahkampfwaffe
    if (melee) {
      const heft     = this._parseHeft(melee.traits);
      const strAttr  = character.attributes?.strength || { current: 6 };
      const strCur   = typeof strAttr === 'number' ? strAttr : (strAttr.current ?? 6);
      const strDM    = this._calcDM(strCur);
      const recoil   = heft !== null && heft > strDM ? heft - strDM : 0;

      inner += `<div class="combat-equip-item">
        <div class="combat-equip-header">
          <span class="combat-equip-icon">⚔️</span>
          <span class="combat-equip-name">${this._esc(melee.name)}</span>
          <span class="combat-equip-tag">Nahkampf</span>
        </div>
        <div class="combat-equip-stats">
          <span><strong>Mod:</strong> ${this._weaponMod(melee, character)}</span>
          <span><strong>Schaden:</strong> ${this._esc(melee.damage || '–')}</span>
          ${heft !== null ? `<span><strong>Heft:</strong> ${heft}</span>` : ''}
        </div>
        ${melee.traits ? `<div class="combat-equip-traits">${this._esc(melee.traits)}</div>` : ''}
        ${recoil > 0 ? `<div class="combat-recoil-warn">⚠ Recoil: −${recoil} Initiative (Heft ${heft} > STR-DM ${this._fmtDM(strDM)})</div>` : ''}
      </div>`;
    }

    if (!inner) {
      inner = `<p class="combat-equip-empty">Keine Bewaffnung aktiv — bitte im Ausrüstungs-Tab aktivieren.</p>`;
    }

    return `<div class="combat-block">
      <h3 class="combat-block-title">Aktive Bewaffnung</h3>
      <div class="combat-equip-grid">${inner}</div>
    </div>`;
  },

  // ── Block 4 ──────────────────────────────────────────────────────────────

  _radLevel(dose) {
    if (dose >= 600) return { cls: 'rad-red',    label: 'Lebensbedrohlich'       };
    if (dose >= 200) return { cls: 'rad-orange',  label: 'Ernstzunehmend'         };
    if (dose >= 100) return { cls: 'rad-yellow',  label: 'Leichte Symptome möglich' };
    return               { cls: 'rad-green',   label: 'Unbedenklich'            };
  },

  _renderBlock4(character) {
    const dose  = typeof character.radiationDose === 'number' ? character.radiationDose : 0;
    const level = this._radLevel(dose);

    return `<div class="combat-block">
      <h3 class="combat-block-title">Strahlungsdosis</h3>
      <div class="combat-rad">
        <div class="combat-rad-display ${level.cls}">
          <span class="combat-rad-value">${dose}</span>
          <span class="combat-rad-unit">Rad</span>
        </div>
        <div class="combat-rad-label ${level.cls}-text">${level.label}</div>
        <div class="combat-rad-controls">
          <input  id="radInput" class="combat-rad-input" type="number" min="0" placeholder="Dosis (Rad)">
          <button id="radAddBtn"   class="combat-rad-btn combat-rad-add">+ Hinzufügen</button>
          <button id="radResetBtn" class="combat-rad-btn combat-rad-reset">Reset</button>
        </div>
      </div>
    </div>`;
  },

  // ── Hauptrender ───────────────────────────────────────────────────────────

  render(character) {
    const str    = this._getAttr(character, 'strength');
    const dex    = this._getAttr(character, 'dexterity');
    const end    = this._getAttr(character, 'endurance');
    const status  = this._statusBanner(str, dex, end);
    const initVal = this._initiative !== null ? this._initiative : '—';

    return `
      <div class="combat-page">

        <!-- Zeile 1 links: Initiative -->
        <div class="combat-block">
          <h3 class="combat-block-title">Initiative</h3>
          <div class="combat-initiative">
            <div class="combat-init-center">
              <input type="number" class="combat-init-val" id="combatInitVal"
                value="${this._initiative !== null ? this._initiative : ''}"
                placeholder="—">
              <span class="combat-init-dex-info">DEX-DM: ${this._fmtDM(dex.dm)}</span>
            </div>
            <div class="combat-init-btns">
              <button class="combat-init-btn combat-init-react" id="combatInitMinus2">−2 Reaktion</button>
              <button class="combat-init-btn" id="combatInitMinus">−</button>
              <button class="combat-init-btn" id="combatInitPlus">+</button>
              <button class="combat-init-btn combat-init-roll" id="combatInitRoll">🎲 Würfeln</button>
            </div>
          </div>
        </div>

        <!-- Zeile 1 rechts: Aktive Bewaffnung -->
        ${this._renderBlock3(character)}

        <!-- Zeile 2 links: Physische Attribute -->
        <div class="combat-block">
          <h3 class="combat-block-title">Physische Attribute</h3>
          <div class="combat-attrs">
            ${this._attrCard('strength',  'STR', str)}
            ${this._attrCard('dexterity', 'DEX', dex)}
            ${this._attrCard('endurance', 'END', end)}
          </div>
          <div class="combat-status combat-status-${status.cls}">
            ${status.icon} ${status.text}
          </div>
          ${this._renderFirstAid(character)}
        </div>

        <!-- Zeile 2 rechts: Aktive Rüstung -->
        <div class="combat-block">
          <h3 class="combat-block-title">Aktive Rüstung</h3>
          ${this._renderProtection(character)}
        </div>

        <!-- Zeile 3: Strahlungsdosis (volle Breite) -->
        <div class="combat-col-span">${this._renderBlock4(character)}</div>

        <!-- Schiffskampf (falls Schiff aktiv) -->
        ${this._renderShipCombat(character)}

      </div>`;
  },

  // ── Schiffskampf ──────────────────────────────────────────────────────────

  _renderShipCombat(character) {
    if (!character.activeShipId) return '';
    const ship = (character.ships || []).find(s => s.id === character.activeShipId);
    if (!ship) return '';

    const roles = (ship.crewRoles || {})[character.id]?.roles || [];
    if (!roles.length) return '';

    const hCur = parseInt(ship.hullCurrent)      ?? ship.hullMax ?? 0;
    const sCur = parseInt(ship.structureCurrent) ?? ship.structureMax ?? 0;
    const aCur = parseInt(ship.armor)            || 0;

    let inner = '';

    if (roles.includes('Pilot')) {
      const opts = this._RANGE_BANDS.map((b, i) =>
        `<option value="${i}"${this._shipRangeBand === i ? ' selected' : ''}>${b}</option>`
      ).join('');
      inner += `<div class="ship-combat-role">
        <div class="ship-combat-role-title">Pilot</div>
        <div class="ship-range-row">
          <label class="ship-combat-lbl">Entfernung</label>
          <select class="ship-range-select" id="shipRangeSelect">${opts}</select>
        </div>
      </div>`;
    }

    if (roles.includes('Schütze')) {
      const weapons = (ship.weapons || []);
      const wRows = weapons.length
        ? weapons.map((w, i) => {
            const hasMag = w.ammoMax != null && w.ammoMax !== '';
            return `<div class="ship-combat-weapon-row">
              <span class="scwr-name">${this._esc(w.name)}</span>
              <span class="scwr-dmg">${this._esc(w.damage||'–')}</span>
              ${hasMag
                ? `<div class="ship-ammo-ctrl">
                     <button class="ship-ammo-btn" data-idx="${i}" data-delta="-1">−</button>
                     <span class="ship-ammo-disp" data-idx="${i}">${parseInt(w.ammo)||0}</span>
                     <button class="ship-ammo-btn" data-idx="${i}" data-delta="1">+</button>
                     <span class="ship-ammo-max">/ ${w.ammoMax}</span>
                   </div>`
                : '<span class="scwr-no-ammo">–</span>'}
            </div>`;
          }).join('')
        : '<p class="ship-empty" style="margin:4px 0">Keine Waffen auf dem Schiff eingetragen.</p>';
      inner += `<div class="ship-combat-role">
        <div class="ship-combat-role-title">Schütze</div>
        ${wRows}
      </div>`;
    }

    if (roles.includes('Ingenieur')) {
      const hits = ship.critHits || {};
      const SYSTEMS = ShipPage._CRIT_SYSTEMS;
      const rows = SYSTEMS.map(sys => {
        const sysHits = hits[sys.key] || [false,false,false,false,false,false];
        const cells = sysHits.map((on, i) =>
          `<button class="ship-crit-box${on ? ' hit' : ''}" data-sys="${sys.key}" data-lvl="${i}">${on ? '✕' : ''}</button>`
        ).join('');
        return `<tr><td class="ship-crit-label">${sys.label}</td><td class="ship-crit-mini-cells">${cells}</td></tr>`;
      }).join('');
      inner += `<div class="ship-combat-role">
        <div class="ship-combat-role-title">Ingenieur – Kritische Treffer</div>
        <div class="ship-crits-scroll"><table class="ship-crits-table ship-crits-mini"><tbody>${rows}</tbody></table></div>
      </div>`;
    }

    if (roles.includes('Sensor-Operator')) {
      inner += `<div class="ship-combat-role">
        <div class="ship-combat-role-title">Sensor-Operator</div>
        <div class="ship-range-row">
          <label class="ship-combat-lbl">Sensor Lock</label>
          <button class="ship-sensor-lock-btn${this._sensorLock ? ' active' : ''}" id="sensorLockBtn">
            ${this._sensorLock ? '🔒 Aktiv' : '○ Inaktiv'}
          </button>
        </div>
        <div class="ship-range-row">
          <label class="ship-combat-lbl">EW DM</label>
          <button class="ship-dm-btn" id="ewDmMinus">−</button>
          <span class="ship-dm-val" id="ewDmVal">${this._ewDM >= 0 ? '+' : ''}${this._ewDM || 0}</span>
          <button class="ship-dm-btn" id="ewDmPlus">+</button>
        </div>
      </div>`;
    }

    if (roles.includes('Kapitän')) {
      inner += `<div class="ship-combat-role">
        <div class="ship-combat-role-title">Kapitän</div>
        <div class="ship-range-row">
          <label class="ship-combat-lbl">Taktik-DM</label>
          <button class="ship-dm-btn" id="tacDmMinus">−</button>
          <span class="ship-dm-val" id="tacDmVal">${this._tacticsDM >= 0 ? '+' : ''}${this._tacticsDM || 0}</span>
          <button class="ship-dm-btn" id="tacDmPlus">+</button>
        </div>
      </div>`;
    }

    return `<div class="combat-col-span">
      <div class="ship-combat-section">
        <div class="ship-combat-header">
          <span class="ship-combat-icon">🚀</span>
          <span class="ship-combat-name">${this._esc(ship.name)}</span>
          <div class="ship-combat-status">
            <span class="${hCur === 0 ? 'scstat-red' : hCur < (ship.hullMax||0) ? 'scstat-yellow' : ''}">H: ${hCur}/${ship.hullMax||0}</span>
            <span class="${sCur === 0 ? 'scstat-red' : sCur < (ship.structureMax||0) ? 'scstat-yellow' : ''}">S: ${sCur}/${ship.structureMax||0}</span>
            <span>Pz: ${aCur}</span>
          </div>
        </div>
        <div class="ship-combat-roles">${inner}</div>
      </div>
    </div>`;
  },

  save(character) {
    // Werte werden sofort beim Ändern gespeichert
  },

  attachListeners() {
    // ── Block 1: Attribut-Buttons ────────────────────────────────────────
    document.querySelectorAll('.combat-attr-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const key  = btn.dataset.attr;
        const max  = parseInt(btn.dataset.max);
        const char = window.currentCharacter;
        const a    = char.attributes[key];
        let current = typeof a === 'number' ? a : (a.current ?? a.value ?? 6);

        current = btn.classList.contains('combat-attr-plus')
          ? Math.min(max, current + 1)
          : Math.max(0, current - 1);

        if (typeof char.attributes[key] === 'number') {
          char.attributes[key] = { value: max, current, dm: this._calcDM(current) };
        } else {
          char.attributes[key].current = current;
          char.attributes[key].dm      = this._calcDM(current);
        }

        Storage.saveCharacter(char);
        document.getElementById('combat-page').innerHTML = this.render(char);
        this.attachListeners();
      });
    });

    // ── Block 2: Initiative-Buttons ──────────────────────────────────────
    const initEl = () => document.getElementById('combatInitVal');

    const updateInit = () => {
      const el = initEl();
      if (el) el.value = this._initiative !== null ? this._initiative : '';
    };

    initEl()?.addEventListener('input', (e) => {
      const v = parseInt(e.target.value);
      this._initiative = isNaN(v) ? null : v;
    });

    document.getElementById('combatInitMinus2')?.addEventListener('click', () => {
      if (this._initiative === null) this._initiative = 0;
      this._initiative -= 2;
      updateInit();
    });
    document.getElementById('combatInitMinus')?.addEventListener('click', () => {
      if (this._initiative === null) this._initiative = 0;
      this._initiative -= 1;
      updateInit();
    });
    document.getElementById('combatInitPlus')?.addEventListener('click', () => {
      if (this._initiative === null) this._initiative = 0;
      this._initiative += 1;
      updateInit();
    });
    document.getElementById('combatInitRoll')?.addEventListener('click', () => {
      const char   = window.currentCharacter;
      const dex    = char.attributes.dexterity || { current: 6 };
      const dexCur = typeof dex === 'number' ? dex : (dex.current ?? 6);
      const roll   = Math.floor(Math.random() * 6) + 1 + Math.floor(Math.random() * 6) + 1;
      this._initiative = roll + this._calcDM(dexCur);

      const el = initEl();
      if (el) {
        el.value = this._initiative;
        el.classList.remove('combat-init-shake');
        void el.offsetWidth;
        el.classList.add('combat-init-shake');
      }
    });

    // ── Erste Hilfe ───────────────────────────────────────────────────────
    document.getElementById('firstAidBtn')?.addEventListener('click', () => {
      const inGameTime = window.prompt('Ingame-Datum / Uhrzeit:', '');
      if (inGameTime === null) return; // Abgebrochen
      const char = window.currentCharacter;
      if (!Array.isArray(char.firstAidLog)) char.firstAidLog = [];
      char.firstAidLog.push({ ts: Date.now(), inGameTime: inGameTime.trim() });
      Storage.saveCharacter(char);
      document.getElementById('combat-page').innerHTML = this.render(char);
      this.attachListeners();
    });

    document.querySelectorAll('.combat-fa-del').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx  = parseInt(btn.dataset.idx);
        const char = window.currentCharacter;
        if (!Array.isArray(char.firstAidLog)) return;
        char.firstAidLog.splice(idx, 1);
        Storage.saveCharacter(char);
        document.getElementById('combat-page').innerHTML = this.render(char);
        this.attachListeners();
      });
    });

    // ── Block 4: Strahlung ───────────────────────────────────────────────
    document.getElementById('radAddBtn')?.addEventListener('click', () => {
      const input = document.getElementById('radInput');
      const val   = parseInt(input?.value);
      if (!val || val <= 0) return;
      const char = window.currentCharacter;
      char.radiationDose = (typeof char.radiationDose === 'number' ? char.radiationDose : 0) + val;
      Storage.saveCharacter(char);
      document.getElementById('combat-page').innerHTML = this.render(char);
      this.attachListeners();
    });

    document.getElementById('radResetBtn')?.addEventListener('click', () => {
      if (!window.confirm('Strahlungsdosis wirklich auf 0 zurücksetzen?')) return;
      const char = window.currentCharacter;
      char.radiationDose = 0;
      Storage.saveCharacter(char);
      document.getElementById('combat-page').innerHTML = this.render(char);
      this.attachListeners();
    });

    // ── Schiffskampf ─────────────────────────────────────────────────────
    document.getElementById('shipRangeSelect')?.addEventListener('change', e => {
      this._shipRangeBand = parseInt(e.target.value);
    });

    document.getElementById('sensorLockBtn')?.addEventListener('click', () => {
      this._sensorLock = !this._sensorLock;
      document.getElementById('combat-page').innerHTML = this.render(window.currentCharacter);
      this.attachListeners();
    });

    const ewDmVal = () => document.getElementById('ewDmVal');
    document.getElementById('ewDmMinus')?.addEventListener('click', () => { this._ewDM = (this._ewDM||0) - 1; const el = ewDmVal(); if(el) el.textContent = (this._ewDM>=0?'+':'') + this._ewDM; });
    document.getElementById('ewDmPlus')?.addEventListener('click',  () => { this._ewDM = (this._ewDM||0) + 1; const el = ewDmVal(); if(el) el.textContent = (this._ewDM>=0?'+':'') + this._ewDM; });

    const tacDmVal = () => document.getElementById('tacDmVal');
    document.getElementById('tacDmMinus')?.addEventListener('click', () => { this._tacticsDM = (this._tacticsDM||0) - 1; const el = tacDmVal(); if(el) el.textContent = (this._tacticsDM>=0?'+':'') + this._tacticsDM; });
    document.getElementById('tacDmPlus')?.addEventListener('click',  () => { this._tacticsDM = (this._tacticsDM||0) + 1; const el = tacDmVal(); if(el) el.textContent = (this._tacticsDM>=0?'+':'') + this._tacticsDM; });

    // Krit-Boxen im Schiffskampf-Block
    document.querySelectorAll('.ship-combat-section .ship-crit-box').forEach(btn => {
      btn.addEventListener('click', () => {
        const char = window.currentCharacter;
        const ship = (char.ships||[]).find(s => s.id === char.activeShipId);
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

    // Schiffswaffen-Munition im Schiffskampf-Block
    document.querySelectorAll('.ship-combat-section .ship-ammo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const char = window.currentCharacter;
        const ship = (char.ships||[]).find(s => s.id === char.activeShipId);
        if (!ship) return;
        const idx   = parseInt(btn.dataset.idx);
        const delta = parseInt(btn.dataset.delta);
        const w     = ship.weapons[idx];
        if (!w) return;
        w.ammo = Math.max(0, Math.min(parseInt(w.ammoMax)||Infinity, (parseInt(w.ammo)||0) + delta));
        const disp = document.querySelector(`.ship-combat-section .ship-ammo-disp[data-idx="${idx}"]`);
        if (disp) disp.textContent = w.ammo;
        Storage.saveCharacter(char);
      });
    });

    // ── Block 3: Ammo-Buttons ────────────────────────────────────────────
    document.querySelectorAll('.combat-ammo-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx    = parseInt(btn.dataset.eqidx);
        const action = btn.dataset.action;
        const char   = window.currentCharacter;
        const item   = char.equipment[idx];
        if (!item) return;

        let ammo = parseInt(item.ammo) || 0;
        if (action === 'minus1') {
          ammo = Math.max(0, ammo - 1);
        } else if (action === 'auto') {
          ammo = Math.max(0, ammo - (parseInt(btn.dataset.auto) || 1));
        } else if (action === 'reload') {
          // Nachladen: Munition auffüllen und ein Reservemagazin verbrauchen
          // (nicht unter 0). Ohne Reservemagazine bleibt die Munition, wie sie
          // ist – man kann nicht aus dem Nichts nachladen.
          const reserve = parseInt(item.reserveMags) || 0;
          if (reserve <= 0) return;
          ammo = parseInt(item.magazine) || parseInt(btn.dataset.mag) || 0;
          item.reserveMags = reserve - 1;
          const resDisp = document.querySelector(`.combat-reserve-cur[data-eqidx="${idx}"]`);
          if (resDisp) resDisp.textContent = item.reserveMags;
          if (item.reserveMags <= 0) { btn.disabled = true; btn.title = 'Keine Reservemagazine'; }
        }

        item.ammo = ammo;
        Storage.saveCharacter(char);

        const display = document.querySelector(`.combat-ammo-cur[data-eqidx="${idx}"]`);
        if (display) display.textContent = ammo;
      });
    });
  }
};
