import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeOrder, checkOrder } from '../web/js/modes/grammar-order.js';

test('gradeOrder mapping', () => {
  assert.equal(gradeOrder({ correct: false, elapsedMs: 3000 }), 'again');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 3000 }), 'easy');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 20000 }), 'hard');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 9000 }), 'good');
});

test('checkOrder true only for the exact sequence', () => {
  const frags = ['a', 'b', 'c', 'd'];
  assert.equal(checkOrder(['a', 'b', 'c', 'd'], frags), true);
  assert.equal(checkOrder(['a', 'c', 'b', 'd'], frags), false);
  assert.equal(checkOrder(['a', 'b', 'c'], frags), false);       // length mismatch
});
