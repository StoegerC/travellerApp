/**
 * Traveller Sync Worker
 *
 * Char-Endpunkte:
 *   GET    /chars              → Charakter-Index
 *   GET    /char/:id           → Charakter laden
 *   PUT    /char/:id           → Charakter speichern
 *   DELETE /char/:id           → Charakter löschen
 *
 * Kampagnen-Endpunkte:
 *   GET    /campaigns                      → Kampagnen-Index
 *   GET    /campaign/:id                   → Kampagne laden
 *   POST   /campaign/:id                   → Kampagne erstellen (409 wenn ID belegt)
 *   PUT    /campaign/:id/notes             → Kampagnen-Notizen aktualisieren (Mitglieder)
 *   GET    /campaign/:id/ships             → Kampagnen-Schiffe laden
 *   PUT    /campaign/:id/ships             → Kampagnen-Schiffe aktualisieren (last-write-wins)
 *   PUT    /campaign/:id/join              → Kampagne beitreten
 *   PUT    /campaign/:id/leave             → Kampagne verlassen
 *   DELETE /campaign/:id                   → Kampagne löschen (nur Owner)
 *   DELETE /campaign/:id/member/:charId    → Mitglied entfernen (nur Owner)
 *
 * Auth: Authorization: Bearer <API_KEY>
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Authorization, Content-Type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.API_KEY}`) {
      return respond(401, 'Unauthorized');
    }

    const url   = new URL(request.url);
    const parts = url.pathname.replace(/^\//, '').split('/');
    const type  = parts[0];
    const id    = parts[1];
    const sub   = parts[2];
    const sub2  = parts[3];

    // ── GET /chars ───────────────────────────────────────────────────────────

    if (type === 'chars' && !id && request.method === 'GET') {
      const index = await env.KV.get('chars:index');
      return respondJSON(index || '[]');
    }

    // ── /char/:id ────────────────────────────────────────────────────────────

    if (type === 'char' && id) {
      if (request.method === 'GET') {
        const value = await env.KV.get(`char:${id}`);
        if (!value) return respond(404, 'Not Found');
        return respondJSON(value);
      }

      if (request.method === 'PUT') {
        const body = await request.text();
        if (!body) return respond(400, 'Empty body');
        await env.KV.put(`char:${id}`, body);
        await updateCharIndex(env, id, body, false);
        return respond(200, 'OK');
      }

      if (request.method === 'DELETE') {
        await env.KV.delete(`char:${id}`);
        await updateCharIndex(env, id, null, true);
        return respond(200, 'OK');
      }
    }

    // ── GET /campaigns ───────────────────────────────────────────────────────

    if (type === 'campaigns' && !id && request.method === 'GET') {
      const index = await env.KV.get('campaigns:index');
      return respondJSON(index || '[]');
    }

    // ── /campaign/:id ────────────────────────────────────────────────────────

    if (type === 'campaign' && id) {
      if (!isValidCampaignId(id)) return respond(400, 'Invalid campaign ID');

      // GET /campaign/:id
      if (request.method === 'GET' && !sub) {
        const value = await env.KV.get(`campaign:${id}`);
        if (!value) return respond(404, 'Not Found');
        return respondJSON(value);
      }

      // POST /campaign/:id – erstellen (409 wenn bereits vorhanden)
      if (request.method === 'POST' && !sub) {
        const existing = await env.KV.get(`campaign:${id}`);
        if (existing) return respond(409, 'Campaign ID already taken');
        const body = await request.text();
        if (!body) return respond(400, 'Empty body');
        let data;
        try { data = JSON.parse(body); } catch { return respond(400, 'Invalid JSON'); }
        if (!data.ownerId) return respond(400, 'Missing ownerId');
        const campaign = {
          id,
          name:      data.name || id,
          ownerId:   data.ownerId,
          createdAt: new Date().toISOString(),
          members:   [{ charId: data.ownerId, joinedAt: new Date().toISOString() }],
          notes:     { sessions: [], persons: [], locations: [], quests: [] },
          ships:     [],
        };
        await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
        await updateCampaignIndex(env, id, campaign.name, 1, false);
        return respondJSON(JSON.stringify(campaign));
      }

      // GET /campaign/:id/ships – Schiffe laden
      if (request.method === 'GET' && sub === 'ships') {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        return respondJSON(JSON.stringify(campaign.ships || []));
      }

      // PUT /campaign/:id/ships – Schiffe aktualisieren (last-write-wins, Bilder ausgenommen)
      if (request.method === 'PUT' && sub === 'ships') {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        if (!body) return respond(400, 'Empty body');
        let ships;
        try { ships = JSON.parse(body); } catch { return respond(400, 'Invalid JSON'); }
        // Strip images to keep KV size manageable
        campaign.ships = ships.map(s => { const { image: _, ...rest } = s; return rest; });
        await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
        return respond(200, 'OK');
      }

      // PUT /campaign/:id/notes – Notizen aktualisieren (Mitglieder)
      if (request.method === 'PUT' && sub === 'notes') {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        if (!body) return respond(400, 'Empty body');
        let notes;
        try { notes = JSON.parse(body); } catch { return respond(400, 'Invalid JSON'); }
        campaign.notes = notes;
        await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
        return respond(200, 'OK');
      }

      // PUT /campaign/:id/join
      if (request.method === 'PUT' && sub === 'join') {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        let data;
        try { data = JSON.parse(body); } catch { return respond(400, 'Invalid JSON'); }
        if (!data.charId) return respond(400, 'Missing charId');
        if (!campaign.members.find(m => m.charId === data.charId)) {
          campaign.members.push({ charId: data.charId, joinedAt: new Date().toISOString() });
          await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
          await updateCampaignIndex(env, id, campaign.name, campaign.members.length, false);
        }
        return respond(200, 'OK');
      }

      // PUT /campaign/:id/leave
      if (request.method === 'PUT' && sub === 'leave') {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        let data;
        try { data = JSON.parse(body); } catch { return respond(400, 'Invalid JSON'); }
        if (!data.charId) return respond(400, 'Missing charId');
        campaign.members = campaign.members.filter(m => m.charId !== data.charId);
        await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
        await updateCampaignIndex(env, id, campaign.name, campaign.members.length, false);
        return respond(200, 'OK');
      }

      // DELETE /campaign/:id/member/:charId – Mitglied entfernen (Owner)
      if (request.method === 'DELETE' && sub === 'member' && sub2) {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        let data = {};
        try { if (body) data = JSON.parse(body); } catch {}
        if (data.requesterId !== campaign.ownerId) return respond(403, 'Forbidden');
        campaign.members = campaign.members.filter(m => m.charId !== sub2);
        await env.KV.put(`campaign:${id}`, JSON.stringify(campaign));
        await updateCampaignIndex(env, id, campaign.name, campaign.members.length, false);
        return respond(200, 'OK');
      }

      // DELETE /campaign/:id – Kampagne löschen (Owner)
      if (request.method === 'DELETE' && !sub) {
        const raw = await env.KV.get(`campaign:${id}`);
        if (!raw) return respond(404, 'Not Found');
        const campaign = JSON.parse(raw);
        const body = await request.text();
        let data = {};
        try { if (body) data = JSON.parse(body); } catch {}
        if (data.requesterId !== campaign.ownerId) return respond(403, 'Forbidden');
        await env.KV.delete(`campaign:${id}`);
        await updateCampaignIndex(env, id, null, 0, true);
        return respond(200, 'OK');
      }
    }

    return respond(404, 'Not Found');
  },
};

// ── Hilfsfunktionen ──────────────────────────────────────────────────────────

function isValidCampaignId(id) {
  return /^[a-z0-9_-]{2,32}$/.test(id);
}

async function updateCharIndex(env, id, body, remove) {
  try {
    const raw   = await env.KV.get('chars:index');
    const index = raw ? JSON.parse(raw) : [];
    const pos   = index.findIndex(c => c.id === id);
    if (remove) {
      if (pos >= 0) index.splice(pos, 1);
    } else {
      const name = body ? (JSON.parse(body).metadata?.name || '') : '';
      if (pos >= 0) { index[pos].name = name; }
      else          { index.push({ id, name }); }
    }
    await env.KV.put('chars:index', JSON.stringify(index));
  } catch {}
}

async function updateCampaignIndex(env, id, name, memberCount, remove) {
  try {
    const raw   = await env.KV.get('campaigns:index');
    const index = raw ? JSON.parse(raw) : [];
    const pos   = index.findIndex(c => c.id === id);
    if (remove) {
      if (pos >= 0) index.splice(pos, 1);
    } else {
      if (pos >= 0) { index[pos].name = name; index[pos].memberCount = memberCount; }
      else          { index.push({ id, name, memberCount }); }
    }
    await env.KV.put('campaigns:index', JSON.stringify(index));
  } catch {}
}

function respond(status, text) {
  return new Response(text, { status, headers: CORS_HEADERS });
}

function respondJSON(json) {
  return new Response(json, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
