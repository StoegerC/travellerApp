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

  pages: {
    metadata:   MetadataPage,
    attributes: AttributesPage,
    equipment:  EquipmentPage,
    career:     CareerPage,
    notes:      NotesPage,
    karte:      KartePage,
    combat:     CombatPage,
    finances:   FinancesPage
  },

  init() {
    this.initDarkMode();
    this.setupEventListeners();

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      this.loadCharacter(characters[0].id);
    } else {
      this.createNewCharacter();
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

    if (this.currentCharacter.syncMode === 'cloud') {
      this._startCloudPoll();
      this._syncCloud();
    } else {
      this._stopCloudPoll();
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
    this._setSyncState('syncing');
    const r = await CloudSync.pullCharacter(this.currentCharacter.id);
    if (r.ok) {
      const cloudChar = Character.fromJSON(r.data);
      this.currentCharacter = cloudChar;
      window.currentCharacter = cloudChar;
      Storage.saveCharacter(cloudChar);
      this._setSyncState('ok');
      this._updateHeaderName();
      this.renderCurrentPage();
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
};

document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  App.init();
});
