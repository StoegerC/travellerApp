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

    let html = '<h2>Attribute & Skills</h2>';
    
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
      const value = typeof attrData === 'number' ? attrData : (attrData.value || 6);
      const current = typeof attrData === 'number' ? attrData : (attrData.current || 6);
      
      // Bei Psi mit Wert 0 kein DM anzeigen
      const isPsi = key === 'psi';
      const dmValue = (isPsi && value === 0) ? '' : this.calculateDM(value);
      
      html += `
        <tr style="border-bottom: 1px solid #eee;">
          <td style="padding: 12px; vertical-align: middle;">${label}</td>
          <td style="padding: 12px;">
            <input type="number" class="attr-value" data-attr="${key}" value="${value}" min="0" max="15" style="width: 100%; padding: 6px; font-weight: 600;">
          </td>
          <td style="padding: 12px;">
            <input type="number" class="attr-current" data-attr="${key}" value="${current}" min="0" max="15" style="width: 100%; padding: 6px;">
          </td>
          <td style="padding: 12px;">
            <input type="number" class="attr-dm" data-attr="${key}" value="${dmValue}" min="-10" max="10" readonly style="width: 100%; padding: 6px; background: #f5f5f5; color: #666;">
          </td>
        </tr>
      `;
    }
    html += '</tbody></table>';

    // Skills Section
    html += '<h3>Skills</h3>';
    
    // Berechne Max. Skill Levels: 3 x (EDU + INT)
    const eduValue = typeof attrs.education === 'number' ? attrs.education : (attrs.education?.value || 6);
    const intValue = typeof attrs.intelligence === 'number' ? attrs.intelligence : (attrs.intelligence?.value || 6);
    const maxSkillLevels = 3 * (eduValue + intValue);
    
    html += `<p style="color: #666; font-size: 0.9em; margin-bottom: 15px;">Max. Skill Levels = 3 x (EDU + INT) = 3 x (${eduValue} + ${intValue}) = <strong>${maxSkillLevels}</strong></p>`;
    
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
        html += `
          <div class="skill-item">
            <label>${skill.name}</label>
            <input type="number" class="skill-level skill-level-input" data-index="${globalIndex}" value="${skill.level || 0}" min="0" max="9">
          </div>
        `;
      });
      
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';

    return html;
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
        const value = parseInt(input.value) || 6;
        attributes[attr].value = value;
        // Berechne DM automatisch (außer bei Psi mit Wert 0)
        if (attr === 'psi' && value === 0) {
          attributes[attr].dm = 0;
        } else {
          attributes[attr].dm = this.calculateDM(value);
        }
      } else if (input.classList.contains('attr-current')) {
        attributes[attr].current = parseInt(input.value) || 6;
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
          const label = item.querySelector('label');
          const skillName = label ? label.textContent.toLowerCase() : '';
          item.style.display = skillName.includes(searchTerm) ? 'flex' : 'none';
        });
      });
    }

    // Restliche Listener nur im Edit-Modus
    if (!App.editMode) return;

    // Attribut-Wert-Änderungen -> DM automatisch berechnen
    document.querySelectorAll('.attr-value').forEach(input => {
      input.addEventListener('input', (e) => {
        const attr = e.target.getAttribute('data-attr');
        const newValue = parseInt(e.target.value) || 0;
        const dmInput = document.querySelector(`.attr-dm[data-attr="${attr}"]`);
        if (dmInput) {
          // Bei Psi mit Wert 0 kein DM anzeigen
          if (attr === 'psi' && newValue === 0) {
            dmInput.value = '';
          } else {
            dmInput.value = this.calculateDM(newValue);
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

