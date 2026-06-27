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
        signal: AbortSignal.timeout(5000),
      });
      if (res.status === 404) return { ok: false, notFound: true };
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async createCampaign(id, name, ownerId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}`), {
        method:  'POST',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ name, ownerId }),
      });
      if (res.status === 409) return { ok: false, conflict: true };
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true, data: await res.json() };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async updateNotes(id, notes) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/notes`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify(notes),
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },

  async join(id, charId) {
    try {
      const res = await fetch(this._url(`/campaign/${id}/join`), {
        method:  'PUT',
        headers: { ...this._headers(), 'Content-Type': 'application/json' },
        body:    JSON.stringify({ charId }),
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
      });
      if (!res.ok) return { ok: false, status: res.status };
      return { ok: true };
    } catch (e) {
      return { ok: false, error: e.message };
    }
  },
};
