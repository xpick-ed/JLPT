import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashKey } from '../web/js/sync.js';
import worker from '../worker/index.js';

test('hashKey is stable hex sha-256', async () => {
  const h = await hashKey('my-pass');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashKey('my-pass'));
  assert.notEqual(h, await hashKey('other'));
});

function fakeEnv() {
  const m = new Map();
  return { KV: { get: k => Promise.resolve(m.get(k) ?? null), put: (k,v) => (m.set(k,v), Promise.resolve()) } };
}

test('worker stores and returns state by key', async () => {
  const env = fakeEnv();
  env.ALLOWED_ORIGIN = 'https://w';
  // Set up a session
  await env.KV.put('session:abc', JSON.stringify({ sub: '123', email: 'test@example.com', name: 'Test' }));

  const put = await worker.fetch(new Request('https://w/data', { method:'PUT', body:'{"cards":{"x":1}}', headers: { Authorization: 'Bearer abc', Origin: 'https://w' } }), env);
  assert.equal(put.status, 204);

  const get = await worker.fetch(new Request('https://w/data', { headers: { Authorization: 'Bearer abc', Origin: 'https://w' } }), env);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { cards:{ x:1 } });
  assert.equal(get.headers.get('access-control-allow-origin'), 'https://w');
});

test('worker unknown key returns empty object', async () => {
  const env = fakeEnv();
  env.ALLOWED_ORIGIN = 'https://w';
  // Set up a session
  await env.KV.put('session:none', JSON.stringify({ sub: '456', email: 'test@example.com', name: 'Test' }));

  const get = await worker.fetch(new Request('https://w/data', { headers: { Authorization: 'Bearer none' } }), env);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), {});
});

test('worker missing authorization => 401', async () => {
  const r = await worker.fetch(new Request('https://w/data'), fakeEnv());
  assert.equal(r.status, 401);
});
