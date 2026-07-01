/**
 * Hauptanwendungs-Logik
 */
const App = {
  currentCharacter: null,
  currentPage: 'metadata',
  editMode: false,
  _autosaveTimer: null,
  _undoStack: [],
  _MAX_UNDO: 50,
  _lastVersionSave: 0,
  _syncState: { status: 'idle', lastSync: null, error: null },
  _syncTimer: null,
  _POLL_INTERVAL: 15000,
  _campaignData: null,
  _campaignTimer: null,
  _CAMPAIGN_POLL: 30000,

  pages: {
    metadata:   MetadataPage,
    attributes: AttributesPage,
    equipment:  EquipmentPage,
    career:     CareerPage,
    notes:      NotesPage,
    karte:      KartePage,
    combat:     CombatPage,
    ship:       ShipPage,
  },

  init() {
    this.initDarkMode();
    this.setupEventListeners();
    this._initPullToRefresh();

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      this.loadCharacter(characters[0].id);
    } else {
      this.showLoadCharDialog(true);
    }

    this.updateEditButton();
  },

  setupEventListeners() {
    // Tab-Navigation
    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const target = e.target.closest('.tab-btn');
        if (target) this.switchPage(target.dataset.page);
      });
    });

    // Globale Header-Buttons
    document.getElementById('toggleEditBtn').addEventListener('click', () => this.toggleEditMode());
    document.getElementById('undoBtn').addEventListener('click', () => this.undo());
    document.getElementById('historyBtn').addEventListener('click', () => this.showVersionHistory());
    document.getElementById('cloudConfigHeaderBtn').addEventListener('click', () => this.showCloudConfig());
    document.getElementById('darkModeBtn').addEventListener('click', () => this.toggleDarkMode());
    document.getElementById('closeVersionModal').addEventListener('click', () => {
      document.getElementById('versionModal').classList.remove('visible');
    });

    // Autosave: jede Eingabe im Content-Bereich mit Debounce speichern
    document.querySelector('.content').addEventListener('input',  () => this._scheduleAutosave());
    document.querySelector('.content').addEventListener('change', () => this._scheduleAutosave());

    // Undo keyboard shortcut (nur außerhalb von Eingabefeldern)
    document.addEventListener('keydown', e => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        const tag = document.activeElement?.tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && !document.activeElement?.isContentEditable) {
          e.preventDefault();
          this.undo();
        }
      }
    });

    // Kampagnen-Modal
    document.getElementById('campaignModalClose').addEventListener('click', () => {
      document.getElementById('campaignModal').classList.remove('visible');
    });
    document.getElementById('campaignCreateBtn').addEventListener('click', () => this.createCampaign());
    document.getElementById('campaignJoinBtn').addEventListener('click',   () => this.joinCampaign());

    // Laden-Modal schließen
    document.getElementById('loadCharClose').addEventListener('click', () => {
      document.getElementById('loadCharModal').classList.remove('visible');
    });

    // Neuer Charakter (nur im Willkommen-Modus sichtbar)
    document.getElementById('lcNewBtn').addEventListener('click', () => {
      document.getElementById('loadCharModal').classList.remove('visible');
      this.createNewCharacter();
    });

    // Laden aus JSON
    document.getElementById('lcJsonBtn').addEventListener('click', () => {
      document.getElementById('loadCharModal').classList.remove('visible');
      document.getElementById('importCharFile').click();
    });

    // Laden aus Cloud
    document.getElementById('lcCloudBtn').addEventListener('click', () => {
      document.getElementById('loadCharModal').classList.remove('visible');
      if (CloudSync.isConfigured()) {
        this.showCloudCharList();
      } else {
        this.showCloudConfig();
      }
    });

    // JSON-Datei eingelesen
    document.getElementById('importCharFile').addEventListener('change', (e) => this._importJSON(e));

    // Cloud-Charakter-Modal schließen
    document.getElementById('cloudCharClose').addEventListener('click', () => {
      document.getElementById('cloudCharModal').classList.remove('visible');
    });

    // Cloud-Einstellungen-Modal schließen
    document.getElementById('cloudConfigClose').addEventListener('click', () => {
      document.getElementById('cloudConfigModal').classList.remove('visible');
    });

    // Charakter-Selector-Buttons leben jetzt in MetadataPage.attachListeners()
  },

  // ── Charakter laden/wechseln ────────────────────────────────────────────
  loadCharacter(id) {
    this.currentCharacter = Storage.loadCharacter(id);
    if (!this.currentCharacter) { console.error('Charakter nicht gefunden:', id); return; }
    window.currentCharacter = this.currentCharacter;
    this._undoStack = [];
    this._updateUndoBtn();
    this._updateHeaderName();
    this._syncState = { status: 'idle', lastSync: null, error: null };
    this._campaignData = null;

    if (this.currentCharacter.syncMode === 'cloud') {
      this._startCloudPoll();
      this._syncCloud();
    } else {
      this._stopCloudPoll();
    }

    if (this.currentCharacter.campaignId) {
      this._loadCampaignData(this.currentCharacter.campaignId);
    } else {
      this._stopCampaignPoll();
    }

    this.renderCurrentPage();
    this.showStatus(`${this.currentCharacter.metadata.name || 'Charakter'} geladen`, 'success');
  },

  async createNewCharacter() {
    const syncMode = await this._showNewCharDialog();
    if (syncMode === null) return;

    const char = new Character({ system: 'traveller', syncMode });
    Storage.saveCharacter(char);
    this.currentCharacter = char;
    window.currentCharacter = char;
    this._undoStack = [];
    this._updateUndoBtn();
    this.editMode = true;
    this._syncState = { status: 'idle', lastSync: null, error: null };
    this._updateHeaderName();

    if (syncMode === 'cloud') {
      this._startCloudPoll();
      this._pushToCloud();
    } else {
      this._stopCloudPoll();
    }

    if (this.currentPage !== 'metadata') {
      this.switchPage('metadata');
    } else {
      this.renderCurrentPage();
    }
    this.showStatus('Neuer Charakter erstellt', 'success');
  },

  _showNewCharDialog() {
    return new Promise(resolve => {
      const modal  = document.getElementById('newCharModal');
      const step1  = document.getElementById('ncStep1');
      const step2  = document.getElementById('ncStep2');
      const testEl = document.getElementById('ncTestResult');

      step1.style.display = '';
      step2.style.display = 'none';
      testEl.textContent  = '';
      testEl.className    = 'nc-test-result';
      document.getElementById('ncCreateBtn').disabled = true;
      if (CloudSync.getWorkerUrl()) document.getElementById('ncWorkerUrl').value = CloudSync.getWorkerUrl();
      if (CloudSync.getApiKey())    document.getElementById('ncApiKey').value    = CloudSync.getApiKey();

      modal.classList.add('visible');

      const close = result => { modal.classList.remove('visible'); resolve(result); };

      document.getElementById('ncCancelBtn').onclick = () => close(null);
      document.getElementById('ncLocalBtn').onclick  = () => close('local');
      document.getElementById('ncCloudBtn').onclick  = () => {
        if (CloudSync.isConfigured()) { close('cloud'); return; }
        step1.style.display = 'none';
        step2.style.display = '';
      };
      document.getElementById('ncBackBtn').onclick = () => {
        step2.style.display = 'none';
        step1.style.display = '';
      };
      document.getElementById('ncTestBtn').onclick = async () => {
        const url = document.getElementById('ncWorkerUrl').value.trim();
        const key = document.getElementById('ncApiKey').value.trim();
        if (!url || !key) { testEl.textContent = '⚠ URL und Key angeben'; return; }
        const btn = document.getElementById('ncTestBtn');
        btn.disabled = true;
        testEl.textContent = '⏳ Teste …';
        testEl.className   = 'nc-test-result';
        const r = await CloudSync.test(url, key);
        btn.disabled = false;
        if (r.ok) {
          testEl.textContent = '✓ Verbindung OK';
          testEl.className   = 'nc-test-result nc-test-ok';
          document.getElementById('ncCreateBtn').disabled = false;
          CloudSync.setWorkerUrl(url);
          CloudSync.setApiKey(key);
        } else {
          testEl.textContent = `✗ Fehler (${r.status || r.error || 'Timeout'})`;
          testEl.className   = 'nc-test-result nc-test-error';
          document.getElementById('ncCreateBtn').disabled = true;
        }
      };
      document.getElementById('ncCreateBtn').onclick = () => close('cloud');
    });
  },

  deleteCharacter() {
    if (!this.currentCharacter) return;
    const name    = this.currentCharacter.metadata.name || 'Charakter';
    const isCloud = this.currentCharacter.syncMode === 'cloud';
    const charId  = this.currentCharacter.id;
    if (!confirm(`„${name}" wirklich löschen?`)) return;

    Storage.deleteCharacter(charId);
    this._stopCloudPoll();
    if (isCloud) CloudSync.deleteCharacter(charId);
    this.currentCharacter = null;
    window.currentCharacter = null;

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      this.loadCharacter(characters[0].id);
    } else {
      this.createNewCharacter();
    }
    this.showStatus('Charakter gelöscht', 'success');
  },

  // ── Speichern ───────────────────────────────────────────────────────────
  _scheduleAutosave() {
    clearTimeout(this._autosaveTimer);
    this._autosaveTimer = setTimeout(() => this._doSave(), 1500);
  },

  saveCharacter() {
    this._doSave();
  },

  _doSave(saveVersion = false) {
    if (!this.currentCharacter) return;

    // Snapshot vor page.save(), damit undo den Pre-Save-Zustand wiederherstellt
    this._takeSnapshot();

    const page = this.pages[this.currentPage];
    if (page && page.save) page.save(this.currentCharacter);

    if (Storage.saveCharacter(this.currentCharacter)) {
      this._updateHeaderName();
      if (saveVersion) this._saveVersion();
      if (this.currentCharacter.syncMode === 'cloud') this._pushToCloud();
    } else {
      const e = Storage.lastError;
      const isQuota = e instanceof DOMException &&
        (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED');
      this.showStatus(
        isQuota ? 'Speicher voll! Bilder entfernen oder Daten exportieren.' : 'Fehler beim Speichern',
        'error'
      );
    }
  },

  _takeSnapshot() {
    if (!this.currentCharacter) return;
    this._undoStack.push(this.currentCharacter.toJSON());
    if (this._undoStack.length > this._MAX_UNDO) this._undoStack.shift();
    this._updateUndoBtn();
  },

  _saveVersion() {
    const now = Date.now();
    if (now - this._lastVersionSave < 30000) return; // max. eine Version pro 30s
    this._lastVersionSave = now;
    Storage.saveVersion(this.currentCharacter.id, this.currentCharacter.toJSON());
  },

  undo() {
    if (!this._undoStack.length) return;
    const json = this._undoStack.pop();
    this.currentCharacter = Character.fromJSON(json);
    window.currentCharacter = this.currentCharacter;
    Storage.saveCharacter(this.currentCharacter);
    this._updateHeaderName();
    this.renderCurrentPage();
    this._updateUndoBtn();
    this.showStatus('Rückgängig', 'success');
  },

  _updateUndoBtn() {
    const btn = document.getElementById('undoBtn');
    if (btn) btn.disabled = this._undoStack.length === 0;
  },

  async showVersionHistory() {
    if (!this.currentCharacter) return;
    const modal = document.getElementById('versionModal');
    const list  = document.getElementById('versionList');
    list.innerHTML = '<p class="vh-loading">Lade …</p>';
    modal.classList.add('visible');

    const versions = await Storage.listVersions(this.currentCharacter.id);
    if (!versions.length) {
      list.innerHTML = '<p class="vh-empty">Noch keine Versionen gespeichert.<br>Versionen werden beim Tab-Wechsel und nach dem Fertigstellen angelegt.</p>';
      return;
    }
    list.innerHTML = versions.map(v => `
      <button class="vh-item" data-vid="${v.id}">
        <span class="vh-time">${this._fmtVersionTime(v.timestamp)}</span>
        <span class="vh-name">${this._esc(v.data?.metadata?.name || 'Namenlos')}</span>
      </button>`).join('');

    list.querySelectorAll('.vh-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        if (!confirm('Version wirklich wiederherstellen? Der aktuelle Stand wird als Undo-Schritt gespeichert.')) return;
        const version = await Storage.loadVersion(btn.dataset.vid);
        if (!version) return;
        this._takeSnapshot();
        this.currentCharacter = Character.fromJSON(version.data);
        window.currentCharacter = this.currentCharacter;
        Storage.saveCharacter(this.currentCharacter);
        this._updateHeaderName();
        this.renderCurrentPage();
        this._updateUndoBtn();
        modal.classList.remove('visible');
        this.showStatus('Version wiederhergestellt', 'success');
      });
    });
  },

  _fmtVersionTime(ts) {
    return new Date(ts).toLocaleString('de-DE', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  },

  _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  },

  // ── Seiten-Navigation ───────────────────────────────────────────────────
  switchPage(pageName) {
    if (!this.pages[pageName]) return;

    clearTimeout(this._autosaveTimer);
    this._doSave(true);

    this.currentPage = pageName;

    document.querySelectorAll('.tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.page === pageName);
    });

    this.renderCurrentPage();
  },

  renderCurrentPage() {
    if (!this.currentCharacter) return;

    window.currentCharacter = this.currentCharacter;

    const page = this.pages[this.currentPage];
    if (!page) return;

    // Karten-iframe verstecken bevor innerHTML ersetzt wird (Safari-safe: kein DOM-Move)
    if (typeof KartePage !== 'undefined') KartePage.hideMapIframe();

    const container = document.getElementById(`${this.currentPage}-page`);
    container.innerHTML = page.render(this.currentCharacter);

    // active vor attachListeners setzen, damit getBoundingClientRect() korrekte Werte liefert
    document.querySelectorAll('.page-content').forEach(el => el.classList.remove('active'));
    container.classList.add('active');
    document.body.classList.toggle('page-karte', this.currentPage === 'karte');

    if (page.attachListeners) page.attachListeners();

    this.updateEditButton();
    this._updateUndoBtn();
  },

  // ── Edit-Modus ──────────────────────────────────────────────────────────
  toggleEditMode() {
    const page = this.pages[this.currentPage];
    if (!page) return;

    if (this.editMode) {
      clearTimeout(this._autosaveTimer);
      this._doSave(true);
    }

    this.editMode = !this.editMode;
    this.renderCurrentPage();
  },

  updateEditButton() {
    const btn = document.getElementById('toggleEditBtn');
    if (!btn) return;

    if (this.editMode) {
      btn.textContent = '✓ Fertig';
      btn.classList.add('active');
    } else {
      btn.textContent = '✎ Bearbeiten';
      btn.classList.remove('active');
    }
  },

  // ── Hilfsfunktionen ─────────────────────────────────────────────────────
  _updateHeaderName() {
    const el = document.getElementById('charNameDisplay');
    if (el) el.textContent = this.currentCharacter?.metadata?.name || '';
  },

  // ── Dark Mode ───────────────────────────────────────────────────────────
  initDarkMode() {
    const saved = localStorage.getItem('theme');
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches;
    const dark = saved === 'dark' || (saved === null && prefersDark);
    document.body.classList.toggle('dark-mode', dark);
    this._updateDarkModeBtn(dark);
  },

  toggleDarkMode() {
    const isDark = document.body.classList.toggle('dark-mode');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    this._updateDarkModeBtn(isDark);
  },

  _updateDarkModeBtn(isDark) {
    const btn = document.getElementById('darkModeBtn');
    if (btn) btn.textContent = isDark ? '☀️' : '🌙';
  },

  showStatus(message, type = 'success') {
    const el = document.getElementById('status-message');
    el.textContent = message;
    el.className = `status ${type}`;
    setTimeout(() => { el.textContent = ''; el.className = 'status'; }, 3000);
  },

  // ── Cloud-Sync ──────────────────────────────────────────────────────────
  async _pushToCloud() {
    if (!this.currentCharacter || this.currentCharacter.syncMode !== 'cloud') return;
    this._setSyncState('syncing');
    const r = await CloudSync.pushCharacter(this.currentCharacter);
    this._setSyncState(r.ok ? 'ok' : 'error', r.ok ? null : (r.error || 'Push-Fehler'));
  },

  async _syncCloud() {
    if (!this.currentCharacter || this.currentCharacter.syncMode !== 'cloud') return;
    if (this.editMode) return;
    if (Storage._pushTimer) {
      clearTimeout(Storage._pushTimer);
      Storage._pushTimer = null;
      await this._pushToCloud();
    }
    this._setSyncState('syncing');
    const r = await CloudSync.pullCharacter(this.currentCharacter.id);
    if (r.ok) {
      const cloudChar = Character.fromJSON(r.data);
      this.currentCharacter = cloudChar;
      window.currentCharacter = cloudChar;
      Storage._suppressPush = true;
      Storage.saveCharacter(cloudChar);
      Storage._suppressPush = false;
      this._setSyncState('ok');
      this._updateHeaderName();
      if (!this.editMode) this.renderCurrentPage();
    } else if (r.notFound) {
      await this._pushToCloud();
    } else {
      this._setSyncState('error', r.error || 'Pull-Fehler');
    }
  },

  _setSyncState(status, error = null) {
    this._syncState = {
      status,
      lastSync: status === 'ok' ? new Date() : this._syncState.lastSync,
      error,
    };
    this._updateSyncBadge();
  },

  _updateSyncBadge() {
    const el = document.getElementById('syncBadge');
    if (!el) return;
    const { status, lastSync, error } = this._syncState;
    const t = lastSync
      ? lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })
      : '–';
    el.className   = `sync-badge sync-badge--${status}`;
    el.textContent = status === 'syncing' ? '☁ Synchronisiere …'
                   : status === 'error'   ? `☁ Sync-Fehler: ${error}`
                   : status === 'ok'      ? `☁ Zuletzt: ${t}`
                   : '☁ Cloud';
  },

  _startCloudPoll() {
    this._stopCloudPoll();
    if (!this.currentCharacter || this.currentCharacter.syncMode !== 'cloud') return;
    const pollId = this.currentCharacter.id;
    this._syncTimer = setInterval(() => {
      if (!this.currentCharacter || this.currentCharacter.id !== pollId) {
        this._stopCloudPoll(); return;
      }
      if (document.visibilityState !== 'visible') return;
      this._syncCloud();
    }, this._POLL_INTERVAL);
  },

  _stopCloudPoll() {
    if (this._syncTimer) { clearInterval(this._syncTimer); this._syncTimer = null; }
  },

  _initPullToRefresh() {
    const content   = document.querySelector('.content');
    const indicator = document.getElementById('ptrIndicator');
    if (!content || !indicator) return;

    const THRESHOLD = 80;
    let startY   = 0;
    let lastY    = 0;
    let pulling  = false;

    const textEl = indicator.querySelector('.ptr-text');

    const reset = () => {
      indicator.style.height = '0';
      indicator.classList.remove('ptr-loading', 'ptr-ready');
      pulling = false;
      startY = lastY = 0;
    };

    content.addEventListener('touchstart', e => {
      if (content.scrollTop > 0) return;
      startY  = e.touches[0].pageY;
      lastY   = startY;
      pulling = true;
    }, { passive: true });

    content.addEventListener('touchmove', e => {
      if (!pulling) return;
      lastY = e.touches[0].pageY;
      const delta = lastY - startY;
      if (delta <= 0) return;

      const h        = Math.min(delta * 0.45, 52);
      const progress = delta / THRESHOLD;
      indicator.style.height = `${h}px`;
      indicator.classList.toggle('ptr-ready', progress >= 1);
      textEl.textContent = progress >= 1
        ? 'Loslassen zum Aktualisieren'
        : 'Zum Aktualisieren ziehen';
    }, { passive: true });

    content.addEventListener('touchend', async () => {
      if (!pulling) return;
      const delta = lastY - startY;

      if (delta >= THRESHOLD && this.currentCharacter?.syncMode === 'cloud' && !this.editMode) {
        indicator.style.height = '50px';
        indicator.classList.add('ptr-loading');
        indicator.classList.remove('ptr-ready');
        textEl.textContent = 'Aktualisiere …';
        await this._syncCloud();
      }
      reset();
    }, { passive: true });

    content.addEventListener('touchcancel', reset, { passive: true });
  },

  showCloudConfig() {
    const modal    = document.getElementById('cloudConfigModal');
    const testEl   = document.getElementById('cfgTestResult');
    const urlInput = document.getElementById('cfgWorkerUrl');
    const keyInput = document.getElementById('cfgApiKey');

    urlInput.value     = CloudSync.getWorkerUrl();
    keyInput.value     = CloudSync.getApiKey();
    testEl.textContent = '';
    testEl.className   = 'nc-test-result';
    modal.classList.add('visible');

    document.getElementById('cfgTestBtn').onclick = async () => {
      const url = urlInput.value.trim();
      const key = keyInput.value.trim();
      if (!url || !key) { testEl.textContent = '⚠ URL und Key angeben'; return; }
      const btn = document.getElementById('cfgTestBtn');
      btn.disabled = true;
      testEl.textContent = '⏳ Teste …';
      testEl.className   = 'nc-test-result';
      const r = await CloudSync.test(url, key);
      btn.disabled = false;
      if (r.ok) {
        testEl.textContent = '✓ Verbindung OK';
        testEl.className   = 'nc-test-result nc-test-ok';
      } else {
        testEl.textContent = `✗ Fehler (${r.status || r.error || 'Timeout'})`;
        testEl.className   = 'nc-test-result nc-test-error';
      }
    };

    document.getElementById('cfgSaveBtn').onclick = () => {
      CloudSync.setWorkerUrl(urlInput.value.trim());
      CloudSync.setApiKey(keyInput.value.trim());
      modal.classList.remove('visible');
      this.showStatus('Cloud-Einstellungen gespeichert ✓', 'success');
      if (this.currentCharacter?.syncMode === 'cloud') this._pushToCloud();
      modal.dispatchEvent(new CustomEvent('configSaved'));
    };
  },

  showLoadCharDialog(firstLaunch = false) {
    const modal    = document.getElementById('loadCharModal');
    const closeBtn = document.getElementById('loadCharClose');
    const newBtn   = document.getElementById('lcNewBtn');
    const title    = document.getElementById('loadCharTitle');
    const hint     = document.getElementById('loadCharHint');
    if (firstLaunch) {
      closeBtn.style.display = 'none';
      newBtn.style.display   = '';
      title.textContent      = 'Willkommen';
      hint.textContent       = 'Wie möchtest du starten?';
    } else {
      closeBtn.style.display = '';
      newBtn.style.display   = 'none';
      title.textContent      = 'Charakter laden';
      hint.textContent       = 'Wie soll der Charakter geladen werden?';
    }
    modal.classList.add('visible');
  },

  async activateCloudSync() {
    if (!this.currentCharacter) return;
    if (!CloudSync.isConfigured()) {
      await this._awaitCloudConfig();
      if (!CloudSync.isConfigured()) return;
    }
    this.currentCharacter.syncMode = 'cloud';
    Storage.saveCharacter(this.currentCharacter);
    this._syncState = { status: 'idle', lastSync: null, error: null };
    this._startCloudPoll();
    this._pushToCloud();
    this.renderCurrentPage();
    this.showStatus('Cloud-Sync aktiviert ✓', 'success');
  },

  deactivateCloudSync() {
    if (!this.currentCharacter) return;
    if (!confirm('Cloud-Sync deaktivieren? Der Charakter bleibt in der Cloud gespeichert.')) return;
    this.currentCharacter.syncMode = 'local';
    Storage.saveCharacter(this.currentCharacter);
    this._stopCloudPoll();
    this._syncState = { status: 'idle', lastSync: null, error: null };
    this.renderCurrentPage();
    this.showStatus('Cloud-Sync deaktiviert', 'success');
  },

  _awaitCloudConfig() {
    return new Promise(resolve => {
      this.showCloudConfig();
      const modal = document.getElementById('cloudConfigModal');
      const onSave = () => {
        modal.removeEventListener('configSaved', onSave);
        modal.removeEventListener('close',       onSave);
        resolve();
      };
      modal.addEventListener('configSaved', onSave, { once: true });
      document.getElementById('cloudConfigClose').addEventListener('click', resolve, { once: true });
    });
  },

  _importJSON(e) {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (event) => {
      let data;
      try { data = JSON.parse(event.target.result); }
      catch { this.showStatus('Ungültige JSON-Datei', 'error'); return; }
      if (!data.id || !data.metadata) { this.showStatus('Kein gültiger Traveller-Charakter', 'error'); return; }
      const existing = Storage.listCharacters();
      const conflict = existing.find(c => c.id === data.id);
      if (conflict) {
        const overwrite = confirm(`„${conflict.name}" existiert bereits.\n\nÜberschreiben? (Abbrechen = als Kopie importieren)`);
        if (!overwrite) { data.id = 'char-' + Date.now(); data.metadata.name = (data.metadata.name || 'Charakter') + ' (Kopie)'; }
      }
      const character = Character.fromJSON(data);
      Storage.saveCharacter(character);
      this.loadCharacter(character.id);
      this.showStatus(`„${character.metadata.name || 'Charakter'}" importiert ✓`, 'success');
    };
    reader.onerror = () => this.showStatus('Datei konnte nicht gelesen werden', 'error');
    reader.readAsText(file);
  },

  // ── Kampagnen ─────────────────────────────────────────────────────────────

  async _loadCampaignData(campaignId) {
    const local = await Storage.loadCampaign(campaignId);
    if (local) {
      this._campaignData = local;
      if (!this.editMode) this.renderCurrentPage();
    }
    if (this.currentCharacter?.syncMode === 'cloud' && CloudSync.isConfigured()) {
      const r = await CampaignSync.getCampaign(campaignId);
      if (r.ok) {
        this._campaignData = r.data;
        Storage.saveCampaign(r.data);
        if (!this.editMode) this.renderCurrentPage();
        this._startCampaignPoll(campaignId);
      }
    }
  },

  async _syncCampaign() {
    if (!this.currentCharacter?.campaignId || !CloudSync.isConfigured()) return;
    const r = await CampaignSync.getCampaign(this.currentCharacter.campaignId);
    if (r.ok) {
      this._campaignData = r.data;
      Storage.saveCampaign(r.data);
      if (!this.editMode && (this.currentPage === 'notes' || this.currentPage === 'metadata')) {
        this.renderCurrentPage();
      }
    }
  },

  async _syncMyCampaignEntries() {
    const char = this.currentCharacter;
    if (!char?.campaignId || char.syncMode !== 'cloud' || !CloudSync.isConfigured()) return;
    const notes  = char.notes || {};
    const result = await CampaignSync.getCampaign(char.campaignId);
    if (!result.ok) return;
    const cur    = result.data.notes || { sessions: [], persons: [], locations: [], quests: [] };
    const merged = {};
    for (const tab of ['sessions', 'persons', 'locations', 'quests']) {
      const myEntries = (notes[tab] || []).filter(e => e.isCampaign);
      const myIds     = new Set(myEntries.map(e => e.id));
      merged[tab]     = [...(cur[tab] || []).filter(e => !myIds.has(e.id)), ...myEntries];
    }
    await CampaignSync.updateNotes(char.campaignId, merged);
    if (this._campaignData) this._campaignData.notes = merged;
  },

  _startCampaignPoll(campaignId) {
    this._stopCampaignPoll();
    this._campaignTimer = setInterval(() => {
      if (!this.currentCharacter || this.currentCharacter.campaignId !== campaignId) {
        this._stopCampaignPoll(); return;
      }
      if (document.visibilityState !== 'visible') return;
      this._syncCampaign();
    }, this._CAMPAIGN_POLL);
  },

  _stopCampaignPoll() {
    if (this._campaignTimer) { clearInterval(this._campaignTimer); this._campaignTimer = null; }
  },

  showCampaignModal() {
    document.getElementById('campaignModal').classList.add('visible');
    this._loadCampaignList();
  },

  async _loadCampaignList() {
    const listEl = document.getElementById('campaignJoinList');
    listEl.innerHTML = '<p class="vh-loading">Lade Kampagnen …</p>';
    const r = await CampaignSync.listCampaigns();
    if (!r.ok) { listEl.innerHTML = '<p class="vh-empty">Laden fehlgeschlagen.</p>'; return; }
    const camps = r.data || [];
    if (!camps.length) { listEl.innerHTML = '<p class="vh-empty">Keine Kampagnen gefunden.</p>'; return; }
    listEl.innerHTML = camps.map(c => `
      <button class="campaign-item" data-id="${this._esc(c.id)}">
        <span class="campaign-item-name">${this._esc(c.name)}</span>
        <span class="campaign-item-meta">${this._esc(c.id)} · ${c.memberCount} Mitglied${c.memberCount !== 1 ? 'er' : ''}</span>
      </button>`).join('');
    listEl.querySelectorAll('.campaign-item').forEach(btn => {
      btn.addEventListener('click', () => {
        document.getElementById('campaignJoinId').value = btn.dataset.id;
      });
    });
  },

  async createCampaign() {
    const char = this.currentCharacter;
    if (!char) return;
    const rawId = document.getElementById('campaignCreateId').value.trim().toLowerCase();
    const name  = document.getElementById('campaignCreateName').value.trim();
    if (!rawId || !name) { this.showStatus('ID und Name erforderlich', 'error'); return; }
    if (!/^[a-z0-9_-]{2,32}$/.test(rawId)) {
      this.showStatus('ID: nur Kleinbuchstaben, Zahlen, - und _ (2–32 Zeichen)', 'error'); return;
    }
    const btn = document.getElementById('campaignCreateBtn');
    btn.disabled = true;
    const r = await CampaignSync.createCampaign(rawId, name, char.id);
    btn.disabled = false;
    if (r.conflict) { this.showStatus('Kampagnen-ID bereits vergeben', 'error'); return; }
    if (!r.ok) { this.showStatus(`Fehler: ${r.error || 'HTTP ' + r.status}`, 'error'); return; }
    this._campaignData = r.data;
    Storage.saveCampaign(r.data);
    char.campaignId = rawId;
    Storage.saveCharacter(char);
    if (char.syncMode === 'cloud') this._pushToCloud();
    document.getElementById('campaignModal').classList.remove('visible');
    this._startCampaignPoll(rawId);
    this.renderCurrentPage();
    this.showStatus(`Kampagne „${name}" erstellt ✓`, 'success');
  },

  async joinCampaign() {
    const char = this.currentCharacter;
    if (!char) return;
    const id = (document.getElementById('campaignJoinId').value.trim() || '').toLowerCase();
    if (!id) { this.showStatus('Bitte Kampagnen-ID eingeben', 'error'); return; }
    const btn = document.getElementById('campaignJoinBtn');
    btn.disabled = true;
    const r = await CampaignSync.join(id, char.id);
    btn.disabled = false;
    if (r.notFound) { this.showStatus('Kampagne nicht gefunden', 'error'); return; }
    if (!r.ok) { this.showStatus(`Fehler: ${r.error || 'HTTP ' + r.status}`, 'error'); return; }
    const rGet = await CampaignSync.getCampaign(id);
    if (!rGet.ok) { this.showStatus('Kampagne beigetreten, Laden fehlgeschlagen', 'error'); return; }
    this._campaignData = rGet.data;
    Storage.saveCampaign(rGet.data);
    char.campaignId = id;
    Storage.saveCharacter(char);
    if (char.syncMode === 'cloud') this._pushToCloud();
    document.getElementById('campaignModal').classList.remove('visible');
    this._startCampaignPoll(id);
    this.renderCurrentPage();
    this.showStatus(`Kampagne „${rGet.data.name}" beigetreten ✓`, 'success');
  },

  async leaveCampaign() {
    const char = this.currentCharacter;
    if (!char?.campaignId) return;
    if (!confirm('Kampagne verlassen? Du kannst jederzeit wieder beitreten.')) return;
    if (char.syncMode === 'cloud' && CloudSync.isConfigured()) {
      await CampaignSync.leave(char.campaignId, char.id);
    }
    char.campaignId = null;
    Storage.saveCharacter(char);
    if (char.syncMode === 'cloud') this._pushToCloud();
    this._stopCampaignPoll();
    this._campaignData = null;
    NotesPage._activeTab = 'sessions';
    this.renderCurrentPage();
    this.showStatus('Kampagne verlassen', 'success');
  },

  async deleteCampaign() {
    const char = this.currentCharacter;
    if (!char?.campaignId || !this._campaignData) return;
    if (this._campaignData.ownerId !== char.id) {
      this.showStatus('Nur der Ersteller kann die Kampagne löschen', 'error'); return;
    }
    if (!confirm(`Kampagne „${this._campaignData.name}" wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.`)) return;
    if (char.syncMode === 'cloud' && CloudSync.isConfigured()) {
      await CampaignSync.deleteCampaign(char.campaignId, char.id);
    }
    Storage.deleteCampaign(char.campaignId);
    char.campaignId = null;
    Storage.saveCharacter(char);
    if (char.syncMode === 'cloud') this._pushToCloud();
    this._stopCampaignPoll();
    this._campaignData = null;
    NotesPage._activeTab = 'sessions';
    this.renderCurrentPage();
    this.showStatus('Kampagne gelöscht', 'success');
  },

  async kickCampaignMember(charId) {
    const char = this.currentCharacter;
    if (!char?.campaignId || !this._campaignData) return;
    if (!confirm('Mitglied aus der Kampagne entfernen?')) return;
    const r = await CampaignSync.kickMember(char.campaignId, charId, char.id);
    if (!r.ok) { this.showStatus('Entfernen fehlgeschlagen', 'error'); return; }
    await this._syncCampaign();
    this.renderCurrentPage();
    this.showStatus('Mitglied entfernt', 'success');
  },

  async showCloudCharList() {
    const modal   = document.getElementById('cloudCharModal');
    const listEl  = document.getElementById('cloudCharList');
    listEl.innerHTML = '<p class="vh-loading">Lade Cloud-Charaktere …</p>';
    modal.classList.add('visible');

    const result = await CloudSync.listCharacters();
    if (!result.ok) {
      listEl.innerHTML = `<p class="vh-empty">Fehler: ${result.error || (result.status ? `HTTP ${result.status}` : 'Verbindung fehlgeschlagen')}</p>`;
      return;
    }

    const chars       = result.data || [];
    const localIds    = new Set(Storage.listCharacters().map(c => c.id));

    if (!chars.length) {
      listEl.innerHTML = '<p class="vh-empty">Keine Cloud-Charaktere gefunden.<br>Speichere einen Charakter um ihn zu indexieren.</p>';
      return;
    }

    listEl.innerHTML = chars.map(c => {
      const isLocal = localIds.has(c.id);
      return `
        <button class="cloud-char-item" data-id="${this._esc(c.id)}">
          <span class="cloud-char-name">${this._esc(c.name || 'Namenlos')}</span>
          <span class="cloud-char-status">${isLocal ? '✓ Lokal vorhanden' : '⬇ Laden'}</span>
        </button>`;
    }).join('');

    listEl.querySelectorAll('.cloud-char-item').forEach(btn => {
      btn.addEventListener('click', async () => {
        btn.disabled = true;
        btn.querySelector('.cloud-char-status').textContent = '⏳ …';

        const r = await CloudSync.pullCharacter(btn.dataset.id);
        if (!r.ok) {
          btn.querySelector('.cloud-char-status').textContent = '✗ Fehler';
          btn.disabled = false;
          return;
        }

        const char = Character.fromJSON(r.data);
        Storage.saveCharacter(char);
        modal.classList.remove('visible');
        this.loadCharacter(char.id);
        this.showStatus(`„${char.metadata.name || 'Charakter'}" geladen ✓`, 'success');
      });
    });
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  App.init();
});
