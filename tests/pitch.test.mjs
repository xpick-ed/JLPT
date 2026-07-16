import { test } from 'node:test';
import assert from 'node:assert/strict';
import { toMorae, pitchPattern, pitchHtml } from '../web/js/pitch.js';

test('toMorae attaches small kana to the previous mora', () => {
  assert.deepEqual(toMorae('がっこう'), ['が', 'っ', 'こ', 'う']);
  assert.deepEqual(toMorae('きょう'), ['きょ', 'う']);
  assert.deepEqual(toMorae('しゃちょう'), ['しゃ', 'ちょ', 'う']);
  assert.deepEqual(toMorae(''), []);
});

test('pitchPattern: 平板 (0) — low first, high rest, no drop', () => {
  const p = pitchPattern('さくら', 0);
  assert.deepEqual(p.levels, ['l', 'h', 'h']);
  assert.equal(p.drop, 0);
});

test('pitchPattern: 頭高 (1) — high first, low rest', () => {
  const p = pitchPattern('いち', 2);   // 中高/尾高 for いち [2]
  assert.deepEqual(p.levels, ['l', 'h']);
  assert.equal(p.drop, 2);
  const atama = pitchPattern('あめ', 1);
  assert.deepEqual(atama.levels, ['h', 'l']);
});

test('pitchPattern: 中高 (n) — rises then drops after mora n; clamps bad data', () => {
  const p = pitchPattern('かんねん', 1);
  assert.deepEqual(p.levels, ['h', 'l', 'l', 'l']);
  const naka = pitchPattern('たべもの', 3);
  assert.deepEqual(naka.levels, ['l', 'h', 'h', 'l']);
  const clamped = pitchPattern('あめ', 9);
  assert.equal(clamped.drop, 2);
});

test('pitchHtml falls back to plain kana without accent data', () => {
  assert.equal(pitchHtml('さくら', undefined), 'さくら');
  assert.equal(pitchHtml('さくら', null), 'さくら');
  assert.ok(pitchHtml('さくら', 0).includes('mora-h'));
  assert.ok(pitchHtml('たべもの', 3).includes('mora-drop'));
});

test('deck acc values are within mora range or clampable', async () => {
  const fs = await import('node:fs');
  let withAcc = 0, total = 0;
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    const deck = JSON.parse(fs.readFileSync(new URL(`../web/data/${lv}.json`, import.meta.url)));
    for (const c of deck) {
      total += 1;
      if (c.acc == null) continue;
      withAcc += 1;
      assert.ok(Number.isInteger(c.acc) && c.acc >= 0, `${c.word}: ${c.acc}`);
    }
  }
  assert.ok(withAcc / total >= 0.75, `${withAcc}/${total}`);
});
