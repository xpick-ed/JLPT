import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ACHIEVEMENTS, evaluateAchievements, mergeAchievements, questsFor, questProgress, QUEST_DEFS } from '../web/js/achievements.js';
import { recordActivity, dayKey } from '../web/js/progress.js';

const noon = (day) => new Date(`${day}T12:00:00`).getTime();

function studiedState(days, perDay = 60) {
  let s = { cards: {}, daily: {}, best: {}, achievements: {}, updated: 0 };
  for (const day of days) {
    for (let i = 0; i < perDay; i++) {
      s = recordActivity(s, { deviceId: 'a', content: 'vocab', grade: 'good', points: 10, combo: 12, now: noon(day) + i });
    }
  }
  return s;
}

test('evaluateAchievements earns streak and volume badges once', () => {
  const s = studiedState(['2026-07-13', '2026-07-14', '2026-07-15']);
  const now = noon('2026-07-15');
  const { earned, newly } = evaluateAchievements(s, now);
  assert.ok(newly.includes('streak3'));
  assert.ok(newly.includes('day50'));
  assert.ok(!newly.includes('day100'));
  // second evaluation: nothing newly earned
  const again = evaluateAchievements({ ...s, achievements: earned }, now);
  assert.equal(again.newly.length, 0);
});

test('combo badges come from the persisted all-time best', () => {
  const s = { cards: {}, daily: {}, best: { combo: 25 }, achievements: {} };
  const { newly } = evaluateAchievements(s, noon('2026-07-15'));
  assert.ok(newly.includes('combo10'));
  assert.ok(newly.includes('combo25'));
  assert.ok(!newly.includes('combo50'));
});

test('mastered badge counts cards with 21+ day intervals', () => {
  const cards = {};
  for (let i = 0; i < 100; i++) cards[`c${i}`] = { interval: 30 };
  const { newly } = evaluateAchievements({ cards, daily: {}, best: {}, achievements: {} }, noon('2026-07-15'));
  assert.ok(newly.includes('master100'));
});

test('mergeAchievements is a union keeping the earliest date', () => {
  const merged = mergeAchievements({ streak3: 100 }, { streak3: 50, day50: 200 });
  assert.deepEqual(merged, { streak3: 50, day50: 200 });
  assert.deepEqual(mergeAchievements(undefined, { day50: 1 }), { day50: 1 });
});

test('every achievement id is unique', () => {
  const ids = ACHIEVEMENTS.map(a => a.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('questsFor picks 3 distinct quests deterministically per day', () => {
  for (const key of ['2026-07-15', '2026-07-16', '2026-08-01', '2027-01-31']) {
    const a = questsFor(key).map(q => q.id);
    const b = questsFor(key).map(q => q.id);
    assert.deepEqual(a, b);
    assert.equal(new Set(a).size, 3);
    for (const id of a) assert.ok(QUEST_DEFS.some(q => q.id === id));
  }
  // different days generally differ (not guaranteed per pair, but across a month
  // at least two distinct selections must appear)
  const picks = new Set();
  for (let d = 1; d <= 28; d++) picks.add(questsFor(`2026-07-${String(d).padStart(2, '0')}`).map(q => q.id).join(','));
  assert.ok(picks.size >= 2);
});

test('questProgress reflects the daily summary and caps at the goal', () => {
  const day = '2026-07-15';
  const s = studiedState([day], 80);   // 80 reviewed/correct, 800 points, combo 12
  const list = questProgress(s, noon(day));
  assert.equal(list.length, 3);
  for (const q of list) {
    assert.ok(q.value <= q.goal);
    const def = QUEST_DEFS.find(d => d.id === q.id);
    assert.equal(q.goal, def.goal);
    // 80 correct answers / 800 pts / combo 12 / vocab-only: every quest except
    // both15 and minutes15 must be done
    if (!['both15', 'minutes15'].includes(q.id)) assert.equal(q.done, true, q.id);
  }
});

test('dayKey matches questProgress keying', () => {
  const now = noon('2026-07-15');
  assert.equal(dayKey(now), '2026-07-15');
});
