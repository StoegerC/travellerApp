/**
 * Charakter-Seite: Selektor, Portrait, Metadaten, Export
 */
const MetadataPage = {

  _esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  },

  render(character) {
    const meta = character.metadata;
    window.currentPortraitImage = meta.portraitImage || null;

    const characters = Storage.listCharacters();

    // ── Charakter-Selektor ──────────────────────────────────────────────
    let html = `
      <div class="char-selector-panel">
        <div class="char-selector-row">
          <select id="characterSelect" class="char-selector-select">
            ${characters.map(c =>
              `<option value="${this._esc(c.id)}"${c.id === character.id ? ' selected' : ''}>${this._esc(c.name || 'Namenlos')}</option>`
            ).join('')}
          </select>
          <button id="newCharBtn"    class="btn-success char-btn">+ Neu</button>
          <button id="deleteCharBtn" class="btn-danger  char-btn">Löschen</button>
        </div>
      </div>
    `;

    html += '<h2>Charakterinformationen</h2>';

    if (App.editMode) {
      // ── Bearbeitungsmodus ─────────────────────────────────────────────
      html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 10px 0 20px;">

          <!-- Portrait -->
          <div>
            <h3>Portrait</h3>
            <div id="portraitContainer" style="margin-bottom: 16px;">
              ${meta.portraitImage
                ? `<img id="portraitImg" src="${meta.portraitImage}" style="width:100%;max-width:400px;aspect-ratio:3/4;object-fit:cover;border:2px solid #ddd;border-radius:8px;">`
                : `<div style="width:100%;max-width:400px;aspect-ratio:3/4;background:#f0f0f0;border:2px dashed #ccc;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;">Kein Portrait</div>`}
            </div>
            <label for="portraitUpload" style="display:inline-block;padding:10px 15px;background:#007bff;color:white;border-radius:6px;cursor:pointer;font-weight:500;">Bild wählen</label>
            <input type="file" id="portraitUpload" accept="image/*" style="display:none;">
            <p style="font-size:0.85em;color:#666;margin-top:8px;">JPG, PNG oder WebP (wird automatisch komprimiert)</p>
          </div>

          <!-- Charakterdaten -->
          <div>
            <h3>Charakterdaten</h3>
            <div class="form-group">
              <label for="charName">Name:</label>
              <input type="text" id="charName" value="${this._esc(meta.name)}" placeholder="Charaktername">
            </div>
            <div class="form-group">
              <label for="charTitle">Titel / Rang:</label>
              <input type="text" id="charTitle" value="${this._esc(meta.title)}" placeholder="z.B. Captain, Dr.">
            </div>
            <div class="form-group">
              <label for="charAge">Alter:</label>
              <input type="number" id="charAge" value="${meta.age || 18}" min="18" max="120">
            </div>
            <div class="form-group">
              <label for="charHomeworld">Heimatplanet:</label>
              <input type="text" id="charHomeworld" value="${this._esc(meta.homeworld)}" placeholder="Planet oder Station">
            </div>
          </div>
        </div>
      `;
    } else {
      // ── Lesemodus ────────────────────────────────────────────────────
      html += `
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 30px; padding: 10px 0 20px;">

          <!-- Portrait -->
          <div>
            <h3>Portrait</h3>
            <div style="margin-bottom: 16px;">
              ${meta.portraitImage
                ? `<img src="${meta.portraitImage}" style="width:100%;max-width:400px;aspect-ratio:3/4;object-fit:cover;border:2px solid #ddd;border-radius:8px;">`
                : `<div style="width:100%;max-width:400px;aspect-ratio:3/4;background:#f0f0f0;border:2px dashed #ccc;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#999;">Kein Portrait</div>`}
            </div>
          </div>

          <!-- Charakterdaten -->
          <div>
            <h3>Charakterdaten</h3>
            <div style="display: grid; gap: 12px;">
              <div><strong>Name:</strong> ${this._esc(meta.name) || '–'}</div>
              <div><strong>Titel / Rang:</strong> ${this._esc(meta.title) || '–'}</div>
              <div><strong>Alter:</strong> ${meta.age || 18} Jahre</div>
              <div><strong>Heimatplanet:</strong> ${this._esc(meta.homeworld) || '–'}</div>
            </div>
          </div>
        </div>
      `;
    }

    // ── Export / Import ───────────────────────────────────────────────────
    html += `
      <div class="export-section">
        <div class="export-btn-row">
          <button id="exportCharBtn" class="btn-secondary export-btn">⬇ Export (JSON)</button>
          <label class="btn-secondary export-btn export-label">⬆ Import (JSON)
            <input type="file" id="importCharFile" accept=".json,application/json" style="display:none;">
          </label>
        </div>
        <p class="export-hint">Sichert alle Charakterdaten inkl. Notizen, Journal und Quests.</p>
      </div>
    `;

    return html;
  },

  getData() {
    return {
      name:          document.getElementById('charName')?.value || '',
      title:         document.getElementById('charTitle')?.value || '',
      age:           parseInt(document.getElementById('charAge')?.value) || 18,
      homeworld:     document.getElementById('charHomeworld')?.value || '',
      portraitImage: window.currentPortraitImage || window.currentCharacter?.metadata?.portraitImage || null
    };
  },

  save(character) {
    if (!document.getElementById('charName')) return; // nicht im Edit-Modus
    character.metadata = { ...character.metadata, ...this.getData() };
  },

  reset() {
    document.getElementById('metadata-page').innerHTML = '';
  },

  attachListeners() {
    // Charakter-Selektor
    document.getElementById('characterSelect')?.addEventListener('change', (e) => {
      if (e.target.value) App.loadCharacter(e.target.value);
    });
    document.getElementById('newCharBtn')?.addEventListener('click', () => App.createNewCharacter());
    document.getElementById('deleteCharBtn')?.addEventListener('click', () => App.deleteCharacter());

    // Portrait-Upload – komprimiert auf max 400×533 (3:4), JPEG 0.8
    if (App.editMode) {
      document.getElementById('portraitUpload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 4 * 1024 * 1024) { alert('Bild zu groß! Maximum 4 MB'); return; }

        const reader = new FileReader();
        reader.onload = (event) => {
          const img = new Image();
          img.onload = () => {
            const MAX_W = 400, MAX_H = 533;
            const scale = Math.min(1, MAX_W / img.width, MAX_H / img.height);
            const canvas = document.createElement('canvas');
            canvas.width  = Math.round(img.width  * scale);
            canvas.height = Math.round(img.height * scale);
            canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
            const compressed = canvas.toDataURL('image/jpeg', 0.8);
            window.currentPortraitImage = compressed;
            const container = document.getElementById('portraitContainer');
            if (container) {
              container.innerHTML = `<img id="portraitImg" src="${compressed}" style="width:100%;max-width:400px;aspect-ratio:3/4;object-fit:cover;border:2px solid #ddd;border-radius:8px;">`;
            }
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // Export
    document.getElementById('exportCharBtn')?.addEventListener('click', () => this._exportJSON());

    // Import
    document.getElementById('importCharFile')?.addEventListener('change', (e) => this._importJSON(e));
  },

  _exportJSON() {
    const char = window.currentCharacter;
    if (!char) return;

    const json = JSON.stringify(char.toJSON(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    const slug = (char.metadata.name || 'charakter')
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const date = new Date().toISOString().split('T')[0];

    a.href     = url;
    a.download = `traveller_${slug}_${date}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);

    App.showStatus('Export heruntergeladen ✓', 'success');
  },

  _importJSON(e) {
    const file = e.target.files[0];
    e.target.value = ''; // Reset so dieselbe Datei erneut gewählt werden kann
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      let data;
      try {
        data = JSON.parse(event.target.result);
      } catch {
        App.showStatus('Ungültige JSON-Datei', 'error');
        return;
      }

      if (!data.id || !data.metadata) {
        App.showStatus('Kein gültiger Traveller-Charakter', 'error');
        return;
      }

      const existing = Storage.listCharacters();
      const conflict = existing.find(c => c.id === data.id);

      if (conflict) {
        const overwrite = confirm(
          `Ein Charakter namens „${conflict.name}" mit dieser ID existiert bereits.\n\nÜberschreiben? (Abbrechen = als Kopie importieren)`
        );
        if (!overwrite) {
          data.id = 'char-' + Date.now();
          data.metadata.name = (data.metadata.name || 'Charakter') + ' (Kopie)';
        }
      }

      const character = Character.fromJSON(data);
      Storage.saveCharacter(character);
      App.loadCharacter(character.id);
      App.showStatus(`„${character.metadata.name || 'Charakter'}" importiert ✓`, 'success');
    };

    reader.onerror = () => App.showStatus('Datei konnte nicht gelesen werden', 'error');
    reader.readAsText(file);
  }
};
