/**
 * Traveller Sync Worker
 *
 * Endpunkte:
 *   GET    /char/:id          → Charakter laden
 *   PUT    /char/:id          → Charakter speichern
 *   DELETE /char/:id          → Charakter löschen
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
    // CORS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    // Auth
    const auth = request.headers.get('Authorization') || '';
    if (auth !== `Bearer ${env.API_KEY}`) {
      return respond(401, 'Unauthorized');
    }

    const url   = new URL(request.url);
    const parts = url.pathname.replace(/^\//, '').split('/');
    const type  = parts[0];
    const id    = parts[1];

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
        return respond(200, 'OK');
      }

      if (request.method === 'DELETE') {
        await env.KV.delete(`char:${id}`);
        return respond(200, 'OK');
      }
    }

    return respond(404, 'Not Found');
  },
};

function respond(status, text) {
  return new Response(text, { status, headers: CORS_HEADERS });
}

function respondJSON(json) {
  return new Response(json, {
    status: 200,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}
