import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midiToFreq, ARP_NOTES } from '../web/js/bgm.js';

test('midiToFreq maps MIDI note numbers to frequencies', () => {
  assert.equal(midiToFreq(69), 440);                    // A4 anchor
  assert.ok(Math.abs(midiToFreq(60) - 261.626) < 0.01); // middle C
  assert.ok(Math.abs(midiToFreq(81) - 880) < 0.001);    // octave up = double
});

test('arp notes are a two-octave C-major pentatonic', () => {
  assert.equal(ARP_NOTES.length, 8);
  // every note is a pentatonic pitch class (C D E G A = 0 2 4 7 9)
  const penta = new Set([0, 2, 4, 7, 9]);
  for (const m of ARP_NOTES) assert.ok(penta.has(m % 12), `${m} not pentatonic`);
});
