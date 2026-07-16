import { test } from 'node:test';
import assert from 'node:assert/strict';
import { groupPatterns, filterPatterns } from '../web/js/modes/grammar-dict.js';

const pool = [
  { id: '1', pattern: '〜わけだ', meaning_zh: '難怪…', connection: '普通形＋わけだ', note: 'x', level: 'N3', before: 'a', answer: 'わけだ', after: '。' },
  { id: '2', pattern: '〜わけだ', meaning_zh: '難怪…', connection: '普通形＋わけだ', note: 'x', level: 'N3', before: 'b', answer: 'わけだ', after: '。' },
  { id: '3', pattern: '〜ばかりに', meaning_zh: '只因為…', connection: '', note: '', level: 'N2', before: 'c', answer: 'ばかりに', after: '。' },
];

test('groupPatterns collects items and levels per pattern', () => {
  const g = groupPatterns(pool);
  assert.equal(g.length, 2);
  const wake = g.find(x => x.pattern === '〜わけだ');
  assert.equal(wake.items.length, 2);
  assert.deepEqual([...wake.levels], ['N3']);
  assert.equal(wake.meaning_zh, '難怪…');
});

test('filterPatterns matches pattern or meaning substrings', () => {
  const g = groupPatterns(pool);
  assert.equal(filterPatterns(g, 'わけ').length, 1);
  assert.equal(filterPatterns(g, '只因').length, 1);
  assert.equal(filterPatterns(g, '').length, 2);
  assert.equal(filterPatterns(g, 'zzz').length, 0);
});

test('real grammar decks group into a sensible dictionary', async () => {
  const fs = await import('node:fs');
  const all = [];
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    all.push(...JSON.parse(fs.readFileSync(new URL(`../web/data/grammar_${lv}.json`, import.meta.url))));
  }
  const groups = groupPatterns(all);
  assert.ok(groups.length >= 200, String(groups.length));
  assert.ok(groups.every(g => g.items.length >= 1));
});
