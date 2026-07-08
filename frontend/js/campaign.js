/**
 * CampaignSync – Kampagnen-Kommunikation mit dem Cloudflare Worker
 * Nutzt dieselben Zugangsdaten wie CloudSync (Worker-URL + API-Key).
 */
const CampaignSync = {

  _url(path) {
    return `${CloudSync.getWorkerUrl()}${path}`;
  },

  _headers() {
    return CloudSync._headers();
  },

  async listCampaigns() {
    try {
      const res = await fetch(this._url('/campaigns'), {
        headers: this._headers(),
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async getCampaign(id) {
    try {
      const res = await fetch(this._url(`/campaign/${id}`), {
        headers: this._headers(),
        // Kampagnen-Dokumente buendeln Notizen/Schiffe mehrerer Spieler (inkl.
        // eingebetteter Bilder) und koennen mehrere MB gross werden - 5s ist
        // hier zu knapp bemessen, siehe cloudsync.js pullCharacter() fuer den
        // Bug, den ein zu kurzes/fehlendes Timeout bei grossen Payloads macht.
        signal: AbortSignal.timeout(30000),
      });
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // charId: der eigene Charakter, der als erstes Mitglied beitritt. Der
  // Kampagnen-"Besitzer" (darf löschen/Mitglieder kicken) wird seit Phase 3
  // serverseitig aus der Session ermittelt, nicht mehr hier übergeben.
  async createCampaign(id, name, charId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}`), {
        method:  'POST',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, charId }),
        signal:  AbortSignal.timeout(5000),
      });
      if (res.status === 409) return { ok: false, conflict: true };
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // entries = { sessions, persons, locations, quests } – nur die eigenen
  // (isCampaign-geflaggten) Eintraege, der Server merged sie atomar gegen
  // den aktuellen Stand (siehe backend/db.js updateCampaignNotes). Antwort
  // enthaelt den gemergten Stand, damit der Aufrufer den lokalen Cache ohne
  // Warten auf den naechsten Poll aktualisieren kann.
  async updateNotes(id, entries) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/notes`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ entries }),
        signal:  AbortSignal.timeout(30000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // ships = die eigenen (isCampaign-geflaggten) Schiffe des Charakters, siehe
  // backend/db.js updateCampaignShips fuer die crewRoles-Merge-Semantik.
  async updateShips(id, charId, ships) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/ships`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ charId, ships }),
        signal:  AbortSignal.timeout(30000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  // joinCode: seit der Sicherheitshaertung Pflicht fuer Nicht-Mitglieder
  // (siehe backend/routes/campaigns.js) - ohne gueltigen Code antwortet der
  // Server mit 403.
  async join(id, charId, joinCode) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/join`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ charId, joinCode }),
        signal:  AbortSignal.timeout(5000),
      });
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async leave(id, charId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/leave`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ charId }),
        signal:  AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async kickMember(id, charId, requesterId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/member/${charId}`), {
        method:  'DELETE',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requesterId }),
        signal:  AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async deleteCampaign(id, requesterId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}`), {
        method:  'DELETE',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ requesterId }),
        signal:  AbortSignal.timeout(5000),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
