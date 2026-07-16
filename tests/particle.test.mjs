import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PARTICLES, makeParticleCloze, particleDistractors } from '../web/js/modes/particle.js';

test('makeParticleCloze blanks a particle after a furigana group', () => {
  const c = makeParticleCloze({ ex: '家（いえ）に帰（かえ）ります。' }, () => 0);
  assert.deepEqual(c, { before: '家（いえ）', after: '帰（かえ）ります。', answer: 'に' });
});

test('makeParticleCloze prefers the long particle から over が', () => {
  const c = makeParticleCloze({ ex: '学校（がっこう）から帰（かえ）ります。' }, () => 0);
  assert.equal(c.answer, 'から');
});

test('makeParticleCloze never blanks hiragana inside a word', () => {
  // に in こんにちは is word-internal (preceded by hiragana) → no match anywhere
  assert.equal(makeParticleCloze({ ex: 'こんにちは。' }), null);
  assert.equal(makeParticleCloze({ ex: '' }), null);
  assert.equal(makeParticleCloze({}), null);
});

test('makeParticleCloze picks among multiple spots deterministically with rnd', () => {
  const ex = '私（わたし）は学校（がっこう）で勉強（べんきょう）します。';
  const first = makeParticleCloze({ ex }, () => 0);
  const second = makeParticleCloze({ ex }, () => 0.99);
  assert.equal(first.answer, 'は');
  assert.equal(second.answer, 'で');
});

test('particleDistractors returns 3 distinct particles, never the answer', () => {
  for (let i = 0; i < 20; i++) {
    const d = particleDistractors('に');
    assert.equal(d.length, 3);
    assert.ok(!d.includes('に'));
    assert.equal(new Set(d).size, 3);
    for (const p of d) assert.ok(PARTICLES.includes(p));
  }
});

test('makeParticleCloze covers at least 80% of every real deck', async () => {
  const fs = await import('node:fs');
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    const deck = JSON.parse(fs.readFileSync(new URL(`../web/data/${lv}.json`, import.meta.url)));
    const ok = deck.filter(c => makeParticleCloze(c)).length;
    assert.ok(ok / deck.length >= 0.8, `${lv}: ${ok}/${deck.length}`);
  }
});
