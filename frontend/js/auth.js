/**
 * AuthAPI – Login/Logout gegen das selbst gehostete Backend (Phase 3).
 * Nutzt dieselbe Server-URL wie CloudSync. Der zurückgegebene Session-Token
 * wird über CloudSync.setApiKey() im selben localStorage-Mechanismus
 * abgelegt, den cloudsync.js/campaign.js/filesync.js ohnehin schon für den
 * Authorization-Header verwenden - keine Änderung an diesen Dateien nötig.
 */
const AuthAPI = {

  // Body: { email, password }. Setzt bei Erfolg automatisch Server-URL/Token
  // in CloudSync, damit direkt danach synchronisiert werden kann.
  async login(workerUrl, email, password) {
    try {
      const res = await fetch(`${workerUrl.replace(/\/$/, '')}/auth/login`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
        signal:  AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        const message = await res.text().catch(() => '');
        return { ok: false, status: res.status, error: message || 'Anmeldung fehlgeschlagen' };
      }
      const data = await res.json();
      CloudSync.setWorkerUrl(workerUrl);
      CloudSync.setApiKey(data.token);
      return { ok: true, email: data.email, roles: data.roles || [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // Dient dem Cloud-Einstellungen-Dialog als kombinierter Verbindungs-/
  // Session-Test fuer bereits angemeldete Nutzer (siehe App.showCloudConfig).
  async me() {
    if (!CloudSync.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const res = await fetch(`${CloudSync.getWorkerUrl()}/auth/me`, {
        headers: CloudSync._headers(),
        signal:  AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status, expired: res.status === 401 };
      const data = await res.json();
      return { ok: true, email: data.email, roles: data.roles || [] };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async logout() {
    if (!CloudSync.isConfigured()) return { ok: true };
    try {
      await fetch(`${CloudSync.getWorkerUrl()}/auth/logout`, {
        method:  'POST',
        headers: CloudSync._headers(),
        signal:  AbortSignal.timeout(5000),
      });
    } catch { /* Logout ist best effort - lokale Session wird trotzdem entfernt */ }
    CloudSync.setApiKey('');
    return { ok: true };
  },
};
