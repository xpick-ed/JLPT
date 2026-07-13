import { test, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { exchangeSession, pull, push } from '../web/js/sync.js';

let calls;
function stub(res) { calls = []; globalThis.fetch = async (url, opts) => { calls.push({ url, opts: opts || {} }); return res; }; }
afterEach(() => { delete globalThis.fetch; });

test('exchangeSession POSTs {credential} to /session', async () => {
  stub({ ok: true, json: async () => ({ session: 's1', email: 'a', name: 'A' }) });
  const r = await exchangeSession('http://w', 'cred');
  assert.equal(calls[0].url, 'http://w/session');
  assert.equal(calls[0].opts.method, 'POST');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { credential: 'cred' });
  assert.deepEqual(r, { session: 's1', email: 'a', name: 'A' });
});
test('exchangeSession returns null on !ok', async () => {
  stub({ ok: false });
  assert.equal(await exchangeSession('http://w', 'cred'), null);
});
test('pull GETs /data with Bearer', async () => {
  stub({ ok: true, json: async () => ({ cards: { x: 1 } }) });
  const r = await pull('http://w', 's1');
  assert.equal(calls[0].url, 'http://w/data');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer s1');
  assert.deepEqual(r, { cards: { x: 1 } });
});
test('pull returns null on empty blob', async () => {
  stub({ ok: true, json: async () => ({}) });
  assert.equal(await pull('http://w', 's1'), null);
});
test('push PUTs /data with Bearer + JSON body', async () => {
  stub({ ok: true });
  const ok = await push('http://w', 's1', { a: 1 });
  assert.equal(calls[0].opts.method, 'PUT');
  assert.equal(calls[0].opts.headers.authorization, 'Bearer s1');
  assert.deepEqual(JSON.parse(calls[0].opts.body), { a: 1 });
  assert.equal(ok, true);
});
test('pull/push swallow fetch errors (offline)', async () => {
  globalThis.fetch = async () => { throw new Error('offline'); };
  assert.equal(await pull('http://w', 's1'), null);
  assert.equal(await push('http://w', 's1', {}), false);
});
