import { test } from 'node:test';
import assert from 'node:assert/strict';
import { chunkSentence, speechText } from '../web/js/modes/dictation.js';
import { shadowQueue, SPEEDS } from '../web/js/modes/shadow.js';

test('speechText strips furigana for TTS', () => {
  assert.equal(speechText('家（いえ）に帰（かえ）ります。'), '家に帰ります。');
  assert.equal(speechText(''), '');
  assert.equal(speechText(undefined), '');
});

test('chunkSentence cuts after particles and punctuation, rejoins to the original', () => {
  const ex = '私（わたし)は学校（がっこう）で日本語（にほんご）を勉強（べんきょう）します。';
  const ex2 = '私（わたし）は学校（がっこう）で日本語（にほんご）を勉強（べんきょう）します。';
  const frags = chunkSentence(ex2);
  assert.ok(frags.length >= 3 && frags.length <= 5, String(frags.length));
  assert.equal(frags.join(''), ex2);
  for (const f of frags) assert.ok(f.replace(/（[^）]*）/g, '').length >= 2, f);
});

test('chunkSentence returns null for too-short sentences', () => {
  assert.equal(chunkSentence('はい。'), null);
  assert.equal(chunkSentence(''), null);
  assert.equal(chunkSentence(undefined), null);
});

test('chunkSentence works on a healthy share of real deck examples', async () => {
  const fs = await import('node:fs');
  const deck = JSON.parse(fs.readFileSync(new URL('../web/data/n3.json', import.meta.url)));
  const ok = deck.filter(c => {
    const f = chunkSentence(c.ex);
    return f && f.join('') === c.ex;
  }).length;
  // Roughly half of the examples are long enough for a 3+-fragment reorder;
  // shorter ones fall back to the plain quiz in-app.
  assert.ok(ok / deck.length >= 0.45, `${ok}/${deck.length}`);
});

test('shadowQueue shuffles only cards with examples', () => {
  const pool = [
    { id: 'a', ex: 'x' }, { id: 'b' }, { id: 'c', ex: 'y' },
  ];
  const q = shadowQueue(pool, () => 0);
  assert.equal(q.length, 2);
  assert.ok(q.includes('a') && q.includes('c'));
});

test('shadow speeds are sane', () => {
  assert.ok(SPEEDS.every(s => s.rate >= 0.5 && s.rate <= 1.5));
});
