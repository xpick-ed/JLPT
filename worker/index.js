// worker/index.js — Google-auth per-user sync.
// KV keys: session:<uuid> = {sub,email,name} (TTL 60d); user:<sub> = state blob.
const TOKENINFO = 'https://oauth2.googleapis.com/tokeninfo?id_token=';
const SESSION_TTL = 60 * 24 * 3600; // 60 days, seconds

// Pure: validate Google ID-token claims (as returned by tokeninfo). Exported for tests.
export function validateClaims(claims, clientId, nowSec) {
  if (!claims || typeof claims !== 'object') return { ok: false, reason: 'no claims' };
  if (claims.aud !== clientId) return { ok: false, reason: 'aud' };
  if (claims.iss !== 'accounts.google.com' && claims.iss !== 'https://accounts.google.com') return { ok: false, reason: 'iss' };
  if (!(Number(claims.exp) > nowSec)) return { ok: false, reason: 'exp' };
  if (!(claims.email_verified === true || claims.email_verified === 'true')) return { ok: false, reason: 'email_verified' };
  if (!claims.sub) return { ok: false, reason: 'sub' };
  return { ok: true, sub: String(claims.sub), email: claims.email || '', name: claims.name || '' };
}

function corsOrigin(request, env) {
  const o = request.headers.get('Origin') || '';
  if (o && (o === env.ALLOWED_ORIGIN || /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(o))) return o;
  return null;
}
function corsHeaders(origin) {
  return origin ? {
    'access-control-allow-origin': origin,
    'access-control-allow-methods': 'GET,PUT,POST,OPTIONS',
    'access-control-allow-headers': 'authorization,content-type',
    'vary': 'Origin',
  } : {};
}
function bearer(request) {
  const m = (request.headers.get('Authorization') || '').match(/^Bearer\s+(.+)$/);
  return m ? m[1] : null;
}
async function subFromSession(request, env) {
  const id = bearer(request);
  if (!id) return null;
  const raw = await env.KV.get('session:' + id);
  if (!raw) return null;
  try { return JSON.parse(raw).sub || null; } catch { return null; }
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(corsOrigin(request, env));
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
    const path = new URL(request.url).pathname;
    const json = (obj, status = 200) => new Response(JSON.stringify(obj), { status, headers: { ...cors, 'content-type': 'application/json' } });

    if (path === '/session' && request.method === 'POST') {
      let credential = null;
      try { credential = (await request.json()).credential; } catch { /* bad body */ }
      if (!credential) return new Response('missing credential', { status: 400, headers: cors });
      const r = await fetch(TOKENINFO + encodeURIComponent(credential));
      if (!r.ok) return new Response('invalid token', { status: 401, headers: cors });
      const v = validateClaims(await r.json(), env.CLIENT_ID, Math.floor(Date.now() / 1000));
      if (!v.ok) return new Response('unauthorized', { status: 401, headers: cors });
      const id = crypto.randomUUID();
      await env.KV.put('session:' + id, JSON.stringify({ sub: v.sub, email: v.email, name: v.name }), { expirationTtl: SESSION_TTL });
      return json({ session: id, email: v.email, name: v.name });
    }

    if (path === '/data') {
      const sub = await subFromSession(request, env);
      if (!sub) return new Response('unauthorized', { status: 401, headers: cors });
      if (request.method === 'PUT') {
        await env.KV.put('user:' + sub, await request.text());
        return new Response(null, { status: 204, headers: cors });
      }
      if (request.method === 'GET') {
        return new Response((await env.KV.get('user:' + sub)) || '{}', { status: 200, headers: { ...cors, 'content-type': 'application/json' } });
      }
    }

    if (path === '/logout' && request.method === 'POST') {
      const id = bearer(request);
      if (id) await env.KV.delete('session:' + id);
      return new Response(null, { status: 204, headers: cors });
    }

    return new Response('not found', { status: 404, headers: cors });
  },
};
