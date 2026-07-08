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

  // Eintraege sind entweder ein voller data:image/...-String (Altbestand) oder
  // eine kurze hochgeladene Datei-ID (Phase 2, siehe frontend/js/filesync.js).
  _portraitSrc(entry) {
    if (!entry) return null;
    return entry.startsWith('data:') ? entry : FileSync.getUrl(entry);
  },

  render(character) {
    const meta       = character.metadata;
    const portraits  = meta.portraits || [];
    const idx        = Math.min(meta.portraitIndex || 0, Math.max(0, portraits.length - 1));
    const current    = this._portraitSrc(portraits[idx]);
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
      ? `<img class="portrait-img" src="${this._esc(current)}" alt="Portrait">`
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
            <div class="form-group meta-age-row">
              <div class="meta-age-field">
                <label for="charAge">Alter:</label>
                <input type="number" id="charAge" value="${meta.age || 18}" min="18" max="120">
              </div>
              <div class="meta-age-field">
                <label for="charBirthdate">Geburtsdatum:</label>
                <input type="text" id="charBirthdate" value="${this._esc(meta.birthdate)}" placeholder="z.B. 1100-001">
              </div>
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
              <div><strong>Alter:</strong> ${meta.age || 18} Jahre${meta.birthdate ? ` <span class="meta-birthdate">(geb. ${this._esc(meta.birthdate)})</span>` : ''}</div>
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

    // ── Kampagne ─────────────────────────────────────────────────────────
    html += this._renderCampaignSection(character);

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
      birthdate: document.getElementById('charBirthdate')?.value   || '',
      homeworld: document.getElementById('charHomeworld')?.value   || '',
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
      // Kein FileSync.remove() mehr hier - die Datei bleibt liegen (siehe
      // Plan "Server-Daten-Backup": still ersetzen statt sofort loeschen,
      // damit eine aeltere Charakter-Version aus dem Verlauf noch darauf
      // verweisen kann). Aufraeumen laeuft nur noch ueber die Admin-Seite.
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
            canvas.toBlob(async blob => {
              const char   = App.currentCharacter;
              const result = await FileSync.upload(blob, { ownerType: 'character', ownerId: char.id, field: 'portrait' });
              if (!result.ok) { App.showStatus('Bild-Upload fehlgeschlagen', 'error'); return; }
              const meta = char.metadata;
              meta.portraits.push(result.data.id);
              meta.portraitIndex = meta.portraits.length - 1;
              App._doSave();
              App.renderCurrentPage();
            }, 'image/jpeg', 0.8);
          };
          img.src = event.target.result;
        };
        reader.readAsDataURL(file);
      });
    }

    // Cloud-Sync aktivieren / deaktivieren
    document.getElementById('syncActivateBtn')?.addEventListener('click',   () => App.activateCloudSync());
    document.getElementById('syncDeactivateBtn')?.addEventListener('click', () => App.deactivateCloudSync());

    // Kampagne
    document.getElementById('campaignOpenBtn')?.addEventListener('click',   () => App.showCampaignModal());
    document.getElementById('campaignLeaveBtn')?.addEventListener('click',  () => App.leaveCampaign());
    document.getElementById('campaignDeleteBtn')?.addEventListener('click', () => App.deleteCampaign());
    document.querySelectorAll('.campaign-kick-btn').forEach(btn => {
      btn.addEventListener('click', () => App.kickCampaignMember(btn.dataset.charId));
    });

    // Export
    document.getElementById('exportCharBtn')?.addEventListener('click', () => this._exportJSON());
  },

  _renderCampaignSection(character) {
    const camp = App._campaignData;
    const isCloud = character.syncMode === 'cloud';
    let html = '<div class="campaign-section"><h3>Kampagne</h3>';

    if (!character.campaignId) {
      html += `<div class="campaign-none">
        <p class="campaign-hint">Kein Kampagnen-Mitglied.</p>
        <button id="campaignOpenBtn" class="btn-secondary campaign-btn"${!isCloud ? ' disabled title="Nur für Cloud-Charaktere"' : ''}>
          Kampagne erstellen / beitreten
        </button>
      </div>`;
    } else if (!camp) {
      html += `<p class="campaign-hint">Kampagne <strong>${this._esc(character.campaignId)}</strong> wird geladen …</p>
        <button id="campaignLeaveBtn" class="btn-secondary campaign-btn">Verlassen</button>`;
    } else {
      const isOwner = camp.ownerId === character.id;
      html += `<div class="campaign-info">
        <div class="campaign-name-row">
          <strong class="campaign-name">${this._esc(camp.name)}</strong>
          <span class="campaign-id-badge">${this._esc(camp.id)}</span>
          ${isOwner ? '<span class="campaign-owner-badge">Owner</span>' : ''}
        </div>
        ${isOwner && camp.joinCode
          ? `<p class="campaign-joincode">Beitritts-Code: <code>${this._esc(camp.joinCode)}</code> <span class="campaign-id-hint">(an Mitspieler weitergeben)</span></p>`
          : ''}
        <div class="campaign-members">
          <p class="campaign-members-title">Mitglieder (${camp.members.length}):</p>
          <ul class="campaign-member-list">
            ${camp.members.map(m => `
              <li class="campaign-member-item">
                <span class="campaign-member-id">${this._esc(m.charId)}</span>
                ${isOwner && m.charId !== character.id
                  ? `<button class="campaign-kick-btn btn-danger-sm" data-char-id="${this._esc(m.charId)}">✕</button>`
                  : ''}
              </li>`).join('')}
          </ul>
        </div>
        <div class="campaign-actions">
          <button id="campaignLeaveBtn" class="btn-secondary campaign-btn">Verlassen</button>
          ${isOwner ? `<button id="campaignDeleteBtn" class="btn-danger campaign-btn">Löschen</button>` : ''}
        </div>
      </div>`;
    }
    html += '</div>';
    return html;
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
