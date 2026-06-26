/**
 * Traveller Sync Worker
 *
 * Endpunkte:
 *   GET    /chars              → Charakter-Index (ID + Name aller Cloud-Chars)
 *   GET    /char/:id           → Charakter laden
 *   PUT    /char/:id           → Charakter speichern (aktualisiert Index)
 *   DELETE /char/:id           → Charakter löschen (entfernt aus Index)
 *
 * Auth: Authorization: Bearer <API_KEY>
 * Env:  API_KEY (Secret), KV (KV Namespace Binding)
 */

const CORS_HEADERS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
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
        await updateIndex(env, id, body, false);
        return respond(200, 'OK');
      }

      if (request.method === 'DELETE') {
        await env.KV.delete(`char:${id}`);
        await updateIndex(env, id, null, true);
        return respond(200, 'OK');
      }
    }

    return respond(404, 'Not Found');
  },
};

async function updateIndex(env, id, body, remove) {
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

function respond(status, text) {
  return new Response(text, { status, headers: CORS_HEADERS });
}

function respondJSON(json) {
  return new Response(json, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
