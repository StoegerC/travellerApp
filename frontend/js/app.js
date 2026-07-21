/**
 * Hauptanwendungs-Logik
 */
// Laufende App-Version — wird von scripts/bump-version.js mitgebumpt.
// Genutzt vom Import-Versionswächter (Multi-System Phase 0): JSON-Exporte
// können ein _minAppVersion tragen, das der Import hiergegen prüft.
const APP_VERSION = '3.21.0';

const App = {
  currentCharacter: null,
  currentPage: 'metadata',
  editMode: false,
  _autosaveTimer: null,
  _undoStack: [],
  _MAX_UNDO: 50,
  _lastVersionSave: 0,
  _syncState: { status: 'idle', lastSync: null, error: null },
  _pendingPush: false, // lokale Änderung geplant, aber noch nicht auf dem Server bestätigt
  _syncTimer: null,
  _POLL_INTERVAL: 15000,
  _campaignData: null,
  _campaignTimer: null,
  _CAMPAIGN_POLL: 15000,
  _LAST_CHAR_KEY: 'traveller_last_character_id',
  // Read-only-Ansicht fuer Meister, die einen fremden Charakter ueber
  // showCloudCharList() laden (gm-Flag, kein Owner) - wird bei jedem
  // regulaeren loadCharacter() zurueckgesetzt.
  _readOnlyView: false,

  // ── System-Manifest (Multi-System Phase 1) ────────────────────────────────
  // Tabs, Seiten und Labels kommen aus dem Manifest des aktiven Regelsystems
  // (SystemRegistry, siehe systems/README.md) statt aus harten Maps.
  // _system() wertet character.system aus — der frühere Todo-Punkt
  // "Regel-System-Switch"; ohne Charakter gilt das Default-System (MGT2).
  _system() {
    return SystemRegistry.get(this.currentCharacter?.system);
  },
  _tab(pageName)  { return this._system().tabs.find(t => t.id === pageName) || null; },
  _page(pageName) { return this._tab(pageName)?.page() || null; },
  _pageLabel(pageName) { return this._tab(pageName)?.label || pageName; },

  // Kalender-Vertrag des aktiven Systems (Phase 2): In-Game-Datumsfelder der
  // Kern-Seiten laufen hierüber. Systeme ohne eigenen Kalender bekommen den
  // Fallback: ein schlichtes Textfeld, der Wert bleibt ein sortierbarer String.
  _calendar() {
    return this._system().calendar || {
      label: '',
      placeholder: '',
      renderInput: (id, value) =>
        `<input type="text" id="${id}" value="${String(value ?? '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;')}">`,
      attachInput: () => {},
      setInput: (id, value) => {
        const el = document.getElementById(id);
        if (!el || el.value.trim()) return;
        el.value = String(value || '');
        el.dispatchEvent(new Event('input', { bubbles: true }));
      },
    };
  },

  // ── Entitäts-Zusatzfelder (Phase 2): entityExtraFields aus dem Manifest ────
  // Personen/Orte/Quests bekommen je System zusätzliche Felder (z.B. MGT2s
  // Rassen-Auswahl bei Personen) — Kern-Formulare (Notes-Detailformular,
  // Erwähnungs-Popover) und Kern-Neuanlage (Tag-Picker, @-Autocomplete) kennen
  // die Feldliste nicht, sondern rendern/lesen/befüllen sie generisch.
  // Feld-Definition: { key, label, type: 'select'|'text', options?, default? }.
  _entityExtraFields(pluralType) {
    return this._system().entityExtraFields?.[pluralType] || [];
  },

  _escExtra(s) {
    return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  },

  // HTML aller Zusatzfelder eines Typs für ein Formular — je ein .form-group,
  // reiht sich also nahtlos in bestehende .detail-form-row/.mp-row ein.
  // idPrefix trennt z.B. das Notes-Detailformular ("extra-") vom gleichzeitig
  // möglichen Erwähnungs-Popover eines ANDEREN Eintrags ("mp-extra-") — beide
  // können pro Feld denselben key haben, dürfen aber nie dieselbe DOM-id
  // tragen (siehe bestehende mp*-Präfixe im Popover für dasselbe Muster).
  _renderExtraFields(pluralType, entity = {}, idPrefix = 'extra') {
    return this._entityExtraFields(pluralType).map(f => {
      const id  = `${idPrefix}-${f.key}`;
      const val = entity[f.key] ?? f.default ?? '';
      if (f.type === 'select') {
        const opts = (f.options || []).map(o =>
          `<option value="${this._escExtra(o)}"${String(val) === String(o) ? ' selected' : ''}>${this._escExtra(o)}</option>`
        ).join('');
        return `<div class="form-group"><label>${this._escExtra(f.label)}</label><select id="${id}">${opts}</select></div>`;
      }
      return `<div class="form-group"><label>${this._escExtra(f.label)}</label><input type="text" id="${id}" value="${this._escExtra(val)}"></div>`;
    }).join('');
  },

  // Liest alle Zusatzfelder eines Typs aus dem DOM zurück (für save()).
  _readExtraFields(pluralType, idPrefix = 'extra') {
    const out = {};
    this._entityExtraFields(pluralType).forEach(f => {
      const el = document.getElementById(`${idPrefix}-${f.key}`);
      if (el) out[f.key] = el.value;
    });
    return out;
  },

  // Default-Werte aller Zusatzfelder eines Typs (für Neuanlage ohne Formular,
  // z.B. Tag-Picker-Schnellanlage oder @-Autocomplete).
  _extraFieldDefaults(pluralType) {
    const out = {};
    this._entityExtraFields(pluralType).forEach(f => {
      if (f.default !== undefined) out[f.key] = f.default;
    });
    return out;
  },

  // Zusatzfelder, deren Wert vom Default abweicht — für die kompakte
  // Leseansicht (z.B. Rassen-Zeile, nur wenn nicht "Mensch").
  _nonDefaultExtraFields(pluralType, entity = {}) {
    return this._entityExtraFields(pluralType).filter(f => {
      const val = entity[f.key];
      return val && val !== (f.default ?? '');
    });
  },

  // Baut Tab-Leiste und Seiten-Container aus dem Manifest — exakt das Markup,
  // das zuvor hart in index.html stand. Läuft vor setupEventListeners(),
  // damit die Tab-Klick-Listener die generierten Buttons finden.
  _buildTabs() {
    const sys = this._system();
    const nav = document.querySelector('.tab-navigation');
    nav.innerHTML = sys.tabs.map(t => `
      <button class="tab-btn${t.id === this.currentPage ? ' active' : ''}" data-page="${t.id}">
        <span class="tab-icon">${t.icon}</span>
        <span class="tab-label">${t.label}</span>
      </button>`).join('');
    const content = document.querySelector('main.content');
    content.querySelectorAll('.page-content').forEach(el => el.remove());
    sys.tabs.forEach(t => {
      const div = document.createElement('div');
      div.id = `${t.id}-page`;
      div.className = 'page-content' + (t.id === this.currentPage ? ' active' : '');
      content.appendChild(div);
    });
  },

  init() {
    this._buildTabs();
    this.initDarkMode();
    this.setupEventListeners();
    this._initPullToRefresh();

    const characters = Storage.listCharacters();
    if (characters.length > 0) {
      const lastId = localStorage.getItem(this._LAST_CHAR_KEY);
      const stillExists = lastId && characters.some(c => c.id === lastId);
      this.loadCharacter(stillExists ? lastId : characters[0].id);
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
    document.getElementById('headerBrand')?.addEventListener('click', () => location.reload());
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

    // Laden aus Cloud. Falls noch nicht konfiguriert (Erststart): erst das
    // Konfigurations-/Login-Modal durchlaufen und DANACH die Charakterliste
    // zeigen — vorher endete der Ablauf nach dem Login im Nichts und die
    // ladbaren Cloud-Charaktere erschienen nie.
    document.getElementById('lcCloudBtn').addEventListener('click', async () => {
      document.getElementById('loadCharModal').classList.remove('visible');
      if (!CloudSync.isConfigured()) {
        await this._awaitCloudConfig();
        if (!CloudSync.isConfigured()) {
          // Abgebrochen ohne Login: beim Erststart (noch kein Charakter)
          // zurück zum Willkommen-Dialog statt in einer leeren App zu enden.
          if (Storage.listCharacters().length === 0) this.showLoadCharDialog(true);
          return;
        }
      }
      this.showCloudCharList();
    });

    // JSON-Datei eingelesen
    document.getElementById('importCharFile').addEventListener('change', (e) => this._importJSON(e));

    // Cloud-Charakter-Modal schließen. Beim Erststart (noch kein Charakter
    // geladen) zurück zum Willkommen-Dialog statt in einer leeren App zu enden.
    document.getElementById('cloudCharClose').addEventListener('click', () => {
      document.getElementById('cloudCharModal').classList.remove('visible');
      if (!this.currentCharacter && Storage.listCharacters().length === 0) {
        this.showLoadCharDialog(true);
      }
    });

    // Cloud-Einstellungen-Modal schließen
    document.getElementById('cloudConfigClose').addEventListener('click', () => {
      document.getElementById('cloudConfigModal').classList.remove('visible');
    });

    // Charakter-Selector-Buttons leben jetzt in MetadataPage.attachListeners()
  },

  // ── Charakter laden/wechseln ────────────────────────────────────────────
  // readOnly: true fuer Meister, die einen fremden Charakter betrachten (siehe
  // showCloudCharList()). Muss hier gesetzt werden statt erst danach - diese
  // Funktion loest weiter unten synchron _syncCloud() aus, das bei einem noch
  // ausstehenden Push sofort _pushToCloud() aufruft; ein "danach" gesetztes
  // _readOnlyView wuerde dieses erste Flush-Push nicht mehr rechtzeitig stoppen.
  loadCharacter(id, readOnly = false) {
    this.currentCharacter = Storage.loadCharacter(id);
    if (!this.currentCharacter) { console.error('Charakter nicht gefunden:', id); return; }
    window.currentCharacter = this.currentCharacter;
    localStorage.setItem(this._LAST_CHAR_KEY, id);
    this._readOnlyView = readOnly;
    this.editMode = false;
    this._undoStack = [];
    this._updateUndoBtn();
    this._updateHeaderName();
    this._syncState = { status: 'idle', lastSync: null, error: null };
    this._pendingPush = false;
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
    localStorage.setItem(this._LAST_CHAR_KEY, char.id);
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
      const modal    = document.getElementById('newCharModal');
      const step1    = document.getElementById('ncStep1');
      const step2    = document.getElementById('ncStep2');
      const step3    = document.getElementById('ncStep3');
      const testEl   = document.getElementById('ncTestResult');
      const loginEl  = document.getElementById('ncLoginResult');

      const showStep = n => {
        step1.style.display = n === 1 ? '' : 'none';
        step2.style.display = n === 2 ? '' : 'none';
        step3.style.display = n === 3 ? '' : 'none';
      };
      showStep(1);
      testEl.textContent  = '';
      testEl.className    = 'nc-test-result';
      loginEl.textContent = '';
      loginEl.className   = 'nc-test-result';
      if (CloudSync.getWorkerUrl()) document.getElementById('ncWorkerUrl').value = CloudSync.getWorkerUrl();

      modal.classList.add('visible');

      const close = result => { modal.classList.remove('visible'); resolve(result); };

      document.getElementById('ncCancelBtn').onclick = () => close(null);
      document.getElementById('ncLocalBtn').onclick  = () => close('local');
      document.getElementById('ncCloudBtn').onclick  = () => {
        if (CloudSync.isConfigured()) { close('cloud'); return; }
        showStep(2);
      };
      document.getElementById('ncBackBtn').onclick  = () => showStep(1);
      document.getElementById('ncBackBtn2').onclick = () => showStep(2);
      document.getElementById('ncTestBtn').onclick = async () => {
        const url = document.getElementById('ncWorkerUrl').value.trim();
        if (!url) { testEl.textContent = '⚠ URL angeben'; return; }
        const btn = document.getElementById('ncTestBtn');
        btn.disabled = true;
        testEl.textContent = '⏳ Teste …';
        testEl.className   = 'nc-test-result';
        const r = await CloudSync.test(url);
        btn.disabled = false;
        if (r.ok) {
          testEl.textContent = '✓ Verbindung OK';
          testEl.className   = 'nc-test-result nc-test-ok';
        } else {
          testEl.textContent = `✗ Fehler (${r.status || r.error || 'Timeout'})`;
          testEl.className   = 'nc-test-result nc-test-error';
        }
      };
      document.getElementById('ncNextBtn').onclick = () => showStep(3);
      document.getElementById('ncCreateBtn').onclick = async () => {
        const url      = document.getElementById('ncWorkerUrl').value.trim();
        const email    = document.getElementById('ncEmail').value.trim();
        const password = document.getElementById('ncPassword').value;
        if (!email || password.length < 8) { loginEl.textContent = '⚠ E-Mail und Passwort (min. 8 Zeichen) angeben'; return; }
        const btn = document.getElementById('ncCreateBtn');
        btn.disabled = true;
        loginEl.textContent = '⏳ Melde an …';
        loginEl.className   = 'nc-test-result';
        const r = await AuthAPI.login(url, email, password);
        btn.disabled = false;
        if (r.ok) { close('cloud'); return; }
        loginEl.textContent = `✗ ${r.error || 'Anmeldung fehlgeschlagen'}`;
        loginEl.className   = 'nc-test-result nc-test-error';
      };
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

  _doSave(saveVersion = false, versionMeta = null) {
    if (!this.currentCharacter) return;

    // Snapshot vor page.save(), damit undo den Pre-Save-Zustand wiederherstellt
    this._takeSnapshot();

    const page = this._page(this.currentPage);
    if (page && page.save) page.save(this.currentCharacter);

    if (Storage.saveCharacter(this.currentCharacter)) {
      this._updateHeaderName();
      if (saveVersion) this._saveVersion(versionMeta);
      // Kein direkter _pushToCloud()-Aufruf hier: Storage.saveCharacter() plant
      // selbst schon einen (dirty-geprüften) Push, sobald sich wirklich etwas
      // geändert hat. Ein zweiter, unconditional Push hier würde genau den
      // Bug zurückbringen, den der Dirty-Check beheben soll (siehe storage.js).
      if (this.currentPage === 'ship' && this.currentCharacter.campaignId) this._syncMyCampaignShips();
      if (this.currentPage === 'notes' && this.currentCharacter.campaignId) this._syncMyCampaignEntries();
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

  _saveVersion(meta = null) {
    const now = Date.now();
    // Drossel gilt nur fuer ungetaggte (Tab-Wechsel-)Versionen - eine mit
    // Seite getaggte (Bearbeitungsmodus verlassen) soll nie stillschweigend
    // wegfallen, nur weil kurz zuvor ein reiner Tab-Wechsel gespeichert hat.
    if (!meta && now - this._lastVersionSave < 30000) return; // max. eine ungetaggte Version pro 30s
    this._lastVersionSave = now;
    Storage.saveVersion(this.currentCharacter.id, this.currentCharacter.toJSON(), meta);
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
        ${v.page ? `<span class="vh-page">${this._esc(this._pageLabel(v.page))}</span>` : ''}
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
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  },

  // ── Seiten-Navigation ───────────────────────────────────────────────────
  switchPage(pageName) {
    if (!this._page(pageName)) return;

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

    const page = this._page(this.currentPage);
    if (!page) return;

    // Beim Re-Render während einer aktiven Notiz-Bearbeitung den DOM-Stand zuerst
    // sichern, damit ungespeicherter Text nicht durch den Render überschrieben wird.
    // Nur wenn das passende Formular-Element auch wirklich im DOM existiert
    // (verhindert Datenverlust bei Tab-Wechseln, die _activeTab schon vorab setzen).
    if (this.editMode && this.currentPage === 'notes' &&
        typeof NotesPage !== 'undefined' && NotesPage._detailId && page.save) {
      const formAnchor = {
        sessions:  'sessionContent',
        persons:   'personName',
        locations: 'locName',
        quests:    'questTitle',
      }[NotesPage._activeTab];
      if (formAnchor && document.getElementById(formAnchor)) {
        page.save(this.currentCharacter);
      }
    }

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
    this._updateSyncIndicator();
  },

  // ── Edit-Modus ──────────────────────────────────────────────────────────
  toggleEditMode() {
    if (this._readOnlyView) return; // Meister-Ansicht eines fremden Charakters
    const page = this._page(this.currentPage);
    if (!page) return;

    if (this.editMode) {
      clearTimeout(this._autosaveTimer);
      // Seite mitgeben, auf der der Bearbeitungsmodus beendet wurde (siehe
      // Storage.saveVersion) - beim reinen Tab-Wechsel (switchPage) bewusst
      // nicht, um den Verlauf nicht mit dieser Zusatzinfo bei jedem Wechsel
      // vollzuschreiben.
      this._doSave(true, { page: this.currentPage });
    }

    this.editMode = !this.editMode;
    this.renderCurrentPage();
  },

  updateEditButton() {
    const btn = document.getElementById('toggleEditBtn');
    if (!btn) return;

    if (this._readOnlyView) {
      btn.style.display = 'none';
      return;
    }
    btn.style.display = '';

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
  // retriesLeft begrenzt die Merge-und-erneut-Versuchen-Schleife bei 409-Konflikten
  // (siehe SyncMerge) auf max. 3 Versuche insgesamt, ohne Backoff — der Konfliktfall
  // ist menschen-zeitskaliert (zwei Geräte editieren im Sekundenbereich), keine
  // Serie von Retries mit Wartezeit nötig.
  async _pushToCloud(retriesLeft = 3) {
    if (!this.currentCharacter || this.currentCharacter.syncMode !== 'cloud') return;
    if (this._readOnlyView) return; // Meister-Ansicht eines fremden Charakters - Server wuerde ohnehin 403 liefern
    this._setSyncState('syncing');

    const expected = this.currentCharacter._syncMeta?.updatedAt || null;
    const r = await CloudSync.pushCharacter(this.currentCharacter, expected);

    if (r.ok) {
      this.currentCharacter._syncMeta.updatedAt = r.updatedAt;
      Storage._suppressPush = true;
      Storage.saveCharacter(this.currentCharacter);
      Storage._suppressPush = false;
      this._setSyncState('ok');
      return;
    }

    if (r.conflict && retriesLeft > 0) {
      // Jemand anderes hat zwischenzeitlich einen neueren Stand gespeichert –
      // lokal mergen (nicht blind überschreiben) und erneut versuchen.
      const mergedJson = SyncMerge.mergeCharacter(this.currentCharacter.toJSON(), r.serverData);
      this.currentCharacter = Character.fromJSON(mergedJson);
      this.currentCharacter._syncMeta.updatedAt = r.serverUpdatedAt;
      window.currentCharacter = this.currentCharacter;
      if (!this.editMode && !this._isBusyEditing()) this.renderCurrentPage();
      return this._pushToCloud(retriesLeft - 1);
    }

    this._setSyncState('error', r.conflict ? 'Sync-Konflikt, bitte erneut versuchen' : (r.error || 'Push-Fehler'));
  },

  // True, wenn der Nutzer gerade in einem Eingabefeld tippt. Poll-getriebene
  // Re-Renders (Cloud-/Kampagnen-Sync) werden dann übersprungen, damit laufende
  // Eingaben nicht weggerendert werden. Betrifft besonders die immer
  // editierbaren Werdegang-Hintergrundfelder ("Zitate & Phrasen" usw.), die auch
  // außerhalb des Bearbeitungsmodus (editMode=false) beschreibbar sind.
  _isEditingField() {
    const el = document.activeElement;
    return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable === true);
  },

  // Poll-getriebene Re-Renders pausieren, solange der Nutzer aktiv etwas
  // bearbeitet: tippt gerade in einem Feld ODER es ist ein Dialog/Modal offen.
  // Sonst würde der Re-Render das offene Modal wegwerfen — das war der Grund,
  // warum sich der Ausgabe-Dialog (Schiff- und Charakter-Finanzen) "von selbst"
  // nach ~15 s schloss (Sync-Poll rendert die Seite neu).
  _isBusyEditing() {
    if (this._isEditingField()) return true;
    return !!document.querySelector('.fin-modal-overlay.open, .vh-modal.visible, .traits-modal-overlay, .mention-popover-backdrop');
  },

  async _syncCloud() {
    if (!this.currentCharacter || this.currentCharacter.syncMode !== 'cloud') return;
    if (this.editMode || this._isBusyEditing()) return;
    if (Storage._pushTimer) {
      clearTimeout(Storage._pushTimer);
      Storage._pushTimer = null;
      await this._pushToCloud();
      if (this.editMode) return; // editMode kann sich während Push geändert haben
    }
    // Kein "Synchronisiere …" vorab: ob ueberhaupt Daten fliessen, weiss erst
    // die Antwort. Der onTransfer-Callback schaltet die Anzeige genau dann um,
    // wenn wirklich ein Body kommt (200) — der reine 304-Vergleich laesst die
    // Anzeige voellig in Ruhe. Pushes zeigen ihren Zustand selbst (_pushToCloud).
    const r = await CloudSync.pullCharacter(
      this.currentCharacter.id,
      this.currentCharacter._syncMeta?.updatedAt,
      () => this._setSyncState('syncing'),
    );
    if (r.ok && r.notModified) {
      // Server unveraendert seit dem letzten gesehenen Stand (304, kein Body).
      // Liegen noch nicht hochgeladene lokale Aenderungen an (z.B. weil der
      // Flush oben fehlgeschlagen ist), jetzt pushen statt faelschlich "ok"
      // zu melden — sonst zeigte der Header gruen, obwohl der Server die
      // Aenderungen nie bekommen hat.
      if (this._pendingPush) await this._pushToCloud();
      else this._setSyncState('ok');
      return;
    }
    if (r.ok) {
      if (this.editMode || this._isBusyEditing()) {
        // editMode gesetzt oder Nutzer tippt gerade (kann sich während des
        // Pulls geändert haben) – Charakter nicht ersetzen/neu rendern, sonst
        // ginge die laufende Eingabe verloren. Nächster Poll holt es nach.
        this._setSyncState('ok');
        return;
      }
      // Gemergt statt blind ersetzt: falls hier noch nicht gepushte lokale
      // Änderungen liegen (z.B. der Flush oben ist fehlgeschlagen), gehen sie
      // nicht verloren, sondern werden mit dem frischen Server-Stand vereint.
      const mergedJson = SyncMerge.mergeCharacter(this.currentCharacter.toJSON(), r.data);
      const cloudChar = Character.fromJSON(mergedJson);
      cloudChar._syncMeta.updatedAt = r.updatedAt;
      this.currentCharacter = cloudChar;
      window.currentCharacter = cloudChar;
      Storage._suppressPush = true;
      Storage.saveCharacter(cloudChar);
      Storage._suppressPush = false;
      this._updateHeaderName();
      this.renderCurrentPage();
      // Hat der Merge lokale, noch nicht gepushte Änderungen eingebracht,
      // weicht das Ergebnis vom Serverstand ab → direkt nachpushen statt
      // "ok" zu melden. Sonst zeigt der Header "✓ gesichert", obwohl der
      // Server die Änderungen nicht hat (z.B. nach Offline-Spiel oder
      // fehlgeschlagenem Push), bis zufällig der nächste Edit passiert.
      // _syncMeta wird für den Vergleich ausgeblendet: lokal und Server
      // tragen dort naturgemäß verschiedene Zeitstempel.
      const stripMeta = j => JSON.stringify({ ...j, _syncMeta: undefined });
      if (stripMeta(mergedJson) !== stripMeta(r.data)) {
        await this._pushToCloud();
        return;
      }
      this._setSyncState('ok');
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
    // Ein erfolgreicher Push/Pull heißt: nichts mehr ausstehend. Fehler lässt
    // die ausstehende Markierung stehen (Änderungen sind noch nicht gesichert).
    if (status === 'ok') this._pendingPush = false;
    this._updateSyncIndicator();
  },

  // Zeigt den Sync-Zustand DAUERHAFT im Header (und, falls sichtbar, im
  // Charakter-Tab-Badge). Unterscheidet ausdrücklich vier Fälle, damit man
  // sieht, ob wirklich alles auf dem Server ist:
  //   ✓ HH:MM:SS  – alle Änderungen erfolgreich gesichert (grün)
  //   ⭯ …         – Änderungen liegen an, werden gleich hochgeladen (gelb)
  //   Synchronisiere … – Übertragung läuft gerade
  //   ⚠ Nicht gesichert – Sync-Fehler, Änderungen noch NICHT auf dem Server (rot)
  _updateSyncIndicator() {
    const isCloud = this.currentCharacter?.syncMode === 'cloud';
    const { status, lastSync, error } = this._syncState;
    const pending = !!this._pendingPush;
    const t = lastSync
      ? lastSync.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      : '–';

    let cls, text, title;
    if (status === 'syncing') {
      cls = 'syncing'; text = '☁ Synchronisiere …'; title = 'Überträgt Änderungen zum Server …';
    } else if (status === 'error') {
      cls = 'error';   text = '☁ ⚠ Nicht gesichert';
      title = `Sync-Fehler: ${error || 'unbekannt'}${lastSync ? ` — zuletzt gesichert ${t}` : ''}`;
    } else if (pending) {
      cls = 'pending'; text = '☁ ● Ungesichert';    title = 'Änderungen werden gleich hochgeladen …';
    } else if (status === 'ok' && lastSync) {
      cls = 'ok';      text = `☁ ✓ ${t}`;           title = `Alle Änderungen gesichert um ${t}`;
    } else {
      cls = 'idle';    text = '☁ Cloud';            title = 'Cloud-Synchronisierung';
    }

    const header = document.getElementById('headerSyncStatus');
    if (header) {
      header.style.display = isCloud ? '' : 'none';
      if (isCloud) {
        header.className   = `header-sync-status header-sync-status--${cls}`;
        header.textContent = text;
        header.title       = title;
      }
    }

    // Der Badge im Charakter-Tab (nur dort im DOM) wird mitgeführt, falls sichtbar.
    const badge = document.getElementById('syncBadge');
    if (badge) {
      badge.className   = `sync-badge sync-badge--${cls === 'pending' ? 'syncing' : cls}`;
      badge.textContent = text;
    }
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
        if (this.currentCharacter?.campaignId) await this._syncCampaign();
      }
      reset();
    }, { passive: true });

    content.addEventListener('touchcancel', reset, { passive: true });
  },

  showCloudConfig() {
    const modal     = document.getElementById('cloudConfigModal');
    const step1     = document.getElementById('cfgStep1');
    const step2     = document.getElementById('cfgStep2');
    const stepConn  = document.getElementById('cfgStepConnected');
    const testEl    = document.getElementById('cfgTestResult');
    const loginEl   = document.getElementById('cfgLoginResult');
    const urlInput  = document.getElementById('cfgWorkerUrl');

    const stepSetPw = document.getElementById('cfgStepSetPw');
    const showStep = n => {
      step1.style.display     = n === 1 ? '' : 'none';
      step2.style.display     = n === 2 ? '' : 'none';
      stepSetPw.style.display = n === 'setpw' ? '' : 'none';
      stepConn.style.display  = n === 'connected' ? '' : 'none';
    };
    urlInput.value       = CloudSync.getWorkerUrl();
    testEl.textContent   = '';
    testEl.className     = 'nc-test-result';
    loginEl.textContent  = '';
    loginEl.className    = 'nc-test-result';
    modal.classList.add('visible');

    if (CloudSync.isConfigured()) {
      showStep('connected');
      this._refreshCloudConnectedState();
    } else {
      showStep(1);
    }

    document.getElementById('cfgTestBtn').onclick = async () => {
      const url = urlInput.value.trim();
      if (!url) { testEl.textContent = '⚠ URL angeben'; return; }
      const btn = document.getElementById('cfgTestBtn');
      btn.disabled = true;
      testEl.textContent = '⏳ Teste …';
      testEl.className   = 'nc-test-result';
      const r = await CloudSync.test(url);
      btn.disabled = false;
      if (r.ok) {
        testEl.textContent = '✓ Verbindung OK';
        testEl.className   = 'nc-test-result nc-test-ok';
      } else {
        testEl.textContent = `✗ Fehler (${r.status || r.error || 'Timeout'})`;
        testEl.className   = 'nc-test-result nc-test-error';
      }
    };

    document.getElementById('cfgNextBtn').onclick = () => showStep(2);
    document.getElementById('cfgBackBtn').onclick = () => showStep(1);

    document.getElementById('cfgLoginBtn').onclick = async () => {
      const url      = urlInput.value.trim();
      const email    = document.getElementById('cfgEmail').value.trim();
      const password = document.getElementById('cfgPassword').value;
      if (!email || password.length < 8) { loginEl.textContent = '⚠ E-Mail und Passwort (min. 8 Zeichen) angeben'; return; }
      const btn = document.getElementById('cfgLoginBtn');
      btn.disabled = true;
      loginEl.textContent = '⏳ Melde an …';
      loginEl.className   = 'nc-test-result';
      const r = await AuthAPI.login(url, email, password);
      btn.disabled = false;
      if (!r.ok) {
        loginEl.textContent = `✗ ${r.error || 'Anmeldung fehlgeschlagen'}`;
        loginEl.className   = 'nc-test-result nc-test-error';
        return;
      }
      // Erst-Login mit Setup-Token: der Server laesst diese Session an keine
      // andere Route, bis ein eigenes Passwort gesetzt ist (requirePasswordSet).
      if (r.mustChangePassword) {
        document.getElementById('cfgSetPw').value  = '';
        document.getElementById('cfgSetPw2').value = '';
        document.getElementById('cfgSetPwResult').textContent = '';
        this._pendingSetupToken = password;
        showStep('setpw');
        return;
      }
      modal.classList.remove('visible');
      this.showStatus('Angemeldet ✓', 'success');
      if (this.currentCharacter?.syncMode === 'cloud') this._pushToCloud();
      modal.dispatchEvent(new CustomEvent('configSaved'));
    };

    const finishConnected = () => {
      modal.classList.remove('visible');
      this.showStatus('Angemeldet ✓', 'success');
      if (this.currentCharacter?.syncMode === 'cloud') this._pushToCloud();
      modal.dispatchEvent(new CustomEvent('configSaved'));
    };

    document.getElementById('cfgSetPwBtn').onclick = async () => {
      const resultEl = document.getElementById('cfgSetPwResult');
      const pw  = document.getElementById('cfgSetPw').value;
      const pw2 = document.getElementById('cfgSetPw2').value;
      if (pw.length < 8)  { resultEl.textContent = '⚠ Mindestens 8 Zeichen'; resultEl.className = 'nc-test-result nc-test-error'; return; }
      if (pw !== pw2)     { resultEl.textContent = '⚠ Passwörter stimmen nicht überein'; resultEl.className = 'nc-test-result nc-test-error'; return; }
      const btn = document.getElementById('cfgSetPwBtn');
      btn.disabled = true;
      resultEl.textContent = '⏳ Setze Passwort …';
      resultEl.className   = 'nc-test-result';
      const r = await AuthAPI.changePassword(this._pendingSetupToken || '', pw);
      btn.disabled = false;
      if (!r.ok) {
        resultEl.textContent = `✗ ${r.error || 'Fehlgeschlagen'}`;
        resultEl.className   = 'nc-test-result nc-test-error';
        return;
      }
      this._pendingSetupToken = null;
      finishConnected();
    };

    document.getElementById('cfgChangePwBtn').onclick = async () => {
      const resultEl = document.getElementById('cfgPwResult');
      const cur = document.getElementById('cfgCurrentPw').value;
      const nw  = document.getElementById('cfgNewPw').value;
      if (nw.length < 8) { resultEl.textContent = '⚠ Neues Passwort min. 8 Zeichen'; resultEl.className = 'nc-test-result nc-test-error'; return; }
      const btn = document.getElementById('cfgChangePwBtn');
      btn.disabled = true;
      resultEl.textContent = '⏳ Ändere …';
      resultEl.className   = 'nc-test-result';
      const r = await AuthAPI.changePassword(cur, nw);
      btn.disabled = false;
      if (!r.ok) {
        resultEl.textContent = `✗ ${r.error || 'Fehlgeschlagen'}`;
        resultEl.className   = 'nc-test-result nc-test-error';
        return;
      }
      document.getElementById('cfgCurrentPw').value = '';
      document.getElementById('cfgNewPw').value     = '';
      resultEl.textContent = '✓ Passwort geändert';
      resultEl.className   = 'nc-test-result nc-test-ok';
    };

    document.getElementById('cfgLogoutBtn').onclick = async () => {
      const btn = document.getElementById('cfgLogoutBtn');
      btn.disabled = true;
      const { purgedIds } = await AuthAPI.logout();
      btn.disabled = false;
      this.showStatus('Abgemeldet - Cloud-Charaktere lokal entfernt', 'info');

      if (this.currentCharacter && purgedIds.includes(this.currentCharacter.id)) {
        // Der aktuell geladene Charakter gehoerte zum jetzt abgemeldeten
        // Account und wurde soeben aus IndexedDB entfernt - auf einen
        // verbleibenden (rein lokalen) Charakter wechseln oder den
        // Willkommen-Dialog zeigen, statt mit einer Karteileiche weiterzuarbeiten.
        this._stopCloudPoll();
        this._stopCampaignPoll();
        this.currentCharacter = null;
        this._campaignData = null;
        modal.classList.remove('visible');
        const remaining = Storage.listCharacters();
        if (remaining.length > 0) this.loadCharacter(remaining[0].id);
        else this.showLoadCharDialog(true);
      } else {
        urlInput.value = CloudSync.getWorkerUrl();
        showStep(1);
      }
    };
  },

  // Zeigt im bereits-verbunden-Zustand des Cloud-Dialogs automatisch das
  // Testergebnis + den angemeldeten Nutzer. GET /auth/me dient als
  // kombinierter Verbindungs-/Session-Test: 200 bestaetigt Erreichbarkeit
  // UND einen noch gueltigen Token in einem Aufruf; 401 zeigt eine
  // abgelaufene/widerrufene Session, alles andere einen Verbindungsfehler.
  async _refreshCloudConnectedState() {
    const connTestEl = document.getElementById('cfgConnTestResult');
    const roleLabels = { gm: 'Meister', admin: 'Administrator' };
    document.getElementById('cfgConnUrl').textContent = CloudSync.getWorkerUrl();
    connTestEl.textContent = '⏳ Teste …';
    connTestEl.className   = 'nc-test-result';

    const r = await AuthAPI.me();
    if (r.ok) {
      connTestEl.textContent = '✓ Verbindung OK';
      connTestEl.className   = 'nc-test-result nc-test-ok';
      document.getElementById('cfgConnEmail').textContent = r.email;
      document.getElementById('cfgConnRoles').innerHTML =
        r.roles.map(role => `<span class="role-badge">${roleLabels[role] || role}</span>`).join('');
    } else if (r.expired) {
      connTestEl.textContent = '✗ Sitzung abgelaufen - bitte erneut anmelden';
      connTestEl.className   = 'nc-test-result nc-test-error';
      CloudSync.setApiKey('');
      document.getElementById('cfgStep1').style.display    = '';
      document.getElementById('cfgStepConnected').style.display = 'none';
    } else {
      connTestEl.textContent = `✗ Fehler (${r.status || r.error || 'Timeout'})`;
      connTestEl.className   = 'nc-test-result nc-test-error';
      document.getElementById('cfgConnEmail').textContent = '(unbekannt, keine Verbindung)';
      document.getElementById('cfgConnRoles').innerHTML = '';
    }
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

  // true wenn Version a kleiner als b ist (numerischer Vergleich je Punktteil,
  // fehlende Teile zählen als 0 — "3.18" < "3.18.1").
  _versionLt(a, b) {
    const pa = String(a).split('.').map(n => parseInt(n) || 0);
    const pb = String(b).split('.').map(n => parseInt(n) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
      const x = pa[i] || 0, y = pb[i] || 0;
      if (x !== y) return x < y;
    }
    return false;
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
      // Import-Versionswächter (Multi-System Phase 0): Exporte mit Feldern,
      // die ältere App-Stände beim Import verwerfen würden, tragen ein
      // _minAppVersion (siehe MetadataPage._exportJSON). Eine zu alte
      // Installation lehnt den Import ab, statt still Daten zu verlieren.
      if (data._minAppVersion && this._versionLt(APP_VERSION, data._minAppVersion)) {
        this.showStatus(`Import benötigt App-Version ${data._minAppVersion} (installiert: v${APP_VERSION}) — bitte erst aktualisieren`, 'error');
        return;
      }
      delete data._minAppVersion; // Export-Metadatum, gehört nicht in den Charakter
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
      if (!this.editMode && !this._isBusyEditing()) this.renderCurrentPage();
    }
    if (this.currentCharacter?.syncMode === 'cloud' && CloudSync.isConfigured()) {
      // _etag stammt aus der letzten Server-Antwort und liegt mit im
      // Storage-Cache — bei unveraendertem Server kommt 304 und der lokale
      // Stand bleibt einfach stehen.
      const r = await CampaignSync.getCampaign(campaignId, local?._etag);
      if (r.ok && !r.notModified) {
        this._campaignData = r.data;
        Storage.saveCampaign(r.data);
        if (!this.editMode && !this._isBusyEditing()) this.renderCurrentPage();
      }
      if (r.ok) this._startCampaignPoll(campaignId);
    }
  },

  async _syncCampaign() {
    if (!this.currentCharacter?.campaignId || !CloudSync.isConfigured()) return;
    const r = await CampaignSync.getCampaign(this.currentCharacter.campaignId, this._campaignData?._etag);
    // 304: Server unveraendert seit dem letzten Poll — Merge-Backs und
    // Re-Render entfallen komplett (haetten mit identischen Daten ohnehin
    // nichts getan). Eigene Aenderungen pushen ihre eigenen Flows.
    if (r.ok && r.notModified) return;
    if (r.ok) {
      this._campaignData = r.data;
      Storage.saveCampaign(r.data);
      this._mergeCampaignShipRoles();
      this._mergeCampaignShipsBack();
      this._mergeCampaignNotesBack();
      // Ohne dieses Speichern leben die Merge-Ergebnisse oben nur im Speicher:
      // ein Reload/Neustart der App vor der naechsten Autosave-Aktion wuerde
      // sie verwerfen (IndexedDB haette noch den alten Stand) und z.B. ein
      // bereits adoptiertes, inzwischen zurueckgenommenes Schiff waere nach
      // Reload wieder da. saveCharacter() hat einen eingebauten Dirty-Check,
      // ist also ein guenstiges No-Op, wenn sich nichts geaendert hat.
      if (this.currentCharacter) Storage.saveCharacter(this.currentCharacter);
      if (!this.editMode && !this._isBusyEditing() && (this.currentPage === 'notes' || this.currentPage === 'metadata' || this.currentPage === 'ship')) {
        this.renderCurrentPage();
      }
    }
  },

  // Kampagnen-Inhalte sind gemeinschaftlich (siehe NotesPage._findEntry): ein
  // Mitspieler kann einen von mir erstellten Eintrag bearbeitet haben. Ohne
  // diesen Schritt würde mein eigenes Gerät die fremde Änderung nie sehen,
  // weil der Poll bisher nur _campaignData aktualisiert hat (das steuert nur
  // die "externe", nie selbst berührte Anzeige) - eigene notes[]-Einträge
  // wurden dagegen als alleine von mir änderbar behandelt. Nur bereits lokal
  // vorhandene Einträge werden abgeglichen (per id, neuere updatedAt gewinnt);
  // rein fremde, nie von mir berührte Einträge bleiben bewusst nur in
  // _campaignData/_extEntries() sichtbar, nicht automatisch übernommen.
  //
  // Guard "local.isCampaign": ohne diesen wuerde ein gerade erst lokal auf
  // privat gestelltes Item (isCampaign=false) durch den eigenen, kurz danach
  // gepushten Unshare-Tombstone (siehe _syncMyCampaignEntries) beim naechsten
  // Poll wieder ueberschrieben - der Tombstone traegt einen minimal spaeteren
  // updatedAt-Stempel als das lokale Speichern selbst und wuerde _pickNewer()
  // sonst fuer sich entscheiden. isCampaign=false ist ein bewusstes "das ist
  // jetzt wieder meine private Kopie, vom Kampagnen-Pool nicht mehr anfassen".
  _mergeCampaignNotesBack() {
    const char        = this.currentCharacter;
    const remoteNotes = this._campaignData?.notes;
    if (!char?.notes || !remoteNotes) return;
    for (const tab of ['sessions', 'persons', 'locations', 'quests']) {
      const remoteList = remoteNotes[tab];
      if (!Array.isArray(remoteList) || !Array.isArray(char.notes[tab])) continue;
      char.notes[tab] = char.notes[tab].map(local => {
        if (!local.isCampaign) return local;
        const remote = remoteList.find(r => r.id === local.id);
        return remote ? SyncMerge._pickNewer(local, remote) : local;
      });
    }
  },

  // Übernimmt crewRoles anderer Charaktere aus dem Kampagnen-Stand in lokal bekannte Schiffe,
  // ohne den eigenen (noch nicht zwingend hochgeladenen) Eintrag zu überschreiben.
  _mergeCampaignShipRoles() {
    const char        = this.currentCharacter;
    const remoteShips = this._campaignData?.ships;
    if (!char?.ships?.length || !Array.isArray(remoteShips)) return;
    char.ships.forEach(local => {
      if (!local.isCampaign) return;
      const remote = remoteShips.find(r => r.id === local.id);
      if (!remote?.crewRoles) return;
      local.crewRoles = { ...remote.crewRoles, ...(local.crewRoles?.[char.id] ? { [char.id]: local.crewRoles[char.id] } : {}) };
    });
  },

  // Analog zu _mergeCampaignNotesBack, aber fuer Schiffe: ein per Dropdown
  // "adoptiertes" fremdes Schiff (siehe #shipSelect "ext:"-Handler) landet
  // sofort in char.ships und ist ab dann komplett unabhaengig vom Kampagnen-
  // Pool - ohne diesen Merge-Schritt wuerde die adoptierende Person nie
  // mitbekommen, wenn der urspruengliche Besitzer das Schiff wieder auf
  // privat stellt oder loescht (Bug: Schiff bleibt bei allen Mitspielern
  // sichtbar, obwohl "nicht mehr in der Kampagne"). _mergeShip() statt
  // _pickNewer(), weil Schiffe zusaetzlich Waffen/Finanzen feldweise
  // brauchen. Gleicher isCampaign-Guard wie bei den Notizen: eine bereits
  // lokal auf privat gestellte eigene Kopie bleibt unangetastet.
  _mergeCampaignShipsBack() {
    const char        = this.currentCharacter;
    const remoteShips = this._campaignData?.ships;
    if (!Array.isArray(char?.ships) || !Array.isArray(remoteShips)) return;
    char.ships = char.ships.map(local => {
      if (!local.isCampaign) return local;
      const remote = remoteShips.find(r => r.id === local.id);
      return remote ? SyncMerge._mergeShip(local, remote) : local;
    });
  },

  // Push der eigenen Kampagnen-Eintraege. Der Server merged sie atomar gegen
  // den aktuellen Stand (siehe backend/db.js updateCampaignNotes) - kein
  // GET-vor-PUT mehr noetig, das war die Race-Luecke zwischen zwei Spielern.
  //
  // Eintraege, die lokal nicht (mehr) "In Kampagne teilen" gesetzt sind, aber
  // noch im Kampagnen-Pool stehen (weil sie frueher mal geteilt waren), werden
  // hier NICHT einfach weggelassen - sonst bleibt die veraltete geteilte Kopie
  // fuer alle anderen Mitglieder fuer immer sichtbar, das Zuruecknehmen von
  // "In Kampagne teilen" hat serverseitig nie einen Effekt (Bug: Eintrag als
  // privat markiert, taucht trotzdem bei anderen Spielern auf). Stattdessen
  // wird ein minimaler Tombstone gepusht, der die alte Pool-Kopie per
  // _pickNewer() (neueres updatedAt gewinnt) ersetzt, ohne den lokalen,
  // weiterhin vorhandenen Eintrag selbst zu loeschen.
  async _syncMyCampaignEntries() {
    const char = this.currentCharacter;
    if (!char?.campaignId || char.syncMode !== 'cloud' || !CloudSync.isConfigured()) return;
    const notes   = char.notes || {};
    const pool    = this._campaignData?.notes || {};
    const entries = {};
    const now     = new Date().toISOString();
    for (const tab of ['sessions', 'persons', 'locations', 'quests']) {
      const list     = notes[tab] || [];
      const shared   = list.filter(e => e.isCampaign);
      const poolIds  = new Set((pool[tab] || []).filter(e => !e._deleted).map(e => e.id));
      const unshared = list
        .filter(e => !e.isCampaign && poolIds.has(e.id))
        .map(e => ({ id: e.id, _deleted: true, deletedAt: now, updatedAt: now }));
      entries[tab] = [...shared, ...unshared];
    }
    const result = await CampaignSync.updateNotes(char.campaignId, entries);
    if (result.ok && this._campaignData) this._campaignData.notes = result.data;
  },

  // Push der eigenen Kampagnen-Schiffe. crewRoles-Merge (fremde Eintraege
  // behalten, nur den eigenen ueberschreiben) und Waffen/Finanzen-Merge
  // laufen jetzt serverseitig in derselben Transaktion (siehe
  // backend/db.js updateCampaignShips).
  //
  // Gleiches Unshare-Tombstone-Prinzip wie in _syncMyCampaignEntries oben.
  async _syncMyCampaignShips() {
    const char = this.currentCharacter;
    if (!char?.campaignId || char.syncMode !== 'cloud' || !CloudSync.isConfigured()) return;
    const now      = new Date().toISOString();
    const poolIds  = new Set((this._campaignData?.ships || []).filter(s => !s._deleted).map(s => s.id));
    const myShips  = (char.ships || []).filter(s => s.isCampaign);
    const unshared = (char.ships || [])
      .filter(s => !s.isCampaign && poolIds.has(s.id))
      .map(s => ({ id: s.id, _deleted: true, deletedAt: now, updatedAt: now }));
    const result  = await CampaignSync.updateShips(char.campaignId, char.id, [...myShips, ...unshared]);
    if (!result.ok) return;
    if (this._campaignData) this._campaignData.ships = result.data;

    // Gemergte crewRoles auch lokal übernehmen, statt auf den nächsten Poll zu warten
    result.data.forEach(s => {
      const local = char.ships.find(cs => cs.id === s.id);
      if (local) local.crewRoles = s.crewRoles;
    });
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
    // Der Beitritts-Code ist das einzige, was Mitspieler zum Beitreten
    // brauchen - er steht dauerhaft im Kampagnen-Panel (Charakter-Tab), hier
    // einmal prominent, damit der Ersteller ihn direkt weitergeben kann.
    if (r.data?.joinCode) {
      alert(`Kampagne „${name}" erstellt.\n\nBeitritts-Code für deine Mitspieler:\n\n    ${r.data.joinCode}\n\n(Später jederzeit im Kampagnen-Panel auf dem Charakter-Tab sichtbar.)`);
    }
  },

  async joinCampaign() {
    const char = this.currentCharacter;
    if (!char) return;
    const id = (document.getElementById('campaignJoinId').value.trim() || '').toLowerCase();
    const joinCode = document.getElementById('campaignJoinCode').value.trim();
    if (!id) { this.showStatus('Bitte Kampagnen-ID eingeben', 'error'); return; }
    if (!joinCode) { this.showStatus('Bitte Beitritts-Code eingeben', 'error'); return; }
    const btn = document.getElementById('campaignJoinBtn');
    btn.disabled = true;
    const r = await CampaignSync.join(id, char.id, joinCode);
    btn.disabled = false;
    if (r.notFound) { this.showStatus('Kampagne nicht gefunden', 'error'); return; }
    if (r.status === 403) { this.showStatus('Falscher oder fehlender Beitritts-Code', 'error'); return; }
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
      const statusLabel = !c.mine ? '🔒 Nur lesen (Meister)' : (isLocal ? '✓ Lokal vorhanden' : '⬇ Laden');
      return `
        <button class="cloud-char-item" data-id="${this._esc(c.id)}" data-mine="${c.mine}">
          <span class="cloud-char-name">${this._esc(c.name || 'Namenlos')}</span>
          <span class="cloud-char-status">${statusLabel}</span>
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

        const isMine = btn.dataset.mine === 'true';
        const char = Character.fromJSON(r.data);
        Storage.saveCharacter(char);
        modal.classList.remove('visible');
        this.loadCharacter(char.id, !isMine);
        this.updateEditButton();
        this.showStatus(`„${char.metadata.name || 'Charakter'}" geladen ✓${isMine ? '' : ' (nur lesen)'}`, 'success');
      });
    });
  },
};

document.addEventListener('DOMContentLoaded', async () => {
  await Storage.init();
  App.init();
});
