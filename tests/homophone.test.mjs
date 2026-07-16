import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homophonesOf } from '../web/js/modes/homophone.js';

const pool = [
  { id: '1', word: '観念', kana: 'かんねん', zh: '觀念' },
  { id: '2', word: '概念', kana: 'がいねん', zh: '概念' },
  { id: '3', word: '記念', kana: 'きねん', zh: '紀念' },
  { id: '4', word: '祈念', kana: 'きねん', zh: '祈願' },
  { id: '5', word: 'きねん', kana: 'きねん', zh: '（假名詞）' },
];

test('homophonesOf finds same-reading different-kanji words only', () => {
  assert.deepEqual(homophonesOf(pool[2], pool).map(c => c.word), ['祈念']);
  assert.deepEqual(homophonesOf(pool[0], pool), []);       // unique reading
});

test('homophonesOf excludes kana-only words and kana-only targets', () => {
  // the kana-only word きねん is not a written-form contrast
  assert.ok(!homophonesOf(pool[2], pool).some(c => c.word === 'きねん'));
  assert.deepEqual(homophonesOf(pool[4], pool), []);        // kana-only target
});

test('real decks contain a healthy number of homophone questions', async () => {
  const fs = await import('node:fs');
  const all = [];
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    all.push(...JSON.parse(fs.readFileSync(new URL(`../web/data/${lv}.json`, import.meta.url))));
  }
  const withTwins = all.filter(c => homophonesOf(c, all).length > 0);
  assert.ok(withTwins.length >= 300, String(withTwins.length));
});
