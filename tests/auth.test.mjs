import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

globalThis.localStorage = {
  _m: {},
  getItem(k) { return k in this._m ? this._m[k] : null; },
  setItem(k, v) { this._m[k] = String(v); },
  removeItem(k) { delete this._m[k]; },
};

const { getSession, setSession, clearSession, getOwner, setOwner, clearOwner } = await import('../web/js/auth.js');

beforeEach(() => { globalThis.localStorage._m = {}; });

test('getSession is null when unset', () => assert.equal(getSession(), null));
test('setSession/getSession round-trip', () => {
  setSession({ session: 's1', email: 'a@b.com', name: 'A' });
  assert.deepEqual(getSession(), { session: 's1', email: 'a@b.com', name: 'A' });
});
test('clearSession removes it', () => {
  setSession({ session: 's1', email: 'a@b.com', name: 'A' });
  clearSession();
  assert.equal(getSession(), null);
});
test('getSession tolerates corrupt json', () => {
  globalThis.localStorage.setItem('vocabmatch.session', '{bad');
  assert.equal(getSession(), null);
});
test('owner tag set/get/clear round-trip', () => {
  setOwner('a@b.com'); assert.equal(getOwner(), 'a@b.com');
  clearOwner(); assert.equal(getOwner(), null);
});
