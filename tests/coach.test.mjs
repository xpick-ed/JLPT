import { test } from 'node:test';
import assert from 'node:assert/strict';
import { daysUntil, dueForecast, todayMenu, mockExamNudge } from '../web/js/coach.js';
import { recordActivity } from '../web/js/progress.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

test('daysUntil counts local whole days; null when unset/invalid', () => {
  const now = noon('2026-07-17');
  assert.equal(daysUntil('2026-12-06', now), 142);
  assert.equal(daysUntil('2026-07-17', now), 0);
  assert.equal(daysUntil('2026-07-16', now), -1);
  assert.equal(daysUntil('', now), null);
  assert.equal(daysUntil('not-a-date', now), null);
});

test('dueForecast buckets cards per day and folds overdue into today', () => {
  const now = noon('2026-07-17');
  const DAY = 86400000;
  const cards = {
    a: { due: now - 3 * DAY },        // overdue → today
    b: { due: now + 1000 },           // later today
    c: { due: now + 2 * DAY },
    d: { due: now + 2 * DAY + 60 },
    e: { due: now + 40 * DAY },       // beyond window → dropped
    f: {},                            // never reviewed → no due
  };
  const fc = dueForecast(cards, 30, now);
  assert.equal(fc.length, 30);
  assert.equal(fc[0].key, '2026-07-17');
  assert.equal(fc[0].count, 2);
  assert.equal(fc[2].count, 2);
  assert.equal(fc.reduce((n, f) => n + f.count, 0), 4);
});

test('todayMenu reflects live progress and includes a weak item only when needed', () => {
  const now = noon('2026-07-17');
  let s = { daily: {}, updated: 0 };
  for (let i = 0; i < 20; i++) s = recordActivity(s, { deviceId: 'a', content: 'grammar', grade: 'good', now });
  const menu = todayMenu(s, { due: 5, fresh: 10, weak: 3, goal: 50 }, now);
  assert.equal(menu.length, 3);
  assert.equal(menu[0].done, false);           // 20 < 50
  assert.equal(menu[1].kind, 'weak');
  assert.equal(menu[2].done, true);            // 20 grammar ≥ 15
  const noWeak = todayMenu(s, { due: 5, fresh: 10, weak: 0, goal: 10 }, now);
  assert.equal(noWeak.length, 2);
  assert.equal(noWeak[0].done, true);          // 20 ≥ 10
});

test('mockExamNudge fires after 7 quiet days', () => {
  const now = noon('2026-07-17');
  assert.equal(mockExamNudge([], now), true);
  assert.equal(mockExamNudge([{ at: now - 2 * 86400000 }], now), false);
  assert.equal(mockExamNudge([{ at: now - 8 * 86400000 }], now), true);
});
