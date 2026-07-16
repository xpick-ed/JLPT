import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAudio, VOICE_IDS } from '../web/js/audio.js';

test('VOICE_IDS covers exactly the eight playable modes', () => {
  assert.deepEqual([...VOICE_IDS].sort(), ['cloze', 'excloze', 'falling', 'listen', 'match', 'order', 'quiz', 'typing']);
});

test('makeAudio exposes the event + control surface', () => {
  const a = makeAudio(false);
  for (const m of ['hit', 'wrong', 'clear', 'setMode', 'setEnabled']) {
    assert.equal(typeof a[m], 'function', `missing ${m}`);
  }
});

test('setMode + events are no-ops when disabled (no AudioContext needed)', () => {
  const a = makeAudio(false);                 // Web Audio absent in node
  for (const id of VOICE_IDS) {
    a.setMode(id);
    assert.doesNotThrow(() => { a.hit(3); a.wrong(); a.clear(); });
  }
  a.setMode('nonexistent');                   // ignored, still no throw
  assert.doesNotThrow(() => a.hit());
});
