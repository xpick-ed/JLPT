import { test } from 'node:test';
import assert from 'node:assert/strict';
import { heatmapCells, intensity, levelMastery, totals, retentionSeries, overallRetention, difficultyBuckets } from '../web/js/stats.js';
import { recordActivity, dayKey } from '../web/js/progress.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

test('heatmapCells starts on a Sunday and ends today', () => {
  const now = noon('2026-07-16');   // a Thursday (getDay 4)
  const cells = heatmapCells({ daily: {} }, { weeks: 4, now });
  assert.equal(cells.length, 3 * 7 + 5);            // 3 full weeks + Sun..Thu
  assert.equal(cells.at(-1).key, '2026-07-16');
  assert.equal(new Date(`${cells[0].key}T12:00:00`).getDay(), 0);
});

test('heatmapCells carries the reviewed counts', () => {
  const now = noon('2026-07-16');
  let s = { daily: {}, updated: 0 };
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', now });
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'again', now });
  const cells = heatmapCells(s, { weeks: 2, now });
  assert.equal(cells.at(-1).count, 2);
  assert.equal(cells[0].count, 0);
});

test('intensity buckets at 1 / 20 / 50 / 100', () => {
  assert.deepEqual([0, 1, 19, 20, 49, 50, 99, 100].map(intensity), [0, 1, 1, 2, 2, 3, 3, 4]);
});

test('levelMastery counts seen and mature cards per loaded level', () => {
  const dataByLevel = {
    n5: [{ id: 'a' }, { id: 'b' }, { id: 'c' }],
    n4: [],                                        // not loaded → skipped
  };
  const state = { cards: { a: { reps: 3, interval: 30 }, b: { reps: 1, interval: 2 } } };
  const m = levelMastery(state, dataByLevel, ['n5', 'n4']);
  assert.deepEqual(m, [{ lv: 'n5', total: 3, seen: 2, mature: 1 }]);
});

test('totals sums retained history and reads the best combo', () => {
  let s = { daily: {}, best: { combo: 17 }, updated: 0 };
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', seconds: 60, now: noon('2026-07-15') });
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', seconds: 30, now: noon('2026-07-16') });
  s.best = { combo: 17 };
  const t = totals(s);
  assert.deepEqual(t, { reviewed: 2, seconds: 90, days: 2, bestCombo: 17 });
});

test('retention series and overall track recall attempts on seen cards only', () => {
  const now = noon('2026-07-17');
  let s = { daily: {}, updated: 0 };
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', recall: true, now });
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'again', recall: false, now });
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', recall: null, now });   // new card: not counted
  const series = retentionSeries(s, 3, now);
  assert.equal(series.length, 3);
  assert.equal(series[2].n, 2);
  assert.equal(series[2].rate, 0.5);
  assert.equal(series[1].rate, null);
  assert.equal(overallRetention(s), 0.5);
  assert.equal(overallRetention({ daily: {} }), null);
});

test('difficultyBuckets bins FSRS difficulty into 5 groups', () => {
  const state = { cards: {
    a: { d: 1 }, b: { d: 2.7 },        // bucket 0
    c: { d: 5 },                        // bucket 2
    e: { d: 10 }, f: { d: 9 },          // bucket 4
    legacy: { ease: 2.5 },              // no d → skipped
  } };
  assert.deepEqual(difficultyBuckets(state), [2, 0, 1, 0, 2]);
});

test('dayKey sanity for heatmap keying', () => {
  assert.equal(dayKey(noon('2026-07-16')), '2026-07-16');
});
