const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const key = new URL(request.url).searchParams.get('key');
    if (!key) return new Response('missing key', { status: 400, headers: CORS });
    if (request.method === 'PUT') {
      await env.KV.put(key, await request.text());
      return new Response(null, { status: 204, headers: CORS });
    }
    const body = (await env.KV.get(key)) || '{}';
    return new Response(body, { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  },
};
