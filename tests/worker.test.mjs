import { test } from 'node:test';
import assert from 'node:assert/strict';
import { validateClaims } from '../worker/index.js';

const CID = 'my-client-id.apps.googleusercontent.com';
const now = 1_000_000;
const good = { aud: CID, iss: 'accounts.google.com', exp: now + 3600, email_verified: 'true', sub: '123', email: 'a@b.com', name: 'A' };

test('accepts a good token', () => {
  const v = validateClaims(good, CID, now);
  assert.equal(v.ok, true);
  assert.equal(v.sub, '123');
  assert.equal(v.email, 'a@b.com');
  assert.equal(v.name, 'A');
});
test('rejects wrong aud', () => assert.equal(validateClaims({ ...good, aud: 'x' }, CID, now).ok, false));
test('rejects wrong iss', () => assert.equal(validateClaims({ ...good, iss: 'evil.com' }, CID, now).ok, false));
test('accepts the https iss form', () => assert.equal(validateClaims({ ...good, iss: 'https://accounts.google.com' }, CID, now).ok, true));
test('rejects expired', () => assert.equal(validateClaims({ ...good, exp: now - 1 }, CID, now).ok, false));
test('rejects unverified email', () => assert.equal(validateClaims({ ...good, email_verified: 'false' }, CID, now).ok, false));
test('accepts boolean email_verified true', () => assert.equal(validateClaims({ ...good, email_verified: true }, CID, now).ok, true));
test('rejects missing sub', () => assert.equal(validateClaims({ ...good, sub: undefined }, CID, now).ok, false));
