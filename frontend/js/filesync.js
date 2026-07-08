/**
 * FileSync – Upload/Download/Löschen echter Dateien (Phase 2), ersetzt
 * eingebettete Base64-Bilder im Charakter-/Kampagnen-JSON durch eine kurze
 * Datei-ID. Nutzt dieselben Zugangsdaten wie CloudSync (Worker-URL + API-Key).
 *
 * getUrl() liefert einen oeffentlichen Link ohne Authorization-Header, weil
 * <img src="..."> keinen Header mitschicken kann - die ID selbst ist eine
 * lange Zufallszeichenkette (siehe backend/routes/files.js).
 */
const FileSync = {

  // meta = { ownerType: 'character'|'campaign', ownerId, field, refId }
  async upload(file, meta) {
    if (!CloudSync.isConfigured()) return { ok: false, error: 'Nicht konfiguriert' };
    try {
      const form = new FormData();
      form.append('file', file);
      for (const [k, v] of Object.entries(meta || {})) {
        if (v != null) form.append(k, v);
      }
      const res = await fetch(`${CloudSync.getWorkerUrl()}/files`, {
        method:  'POST',
        headers: CloudSync._headers(), // kein Content-Type - Browser setzt die Multipart-Boundary selbst
        body:    form,
        // 100-MB-PDFs (siehe backend/routes/files.js Limit) brauchen auf
        // langsameren Verbindungen (Tailscale Funnel, mobiles Netz) deutlich
        // laenger als die vorherigen 30s - siehe auch das 30s-Timeout bei
        // CampaignSync.getCampaign fuer dieselbe Klasse Problem bei grossen Payloads.
        signal:  AbortSignal.timeout(300000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // Datei-IDs kommen ausschliesslich vom Server (crypto.randomBytes(16) als
  // Hex, siehe backend/routes/files.js) - alles andere ist manipulierter
  // Datenbestand (JSON-Import, Kampagnen-Sync von Mitspielern) und wird hier
  // zentral abgewiesen, bevor die ID in ein src/href-Attribut interpoliert wird.
  _ID_RE: /^[a-f0-9]{16,64}$/i,

  getUrl(fileId) {
    if (!fileId || !this._ID_RE.test(String(fileId))) return null;
    return `${CloudSync.getWorkerUrl()}/files/${fileId}`;
  },

  async remove(fileId) {
    // Gleiche ID-Validierung wie getUrl(): verhindert, dass eine manipulierte
    // "Datei-ID" wie "../char/<id>" per Pfad-Traversal einen ganz anderen
    // DELETE-Endpunkt trifft.
    if (!fileId || !this._ID_RE.test(String(fileId)) || !CloudSync.isConfigured()) return { ok: false };
    try {
      const res = await fetch(`${CloudSync.getWorkerUrl()}/files/${fileId}`, {
        method:  'DELETE',
        headers: CloudSync._headers(),
        signal:  AbortSignal.timeout(5000),
      });
      return { ok: res.ok };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
