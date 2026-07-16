import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, LEVEL_CUMULATIVE, sampleTest, correctForGuessing, estimate, mergeTests } from '../web/js/vocab-test.js';

function fakeDecks(perLevel = 30) {
  const decks = {};
  for (const lv of LEVELS) {
    decks[lv] = Array.from({ length: perLevel }, (_, i) => ({ id: `${lv}-${i}`, word: `w${i}`, zh: `m${i}`, level: lv }));
  }
  return decks;
}

test('sampleTest draws the stratified count from every level, no duplicates', () => {
  const qs = sampleTest(fakeDecks(), 8, Math.random);
  assert.equal(qs.length, 40);
  for (const lv of LEVELS) assert.equal(qs.filter(q => q.level === lv).length, 8);
  assert.equal(new Set(qs.map(q => q.card.id)).size, 40);
});

test('sampleTest tolerates a short or missing deck', () => {
  const decks = fakeDecks();
  decks.n1 = decks.n1.slice(0, 3);
  delete decks.n2;
  const qs = sampleTest(decks, 8, Math.random);
  assert.equal(qs.filter(q => q.level === 'n1').length, 3);
  assert.equal(qs.filter(q => q.level === 'n2').length, 0);
});

test('correctForGuessing removes the 25% chance floor', () => {
  assert.equal(correctForGuessing(1), 1);
  assert.equal(correctForGuessing(0.25), 0);
  assert.equal(correctForGuessing(0), 0);           // clamped
  assert.ok(Math.abs(correctForGuessing(0.625) - 0.5) < 1e-9);
});

test('estimate: perfect answers reach the N1 threshold', () => {
  const results = LEVELS.flatMap(lv => Array.from({ length: 8 }, () => ({ level: lv, correct: true })));
  const { size, recommended, rates } = estimate(results);
  assert.equal(size, 10000);
  assert.equal(recommended, 'n1');
  for (const lv of LEVELS) assert.equal(rates[lv], 1);
});

test('estimate: all wrong stays below N5', () => {
  const results = LEVELS.flatMap(lv => Array.from({ length: 8 }, () => ({ level: lv, correct: false })));
  const { size, recommended } = estimate(results);
  assert.equal(size, 0);
  assert.equal(recommended, null);
});

test('estimate: knowing N5+N4 fully lands between the N4 and N3 thresholds', () => {
  const results = LEVELS.flatMap(lv => Array.from({ length: 8 }, (_, i) => ({
    level: lv,
    correct: lv === 'n5' || lv === 'n4' ? true : i < 2,   // 25% raw on upper levels ≈ chance
  })));
  const { size, recommended } = estimate(results);
  assert.ok(size >= LEVEL_CUMULATIVE.n4 && size < LEVEL_CUMULATIVE.n3, String(size));
  assert.equal(recommended, 'n4');
});

test('mergeTests unions by timestamp, sorts, and caps', () => {
  const a = [{ at: 1, size: 100 }, { at: 3, size: 300 }];
  const b = [{ at: 2, size: 200 }, { at: 3, size: 300 }];
  const merged = mergeTests(a, b);
  assert.deepEqual(merged.map(t => t.at), [1, 2, 3]);
  const many = Array.from({ length: 30 }, (_, i) => ({ at: i + 1, size: i }));
  assert.equal(mergeTests(many, [], 20).length, 20);
  assert.equal(mergeTests(many, [])[0].at, 11);
  assert.deepEqual(mergeTests(undefined, undefined), []);
});
