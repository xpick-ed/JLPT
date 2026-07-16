import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, applyGrade } from '../web/js/session.js';
import { emptyState } from '../web/js/store.js';

const T = 1_000_000_000_000;

test('buildQueue surfaces new cards up to newPerDay', () => {
  const s = emptyState();
  s.settings.newPerDay = 2;
  assert.deepEqual(buildQueue(s, ['a','b','c'], T), ['a','b']);
});

test('applyGrade creates then schedules a card immutably', () => {
  const s = emptyState();
  const s2 = applyGrade(s, 'a', 'good', T);
  assert.equal(s.cards.a, undefined);            // original untouched
  assert.equal(s2.cards.a.reps, 1);
  assert.equal(s2.cards.a.interval, 4);   // FSRS initial 'good' stability
  assert.equal(s2.updated, T);
});
