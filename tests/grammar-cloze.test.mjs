import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCloze } from '../web/js/modes/grammar-cloze.js';

test('gradeCloze mapping', () => {
  assert.equal(gradeCloze({ correct: false, elapsedMs: 800 }), 'again');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 800 }), 'easy');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 6000 }), 'hard');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 3000 }), 'good');
});
