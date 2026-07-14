import { test } from 'node:test';
import assert from 'node:assert/strict';
import { midiToFreq, ARP_NOTES, BGM_STYLES, normalizeStyle } from '../web/js/bgm.js';

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

test('BGM_STYLES has off plus real, fully-specified styles', () => {
  assert.equal(BGM_STYLES.off.label, '關閉');
  const real = Object.entries(BGM_STYLES).filter(([id]) => id !== 'off');
  assert.ok(real.length >= 3, 'expected at least 3 selectable styles');
  for (const [id, s] of real) {
    for (const k of ['label', 'arpType', 'filterHz', 'arpGain', 'oct', 'gap', 'rel', 'pad']) {
      assert.ok(s[k] !== undefined, `${id} missing ${k}`);
    }
    assert.equal(s.gap.length, 2);
  }
});

test('normalizeStyle coerces legacy and unknown values', () => {
  assert.equal(normalizeStyle('lofi'), 'lofi');     // valid id passes through
  assert.equal(normalizeStyle('off'), 'off');
  assert.equal(normalizeStyle(true), 'ambient');    // legacy bgm: true
  assert.equal(normalizeStyle(false), 'off');       // legacy bgm: false
  assert.equal(normalizeStyle(undefined), 'off');
  assert.equal(normalizeStyle('nope'), 'off');      // unknown id
});
