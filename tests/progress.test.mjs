import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentStreak, dailySummary, isWeakCard, mergeDaily, recordActivity } from '../web/js/progress.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

test('recordActivity builds per-device daily summaries', () => {
  let s = { daily: {}, updated: 0 };
  s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', seconds: 8, now: noon('2026-07-15') });
  s = recordActivity(s, { deviceId: 'a', content: 'grammar', grade: 'again', seconds: 4, now: noon('2026-07-15') + 100 });
  const d = dailySummary(s, '2026-07-15');
  assert.deepEqual({ reviewed: d.reviewed, correct: d.correct, seconds: d.seconds, vocab: d.vocab, grammar: d.grammar },
    { reviewed: 2, correct: 1, seconds: 12, vocab: 1, grammar: 1 });
});

test('mergeDaily combines devices and keeps newer same-device bucket', () => {
  const local = { '2026-07-15': { phone: { reviewed: 2, updated: 20 } } };
  const remote = { '2026-07-15': { phone: { reviewed: 1, updated: 10 }, laptop: { reviewed: 3, updated: 30 } } };
  const merged = mergeDaily(local, remote);
  assert.equal(merged['2026-07-15'].phone.reviewed, 2);
  assert.equal(merged['2026-07-15'].laptop.reviewed, 3);
});

test('currentStreak counts consecutive active local days', () => {
  let s = { daily: {} };
  for (const day of ['2026-07-13', '2026-07-14', '2026-07-15']) {
    s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', now: noon(day) });
  }
  assert.equal(currentStreak(s, noon('2026-07-15')), 3);
});

test('isWeakCard uses recent grade, repeated lapses, or low ease', () => {
  assert.equal(isWeakCard({ lastGrade: 'again', ease: 2.5 }), true);
  assert.equal(isWeakCard({ lastGrade: 'good', lapses: 2, ease: 2.5 }), true);
  assert.equal(isWeakCard({ lastGrade: 'good', lapses: 0, ease: 2.4 }), false);
});
