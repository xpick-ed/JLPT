import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../web/js/modes/reading.js';

test('SOURCES is a non-empty list of well-formed entries', () => {
  assert.ok(Array.isArray(SOURCES) && SOURCES.length > 0);
  for (const s of SOURCES) {
    assert.ok(s.name && typeof s.name === 'string');
    assert.match(s.url, /^https:\/\//);
    assert.ok(s.level && typeof s.level === 'string');
    assert.ok(s.desc && typeof s.desc === 'string');
  }
});
