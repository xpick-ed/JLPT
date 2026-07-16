import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFalling, nextDifficulty, isLanded, POWER_UPS, shouldDropPower, pickPowerUp } from '../web/js/modes/falling.js';

test('gradeFalling by elapsed time', () => {
  assert.equal(gradeFalling(1000), 'easy');
  assert.equal(gradeFalling(2499), 'easy');
  assert.equal(gradeFalling(2500), 'good');
  assert.equal(gradeFalling(5999), 'good');
  assert.equal(gradeFalling(6000), 'hard');
  assert.equal(gradeFalling(99999), 'hard');
});

test('nextDifficulty ramps and clamps', () => {
  assert.deepEqual(nextDifficulty(0), { fallSpeed: 22, spawnInterval: 1200 });
  assert.deepEqual(nextDifficulty(10), { fallSpeed: 29, spawnInterval: 1000 });
  const hot = nextDifficulty(100000);
  assert.equal(hot.fallSpeed, 50);        // clamped
  assert.equal(hot.spawnInterval, 700);   // clamped
});

test('isLanded when tile bottom reaches floor', () => {
  assert.equal(isLanded(400, 60, 500), false); // bottom 460 < 500
  assert.equal(isLanded(440, 60, 500), true);  // bottom 500 >= 500
  assert.equal(isLanded(600, 60, 500), true);
});

test('power-ups drop on every 5-streak only', () => {
  assert.equal(shouldDropPower(0), false);
  assert.equal(shouldDropPower(4), false);
  assert.equal(shouldDropPower(5), true);
  assert.equal(shouldDropPower(7), false);
  assert.equal(shouldDropPower(10), true);
});

test('pickPowerUp covers the three distinct effects', () => {
  assert.deepEqual(POWER_UPS.map(p => p.id), ['bomb', 'slow', 'double']);
  assert.equal(new Set(POWER_UPS.map(p => p.id)).size, 3);
  assert.equal(pickPowerUp(() => 0).id, 'bomb');
  assert.equal(pickPowerUp(() => 0.5).id, 'slow');
  assert.equal(pickPowerUp(() => 0.99).id, 'double');
});
