/**
 * Attribute & Skills Seite
 */
const AttributesPage = {
  attributeLabels: {
    strength: 'Stärke',
    dexterity: 'Geschick',
    endurance: 'Ausdauer',
    intelligence: 'Intelligenz',
    education: 'Bildung',
    socialStatus: 'Soziale Stellung',
    psi: 'Psi'
  },

  /**
   * Berechnet den DM-Wert basierend auf dem Attribut-Wert
   */
  calculateDM(value) {
    value = parseInt(value) || 0;
    if (value === 0) return -3;
    if (value <= 2) return -2;
    if (value <= 5) return -1;
    if (value <= 8) return 0;
    if (value <= 11) return 1;
    if (value <= 14) return 2;
    return 3;
  },

  render(character) {
    const attrs = character.attributes;
    const skills = character.skills;

    let html = `<div class="${App.editMode ? '' : 'view-mode'}"><h2>Attribute & Skills</h2>`;
    
    // Attribute Section
    html += '<h3>Attribute</h3>';
    
    // DM-Berechnungsreferenz (klein und grau)
    html += `<div class="dm-info-box"><strong>DM:</strong> 0=−3 &nbsp;1-2=−2 &nbsp;3-5=−1 &nbsp;6-8=0 &nbsp;9-11=+1 &nbsp;12-14=+2 &nbsp;15+=+3</div>`;
    
    html += `
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 30px;">
        <thead>
          <tr>
            <th style="text-align: left; padding: 12px; border-bottom: 2px solid #ddd;">Attribut</th>
            <th style="padding: 12px; border-bottom: 2px solid #ddd; width: 120px;">Wert</th>
            <th style="padding: 12px; border-bottom: 2px solid #ddd; width: 120px;">Aktuell</th>
            <th style="padding: 12px; border-bottom: 2px solid #ddd; width: 120px;">DM</th>
          </tr>
        </thead>
        <tbody>
    `;
    
    for (const [key, label] of Object.entries(this.attributeLabels)) {
      const attrData = attrs[key] || { value: 6, current: 6, dm: 0 };
      const value   = typeof attrData === 'number' ? attrData : (attrData.value   ?? 6);
      const current = typeof attrData === 'number' ? attrData : (attrData.current ?? 6);

      const isPsi       = key === 'psi';
      const psiInactive = isPsi && current === -1;
      const dmValue     = (isPsi && current <= 0) ? '' : this.calculateDM(current);

      if (!App.editMode && psiInactive) {
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; color: #bbb;">${label}</td>
            <td style="padding: 12px; color: #bbb; text-align: center;">–</td>
            <td style="padding: 12px; color: #bbb; text-align: center;">–</td>
            <td style="padding: 12px; color: #bbb; text-align: center;">–</td>
          </tr>
        `;
      } else {
        html += `
          <tr style="border-bottom: 1px solid #eee;">
            <td style="padding: 12px; vertical-align: middle;">${label}</td>
            <td style="padding: 12px;">
              <input type="number" class="attr-value" data-attr="${key}" value="${value}" min="${isPsi ? -1 : 0}" max="15" style="width: 100%; padding: 6px; font-weight: 600;">
            </td>
            <td style="padding: 12px;">
              <input type="number" class="attr-current" data-attr="${key}" value="${current}" min="${isPsi ? -1 : 0}" max="15" style="width: 100%; padding: 6px;">
            </td>
            <td style="padding: 12px;">
              <input type="number" class="attr-dm" data-attr="${key}" value="${dmValue}" min="-10" max="10" readonly style="width: 100%; padding: 6px;">
            </td>
          </tr>
        `;
      }
    }
    html += '</tbody></table>';

    // Skills Section
    html += '<h3>Skills</h3>';
    
    // Berechne Max. Skill Levels: 3 x (EDU DM + INT DM), basierend auf aktuellen Werten
    const eduAttr = attrs.education || { current: 6 };
    const intAttr = attrs.intelligence || { current: 6 };
    const eduCurrent = typeof eduAttr === 'number' ? eduAttr : (eduAttr.current || 6);
    const intCurrent = typeof intAttr === 'number' ? intAttr : (intAttr.current || 6);
    const eduDM = this.calculateDM(eduCurrent);
    const intDM = this.calculateDM(intCurrent);
    const maxSkillLevels = 3 * (eduDM + intDM);
    const fmt = n => n >= 0 ? `+${n}` : `${n}`;

    html += `<p class="attr-max-skill-hint">Max. Skill Levels = 3 × (EDU DM + INT DM) = 3 × (${fmt(eduDM)} + ${fmt(intDM)}) = <strong>${maxSkillLevels}</strong></p>`;
    
    // Suchfilter und Add-Button (Add-Button nur im Edit-Modus)
    html += `
      <div style="display: flex; gap: 10px; margin-bottom: 20px; align-items: center;">
        <input type="text" id="skillFilter" placeholder="Skill suchen..." style="flex: 1; padding: 8px; border: 1px solid #ddd; border-radius: 4px; font-size: 0.9em;">
        ${App.editMode ? '<button id="addSkillBtn" class="btn-success">+ Skill</button>' : ''}
      </div>
      <div id="skillsContainer">
    `;
    
    // Berechne Spaltenanzahl basierend auf der Anzahl der Skills
    const columnCount = Math.max(2, Math.min(4, Math.ceil(skills.length / 20)));
    html += `<div style="display: grid; grid-template-columns: repeat(${columnCount}, 1fr); gap: 15px;">`;
    
    const skillsPerColumn = Math.ceil(skills.length / columnCount);
    
    for (let col = 0; col < columnCount; col++) {
      const start = col * skillsPerColumn;
      const end = Math.min(start + skillsPerColumn, skills.length);
      const columnSkills = skills.slice(start, end);
      
      html += '<div>';
      
      columnSkills.forEach((skill, index) => {
        const globalIndex = start + index;
        const level = skill.level || 0;
        if (App.editMode) {
          html += `
            <div class="skill-item">
              <label>${skill.name}</label>
              <input type="number" class="skill-level skill-level-input" data-index="${globalIndex}" value="${level}" min="-1" max="9">
            </div>
          `;
        } else {
          const learned = level >= 0;
          html += `
            <div class="skill-item ${learned ? 'skill-item--learned' : 'skill-item--unlearned'}">
              <span class="skill-label">${skill.name}</span>
              ${learned ? `<span class="skill-badge">${level}</span>` : ''}
            </div>
          `;
        }
      });
      
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    // ── Weiterbildung ──
    html += this._renderTraining(character);

    html += '</div>'; // view-mode wrapper

    return html;
  },

  // ─────────────────────── TRAINING RENDER ────────────────────────────────

  _esc(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  _methodLabel(m) {
    return { self: 'Selbststudium', teacher: 'Mit Lehrer', course: 'Kurs/Schule' }[m] || m;
  },

  _methodClass(m) {
    return { self: 'train-method-self', teacher: 'train-method-teacher', course: 'train-method-course' }[m] || '';
  },

  _addTrainingMonths(dateStr, months) {
    if (!dateStr || !months) return '';
    const parts = String(dateStr).split('-');
    if (parts.length < 2) return '';
    let year = parseInt(parts[0]), month = parseInt(parts[1]);
    if (isNaN(year) || isNaN(month)) return '';
    month += parseInt(months) || 0;
    while (month > 12) { month -= 12; year++; }
    return `${year}-${String(month).padStart(2, '0')}`;
  },

  _renderTraining(character) {
    const training = Array.isArray(character.training) ? character.training : [];
    const active = training.filter(t => !t.completed);
    const done   = training.filter(t =>  t.completed).reverse();
    const e = s => this._esc(s);

    let html = `<h3 style="margin-top:28px;">Weiterbildung</h3><div class="training-section">`;

    if (App.editMode) {
      html += `<button id="addTrainingBtn" class="btn-success training-add-btn">+ Training hinzufügen</button>`;
    }

    if (active.length === 0) {
      html += `<p class="training-empty">Kein aktives Training eingetragen.</p>`;
    }

    active.forEach(t => {
      const progress = Math.max(0, t.progressMonths || 0);
      const total    = Math.max(1, t.durationMonths || 1);
      const pct      = Math.min(100, Math.round((progress / total) * 100));
      const ready    = progress >= total;

      html += `
        <div class="training-card${ready ? ' training-card--ready' : ''}">
          <div class="training-card-top">
            <span class="training-skill-name">${e(t.skillName)}</span>
            <span class="training-levels">${t.fromLevel} → ${t.toLevel}</span>
            <span class="train-method-badge ${this._methodClass(t.method)}">${this._methodLabel(t.method)}</span>
            ${App.editMode ? `<button class="training-del-btn btn-icon" data-id="${t.id}">🗑</button>` : ''}
          </div>

          <div class="training-card-counter">
            <button class="training-pm-btn" data-id="${t.id}" data-delta="-1" aria-label="Weniger">−</button>
            <span class="training-counter" data-id="${t.id}">${progress} / ${total} Monate</span>
            <button class="training-pm-btn" data-id="${t.id}" data-delta="1" aria-label="Mehr">+</button>
            <button class="training-complete-btn${ready ? ' training-complete-ready' : ''}" data-id="${t.id}">
              ✓ Abschließen
            </button>
          </div>

          <div class="training-progress-track">
            <div class="training-progress-fill${ready ? ' training-progress-fill--done' : ''}"
                 data-id="${t.id}"
                 style="width:${pct}%"></div>
          </div>

          ${t.notes ? `<div class="training-card-notes md-content">${Md.render(t.notes)}</div>` : ''}
        </div>`;
    });

    if (done.length > 0) {
      html += `
        <details class="training-done-details">
          <summary class="training-done-summary">✓ Abgeschlossen (${done.length})</summary>
          <div class="training-done-list">
            ${done.map(t => `
              <div class="training-done-item">
                <span class="training-skill-name">${e(t.skillName)}</span>
                <span class="training-levels">${t.fromLevel}→${t.toLevel}</span>
                <span class="train-method-small">${this._methodLabel(t.method)}</span>
                ${t.completedDate ? `<span class="training-done-date">${e(t.completedDate)}</span>` : ''}
                ${App.editMode ? `<button class="training-del-btn btn-icon btn-xs" data-id="${t.id}">🗑</button>` : ''}
              </div>`).join('')}
          </div>
        </details>`;
    }

    html += '</div>';
    return html;
  },

  // ─────────────────────── TRAINING MODALS ────────────────────────────────

  _showAddTrainingModal(char) {
    const skillOpts = (char.skills || []).map(s =>
      `<option value="${this._esc(s.name)}" data-level="${s.level}">${this._esc(s.name)} (${s.level >= 0 ? s.level : 'ungelernt'})</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'fin-settle-overlay';
    overlay.innerHTML = `
      <div class="training-modal">
        <h3>Training hinzufügen</h3>
        <div class="form-group">
          <label>Skill</label>
          <select id="tmSkill">
            <option value="">– Skill wählen –</option>
            ${skillOpts}
            <option value="__custom">Anderer Skill …</option>
          </select>
          <input type="text" id="tmSkillCustom" class="training-custom-input" placeholder="Skill-Name" style="display:none;">
        </div>
        <div class="training-modal-row">
          <div class="form-group"><label>Von Level</label>
            <input type="number" id="tmFrom" value="0" min="-1" max="8">
          </div>
          <div class="form-group"><label>Zu Level</label>
            <input type="number" id="tmTo" value="1" min="0" max="9">
          </div>
        </div>
        <div class="form-group">
          <label>Methode</label>
          <select id="tmMethod">
            <option value="self">Selbststudium (4 Monate)</option>
            <option value="teacher">Mit Lehrer (3 Monate)</option>
            <option value="course">Kurs / Schule</option>
          </select>
        </div>
        <div class="training-modal-row">
          <div class="form-group"><label>Dauer (Monate)</label>
            <input type="number" id="tmDuration" value="4" min="1" max="120">
          </div>
          <div class="form-group"><label>Start (In-Game)</label>
            <input type="text" id="tmStart" placeholder="z.B. 1105-03">
          </div>
        </div>
        <div class="form-group"><label>Notizen</label>
          <input type="text" id="tmNotes" placeholder="Optional">
        </div>
        <div class="training-modal-actions">
          <button id="tmConfirm" class="btn-success">Hinzufügen</button>
          <button id="tmCancel"  class="btn-secondary">Abbrechen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const skillSel    = document.getElementById('tmSkill');
    const customInput = document.getElementById('tmSkillCustom');
    const fromInput   = document.getElementById('tmFrom');
    const toInput     = document.getElementById('tmTo');
    const methodSel   = document.getElementById('tmMethod');
    const durInput    = document.getElementById('tmDuration');

    skillSel.addEventListener('change', () => {
      const sel = skillSel.options[skillSel.selectedIndex];
      customInput.style.display = sel.value === '__custom' ? '' : 'none';
      if (sel.value && sel.value !== '__custom') {
        const lv = parseInt(sel.dataset.level ?? 0);
        const base = lv < 0 ? 0 : lv;
        fromInput.value = base;
        toInput.value   = base + 1;
      }
    });
    methodSel.addEventListener('change', () => {
      durInput.value = { self: 4, teacher: 3, course: 6 }[methodSel.value] ?? 4;
    });

    document.getElementById('tmCancel').onclick = () => overlay.remove();
    document.getElementById('tmConfirm').onclick = () => {
      const skillName = skillSel.value === '__custom'
        ? customInput.value.trim()
        : skillSel.value;
      if (!skillName) { alert('Bitte einen Skill wählen.'); return; }

      if (!Array.isArray(char.training)) char.training = [];
      char.training.push({
        id:             'tr_' + Date.now(),
        skillName,
        fromLevel:      parseInt(fromInput.value)  ?? 0,
        toLevel:        parseInt(toInput.value)    ?? 1,
        method:         methodSel.value,
        durationMonths: parseInt(durInput.value)   || 4,
        progressMonths: 0,
        startDate:      document.getElementById('tmStart').value.trim(),
        notes:          document.getElementById('tmNotes').value.trim(),
        completed:      false,
        completedDate:  ''
      });
      Storage.saveCharacter(char);
      App.renderCurrentPage();
      overlay.remove();
    };
  },

  _showCompleteTrainingModal(t, char) {
    const suggestedDate = this._addTrainingMonths(t.startDate, t.durationMonths);
    const overlay = document.createElement('div');
    overlay.className = 'fin-settle-overlay';
    overlay.innerHTML = `
      <div class="training-modal">
        <h3>Training abschließen</h3>
        <p class="training-modal-info">
          <strong>${this._esc(t.skillName)}</strong>
          &nbsp; ${t.fromLevel} → ${t.toLevel} &nbsp;·&nbsp; ${this._methodLabel(t.method)}
        </p>
        <div class="form-group"><label>Abgeschlossen am (In-Game)</label>
          <input type="text" id="tcDate" value="${this._esc(suggestedDate)}" placeholder="z.B. 1105-07">
        </div>
        <label class="training-modal-check">
          <input type="checkbox" id="tcUpdateSkill" checked>
          Skill-Level auf ${t.toLevel} setzen
        </label>
        <div class="training-modal-actions" style="margin-top:20px;">
          <button id="tcConfirm" class="btn-success">Abschließen</button>
          <button id="tcCancel"  class="btn-secondary">Abbrechen</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    document.getElementById('tcCancel').onclick  = () => overlay.remove();
    document.getElementById('tcConfirm').onclick = () => {
      const completedDate  = document.getElementById('tcDate').value.trim();
      const updateSkill    = document.getElementById('tcUpdateSkill').checked;

      const entry = char.training.find(x => x.id === t.id);
      if (entry) { entry.completed = true; entry.completedDate = completedDate; }

      if (updateSkill) {
        const skill = char.skills.find(s => s.name === t.skillName);
        if (skill) skill.level = t.toLevel;
      }

      Storage.saveCharacter(char);
      App.renderCurrentPage();
      overlay.remove();
    };
  },

  getData() {
    const attributes = {};
    
    // Sammle Attribute
    document.querySelectorAll('[data-attr]').forEach(input => {
      const attr = input.getAttribute('data-attr');
      if (!attributes[attr]) {
        attributes[attr] = { value: 6, current: 6, dm: 0 };
      }
      
      if (input.classList.contains('attr-value')) {
        attributes[attr].value = parseInt(input.value) || 6;
      } else if (input.classList.contains('attr-current')) {
        const current = parseInt(input.value) || 6;
        attributes[attr].current = current;
        // DM wird vom aktuellen Wert berechnet
        if (attr === 'psi' && current === 0) {
          attributes[attr].dm = 0;
        } else {
          attributes[attr].dm = this.calculateDM(current);
        }
      }
    });

    // Sammle Skills
    document.querySelectorAll('.skill-level').forEach(input => {
      const index = parseInt(input.getAttribute('data-index'));
      if (index >= 0 && index < window.currentCharacter.skills.length) {
        window.currentCharacter.skills[index].level = parseInt(input.value) || 0;
      }
    });

    return { attributes, skills: window.currentCharacter.skills };
  },

  save(character) {
    // Sichere nur, wenn Eingabefelder existieren (Edit-Modus ist aktiv)
    const attrInputs = document.querySelectorAll('[data-attr]');
    const skillLevelInputs = document.querySelectorAll('.skill-level');
    if (attrInputs.length === 0 && skillLevelInputs.length === 0) return; // Keine Eingabefelder gefunden

    const data = this.getData();
    // Merge neue/aktuelle Attribute in bestehende, damit dynamisch hinzugefügte Attribute erhalten bleiben
    character.attributes = { ...character.attributes, ...data.attributes };
    character.skills = data.skills;
  },

  reset() {
    document.getElementById('attributes-page').innerHTML = '';
  },

  attachListeners() {
    // Skill-Suchfilter: immer verfügbar (auch im View-Modus)
    const filterInput = document.getElementById('skillFilter');
    if (filterInput && !filterInput.dataset.listenerAttached) {
      filterInput.dataset.listenerAttached = '1';
      filterInput.addEventListener('input', (e) => {
        const searchTerm = e.target.value.toLowerCase();
        document.querySelectorAll('.skill-item').forEach(item => {
          const el = item.querySelector('label, .skill-label');
          const skillName = el ? el.textContent.toLowerCase() : '';
          item.style.display = skillName.includes(searchTerm) ? 'flex' : 'none';
        });
      });
    }

    // ── Training-Buttons (immer aktiv, auch im View-Modus) ───────────────
    document.getElementById('addTrainingBtn')?.addEventListener('click', () => {
      this._showAddTrainingModal(App.currentCharacter);
    });

    document.querySelectorAll('.training-pm-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id    = btn.dataset.id;
        const delta = parseInt(btn.dataset.delta);
        const t     = (App.currentCharacter.training || []).find(x => x.id === id);
        if (!t) return;

        t.progressMonths = Math.max(0, (t.progressMonths || 0) + delta);
        Storage.saveCharacter(App.currentCharacter);

        const total = Math.max(1, t.durationMonths || 1);
        const prog  = t.progressMonths;
        const pct   = Math.min(100, Math.round((prog / total) * 100));
        const ready = prog >= total;

        const counter = document.querySelector(`.training-counter[data-id="${id}"]`);
        if (counter) counter.textContent = `${prog} / ${total} Monate`;

        const fill = document.querySelector(`.training-progress-fill[data-id="${id}"]`);
        if (fill) {
          fill.style.width = `${pct}%`;
          fill.classList.toggle('training-progress-fill--done', ready);
        }

        const card = btn.closest('.training-card');
        if (card) card.classList.toggle('training-card--ready', ready);

        const completeBtn = document.querySelector(`.training-complete-btn[data-id="${id}"]`);
        if (completeBtn) completeBtn.classList.toggle('training-complete-ready', ready);
      });
    });

    document.querySelectorAll('.training-complete-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = (App.currentCharacter.training || []).find(x => x.id === btn.dataset.id);
        if (t) this._showCompleteTrainingModal(t, App.currentCharacter);
      });
    });

    document.querySelectorAll('.training-del-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm('Eintrag löschen?')) return;
        App.currentCharacter.training = (App.currentCharacter.training || []).filter(t => t.id !== btn.dataset.id);
        Storage.saveCharacter(App.currentCharacter);
        App.renderCurrentPage();
      });
    });

    // Restliche Listener nur im Edit-Modus
    if (!App.editMode) return;

    // Aktuell-Wert-Änderungen -> DM automatisch berechnen
    document.querySelectorAll('.attr-current').forEach(input => {
      input.addEventListener('input', (e) => {
        const attr = e.target.getAttribute('data-attr');
        const current = parseInt(e.target.value) || 0;
        const dmInput = document.querySelector(`.attr-dm[data-attr="${attr}"]`);
        if (dmInput) {
          if (attr === 'psi' && current === 0) {
            dmInput.value = '';
          } else {
            dmInput.value = this.calculateDM(current);
          }
        }
      });
    });

    // Add-Skill-Button
    const addBtn = document.getElementById('addSkillBtn');
    if (addBtn) {
      addBtn.addEventListener('click', () => {
        const skillName = prompt('Skill-Name eingeben:');
        if (skillName && skillName.trim()) {
          this.addCustomSkill(skillName.trim());
        }
      });
    }

  },

  /**
   * Fügt einen benutzerdefinierten Skill alphabetisch sortiert hinzu
   */
  addCustomSkill(skillName) {
    // Prüfe, ob Skill bereits existiert
    if (window.currentCharacter.skills.some(s => s.name.toLowerCase() === skillName.toLowerCase())) {
      alert(`Skill "${skillName}" existiert bereits.`);
      return;
    }

    // Füge neuen Skill hinzu
    window.currentCharacter.skills.push({
      name: skillName,
      level: 0
    });

    // Sortiere alphabetisch
    window.currentCharacter.skills.sort((a, b) => a.name.localeCompare(b.name));

    // Neu rendern
    App.renderCurrentPage();
  }
};

