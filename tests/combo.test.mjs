import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BASE_POINTS, applyAnswer, makeCombo, mergeBest, multiplierFor } from '../web/js/combo.js';
import { dailySummary, recordActivity } from '../web/js/progress.js';
import { mergeStates } from '../web/js/store.js';

test('multiplier tiers step up at 5 / 10 / 20', () => {
  assert.equal(multiplierFor(0), 1);
  assert.equal(multiplierFor(4), 1);
  assert.equal(multiplierFor(5), 2);
  assert.equal(multiplierFor(9), 2);
  assert.equal(multiplierFor(10), 3);
  assert.equal(multiplierFor(19), 3);
  assert.equal(multiplierFor(20), 4);
  assert.equal(multiplierFor(99), 4);
});

test('applyAnswer extends the streak and scores base × multiplier', () => {
  let s = makeCombo();
  for (let i = 0; i < 5; i++) s = applyAnswer(s, true);
  assert.equal(s.combo, 5);
  assert.equal(s.multiplier, 2);
  assert.equal(s.gained, BASE_POINTS * 2);
  assert.equal(s.score, BASE_POINTS * 4 + BASE_POINTS * 2); // 4 at ×1, 1 at ×2
  assert.equal(s.best, 5);
});

test('a miss resets the streak but keeps score and best', () => {
  let s = makeCombo();
  for (let i = 0; i < 3; i++) s = applyAnswer(s, true);
  const scoreBefore = s.score;
  s = applyAnswer(s, false);
  assert.equal(s.combo, 0);
  assert.equal(s.gained, 0);
  assert.equal(s.multiplier, 1);
  assert.equal(s.score, scoreBefore);
  assert.equal(s.best, 3);
});

test('mergeBest keeps the higher record from either side', () => {
  assert.deepEqual(mergeBest({ combo: 7, updated: 10 }, { combo: 12, updated: 5 }), { combo: 12, updated: 10 });
  assert.deepEqual(mergeBest(undefined, { combo: 3 }), { combo: 3, updated: 0 });
  assert.deepEqual(mergeBest(undefined, undefined), { combo: 0, updated: 0 });
});

test('points accumulate into daily score; old buckets without score still summarize', () => {
  const noon = new Date('2026-07-15T12:00:00').getTime();
  let s = { daily: { '2026-07-15': { legacy: { reviewed: 5, correct: 4, updated: 1 } } }, updated: 0 };
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', points: 30, now: noon });
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'again', points: 0, now: noon + 100 });
  const d = dailySummary(s, '2026-07-15');
  assert.equal(d.score, 30);
  assert.equal(d.reviewed, 7); // 5 legacy + 2 new
});

test('mergeStates keeps the max best combo across devices and tolerates old blobs', () => {
  const a = { cards: {}, daily: {}, best: { combo: 8, updated: 2 }, settings: {}, updated: 2 };
  const b = { cards: {}, daily: {}, settings: {}, updated: 1 }; // old blob: no best
  assert.equal(mergeStates(a, b).best.combo, 8);
  assert.equal(mergeStates(b, a).best.combo, 8);
  const c = { cards: {}, daily: {}, best: { combo: 15, updated: 3 }, settings: {}, updated: 3 };
  assert.equal(mergeStates(a, c).best.combo, 15);
});
