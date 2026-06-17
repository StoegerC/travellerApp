/**
 * Werdegang Seite - mit Galaxienkarte
 */
const CareerPage = {
  GRID_SIZE: 15,
  CELL_SIZE: 30,  // wird in drawGalaxyMap() dynamisch überschrieben
  _cellSize: 30,

  render(character) {
    const career = character.career || {};
    const history = career.careerHistory || [];
    const rank = career.rank || 0;
    const benefits = career.benefits || [];
    const galaxyMap = career.galaxyMap || { visitedSystems: [] };
    const visitedSystems = galaxyMap.visitedSystems || [];

    let html = '<h2>Werdegang</h2>';

    html += '<h3>Galaxienkarte</h3>';
    html += '<p style="color: #666; font-size: 0.9em; margin-bottom: 10px;">Tippen auf eine Zelle, um ein System zu markieren oder deine Geschichte einzutragen</p>';
    html += '<div id="galaxyMapContainer" style="margin-bottom: 20px; touch-action: none;">';
    html += `<canvas id="galaxyCanvas" style="display: block; width: 100%; border: 1px solid #444; background: #1a1a2e; cursor: crosshair; border-radius: 6px; touch-action: none;"></canvas>`;
    html += '</div>';

    html += '<h3>Besuchte Systeme</h3>';
    html += '<div id="visitedSystemsList" style="margin-bottom: 20px;">';
    if (visitedSystems.length === 0) {
      html += '<p style="color: #999;">Noch keine Systeme besucht. Tippe auf die Karte, um Systeme hinzuzufügen!</p>';
    } else {
      visitedSystems.forEach((system, index) => {
        html += `
          <div class="system-card">
            <div>
              <strong>${system.name || 'Unbenanntes System'}</strong> (${system.x}, ${system.y})
              <p>${system.description || '<em>Keine Beschreibung</em>'}</p>
            </div>
            ${App.editMode ? `<button class="btn-danger btn-remove-system" data-index="${index}">Löschen</button>` : ''}
          </div>
        `;
      });
    }
    html += '</div>';

    if (App.editMode) {
      html += '<h3>Karriere-Historie</h3>';
      html += '<div class="table-container">';
      html += '<table>';
      html += '<thead><tr><th>Karriere</th><th>Jahre</th><th>Aktion</th></tr></thead>';
      html += '<tbody id="careerHistoryTable">';

      history.forEach((entry) => {
        html += `
          <tr>
            <td><input type="text" class="career-name" value="${entry.name || ''}" style="width: 100%;"></td>
            <td><input type="number" class="career-years" value="${entry.years || 0}" min="0" style="width: 80px;"></td>
            <td><button class="btn-remove-career" type="button">Entfernen</button></td>
          </tr>
        `;
      });

      html += '</tbody>';
      html += '</table>';
      html += '</div>';
      html += '<button id="addCareerBtn" class="btn-primary" type="button">Karriere hinzufügen</button>';

      html += `
        <div class="form-group" style="margin-top: 20px;">
          <label for="careerRank">Rang:</label>
          <input type="number" id="careerRank" value="${rank}" min="0" max="6">
        </div>
      `;

      html += '<h3>Vorteile</h3>';
      html += '<div class="form-group form-grid-full">';
      html += '<textarea id="benefitsText" placeholder="Vorteile (kommasepariert oder zeilenweise)" style="min-height: 100px; width: 100%;">';
      html += (Array.isArray(benefits) ? benefits.join(', ') : benefits);
      html += '</textarea>';
      html += '</div>';
    } else {
      html += '<h3>Karriere-Historie</h3>';
      if (history.length === 0) {
        html += '<p style="color: #999;">Noch keine Karriere-Einträge.</p>';
      } else {
        html += '<div class="table-container">';
        html += '<table>';
        html += '<thead><tr><th>Karriere</th><th>Jahre</th></tr></thead>';
        html += '<tbody>';

        history.forEach((entry) => {
          html += `
            <tr>
              <td>${entry.name || '-'}</td>
              <td>${entry.years || 0}</td>
            </tr>
          `;
        });

        html += '</tbody>';
        html += '</table>';
        html += '</div>';
      }

      html += `
        <div style="margin-top: 20px;">
          <strong>Rang:</strong> ${rank}
        </div>
      `;

      html += '<h3>Vorteile</h3>';
      if (!benefits || benefits.length === 0) {
        html += '<p style="color: #999;">Keine Vorteile.</p>';
      } else {
        html += '<ul>';
        benefits.forEach(benefit => {
          html += `<li>${benefit}</li>`;
        });
        html += '</ul>';
      }
    }

    html += `
      <div id="systemModal" style="display: none; position: fixed; top: 0; left: 0; width: 100%; height: 100%; background: rgba(0,0,0,0.7); z-index: 1000; padding-top: 60px;">
        <div style="background: white; width: 90%; max-width: 500px; margin: 0 auto; padding: 20px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.3);">
          <h3>System Details</h3>
          <div class="form-group">
            <label for="systemNameInput">Systemname:</label>
            <input type="text" id="systemNameInput" placeholder="z.B. Sol, Proxima Centauri" style="width: 100%; padding: 8px; border: 1px solid #ddd; border-radius: 4px;">
          </div>
          <div class="form-group">
            <label for="systemDescInput">Deine Geschichte an diesem Ort:</label>
            <textarea id="systemDescInput" placeholder="Was hast du hier erlebt?" style="width: 100%; min-height: 100px; padding: 8px; border: 1px solid #ddd; border-radius: 4px;"></textarea>
          </div>
          <div style="text-align: right; margin-top: 15px;">
            <button id="cancelSystemBtn" type="button" style="padding: 8px 15px; margin-right: 10px; background: #ccc; border: none; border-radius: 4px; cursor: pointer;">Abbrechen</button>
            <button id="saveSystemBtn" type="button" style="padding: 8px 15px; background: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer;">Speichern</button>
          </div>
        </div>
      </div>
    `;

    return html;
  },

  getData() {
    const history = [];
    document.querySelectorAll('#careerHistoryTable tr').forEach(row => {
      const name = row.querySelector('.career-name')?.value || '';
      const years = parseInt(row.querySelector('.career-years')?.value) || 0;
      if (name) {
        history.push({ name, years });
      }
    });

    const benefitsText = document.getElementById('benefitsText')?.value || '';
    const benefits = benefitsText
      .split(',')
      .map(b => b.trim())
      .filter(b => b.length > 0);

    return {
      careerHistory: history,
      rank: parseInt(document.getElementById('careerRank')?.value) || 0,
      benefits,
      galaxyMap: {
        visitedSystems: window.currentVisitedSystems || []
      }
    };
  },

  save(character) {
    // Sichere nur, wenn Eingabefelder existieren (Edit-Modus ist aktiv)
    const careerInputs = document.querySelectorAll('.career-name');
    if (careerInputs.length === 0 && character.career.careerHistory.length > 0) return; // Keine Eingabefelder, aber Karriere existiert
    
    character.career = this.getData();
  },

  reset() {
    document.getElementById('career-page').innerHTML = '';
  },

  attachListeners() {
    this.drawGalaxyMap();

    const canvas = document.getElementById('galaxyCanvas');
    if (canvas) {
      canvas.addEventListener('click', (e) => this.handleCanvasClick(e));
      // Touch-Support für Tablets
      canvas.addEventListener('touchend', (e) => {
        e.preventDefault();
        if (e.changedTouches && e.changedTouches.length > 0) {
          const touch = e.changedTouches[0];
          this.handleCanvasClick({ clientX: touch.clientX, clientY: touch.clientY });
        }
      }, { passive: false });
    }

    document.getElementById('cancelSystemBtn')?.addEventListener('click', () => {
      document.getElementById('systemModal').style.display = 'none';
    });

    document.getElementById('saveSystemBtn')?.addEventListener('click', () => {
      this.saveSystemModal();
    });

    if (!App.editMode) {
      return;
    }

    document.getElementById('addCareerBtn')?.addEventListener('click', () => {
      const table = document.getElementById('careerHistoryTable');
      const newRow = `
        <tr>
          <td><input type="text" class="career-name" placeholder="Karriere-Name" style="width: 100%;"></td>
          <td><input type="number" class="career-years" value="0" min="0" style="width: 80px;"></td>
          <td><button class="btn-remove-career" type="button">Entfernen</button></td>
        </tr>
      `;
      table.insertAdjacentHTML('beforeend', newRow);
      this.attachRemoveListeners();
    });

    this.attachRemoveListeners();

    document.querySelectorAll('.btn-remove-system').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const index = parseInt(e.target.getAttribute('data-index'));
        if (window.currentVisitedSystems) {
          window.currentVisitedSystems.splice(index, 1);
          this.redraw();
        }
      });
    });
  },

  attachRemoveListeners() {
    document.querySelectorAll('.btn-remove-career').forEach(btn => {
      btn.onclick = (e) => {
        e.target.closest('tr').remove();
      };
    });
  },

  drawGalaxyMap() {
    const canvas = document.getElementById('galaxyCanvas');
    if (!canvas) return;

    const container = document.getElementById('galaxyMapContainer');
    const containerWidth = container ? container.clientWidth : 450;
    const dpr = window.devicePixelRatio || 1;
    const cssSize = Math.min(containerWidth, 600);
    const cellSize = Math.floor(cssSize / this.GRID_SIZE);
    const canvasSize = cellSize * this.GRID_SIZE;

    // Setze Canvas-Pixelgröße (HiDPI-Unterstützung)
    canvas.width = canvasSize * dpr;
    canvas.height = canvasSize * dpr;
    canvas.style.width = canvasSize + 'px';
    canvas.style.height = canvasSize + 'px';
    this._cellSize = cellSize;

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(0, 0, canvasSize, canvasSize);

    // Gitterlinien
    ctx.strokeStyle = '#2a2a4e';
    ctx.lineWidth = 0.5;
    for (let i = 0; i <= this.GRID_SIZE; i++) {
      const pos = i * cellSize;
      ctx.beginPath();
      ctx.moveTo(pos, 0);
      ctx.lineTo(pos, canvasSize);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, pos);
      ctx.lineTo(canvasSize, pos);
      ctx.stroke();
    }

    if (window.currentVisitedSystems) {
      const radius = Math.max(8, Math.floor(cellSize * 0.32));
      window.currentVisitedSystems.forEach((system, index) => {
        const x = system.x * cellSize + cellSize / 2;
        const y = system.y * cellSize + cellSize / 2;

        ctx.fillStyle = '#00d4ff';
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();

        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#1a1a2e';
        ctx.font = `bold ${Math.max(9, radius - 2)}px Arial`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(index + 1, x, y);
      });
    }
  },

  _getGridCoords(e) {
    const canvas = document.getElementById('galaxyCanvas');
    if (!canvas) return null;

    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;

    if (e.touches && e.touches.length > 0) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    // CSS-Pixel relativ zum Canvas
    const scaleX = canvas.offsetWidth / (this._cellSize * this.GRID_SIZE);
    const x = (clientX - rect.left) / scaleX;
    const y = (clientY - rect.top) / scaleX;

    const gridX = Math.floor(x / this._cellSize);
    const gridY = Math.floor(y / this._cellSize);

    if (gridX < 0 || gridX >= this.GRID_SIZE || gridY < 0 || gridY >= this.GRID_SIZE) {
      return null;
    }
    return { x: gridX, y: gridY };
  },

  handleCanvasClick(e) {
    const coords = this._getGridCoords(e);
    if (!coords) return;

    if (!window.currentVisitedSystems) {
      window.currentVisitedSystems = [];
    }

    const existingSystem = window.currentVisitedSystems.find(s => s.x === coords.x && s.y === coords.y);
    if (existingSystem) {
      this.showSystemModal(existingSystem);
    } else {
      this.showSystemModal({ x: coords.x, y: coords.y, name: '', description: '' }, true);
    }
  },

  showSystemModal(system, isNew = false) {
    window.currentEditingSystem = system;
    window.isNewSystem = isNew;

    document.getElementById('systemNameInput').value = system.name || '';
    document.getElementById('systemDescInput').value = system.description || '';
    document.getElementById('systemModal').style.display = 'block';
  },

  saveSystemModal() {
    const name = document.getElementById('systemNameInput').value.trim();
    const description = document.getElementById('systemDescInput').value.trim();
    const system = window.currentEditingSystem;

    if (!name) {
      alert('Bitte gib einen Systemnamen ein!');
      return;
    }

    if (window.isNewSystem) {
      system.name = name;
      system.description = description;
      if (!window.currentVisitedSystems) {
        window.currentVisitedSystems = [];
      }
      window.currentVisitedSystems.push(system);
    } else {
      system.name = name;
      system.description = description;
    }

    document.getElementById('systemModal').style.display = 'none';
    this.redraw();
  },

  redraw() {
    const careerPageContent = document.getElementById('career-page');
    if (!careerPageContent) {
      return;
    }
    const backup = window.currentVisitedSystems;
    careerPageContent.innerHTML = this.render(window.currentCharacter);
    window.currentVisitedSystems = backup;
    this.attachListeners();
  }
};
