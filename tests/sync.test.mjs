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
  const put = await worker.fetch(new Request('https://w/?key=abc', { method:'PUT', body:'{"cards":{"x":1}}' }), env);
  assert.equal(put.status, 204);
  const get = await worker.fetch(new Request('https://w/?key=abc'), env);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { cards:{ x:1 } });
  assert.equal(get.headers.get('access-control-allow-origin'), '*');
});

test('worker unknown key returns empty object', async () => {
  const get = await worker.fetch(new Request('https://w/?key=none'), fakeEnv());
  assert.deepEqual(await get.json(), {});
});

test('worker missing key => 400', async () => {
  const r = await worker.fetch(new Request('https://w/'), fakeEnv());
  assert.equal(r.status, 400);
});
