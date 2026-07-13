import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const ICONS = [
  'web/icons/icon-192.png',
  'web/icons/icon-512.png',
  'web/icons/icon-maskable-512.png',
  'web/icons/apple-touch-icon.png',
];

test('icon PNGs exist, are non-trivial, and have PNG magic bytes', () => {
  for (const p of ICONS) {
    const buf = readFileSync(p);
    assert.ok(buf.length > 500, `${p} too small`);
    assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], `${p} not a PNG`);
  }
});

test('manifest.json is valid, standalone, with maskable + >=2 icons', () => {
  const m = JSON.parse(readFileSync('web/manifest.json', 'utf8'));
  assert.equal(m.display, 'standalone');
  assert.ok(m.name && m.short_name, 'name/short_name present');
  assert.equal(m.start_url, '.');
  assert.equal(m.scope, '.');
  assert.ok(Array.isArray(m.icons) && m.icons.length >= 2, '>=2 icons');
  assert.ok(m.icons.some(i => i.purpose === 'maskable'), 'has a maskable icon');
});
