/**
 * Waffen & Ausrüstung Seite
 */
const EquipmentPage = {
  attributeLabels: {
    strength: 'Stärke',
    dexterity: 'Geschick',
    endurance: 'Ausdauer',
    intelligence: 'Intelligenz',
    education: 'Bildung',
    socialStatus: 'Soziale Stellung',
    psi: 'Psi'
  },

  skillNames: typeof TravellerSkills !== 'undefined' ? TravellerSkills.getSkills() : [],

  render(character) {
    const weapons = character.equipment.filter(e => e.type === 'weapon') || [];

    let html = '<h2>Waffen & Ausrüstung</h2>';
    
    // Waffentabelle
    html += '<h3>Waffen</h3>';
    html += `
      <div style="overflow-x: auto; margin-bottom: 20px;">
        <table style="width: 100%; border-collapse: collapse; font-size: 0.9em;">
          <thead>
            <tr style="background: #f5f5f5;">
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Name</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">TL</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Reichweite</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Schaden-Mod</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Schaden</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Gewicht</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: left;">Magazin</th>
              <th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Merkmale</th>
              ${App.editMode ? '<th style="padding: 10px; border: 1px solid #ddd; text-align: center;">Aktion</th>' : ''}
            </tr>
          </thead>
          <tbody id="weaponTable">
    `;

    weapons.forEach((weapon, index) => {
      const dmText = this.getWeaponDMText(weapon, character);
      
      if (App.editMode) {
        // Edit-Modus: Mit Input-Feldern
        html += `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-name" value="${weapon.name || ''}" style="width: 100%; padding: 4px;"></td>
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="number" class="weapon-tl" value="${weapon.tl || ''}" min="0" max="20" style="width: 100%; padding: 4px; text-align: center;"></td>
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-range" value="${weapon.range || ''}" placeholder="z.B. 50" style="width: 100%; padding: 4px;"><span style="font-size: 0.85em; color: #666;"> m</span></td>
            <td style="padding: 10px; border: 1px solid #ddd;">
              <div style="display: flex; gap: 4px;">
                <select class="weapon-dm-attr" style="flex: 1; padding: 4px; font-size: 0.85em;">
                  <option value="">-</option>
                  ${Object.entries(this.attributeLabels).map(([key, label]) => `<option value="${key}" ${weapon.dmAttribute === key ? 'selected' : ''}>${label}</option>`).join('')}
                </select>
                <select class="weapon-dm-skill" style="flex: 1; padding: 4px; font-size: 0.85em;">
                  <option value="">-</option>
                  ${this.skillNames.map(skill => `<option value="${skill}" ${weapon.dmSkill === skill ? 'selected' : ''}>${skill}</option>`).join('')}
                </select>
              </div>
            </td>
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-damage" value="${weapon.damage || ''}" style="width: 100%; padding: 4px;"></td>
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="number" class="weapon-weight" value="${weapon.weight || ''}" step="0.1" style="width: 100%; padding: 4px; text-align: center;"><span style="font-size: 0.85em; color: #666;"> kg</span></td>
            <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-magazine" value="${weapon.magazine || ''}" style="width: 100%; padding: 4px;"></td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><button class="btn-info btn-weapon-traits" data-index="${index}">Details</button></td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><button class="btn-danger btn-remove-weapon" data-index="${index}">Löschen</button></td>
          </tr>
        `;
      } else {
        // View-Modus: Nur Text
        html += `
          <tr style="border-bottom: 1px solid #ddd;">
            <td style="padding: 10px; border: 1px solid #ddd; font-weight: 600;">${weapon.name || '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${weapon.tl || '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${weapon.range ? weapon.range + ' m' : '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${dmText || '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${weapon.damage || '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;">${weapon.weight ? weapon.weight + ' kg' : '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd;">${weapon.magazine || '-'}</td>
            <td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><button class="btn-info btn-weapon-traits" data-index="${index}">Details</button></td>
          </tr>
        `;
      }
    });

    html += '</tbody></table></div>';
    
    if (App.editMode) {
      html += '<button id="addWeaponBtn" class="btn-success" style="margin-top: 12px; margin-bottom: 20px;">+ Waffe hinzufügen</button>';
    }

    return html;
  },

  getData() {
    const weapons = [];
    document.querySelectorAll('#weaponTable tr').forEach((row, index) => {
      const name = row.querySelector('.weapon-name')?.value || '';
      if (name) {
        weapons.push({
          type: 'weapon',
          name,
          tl: row.querySelector('.weapon-tl')?.value || '',
          range: row.querySelector('.weapon-range')?.value || '',
          dmAttribute: row.querySelector('.weapon-dm-attr')?.value || '',
          dmSkill: row.querySelector('.weapon-dm-skill')?.value || '',
          damage: row.querySelector('.weapon-damage')?.value || '',
          weight: row.querySelector('.weapon-weight')?.value || '',
          magazine: row.querySelector('.weapon-magazine')?.value || '',
          traits: window.currentCharacter?.equipment?.[index]?.traits || { image: '', description: '' }
        });
      }
    });
    return weapons;
  },

  save(character) {
    // Sichere nur, wenn Eingabefelder existieren (Edit-Modus ist aktiv)
    const weaponInputs = document.querySelectorAll('.weapon-name');
    if (weaponInputs.length === 0 && character.equipment.length > 0) return; // Keine Eingabefelder, aber Waffen existieren
    
    character.equipment = this.getData();
  },

  reset() {
    document.getElementById('equipment-page').innerHTML = '';
  },

  attachListeners() {
    document.getElementById('addWeaponBtn')?.addEventListener('click', () => {
      const table = document.getElementById('weaponTable');
      const newRow = `
        <tr style="border-bottom: 1px solid #ddd;">
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-name" placeholder="Name" style="width: 100%; padding: 4px;"></td>
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="number" class="weapon-tl" min="0" max="20" style="width: 100%; padding: 4px; text-align: center;"></td>
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-range" placeholder="z.B. 50" style="width: 100%; padding: 4px;"><span style="font-size: 0.85em; color: #666;"> m</span></td>
          <td style="padding: 10px; border: 1px solid #ddd;">
            <div style="display: flex; gap: 4px;">
              <select class="weapon-dm-attr" style="flex: 1; padding: 4px; font-size: 0.85em;">
                <option value="">-</option>
                ${Object.entries(this.attributeLabels).map(([key, label]) => `<option value="${key}">${label}</option>`).join('')}
              </select>
              <select class="weapon-dm-skill" style="flex: 1; padding: 4px; font-size: 0.85em;">
                <option value="">-</option>
                ${this.skillNames.map(skill => `<option value="${skill}">${skill}</option>`).join('')}
              </select>
            </div>
          </td>
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-damage" placeholder="z.B. 2D6" style="width: 100%; padding: 4px;"></td>
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="number" class="weapon-weight" step="0.1" placeholder="z.B. 1.5" style="width: 100%; padding: 4px; text-align: center;"><span style="font-size: 0.85em; color: #666;"> kg</span></td>
          <td style="padding: 10px; border: 1px solid #ddd;"><input type="text" class="weapon-magazine" style="width: 100%; padding: 4px;"></td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><button class="btn-info btn-weapon-traits">Details</button></td>
          <td style="padding: 10px; border: 1px solid #ddd; text-align: center;"><button class="btn-danger btn-remove-weapon">Löschen</button></td>
        </tr>
      `;
      table.insertAdjacentHTML('beforeend', newRow);
      this.attachRowListeners();
    });

    this.attachRowListeners();
  },

  attachRowListeners() {
    // Entfernen-Buttons
    document.querySelectorAll('.btn-remove-weapon').forEach(btn => {
      btn.onclick = (e) => {
        e.target.closest('tr').remove();
      };
    });

    // Traits-Buttons
    document.querySelectorAll('.btn-weapon-traits').forEach((btn, index) => {
      btn.onclick = () => {
        this.showTraitsPopup(index);
      };
    });
  },

  getWeaponDMText(weapon, character) {
    let total = 0;
    let hasValue = false;

    if (weapon.dmAttribute && character.attributes?.[weapon.dmAttribute]) {
      const attrDM = parseInt(character.attributes[weapon.dmAttribute].dm);
      if (!Number.isNaN(attrDM)) {
        total += attrDM;
        hasValue = true;
      }
    }

    if (weapon.dmSkill) {
      const skill = (character.skills || []).find(s => s.name === weapon.dmSkill);
      const skillLevel = skill ? parseInt(skill.level) || 0 : 0;
      if (!Number.isNaN(skillLevel)) {
        total += skillLevel;
        hasValue = true;
      }
    }

    if (!hasValue) {
      return weapon.dmText || '-';
    }

    return this.formatDM(total);
  },

  formatDM(value) {
    return value >= 0 ? `+${value}` : `${value}`;
  },

  showTraitsPopup(weaponIndex) {
    const weapon = window.currentCharacter?.equipment?.[weaponIndex];
    const traits = weapon?.traits || { image: '', description: '' };

    const modalHtml = `
      <div id="traitsModal" style="display: block; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 3000; padding-top: 50px;">
        <div style="background: white; width: 90%; max-width: 500px; margin: 0 auto; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
          <h3 style="margin-top: 0;">Waffen-Merkmale (Details)</h3>
          
          <div style="margin: 20px 0;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px;">Bild:</label>
            <input type="file" id="traitsImageInput" accept="image/*" style="display: block; margin-bottom: 10px;">
            <div id="traitsImagePreview" style="width: 100%; max-width: 300px; margin: 10px 0; border: 1px solid #ddd; border-radius: 4px; overflow: hidden;">
              ${traits.image ? `<img src="${traits.image}" style="width: 100%; height: auto;">` : '<div style="padding: 20px; text-align: center; color: #999;">Kein Bild</div>'}
            </div>
          </div>
          
          <div style="margin: 20px 0;">
            <label style="display: block; font-weight: 600; margin-bottom: 8px;">Beschreibung:</label>
            <textarea id="traitsDescription" style="width: 100%; padding: 10px; border: 1px solid #ddd; border-radius: 4px; font-family: sans-serif; min-height: 120px;">${traits.description || ''}</textarea>
          </div>
          
          <div style="text-align: right; margin-top: 25px;">
            <button id="cancelTraitsBtn" style="padding: 10px 20px; margin-right: 10px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Abbrechen</button>
            <button id="saveTraitsBtn" style="padding: 10px 20px; background: #007bff; color: white; border: none; border-radius: 4px; cursor: pointer;">Speichern</button>
          </div>
        </div>
      </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);

    // Bild-Upload
    document.getElementById('traitsImageInput').addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = (event) => {
          const preview = document.getElementById('traitsImagePreview');
          preview.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: auto;">`;
          traits.image = event.target.result;
        };
        reader.readAsDataURL(file);
      }
    });

    // Speichern
    document.getElementById('saveTraitsBtn').addEventListener('click', () => {
      traits.description = document.getElementById('traitsDescription').value;
      if (window.currentCharacter?.equipment?.[weaponIndex]) {
        window.currentCharacter.equipment[weaponIndex].traits = traits;
      }
      document.getElementById('traitsModal').remove();
    });

    // Abbrechen
    document.getElementById('cancelTraitsBtn').addEventListener('click', () => {
      document.getElementById('traitsModal').remove();
    });
  }
};
