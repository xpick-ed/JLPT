import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, newCard, review, dueQueue } from '../web/js/srs.js';

const T = 1_000_000_000_000;

test('new card good schedules 1 day', () => {
  const c = review(newCard('a', T), 'good', T);
  assert.equal(c.interval, 1);
  assert.equal(c.due, T + DAY);
  assert.equal(c.reps, 1);
  assert.equal(c.isNew, false);
  assert.equal(c.lastGrade, 'good');
});

test('new card easy schedules 3 days and raises ease', () => {
  const c = review(newCard('a', T), 'easy', T);
  assert.equal(c.interval, 3);
  assert.ok(c.ease > 2.5);
});

test('again resets interval, adds lapse, due in 10 min', () => {
  let c = review(newCard('a', T), 'good', T);   // interval 1
  c = review(c, 'again', T + DAY);
  assert.equal(c.interval, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, T + DAY + 600000);
  assert.ok(c.ease < 2.5);
});

test('good on mature card multiplies by ease', () => {
  let c = review(newCard('a', T), 'good', T); // interval 1, ease 2.5
  c = review(c, 'good', T + DAY);
  assert.equal(c.interval, Math.round(1 * 2.5));
});

test('ease never drops below 1.3', () => {
  let c = newCard('a', T);
  for (let i = 0; i < 20; i++) c = review(c, 'again', T);
  assert.ok(c.ease >= 1.3);
});

test('dueQueue returns due sorted then new up to newPerDay', () => {
  const cards = {
    x: { id:'x', due: T - 1, updated:T },
    y: { id:'y', due: T - 5, updated:T },
    z: { id:'z', due: T + DAY*10, updated:T }, // not due
  };
  const pool = ['x','y','z','n1','n2','n3'];
  const q = dueQueue(cards, pool, T, 2);
  assert.deepEqual(q.slice(0,2), ['y','x']);      // due, earliest first
  assert.deepEqual(q.slice(2), ['n1','n2']);      // 2 new, pool order
});
