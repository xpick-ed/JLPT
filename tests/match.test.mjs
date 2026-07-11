import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeMatch } from '../web/js/modes/match.js';

test('mismatch before clear => again', () => {
  assert.equal(gradeMatch({ wrongBefore: 1, elapsedMs: 1000, firstPickHit: false }), 'again');
});
test('slow clean => hard', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 9000, firstPickHit: false }), 'hard');
});
test('fast first-pick => easy', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 2000, firstPickHit: true }), 'easy');
});
test('normal clean => good', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 4000, firstPickHit: true }), 'good');
});
