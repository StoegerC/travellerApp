/**
 * CloudSync – Kommunikation mit dem Cloudflare Worker
 *
 * Konfiguration wird einmalig in localStorage gespeichert:
 *   traveller_worker_url  – z.B. https://traveller-sync.name.workers.dev
 *   traveller_cloud_key   – Bearer-Token
 */
const CloudSync = {

  // ── Konfiguration ─────────────────────────────────────────────────────────

  getWorkerUrl() { return localStorage.getItem('traveller_worker_url') || ''; },
  getApiKey()    { return localStorage.getItem('traveller_cloud_key')  || ''; },

  setWorkerUrl(url) { localStorage.setItem('traveller_worker_url', url.replace(/\/$/, '')); },
  setApiKey(key)    { localStorage.setItem('traveller_cloud_key',  key); },

  isConfigured() { return !!(this.getWorkerUrl() && this.getApiKey()); },

  _headers() {
    return {
      'Authorization': `Bearer ${this.getApiKey()}`,
      'Content-Type':  'application/json',
    };
  },

  // ── Verbindungstest ────────────────────────────────────────────────────────

  async test(workerUrl, apiKey) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/char/__ping__`, {
        headers: { 'Authorization': `Bearer ${apiKey}` },
        signal: AbortSignal.timeout(5000),
      });
      // 404 = Worker erreichbar + Auth OK (Charakter __ping__ existiert nicht)
      return { ok: res.status === 404 || res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ── Charakter ─────────────────────────────────────────────────────────────

  async pushCharacter(character) {
    if (!this.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const res = await fetch(`${this.getWorkerUrl()}/char/${character.id}`, {
        method:  'PUT',
        headers: this._headers(),
        body:    JSON.stringify(character.toJSON()),
      });
      return { ok: res.ok, status: res.status };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async pullCharacter(charId) {
    if (!this.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const res = await fetch(`${this.getWorkerUrl()}/char/${charId}`, {
        headers: this._headers(),
      });
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok)            return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async listCharacters() {
    if (!this.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const res = await fetch(`${this.getWorkerUrl()}/chars`, {
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, data };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async deleteCharacter(charId) {
    if (!this.isConfigured()) return { ok: false };
    try {
      const res = await fetch(`${this.getWorkerUrl()}/char/${charId}`, {
        method:  'DELETE',
        headers: this._headers(),
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
