import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeCloze } from '../web/js/modes/vocab-cloze.js';

test('makeCloze blanks a plain noun with furigana', () => {
  const c = makeCloze({ word: '家', kana: 'いえ', ex: '家（いえ）に帰（かえ）ります。' });
  assert.deepEqual(c, { before: '', after: 'に帰（かえ）ります。' });
});

test('makeCloze handles conjugated verbs by shrinking the stem', () => {
  // 帰る appears as 帰（かえ）ります — the blank covers the kanji+reading only.
  const c = makeCloze({ word: '帰る', kana: 'かえる', ex: '家（いえ）に帰（かえ）ります。' });
  assert.deepEqual(c, { before: '家（いえ）に', after: 'ります。' });
});

test('makeCloze finds kana-only words by raw substring', () => {
  const c = makeCloze({ word: 'うち', kana: 'うち', ex: 'うちには猫（ねこ）が二匹（にひき）います。' });
  assert.deepEqual(c, { before: '', after: 'には猫（ねこ）が二匹（にひき）います。' });
});

test('makeCloze returns null when the word is not in the example', () => {
  assert.equal(makeCloze({ word: '学校', kana: 'がっこう', ex: '先生（せんせい）に会（あ）います。' }), null);
  assert.equal(makeCloze({ word: '学校', kana: 'がっこう', ex: '' }), null);
  assert.equal(makeCloze({ word: '学校', kana: 'がっこう' }), null);
});

test('makeCloze covers at least 85% of every real deck', async () => {
  const fs = await import('node:fs');
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    const deck = JSON.parse(fs.readFileSync(new URL(`../web/data/${lv}.json`, import.meta.url)));
    const ok = deck.filter(c => makeCloze(c)).length;
    assert.ok(ok / deck.length >= 0.85, `${lv}: ${ok}/${deck.length}`);
  }
});
