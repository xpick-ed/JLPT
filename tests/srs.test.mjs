import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, newCard, review, dueQueue, retrievability, migrateLegacy, initDifficulty } from '../web/js/srs.js';

const T = 1_000_000_000_000;

test('new card good schedules the FSRS initial stability (~4 days)', () => {
  const c = review(newCard('a', T), 'good', T);
  assert.equal(c.interval, 4);                 // round(w[2] = 3.7145)
  assert.equal(c.due, T + 4 * DAY);
  assert.equal(c.reps, 1);
  assert.equal(c.isNew, false);
  assert.equal(c.lastGrade, 'good');
  assert.ok(c.s > 3 && c.s < 4.5);
  assert.ok(c.d >= 1 && c.d <= 10);
});

test('new card easy schedules ~2 weeks and raises ease', () => {
  const c = review(newCard('a', T), 'easy', T);
  assert.equal(c.interval, 14);                // round(w[3] = 13.8206)
  assert.ok(c.ease > 2.5);
});

test('again resets interval, adds lapse, due in 10 min, ease floor kept', () => {
  let c = review(newCard('a', T), 'good', T);
  c = review(c, 'again', c.due);
  assert.equal(c.interval, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, c.updated + 600000);
  for (let i = 0; i < 20; i++) c = review(c, 'again', c.due);
  assert.ok(c.ease >= 1.3);
});

test('consecutive good reviews grow stability monotonically', () => {
  let c = review(newCard('a', T), 'good', T);
  for (let i = 0; i < 5; i++) {
    const prev = c.s;
    c = review(c, 'good', c.due);
    assert.ok(c.s > prev, `${c.s} > ${prev}`);
    assert.equal(c.interval, Math.round(c.s));
  }
  assert.ok(c.interval > 30);                  // a handful of goods reaches weeks+
});

test('hard grows stability slower than good; easy faster', () => {
  const base = review(newCard('a', T), 'good', T);
  const hard = review(base, 'hard', base.due).s;
  const good = review(base, 'good', base.due).s;
  const easy = review(base, 'easy', base.due).s;
  assert.ok(hard < good && good < easy, `${hard} < ${good} < ${easy}`);
});

test('a lapse shrinks stability and never increases it', () => {
  let c = review(newCard('a', T), 'good', T);
  for (let i = 0; i < 4; i++) c = review(c, 'good', c.due);
  const sBefore = c.s;
  c = review(c, 'again', c.due);
  assert.ok(c.s < sBefore);
});

test('legacy SM-2 cards migrate: stability ≈ interval, difficulty from ease', () => {
  const legacy = { id: 'x', ease: 2.5, interval: 30, due: T, reps: 8, lapses: 1, updated: T - 30 * DAY };
  const m = migrateLegacy(legacy);
  assert.equal(m.s, 30);
  assert.ok(m.d >= 1 && m.d <= 10);
  const c = review(legacy, 'good', T);
  assert.ok(c.interval > 30, String(c.interval));   // successful mature recall extends
  assert.ok(c.s > 30);
});

test('retrievability: 1 at t=0, 0.9 at t=s, decreasing', () => {
  assert.equal(retrievability(0, 10), 1);
  assert.ok(Math.abs(retrievability(10, 10) - 0.9) < 1e-9);
  assert.ok(retrievability(30, 10) < retrievability(10, 10));
});

test('difficulty stays clamped in [1,10]', () => {
  assert.ok(initDifficulty(1) <= 10 && initDifficulty(4) >= 1);
  let c = review(newCard('a', T), 'again', T);
  for (let i = 0; i < 30; i++) c = review(c, 'again', c.due);
  assert.ok(c.d <= 10);
  let e = review(newCard('b', T), 'easy', T);
  for (let i = 0; i < 30; i++) e = review(e, 'easy', e.due);
  assert.ok(e.d >= 1);
});

test('dueQueue returns due sorted then new up to newPerDay', () => {
  const cards = {
    x: { id: 'x', due: T - 1, updated: T },
    y: { id: 'y', due: T - 5, updated: T },
    z: { id: 'z', due: T + DAY * 10, updated: T },
  };
  const pool = ['x', 'y', 'z', 'n1', 'n2', 'n3'];
  const q = dueQueue(cards, pool, T, 2);
  assert.deepEqual(q.slice(0, 2), ['y', 'x']);
  assert.deepEqual(q.slice(2), ['n1', 'n2']);
});
