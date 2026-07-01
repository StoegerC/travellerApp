const EquipmentPage = {
  _activeTab: 'melee',
  skillNames: typeof TravellerSkills !== 'undefined' ? TravellerSkills.getSkills() : [],

  _attrLabels: {
    strength: 'STR', dexterity: 'DEX', endurance: 'END',
    intelligence: 'INT', education: 'EDU', socialStatus: 'SOZ', psi: 'PSI'
  },

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // Normalize + migrate old 'weapon' type → 'ranged'
  _d(character) {
    const eq = character.equipment || [];
    return {
      melee:  eq.filter(e => e.type === 'melee'),
      ranged: eq.filter(e => e.type === 'ranged' || e.type === 'weapon'),
      armor:  eq.filter(e => e.type === 'armor'),
      misc:   eq.filter(e => e.type === 'misc'),
    };
  },

  _tabOwns(tab, type) {
    if (tab === 'melee')  return type === 'melee';
    if (tab === 'ranged') return type === 'ranged' || type === 'weapon';
    if (tab === 'armor')  return type === 'armor';
    return type === 'misc';
  },

  // ─── RENDER ─────────────────────────────────────────────────────────────
  render(character) {
    const data = this._d(character);
    const tabs = [
      { id: 'melee',  label: 'Nahkampf',  n: data.melee.length  },
      { id: 'ranged', label: 'Fernkampf', n: data.ranged.length },
      { id: 'armor',  label: 'Rüstung',   n: data.armor.length  },
      { id: 'misc',   label: 'Sonstiges', n: data.misc.length   },
    ];

    let html = '<h2>Ausrüstung</h2><div class="equip-subtabs">';
    tabs.forEach(t => {
      html += `<button class="equip-subtab${this._activeTab === t.id ? ' active' : ''}" data-tab="${t.id}">
        ${t.label}${t.n ? ` <span class="subtab-count">${t.n}</span>` : ''}
      </button>`;
    });
    html += '</div>';

    if      (this._activeTab === 'melee')  html += this._meleeTab(data.melee, character);
    else if (this._activeTab === 'ranged') html += this._rangedTab(data.ranged, character);
    else if (this._activeTab === 'armor')  html += this._armorTab(data.armor);
    else                                   html += this._miscTab(data.misc);

    html += '<div class="equip-fin-divider"><h2>Finanzen</h2></div>';
    html += '<div id="finances-section">' + FinancesPage.render(character) + '</div>';

    return html;
  },

  _wrap(tableHtml, addId) {
    return `<div class="equip-section">
      ${App.editMode && addId ? `<div class="equip-add-row"><button id="${addId}" class="btn-success">+ Hinzufügen</button></div>` : ''}
      <div class="equip-scroll">${tableHtml}</div>
    </div>`;
  },

  _skillSel(cls, current) {
    return `<select class="${cls}">
      <option value="">–</option>
      ${this.skillNames.map(s => `<option value="${this._esc(s)}"${current === s ? ' selected' : ''}>${this._esc(s)}</option>`).join('')}
    </select>`;
  },

  _attrSel(cls, current) {
    return `<select class="${cls}">
      <option value="">–</option>
      ${Object.entries(this._attrLabels).map(([k, l]) =>
        `<option value="${k}"${current === k ? ' selected' : ''}>${l}</option>`).join('')}
    </select>`;
  },

  // Berechnet Skill-Level + Attribut-DM für die Anzeige im Lesemodus
  _weaponMod(item, character) {
    let total = 0, hasValue = false;
    if (item.attribute && character.attributes?.[item.attribute]) {
      const dm = parseInt(character.attributes[item.attribute].dm);
      if (!isNaN(dm)) { total += dm; hasValue = true; }
    }
    if (item.skill) {
      const sk = (character.skills || []).find(s => s.name === item.skill);
      const lv = sk ? parseInt(sk.level) || 0 : 0;
      total += lv; hasValue = true;
    }
    if (!hasValue) return '–';
    return total >= 0 ? `+${total}` : `${total}`;
  },

  // ─── TAB: NAHKAMPF ──────────────────────────────────────────────────────
  _meleeTab(items, character) {
    let rows = '';
    items.forEach((it, i) => {
      if (App.editMode) {
        rows += `<tr>
          <td class="eq-chk"><input type="checkbox" class="eq-equipped" ${it.equipped ? 'checked' : ''}></td>
          <td><input class="m-name"   value="${this._esc(it.name)}"></td>
          <td class="weapon-mod-edit">
            ${this._attrSel('m-attr', it.attribute)}
            ${this._skillSel('m-skill', it.skill)}
          </td>
          <td><input class="m-dmg"    value="${this._esc(it.damage)}"     placeholder="2D6"></td>
          <td><input class="m-dtype"  value="${this._esc(it.damageType)}" placeholder="B/P/S"></td>
          <td><input class="m-tl"     value="${this._esc(it.tl)}"     type="number" min="0" max="20"></td>
          <td><input class="m-weight" value="${this._esc(it.weight)}" type="number" step="0.1"></td>
          <td><input class="m-traits" value="${this._esc(it.traits || '')}" placeholder="Auto 3, Bulky …"></td>
          <td><button class="btn-info   eq-traits" data-eqtype="melee" data-idx="${i}">Details</button></td>
          <td><button class="btn-danger eq-rm"     data-eqtype="melee" data-idx="${i}">✕</button></td>
        </tr>`;
      } else {
        rows += `<tr${it.equipped ? ' class="item-equipped"' : ''}>
          <td class="eq-chk"><button class="equip-toggle${it.equipped ? ' on' : ''}" data-eqtype="melee" data-idx="${i}">${it.equipped ? '●' : '○'}</button></td>
          <td class="eq-nm">${this._esc(it.name || '–')}</td>
          <td class="weapon-mod-val">${this._weaponMod(it, character)}</td>
          <td>${this._esc(it.damage || '–')}</td>
          <td>${this._esc(it.damageType || '–')}</td>
          <td>${this._esc(it.tl || '–')}</td>
          <td>${it.weight ? it.weight + ' kg' : '–'}</td>
          <td class="eq-traits-cell">${this._esc(it.traits || '–')}</td>
          <td><button class="btn-info eq-traits" data-eqtype="melee" data-idx="${i}">Details</button></td>
        </tr>`;
      }
    });
    if (!items.length) {
      rows = `<tr><td colspan="${App.editMode ? 10 : 9}" class="eq-empty">Keine Nahkampfwaffen eingetragen.</td></tr>`;
    }
    return this._wrap(`<table class="equip-table">
      <thead><tr>
        <th class="eq-chk">Aktiv</th><th>Name</th><th>${App.editMode ? 'Attribut / Skill' : 'Mod'}</th>
        <th>Schaden</th><th>Art</th><th>TL</th><th>Kg</th><th>Traits</th><th>Merkmale</th>
        ${App.editMode ? '<th></th>' : ''}
      </tr></thead>
      <tbody id="meleeBody">${rows}</tbody>
    </table>`, 'addMeleeBtn');
  },

  // ─── TAB: FERNKAMPF ─────────────────────────────────────────────────────
  _rangedTab(items, character) {
    let rows = '';
    items.forEach((it, i) => {
      if (App.editMode) {
        rows += `<tr>
          <td class="eq-chk"><input type="checkbox" class="eq-equipped" ${it.equipped ? 'checked' : ''}></td>
          <td><input class="r-name"   value="${this._esc(it.name)}"></td>
          <td class="weapon-mod-edit">
            ${this._attrSel('r-attr', it.attribute)}
            ${this._skillSel('r-skill', it.skill)}
          </td>
          <td><input class="r-dmg"    value="${this._esc(it.damage)}"     placeholder="3D6"></td>
          <td><input class="r-dtype"  value="${this._esc(it.damageType)}" placeholder="P"></td>
          <td><input class="r-range"  value="${this._esc(it.range)}"      placeholder="50/200"></td>
          <td><input class="r-mag"    value="${this._esc(it.magazine)}"   type="number" min="0"></td>
          <td class="ammo-cell">
            <div class="ammo-ctrl">
              <button class="ammo-btn ammo-m" data-idx="${i}">−</button>
              <input  class="r-ammo ammo-inp" value="${parseInt(it.ammo) || 0}" type="number" min="0">
              <button class="ammo-btn ammo-p" data-idx="${i}">+</button>
            </div>
          </td>
          <td><input class="r-acost"  value="${this._esc(it.ammoCost)}"   placeholder="Cr"></td>
          <td><input class="r-tl"     value="${this._esc(it.tl)}"         type="number" min="0" max="20"></td>
          <td><input class="r-weight" value="${this._esc(it.weight)}"     type="number" step="0.1"></td>
          <td><input class="r-traits" value="${this._esc(it.traits || '')}" placeholder="Auto 3, Bulky …"></td>
          <td><button class="btn-info   eq-traits" data-eqtype="ranged" data-idx="${i}">Details</button></td>
          <td><button class="btn-danger eq-rm"     data-eqtype="ranged" data-idx="${i}">✕</button></td>
        </tr>`;
      } else {
        rows += `<tr${it.equipped ? ' class="item-equipped"' : ''}>
          <td class="eq-chk"><button class="equip-toggle${it.equipped ? ' on' : ''}" data-eqtype="ranged" data-idx="${i}">${it.equipped ? '●' : '○'}</button></td>
          <td class="eq-nm">${this._esc(it.name || '–')}</td>
          <td class="weapon-mod-val">${this._weaponMod(it, character)}</td>
          <td>${this._esc(it.damage || '–')}</td>
          <td>${this._esc(it.damageType || '–')}</td>
          <td>${this._esc(it.range || '–')}</td>
          <td>${this._esc(it.magazine || '–')}</td>
          <td class="ammo-cell">
            <div class="ammo-ctrl">
              <button class="ammo-btn ammo-m" data-idx="${i}">−</button>
              <span class="ammo-disp">${parseInt(it.ammo) || 0}</span>
              <button class="ammo-btn ammo-p" data-idx="${i}">+</button>
            </div>
          </td>
          <td>${this._esc(it.ammoCost || '–')}</td>
          <td>${this._esc(it.tl || '–')}</td>
          <td>${it.weight ? it.weight + ' kg' : '–'}</td>
          <td class="eq-traits-cell">${this._esc(it.traits || '–')}</td>
          <td><button class="btn-info eq-traits" data-eqtype="ranged" data-idx="${i}">Details</button></td>
        </tr>`;
      }
    });
    if (!items.length) {
      rows = `<tr><td colspan="${App.editMode ? 14 : 13}" class="eq-empty">Keine Fernkampfwaffen eingetragen.</td></tr>`;
    }
    return this._wrap(`<table class="equip-table">
      <thead><tr>
        <th class="eq-chk">Aktiv</th><th>Name</th><th>${App.editMode ? 'Attribut / Skill' : 'Mod'}</th>
        <th>Schaden</th><th>Art</th>
        <th>Reichweite</th><th>Mag</th><th>Munition</th>
        <th>Preis/Mag</th><th>TL</th><th>Kg</th><th>Traits</th><th>Merkmale</th>
        ${App.editMode ? '<th></th>' : ''}
      </tr></thead>
      <tbody id="rangedBody">${rows}</tbody>
    </table>`, 'addRangedBtn');
  },

  // ─── TAB: RÜSTUNG ───────────────────────────────────────────────────────
  _armorTab(items) {
    const active     = items.filter(a => a.equipped);
    const totalProt  = active.reduce((s, a) => s + (parseInt(a.protection) || 0), 0);

    let rows = '';
    items.forEach((it, i) => {
      if (App.editMode) {
        rows += `<tr>
          <td class="eq-chk"><input type="checkbox" class="eq-equipped" ${it.equipped ? 'checked' : ''}></td>
          <td><input class="a-name"   value="${this._esc(it.name)}"></td>
          <td><input class="a-prot"   value="${this._esc(it.protection)}" type="number" min="0"></td>
          <td><input class="a-tl"     value="${this._esc(it.tl)}"         type="number" min="0" max="20"></td>
          <td><input class="a-rad"    value="${this._esc(it.rad)}"        type="number" min="0"></td>
          <td><input class="a-weight" value="${this._esc(it.weight)}"     type="number" step="0.1"></td>
          <td>${this._skillSel('a-skill', it.requiredSkill)}</td>
          <td class="eq-chk"><input type="checkbox" class="a-sealed"    ${it.sealed    ? 'checked' : ''}></td>
          <td class="eq-chk"><input type="checkbox" class="a-layerable" ${it.layerable ? 'checked' : ''}></td>
          <td><button class="btn-info   eq-traits" data-eqtype="armor" data-idx="${i}">Details</button></td>
          <td><button class="btn-danger eq-rm"     data-eqtype="armor" data-idx="${i}">✕</button></td>
        </tr>`;
      } else {
        rows += `<tr${it.equipped ? ' class="armor-active item-equipped"' : ''}>
          <td class="eq-chk"><button class="equip-toggle${it.equipped ? ' on' : ''}" data-eqtype="armor" data-idx="${i}">${it.equipped ? '●' : '○'}</button></td>
          <td class="eq-nm">${this._esc(it.name || '–')}</td>
          <td>${this._esc(it.protection || '–')}</td>
          <td>${this._esc(it.tl || '–')}</td>
          <td>${it.rad || '–'}</td>
          <td>${it.weight ? it.weight + ' kg' : '–'}</td>
          <td>${this._esc(it.requiredSkill || '–')}</td>
          <td>${it.sealed    ? '✓' : '–'}</td>
          <td>${it.layerable ? '✓' : '–'}</td>
          <td><button class="btn-info eq-traits" data-eqtype="armor" data-idx="${i}">Details</button></td>
        </tr>`;
      }
    });

    if (!items.length) {
      rows = `<tr><td colspan="${App.editMode ? 11 : 10}" class="eq-empty">Keine Rüstung eingetragen.</td></tr>`;
    }

    const totalRow = active.length ? `
      <tr class="armor-total">
        <td colspan="${App.editMode ? 11 : 10}">
          <strong>Schutzwert gesamt: ${totalProt}</strong>
          <span class="armor-total-names">${active.map(a => this._esc(a.name)).join(' + ')}</span>
        </td>
      </tr>` : '';

    return this._wrap(`<table class="equip-table">
      <thead><tr>
        <th class="eq-chk">Aktiv</th><th>Name</th><th>Schutz</th><th>TL</th><th>Rad</th><th>Kg</th>
        <th>Skill</th><th>Sealed</th><th>Stapelbar</th><th>Merkmale</th>
        ${App.editMode ? '<th></th>' : ''}
      </tr></thead>
      <tbody id="armorBody">${rows}${totalRow}</tbody>
    </table>`, 'addArmorBtn');
  },

  // ─── TAB: SONSTIGES ─────────────────────────────────────────────────────
  _miscTab(items) {
    let rows = '';
    items.forEach((it, i) => {
      if (App.editMode) {
        rows += `<tr>
          <td><input class="mi-name" value="${this._esc(it.name)}"></td>
          <td><input class="mi-qty"  value="${this._esc(it.quantity || 1)}" type="number" min="0"></td>
          <td><input class="mi-tl"   value="${this._esc(it.tl)}"            type="number" min="0" max="20"></td>
          <td><input class="mi-wt"   value="${this._esc(it.weight)}"        type="number" step="0.1"></td>
          <td><input class="mi-desc" value="${this._esc(it.description)}"></td>
          <td><button class="btn-info   eq-traits" data-eqtype="misc" data-idx="${i}">Details</button></td>
          <td><button class="btn-danger eq-rm"     data-eqtype="misc" data-idx="${i}">✕</button></td>
        </tr>`;
      } else {
        rows += `<tr>
          <td class="eq-nm">${this._esc(it.name || '–')}</td>
          <td>${this._esc(it.quantity || 1)}</td>
          <td>${this._esc(it.tl || '–')}</td>
          <td>${it.weight ? it.weight + ' kg' : '–'}</td>
          <td>${this._esc(it.description || '–')}</td>
          <td><button class="btn-info eq-traits" data-eqtype="misc" data-idx="${i}">Details</button></td>
        </tr>`;
      }
    });
    if (!items.length) {
      rows = `<tr><td colspan="${App.editMode ? 7 : 6}" class="eq-empty">Keine sonstigen Gegenstände eingetragen.</td></tr>`;
    }
    return this._wrap(`<table class="equip-table">
      <thead><tr>
        <th>Name</th><th>Menge</th><th>TL</th><th>Kg</th><th>Beschreibung</th><th>Merkmale</th>
        ${App.editMode ? '<th></th>' : ''}
      </tr></thead>
      <tbody id="miscBody">${rows}</tbody>
    </table>`, 'addMiscBtn');
  },

  // ─── SAVE ────────────────────────────────────────────────────────────────
  save(character) {
    const tab  = this._activeTab;
    const data = this._d(character);
    let updated;

    if      (tab === 'melee')  updated = this._readMelee(data.melee);
    else if (tab === 'ranged') updated = this._readRanged(data.ranged);
    else if (tab === 'armor')  updated = this._readArmor(data.armor);
    else                       updated = this._readMisc(data.misc);

    if (updated === null) return;

    const others = character.equipment.filter(e => !this._tabOwns(tab, e.type));
    character.equipment = [...others, ...updated];
  },

  _readMelee(existing) {
    const body = document.getElementById('meleeBody');
    if (!body || !App.editMode) return null;
    return Array.from(body.querySelectorAll('tr')).flatMap((tr, i) => {
      const name = tr.querySelector('.m-name')?.value?.trim();
      if (!name) return [];
      return [{
        type: 'melee',
        id:         existing[i]?.id || ('mel' + Date.now() + i),
        createdAt:  existing[i]?.createdAt || new Date().toISOString(),
        equipped:   tr.querySelector('.eq-equipped')?.checked || false,
        name,
        attribute:  tr.querySelector('.m-attr')?.value   || '',
        skill:      tr.querySelector('.m-skill')?.value  || '',
        damage:     tr.querySelector('.m-dmg')?.value    || '',
        damageType: tr.querySelector('.m-dtype')?.value  || '',
        tl:         tr.querySelector('.m-tl')?.value     || '',
        weight:     tr.querySelector('.m-weight')?.value || '',
        traits:  tr.querySelector('.m-traits')?.value?.trim() || '',
        details: existing[i]?.details ?? (typeof existing[i]?.traits === 'object' ? existing[i].traits : {}),
      }];
    });
  },

  _readRanged(existing) {
    const body = document.getElementById('rangedBody');
    if (!body || !App.editMode) return null;
    return Array.from(body.querySelectorAll('tr')).flatMap((tr, i) => {
      const name = tr.querySelector('.r-name')?.value?.trim();
      if (!name) return [];
      return [{
        type: 'ranged',
        id:         existing[i]?.id || ('rng' + Date.now() + i),
        createdAt:  existing[i]?.createdAt || new Date().toISOString(),
        equipped:   tr.querySelector('.eq-equipped')?.checked || false,
        name,
        attribute:  tr.querySelector('.r-attr')?.value   || '',
        skill:      tr.querySelector('.r-skill')?.value  || '',
        damage:     tr.querySelector('.r-dmg')?.value    || '',
        damageType: tr.querySelector('.r-dtype')?.value  || '',
        range:      tr.querySelector('.r-range')?.value  || '',
        magazine:   tr.querySelector('.r-mag')?.value    || '',
        ammo:       parseInt(tr.querySelector('.r-ammo, .ammo-inp')?.value) || 0,
        ammoCost:   tr.querySelector('.r-acost')?.value  || '',
        tl:         tr.querySelector('.r-tl')?.value     || '',
        weight:     tr.querySelector('.r-weight')?.value || '',
        traits:  tr.querySelector('.r-traits')?.value?.trim() || '',
        details: existing[i]?.details ?? (typeof existing[i]?.traits === 'object' ? existing[i].traits : {}),
      }];
    });
  },

  _readArmor(existing) {
    const body = document.getElementById('armorBody');
    if (!body || !App.editMode) return null;
    return Array.from(body.querySelectorAll('tr:not(.armor-total)')).flatMap((tr, i) => {
      const name = tr.querySelector('.a-name')?.value?.trim();
      if (!name) return [];
      return [{
        type: 'armor',
        id:            existing[i]?.id || ('arm' + Date.now() + i),
        createdAt:     existing[i]?.createdAt || new Date().toISOString(),
        equipped:      tr.querySelector('.eq-equipped')?.checked  || false,
        name,
        protection:    tr.querySelector('.a-prot')?.value   || '',
        tl:            tr.querySelector('.a-tl')?.value     || '',
        rad:           tr.querySelector('.a-rad')?.value    || '',
        weight:        tr.querySelector('.a-weight')?.value || '',
        requiredSkill: tr.querySelector('.a-skill')?.value  || '',
        sealed:        tr.querySelector('.a-sealed')?.checked    || false,
        layerable:     tr.querySelector('.a-layerable')?.checked || false,
        details: existing[i]?.details ?? (typeof existing[i]?.traits === 'object' ? existing[i].traits : {}),
      }];
    });
  },

  _readMisc(existing) {
    const body = document.getElementById('miscBody');
    if (!body || !App.editMode) return null;
    return Array.from(body.querySelectorAll('tr')).flatMap((tr, i) => {
      const name = tr.querySelector('.mi-name')?.value?.trim();
      if (!name) return [];
      return [{
        type: 'misc',
        id:          existing[i]?.id || ('misc' + Date.now() + i),
        createdAt:   existing[i]?.createdAt || new Date().toISOString(),
        name,
        quantity:    parseInt(tr.querySelector('.mi-qty')?.value)  || 1,
        tl:          tr.querySelector('.mi-tl')?.value             || '',
        weight:      tr.querySelector('.mi-wt')?.value             || '',
        description: tr.querySelector('.mi-desc')?.value           || '',
        details: existing[i]?.details ?? (typeof existing[i]?.traits === 'object' ? existing[i].traits : {}),
      }];
    });
  },

  // ─── LISTENERS ──────────────────────────────────────────────────────────
  attachListeners() {
    // Sub-tab switching
    document.querySelectorAll('.equip-subtab').forEach(btn => {
      btn.addEventListener('click', () => {
        if (window.currentCharacter) {
          this.save(window.currentCharacter);
          Storage.saveCharacter(window.currentCharacter);
        }
        this._activeTab = btn.dataset.tab;
        App.renderCurrentPage();
      });
    });

    // Add-row buttons
    document.getElementById('addMeleeBtn')?.addEventListener('click',  () => this._addRow('melee'));
    document.getElementById('addRangedBtn')?.addEventListener('click', () => this._addRow('ranged'));
    document.getElementById('addArmorBtn')?.addEventListener('click',  () => this._addRow('armor'));
    document.getElementById('addMiscBtn')?.addEventListener('click',   () => this._addRow('misc'));

    // Delegated: remove + traits
    document.querySelector('.equip-scroll')?.addEventListener('click', e => {
      const rm = e.target.closest('.eq-rm');
      if (rm) { rm.closest('tr').remove(); return; }
      const tr = e.target.closest('.eq-traits');
      if (tr) this._showTraits(tr.dataset.eqtype, parseInt(tr.dataset.idx));
    });

    // Ammo buttons
    document.querySelectorAll('.ammo-btn').forEach(btn => this._bindAmmoBtn(btn));

    // Ausgerüstet-Toggle (view mode)
    document.querySelectorAll('.equip-toggle').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx   = parseInt(btn.dataset.idx);
        const type  = btn.dataset.eqtype;
        const data  = this._d(window.currentCharacter);
        const items = data[type];
        const item  = items[idx];
        if (!item) return;
        const wasOn = !!item.equipped;

        if (type === 'armor') {
          if (!wasOn) {
            if (!item.layerable) {
              items.forEach((a, j) => { if (j !== idx && !a.layerable) a.equipped = false; });
            }
            item.equipped = true;
          } else {
            item.equipped = false;
          }
        } else {
          // Waffen: exklusiv
          items.forEach(it => { it.equipped = false; });
          if (!wasOn) item.equipped = true;
        }

        const others = window.currentCharacter.equipment.filter(e => !this._tabOwns(type, e.type));
        window.currentCharacter.equipment = [...others, ...items];
        Storage.saveCharacter(window.currentCharacter);
        App.renderCurrentPage();
      });
    });

    // Ausgerüstet-Checkbox (edit mode) – exklusiv
    document.querySelectorAll('.eq-equipped').forEach(cb => this._bindEquippedCb(cb));

    FinancesPage.attachListeners();
  },

  _bindAmmoBtn(btn) {
    btn.addEventListener('click', () => {
      const delta = btn.classList.contains('ammo-p') ? 1 : -1;
      const tr    = btn.closest('tr');

      // Edit mode: input field
      const inp = tr?.querySelector('.ammo-inp');
      if (inp) { inp.value = Math.max(0, (parseInt(inp.value) || 0) + delta); return; }

      // View mode: span + persist
      const disp = tr?.querySelector('.ammo-disp');
      if (disp) {
        const idx = parseInt(btn.dataset.idx);
        const val = Math.max(0, (parseInt(disp.textContent) || 0) + delta);
        disp.textContent = val;
        const data = this._d(window.currentCharacter);
        if (data.ranged[idx]) {
          data.ranged[idx].ammo = val;
          const others = window.currentCharacter.equipment.filter(e => e.type !== 'ranged' && e.type !== 'weapon');
          window.currentCharacter.equipment = [...others, ...data.ranged];
          Storage.saveCharacter(window.currentCharacter);
        }
      }
    });
  },

  _bindEquippedCb(cb) {
    cb.addEventListener('change', () => {
      if (!cb.checked) return;
      const tbody = cb.closest('tbody');
      if (tbody?.id === 'armorBody') {
        const myTr = cb.closest('tr');
        const isLayerable = myTr.querySelector('.a-layerable')?.checked;
        if (isLayerable) return; // layerbar: darf zusätzlich aktiv sein
        tbody.querySelectorAll('tr').forEach(tr => {
          if (tr === myTr) return;
          if (!tr.querySelector('.a-layerable')?.checked) {
            const other = tr.querySelector('.eq-equipped');
            if (other) other.checked = false;
          }
        });
      } else {
        // Waffen: exklusiv
        tbody?.querySelectorAll('.eq-equipped').forEach(other => {
          if (other !== cb) other.checked = false;
        });
      }
    });
  },

  _addRow(type) {
    const ids = { melee: 'meleeBody', ranged: 'rangedBody', armor: 'armorBody', misc: 'miscBody' };
    const body = document.getElementById(ids[type]);
    if (!body) return;
    body.querySelector('.eq-empty')?.closest('tr')?.remove();

    let row = '';
    if (type === 'melee') {
      row = `<tr>
        <td class="eq-chk"><input type="checkbox" class="eq-equipped"></td>
        <td><input class="m-name" placeholder="Name"></td>
        <td class="weapon-mod-edit">
          ${this._attrSel('m-attr', '')}
          ${this._skillSel('m-skill', '')}
        </td>
        <td><input class="m-dmg" placeholder="2D6"></td>
        <td><input class="m-dtype"  placeholder="B/P/S"></td>
        <td><input class="m-tl"     type="number" min="0" max="20"></td>
        <td><input class="m-weight" type="number" step="0.1"></td>
        <td><input class="m-traits" placeholder="Auto 3, Bulky …"></td>
        <td><button class="btn-info   eq-traits" data-eqtype="melee">Details</button></td>
        <td><button class="btn-danger eq-rm">✕</button></td>
      </tr>`;
    } else if (type === 'ranged') {
      row = `<tr>
        <td class="eq-chk"><input type="checkbox" class="eq-equipped"></td>
        <td><input class="r-name" placeholder="Name"></td>
        <td class="weapon-mod-edit">
          ${this._attrSel('r-attr', '')}
          ${this._skillSel('r-skill', '')}
        </td>
        <td><input class="r-dmg" placeholder="3D6"></td>
        <td><input class="r-dtype"  placeholder="P"></td>
        <td><input class="r-range"  placeholder="50/200"></td>
        <td><input class="r-mag"    type="number" min="0"></td>
        <td class="ammo-cell"><div class="ammo-ctrl">
          <button class="ammo-btn ammo-m">−</button>
          <input  class="r-ammo ammo-inp" value="0" type="number" min="0">
          <button class="ammo-btn ammo-p">+</button>
        </div></td>
        <td><input class="r-acost"  placeholder="Cr"></td>
        <td><input class="r-tl"     type="number" min="0" max="20"></td>
        <td><input class="r-weight" type="number" step="0.1"></td>
        <td><input class="r-traits" placeholder="Auto 3, Bulky …"></td>
        <td><button class="btn-info   eq-traits" data-eqtype="ranged">Details</button></td>
        <td><button class="btn-danger eq-rm">✕</button></td>
      </tr>`;
    } else if (type === 'armor') {
      row = `<tr>
        <td class="eq-chk"><input type="checkbox" class="eq-equipped"></td>
        <td><input class="a-name"   placeholder="Name"></td>
        <td><input class="a-prot"   type="number" min="0"></td>
        <td><input class="a-tl"     type="number" min="0" max="20"></td>
        <td><input class="a-rad"    type="number" min="0"></td>
        <td><input class="a-weight" type="number" step="0.1"></td>
        <td>${this._skillSel('a-skill', '')}</td>
        <td class="eq-chk"><input type="checkbox" class="a-sealed"></td>
        <td class="eq-chk"><input type="checkbox" class="a-layerable"></td>
        <td class="eq-chk"><input type="checkbox" class="a-equipped"></td>
        <td><button class="btn-info   eq-traits" data-eqtype="armor">Details</button></td>
        <td><button class="btn-danger eq-rm">✕</button></td>
      </tr>`;
    } else {
      row = `<tr>
        <td><input class="mi-name" placeholder="Name"></td>
        <td><input class="mi-qty"  type="number" value="1" min="0"></td>
        <td><input class="mi-tl"   type="number" min="0" max="20"></td>
        <td><input class="mi-wt"   type="number" step="0.1"></td>
        <td><input class="mi-desc" placeholder="Beschreibung"></td>
        <td><button class="btn-info   eq-traits" data-eqtype="misc">Details</button></td>
        <td><button class="btn-danger eq-rm">✕</button></td>
      </tr>`;
    }

    body.insertAdjacentHTML('beforeend', row);
    const newTr = body.lastElementChild;
    newTr.querySelectorAll('.ammo-btn').forEach(b => this._bindAmmoBtn(b));
    newTr.querySelectorAll('.a-equipped').forEach(cb => this._bindEquippedCb(cb));
  },

  // ─── TRAITS MODAL ───────────────────────────────────────────────────────
  _showTraits(type, idx) {
    const data  = this._d(window.currentCharacter);
    const lists = { melee: data.melee, ranged: data.ranged, armor: data.armor, misc: data.misc };
    const items = lists[type] || [];
    const item  = items[idx];
    if (!item) return;
    const traits = item.details || {};

    const modal = document.createElement('div');
    modal.className = 'traits-modal-overlay';
    modal.innerHTML = `
      <div class="traits-modal">
        <h3>${this._esc(item.name || 'Gegenstand')} – Details</h3>
        ${App.editMode ? `<label class="traits-label">Bild</label>
          <input type="file" id="traitsImg" accept="image/*">` : ''}
        <div id="traitsImgPreview" class="traits-img-preview">
          ${traits.image ? `<img src="${traits.image}">` : ''}
        </div>
        ${App.editMode
          ? `<label class="traits-label">Beschreibung / Merkmale</label>
             <textarea id="traitsDesc" class="traits-textarea">${this._esc(traits.description || '')}</textarea>
             <span class="md-hint">**fett** · *kursiv* · # Überschrift · | Tabelle |</span>
             <div class="form-group form-group-ts" style="margin-top:12px">
               <label>Erstellt am</label>
               <span class="ts-display">${item.createdAt ? new Date(item.createdAt).toLocaleString('de-AT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '–'}</span>
             </div>`
          : `<div class="traits-desc-view md-content">${Md.render(traits.description || '') || '<p class="md-p" style="color:#999">Keine Beschreibung.</p>'}</div>`}
        <div class="traits-actions">
          <button id="traitsCancelBtn" class="btn-secondary">Schließen</button>
          ${App.editMode ? '<button id="traitsSaveBtn" class="btn-primary">Speichern</button>' : ''}
        </div>
      </div>`;
    document.body.appendChild(modal);

    document.getElementById('traitsCancelBtn').addEventListener('click', () => modal.remove());
    modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

    if (App.editMode) {
      document.getElementById('traitsImg')?.addEventListener('change', e => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = ev => {
          traits.image = ev.target.result;
          document.getElementById('traitsImgPreview').innerHTML = `<img src="${ev.target.result}">`;
        };
        reader.readAsDataURL(file);
      });

      document.getElementById('traitsSaveBtn').addEventListener('click', () => {
        traits.description = document.getElementById('traitsDesc').value;
        item.details = traits;
        const others = window.currentCharacter.equipment.filter(e => !this._tabOwns(type, e.type));
        window.currentCharacter.equipment = [...others, ...items];
        Storage.saveCharacter(window.currentCharacter);
        modal.remove();
      });
    }
  },

  reset() {
    document.getElementById('equipment-page').innerHTML = '';
  }
};
