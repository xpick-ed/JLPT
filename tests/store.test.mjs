import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, emptyState, applySync, DEFAULT_SETTINGS } from '../web/js/store.js';

test('emptyState has defaults', () => {
  const s = emptyState();
  assert.deepEqual(s.settings, DEFAULT_SETTINGS);
  assert.deepEqual(s.cards, {});
});

test('mergeStates keeps newer card per id', () => {
  const a = { cards: { x:{id:'x',updated:10,interval:1}, y:{id:'y',updated:5} }, settings:DEFAULT_SETTINGS, updated:10 };
  const b = { cards: { x:{id:'x',updated:20,interval:9}, z:{id:'z',updated:7} }, settings:DEFAULT_SETTINGS, updated:7 };
  const m = mergeStates(a, b);
  assert.equal(m.cards.x.interval, 9);   // b newer
  assert.equal(m.cards.y.updated, 5);    // only in a
  assert.equal(m.cards.z.updated, 7);    // only in b
});

test('mergeStates settings follow larger top-level updated', () => {
  const a = { cards:{}, settings:{newPerDay:50}, updated:10 };
  const b = { cards:{}, settings:{newPerDay:30}, updated:99 };
  assert.equal(mergeStates(a,b).settings.newPerDay, 30);
  assert.equal(mergeStates(a,b).updated, 99);
});

test('DEFAULT_SETTINGS has content vocab and loadState fills it', () => {
  assert.equal(DEFAULT_SETTINGS.content, 'vocab');
});

test('applySync merge keeps local when there is no remote', () => {
  const local = { cards: { A: {} }, settings: { newPerDay: 9 }, updated: 5 };
  assert.deepEqual(applySync(local, null, true), local);
});
test('applySync merge combines remote (same account)', () => {
  const local = { cards: { A: { updated: 1 } }, settings: {}, updated: 1 };
  const remote = { cards: { B: { updated: 2 } }, settings: {}, updated: 2 };
  const r = applySync(local, remote, true);
  assert.deepEqual(Object.keys(r.cards).sort(), ['A', 'B']);
});
test('applySync ADOPT takes only remote cards — no cross-account leak', () => {
  const local = { cards: { A: { due: 1 } }, settings: { newPerDay: 9 }, updated: 5 };
  const remote = { cards: { B: { due: 2 } }, settings: { newPerDay: 3 }, updated: 3 };
  const r = applySync(local, remote, false);
  assert.deepEqual(Object.keys(r.cards), ['B']);       // A must be gone
  assert.equal(r.settings.newPerDay, 3);
});
test('applySync ADOPT with no remote yields empty — no leak', () => {
  const r = applySync({ cards: { A: {} }, settings: { newPerDay: 9 }, updated: 9 }, null, false);
  assert.deepEqual(r.cards, {});
});
