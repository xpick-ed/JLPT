import { test } from 'node:test';
import assert from 'node:assert/strict';
import { kanjiOf, strokeMatches } from '../web/js/modes/strokes.js';

test('kanjiOf extracts only kanji characters', () => {
  assert.deepEqual(kanjiOf('食べ物'), ['食', '物']);
  assert.deepEqual(kanjiOf('きっと'), []);
  assert.deepEqual(kanjiOf(''), []);
  assert.deepEqual(kanjiOf(undefined), []);
});

test('strokeMatches accepts a stroke tracing the template endpoints', () => {
  const exp = { x1: 10, y1: 10, x2: 90, y2: 90, len: 113 };
  const good = [{ x: 12, y: 9 }, { x: 50, y: 50 }, { x: 88, y: 91 }];
  assert.equal(strokeMatches(exp, good), true);
});

test('strokeMatches rejects wrong start, wrong end, or absurd length', () => {
  const exp = { x1: 10, y1: 10, x2: 90, y2: 90, len: 113 };
  assert.equal(strokeMatches(exp, [{ x: 60, y: 10 }, { x: 90, y: 90 }]), false);   // bad start
  assert.equal(strokeMatches(exp, [{ x: 10, y: 10 }, { x: 40, y: 90 }]), false);   // bad end
  // right endpoints but a huge scribble in between
  const scribble = [{ x: 10, y: 10 }];
  for (let i = 0; i < 20; i++) scribble.push({ x: i % 2 ? 100 : 0, y: 50 });
  scribble.push({ x: 90, y: 90 });
  assert.equal(strokeMatches(exp, scribble), false);
  assert.equal(strokeMatches(exp, [{ x: 10, y: 10 }]), false);                     // single point
  assert.equal(strokeMatches(null, [{ x: 0, y: 0 }, { x: 1, y: 1 }]), false);
});

test('stroke data files exist, parse, and hold plausible SVG paths', async () => {
  const fs = await import('node:fs');
  let total = 0;
  for (const lv of ['n5', 'n4', 'n3', 'n2', 'n1']) {
    const map = JSON.parse(fs.readFileSync(new URL(`../web/data/strokes_${lv}.json`, import.meta.url)));
    assert.ok(map._license.includes('KanjiVG'));
    delete map._license;
    for (const [ch, strokes] of Object.entries(map)) {
      assert.ok(Array.isArray(strokes) && strokes.length >= 1, ch);
      assert.ok(strokes.every(d => typeof d === 'string' && /^[Mm]/.test(d)), ch);
    }
    total += Object.keys(map).length;
  }
  assert.equal(total, 2217);
});
