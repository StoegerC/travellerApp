/**
 * Storage – IndexedDB-Backend mit synchronem In-Memory-Cache.
 *
 * Öffentliche API bleibt vollständig synchron (saveCharacter, loadCharacter,
 * listCharacters, deleteCharacter). Einzig Storage.init() ist async und muss
 * einmalig beim App-Start awaited werden.
 *
 * Später auf einen Cloud-Provider wechseln:
 *   1. SyncProvider implementieren (push/pull/list mit gleicher Signatur)
 *   2. Storage._persist / Storage._delete gegen den Provider tauschen
 *   → Kein weiterer Code muss angefasst werden.
 */
const Storage = {
  _DB_NAME:        'traveller_charsheet',
  _DB_VERSION:     2,
  _STORE:          'characters',
  _VERSION_STORE:  'character_versions',
  _LS_KEY:         'traveller_characters', // nur für Migration
  _MAX_VERSIONS:   30,
  lastError:       null,
  _db:             null,
  _cache:          [], // rohe JSON-Objekte aller Charaktere

  // ── Initialisierung ────────────────────────────────────────────────────
  async init() {
    this._db    = await this._openDB();
    this._cache = await this._loadAllFromDB();
    await this._migrateFromLocalStorage();
  },

  _openDB() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this._DB_NAME, this._DB_VERSION);
      req.onupgradeneeded = e => {
        const db = e.target.result;
        const oldVer = e.oldVersion;
        if (oldVer < 1) db.createObjectStore(this._STORE, { keyPath: 'id' });
        if (oldVer < 2) db.createObjectStore(this._VERSION_STORE, { keyPath: 'id' });
      };
      req.onsuccess = e => resolve(e.target.result);
      req.onerror   = e => reject(e.target.error);
    });
  },

  _loadAllFromDB() {
    return new Promise((resolve, reject) => {
      const req = this._db
        .transaction(this._STORE)
        .objectStore(this._STORE)
        .getAll();
      req.onsuccess = e => resolve(e.target.result || []);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async _migrateFromLocalStorage() {
    const raw = localStorage.getItem(this._LS_KEY);
    if (!raw) return;
    try {
      const chars = JSON.parse(raw);
      for (const c of chars) {
        if (!this._cache.find(x => x.id === c.id)) {
          this._cache.push(c);
          await this._writeToDB(c);
        }
      }
      localStorage.removeItem(this._LS_KEY);
      console.info('Migration von localStorage nach IndexedDB abgeschlossen.');
    } catch (e) {
      console.error('Migration fehlgeschlagen:', e);
    }
  },

  // ── Interne DB-Operationen (async, fire-and-forget von außen) ──────────
  _writeToDB(json) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this._STORE, 'readwrite');
      tx.objectStore(this._STORE).put(json);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  },

  _deleteFromDB(id) {
    return new Promise((resolve, reject) => {
      const tx = this._db.transaction(this._STORE, 'readwrite');
      tx.objectStore(this._STORE).delete(id);
      tx.oncomplete = resolve;
      tx.onerror    = e => reject(e.target.error);
    });
  },

  // ── Öffentliche API (synchron via Cache) ───────────────────────────────
  saveCharacter(character) {
    this.lastError = null;
    try {
      const json = character.toJSON();
      const idx  = this._cache.findIndex(c => c.id === json.id);
      if (idx >= 0) this._cache[idx] = json;
      else          this._cache.push(json);

      this._writeToDB(json).catch(e => {
        console.error('IndexedDB Schreibfehler:', e);
        this.lastError = e;
      });
      return true;
    } catch (e) {
      console.error('Fehler beim Speichern:', e);
      this.lastError = e;
      return false;
    }
  },

  loadCharacter(id) {
    const data = this._cache.find(c => c.id === id);
    return data ? Character.fromJSON(data) : null;
  },

  getAllCharacters() {
    return this._cache.map(c => Character.fromJSON(c));
  },

  listCharacters() {
    return this._cache
      .map(c => ({ id: c.id, name: c.metadata?.name || 'Namenlos' }))
      .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  },

  deleteCharacter(id) {
    this._cache = this._cache.filter(c => c.id !== id);
    this._deleteFromDB(id).catch(e => console.error('IndexedDB Löschfehler:', e));
    this.deleteVersionsForChar(id);
  },

  // ── Versionsverlauf ────────────────────────────────────────────────────
  saveVersion(charId, json) {
    if (!this._db) return;
    const version = { id: `${charId}_${Date.now()}`, charId, timestamp: Date.now(), data: json };
    const tx = this._db.transaction(this._VERSION_STORE, 'readwrite');
    tx.objectStore(this._VERSION_STORE).put(version);
    tx.oncomplete = () => this._pruneVersions(charId);
  },

  listVersions(charId) {
    if (!this._db) return Promise.resolve([]);
    return new Promise((resolve, reject) => {
      const req = this._db.transaction(this._VERSION_STORE)
        .objectStore(this._VERSION_STORE).getAll();
      req.onsuccess = e => resolve(
        (e.target.result || [])
          .filter(v => v.charId === charId)
          .sort((a, b) => b.timestamp - a.timestamp)
      );
      req.onerror = e => reject(e.target.error);
    });
  },

  loadVersion(versionId) {
    if (!this._db) return Promise.resolve(null);
    return new Promise((resolve, reject) => {
      const req = this._db.transaction(this._VERSION_STORE)
        .objectStore(this._VERSION_STORE).get(versionId);
      req.onsuccess = e => resolve(e.target.result || null);
      req.onerror   = e => reject(e.target.error);
    });
  },

  async _pruneVersions(charId) {
    const versions = await this.listVersions(charId);
    if (versions.length <= this._MAX_VERSIONS) return;
    const toDelete = versions.slice(this._MAX_VERSIONS);
    const tx = this._db.transaction(this._VERSION_STORE, 'readwrite');
    const store = tx.objectStore(this._VERSION_STORE);
    toDelete.forEach(v => store.delete(v.id));
  },

  async deleteVersionsForChar(charId) {
    const versions = await this.listVersions(charId);
    if (!versions.length) return;
    const tx = this._db.transaction(this._VERSION_STORE, 'readwrite');
    const store = tx.objectStore(this._VERSION_STORE);
    versions.forEach(v => store.delete(v.id));
  },
};
