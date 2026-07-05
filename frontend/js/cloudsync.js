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
    return { 'Authorization': `Bearer ${this.getApiKey()}` };
  },

  // ── Verbindungstest ────────────────────────────────────────────────────────

  async test(workerUrl, apiKey) {
    if (!/^https?:\/\/.+/.test(workerUrl)) {
      return { ok: false, error: 'URL muss mit https:// beginnen' };
    }
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

  // expectedUpdatedAt: zuletzt bekannter Server-Stand (Character._syncMeta.updatedAt).
  // Weicht der aktuelle Serverstand davon ab, antwortet der Server mit 409 statt zu
  // überschreiben (optimistische Sperre) — Aufrufer muss dann mergen und erneut pushen.
  async pushCharacter(character, expectedUpdatedAt = null) {
    if (!this.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const headers = { ...this._headers(), 'Content-Type': 'application/json' };
      if (expectedUpdatedAt) headers['If-Unmodified-Since-Version'] = expectedUpdatedAt;
      const res = await fetch(`${this.getWorkerUrl()}/char/${character.id}`, {
        method:  'PUT',
        headers,
        body:    JSON.stringify(character.toJSON()),
        // Grosszuegig bemessen (nicht die 5s wie bei den leichten Aufrufen unten):
        // Charaktere mit eingebetteten Base64-Bildern koennen mehrere MB gross
        // sein, ein PUT darueber via Tailscale Funnel kann legitim langsam sein.
        // Ohne Timeout blieb ein haengender Request fuer immer bei "syncing"
        // stehen, ohne je einen Fehler zu zeigen (siehe Bugreport Solan Hellgard).
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 409) {
        const body = await res.json();
        return { ok: false, conflict: true, serverData: body.data, serverUpdatedAt: body.updatedAt };
      }
      if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
      return { ok: true, updatedAt: res.headers.get('X-Updated-At') };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async pullCharacter(charId) {
    if (!this.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const res = await fetch(`${this.getWorkerUrl()}/char/${charId}`, {
        headers: this._headers(),
        signal:  AbortSignal.timeout(30000), // siehe pushCharacter() fuer Begruendung
      });
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok)            return { ok: false, status: res.status };
      const data = await res.json();
      return { ok: true, data, updatedAt: res.headers.get('X-Updated-At') };
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
