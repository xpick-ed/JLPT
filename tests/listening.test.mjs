import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickJaVoice, gradeListening } from '../web/js/modes/listening.js';

test('pickJaVoice prefers exact ja-JP, then any ja-*, else null', () => {
  const jaJP = { lang: 'ja-JP', name: 'Kyoko' };
  const ja = { lang: 'ja', name: 'Generic' };
  const en = { lang: 'en-US', name: 'Samantha' };
  assert.equal(pickJaVoice([en, ja, jaJP]), jaJP);
  assert.equal(pickJaVoice([en, ja]), ja);
  assert.equal(pickJaVoice([en]), null);
  assert.equal(pickJaVoice([]), null);
  assert.equal(pickJaVoice(undefined), null);
});

test('gradeListening allows more time than the visual quiz', () => {
  assert.equal(gradeListening({ correct: false, elapsedMs: 1000 }), 'again');
  assert.equal(gradeListening({ correct: true, elapsedMs: 2000 }), 'easy');
  assert.equal(gradeListening({ correct: true, elapsedMs: 5000 }), 'good');
  assert.equal(gradeListening({ correct: true, elapsedMs: 9500 }), 'hard');
});
