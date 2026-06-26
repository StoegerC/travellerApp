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
    const meta       = character.metadata;
    const portraits  = meta.portraits || [];
    const idx        = Math.min(meta.portraitIndex || 0, Math.max(0, portraits.length - 1));
    const current    = portraits[idx] || null;
    const total      = portraits.length;

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
          <button id="loadCharBtn"   class="btn-secondary char-btn">⬇ Laden</button>
          <button id="deleteCharBtn" class="btn-danger  char-btn">Löschen</button>
        </div>
      </div>
    `;

    html += '<h2>Charakterinformationen</h2>';

    // ── Portrait-Widget (gemeinsam für Lese- und Bearbeitungsmodus) ─────
    const portraitDisplay = current
      ? `<img class="portrait-img" src="${current}" alt="Portrait">`
      : `<div class="portrait-placeholder">Kein Portrait</div>`;

    const navButtons = total > 1 ? `
      <button class="portrait-nav portrait-prev" id="portraitPrev" ${idx === 0 ? 'disabled' : ''}>‹</button>
      <button class="portrait-nav portrait-next" id="portraitNext" ${idx === total - 1 ? 'disabled' : ''}>›</button>` : '';

    const counter = total > 1 ? `<span class="portrait-counter">${idx + 1} / ${total}</span>` : '';

    const editControls = App.editMode ? `
      <div class="portrait-edit-row">
        <label for="portraitUpload" class="btn-secondary portrait-add-btn">+ Hinzufügen</label>
        <input type="file" id="portraitUpload" accept="image/*" style="display:none;">
        ${total > 0 ? `<button id="portraitDelete" class="btn-danger portrait-del-btn">🗑 Entfernen</button>` : ''}
        <span class="portrait-hint">JPG, PNG oder WebP</span>
      </div>` : '';

    const portraitWidget = `
      <div class="portrait-widget">
        <div class="portrait-frame" id="portraitFrame">
          ${portraitDisplay}
          ${navButtons}
          ${counter}
        </div>
        ${editControls}
      </div>`;

    if (App.editMode) {
      html += `
        <div class="meta-grid">
          <div>
            <h3>Portrait</h3>
            ${portraitWidget}
          </div>
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
      html += `
        <div class="meta-grid">
          <div>
            <h3>Portrait</h3>
            ${portraitWidget}
          </div>
          <div>
            <h3>Charakterdaten</h3>
            <div style="display:grid;gap:12px;">
              <div><strong>Name:</strong> ${this._esc(meta.name) || '–'}</div>
              <div><strong>Titel / Rang:</strong> ${this._esc(meta.title) || '–'}</div>
              <div><strong>Alter:</strong> ${meta.age || 18} Jahre</div>
              <div><strong>Heimatplanet:</strong> ${this._esc(meta.homeworld) || '–'}</div>
            </div>
          </div>
        </div>
      `;
    }

    // ── Sync-Zeile ───────────────────────────────────────────────────────
    if (character.syncMode === 'cloud') {
      const { status, lastSync } = App._syncState || {};
      const t = lastSync
        ? lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
        : '–';
      const text = status === 'syncing' ? '☁ Synchronisiere …'
                 : status === 'error'   ? '☁ Sync-Fehler'
                 : status === 'ok'      ? `☁ Zuletzt: ${t}`
                 : '☁ Cloud';
      html += `<div class="sync-badge-row">
        <div id="syncBadge" class="sync-badge sync-badge--${status || 'idle'}">${text}</div>
        <button id="cloudConfigBtn"    class="sync-config-btn" title="Cloud-Einstellungen">⚙</button>
        <button id="syncDeactivateBtn" class="sync-config-btn sync-deactivate-btn" title="Cloud-Sync deaktivieren">✕</button>
      </div>`;
    } else {
      html += `<div class="sync-badge-row">
        <button id="syncActivateBtn" class="btn-secondary sync-activate-btn">☁ Cloud-Sync aktivieren</button>
      </div>`;
    }

    // ── Export / Import ─────────────────────────────────────────────────
    html += `
      <div class="export-section">
        <div class="export-btn-row">
          <button id="exportCharBtn" class="btn-secondary export-btn">⬇ Export (JSON)</button>
        </div>
        <p class="export-hint">Sichert alle Charakterdaten inkl. Log, Journal und Quests.</p>
      </div>
    `;

    return html;
  },

  save(character) {
    if (!document.getElementById('charName')) return;
    character.metadata = {
      ...character.metadata,
      name:      document.getElementById('charName')?.value      || '',
      title:     document.getElementById('charTitle')?.value     || '',
      age:       parseInt(document.getElementById('charAge')?.value) || 18,
      homeworld: document.getElementById('charHomeworld')?.value || '',
    };
  },

  attachListeners() {
    // Charakter-Selektor
    document.getElementById('characterSelect')?.addEventListener('change', (e) => {
      if (e.target.value) App.loadCharacter(e.target.value);
    });
    document.getElementById('newCharBtn')?.addEventListener('click', () => App.createNewCharacter());
    document.getElementById('loadCharBtn')?.addEventListener('click', () => App.showLoadCharDialog());
    document.getElementById('cloudConfigBtn')?.addEventListener('click', () => App.showCloudConfig());
    document.getElementById('deleteCharBtn')?.addEventListener('click', () => App.deleteCharacter());

    // Portrait-Navigation
    document.getElementById('portraitPrev')?.addEventListener('click', () => {
      const meta = App.currentCharacter.metadata;
      if (meta.portraitIndex > 0) {
        meta.portraitIndex--;
        App._doSave();
        App.renderCurrentPage();
      }
    });
    document.getElementById('portraitNext')?.addEventListener('click', () => {
      const meta = App.currentCharacter.metadata;
      if (meta.portraitIndex < meta.portraits.length - 1) {
        meta.portraitIndex++;
        App._doSave();
        App.renderCurrentPage();
      }
    });

    // Portrait löschen
    document.getElementById('portraitDelete')?.addEventListener('click', () => {
      const meta = App.currentCharacter.metadata;
      if (!meta.portraits.length) return;
      if (!confirm('Dieses Portrait entfernen?')) return;
      meta.portraits.splice(meta.portraitIndex, 1);
      meta.portraitIndex = Math.min(meta.portraitIndex, Math.max(0, meta.portraits.length - 1));
      App._doSave();
      App.renderCurrentPage();
    });

    // Portrait-Upload
    if (App.editMode) {
      document.getElementById('portraitUpload')?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (!file) return;
        if (file.size > 8 * 1024 * 1024) { alert('Bild zu groß! Maximum 8 MB'); return; }

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

            const meta = App.currentCharacter.metadata;
            meta.portraits.push(compressed);
            meta.portraitIndex = meta.portraits.length - 1;
            App._doSave();
            App.renderCurrentPage();
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // Cloud-Sync aktivieren / deaktivieren
    document.getElementById('syncActivateBtn')?.addEventListener('click',   () => App.activateCloudSync());
    document.getElementById('syncDeactivateBtn')?.addEventListener('click', () => App.deactivateCloudSync());

    // Export
    document.getElementById('exportCharBtn')?.addEventListener('click', () => this._exportJSON());
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
    a.href     = url;
    a.download = `traveller_${slug}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    App.showStatus('Export heruntergeladen ✓', 'success');
  },

};
