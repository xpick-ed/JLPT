import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRomaji, hasKana, checkTyping, gradeTyping } from '../web/js/modes/typing.js';

test('normalizeRomaji is long-vowel insensitive', () => {
  assert.equal(normalizeRomaji('kyō'), normalizeRomaji('kyou'));
  assert.equal(normalizeRomaji('kyō'), normalizeRomaji('kyoo'));
  assert.equal(normalizeRomaji('gakkō'), normalizeRomaji('gakkou'));
});
test('checkTyping accepts romaji variants', () => {
  const card = { kana:'きょう', romaji:'kyō' };
  assert.equal(checkTyping('kyou', card), true);
  assert.equal(checkTyping('KYŌ', card), true);
  assert.equal(checkTyping('ashita', card), false);
});
test('checkTyping accepts kana input', () => {
  assert.equal(hasKana('きょう'), true);
  assert.equal(checkTyping('きょう', { kana:'きょう', romaji:'kyō' }), true);
});
test('gradeTyping mapping', () => {
  assert.equal(gradeTyping({ correct:false, revealed:true }), 'again');
  assert.equal(gradeTyping({ correct:true, firstTry:true, elapsedMs:2000 }), 'easy');
  assert.equal(gradeTyping({ correct:true, hadTypo:true, elapsedMs:3000 }), 'hard');
  assert.equal(gradeTyping({ correct:true, firstTry:false, hadTypo:false, elapsedMs:5000 }), 'good');
});
