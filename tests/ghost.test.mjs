import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ghostScoreAt, mergeGhosts } from '../web/js/ghost.js';

test('ghostScoreAt is a step function over the run tape', () => {
  const samples = [[0, 0], [1000, 10], [2500, 30], [4000, 60]];
  assert.equal(ghostScoreAt(samples, 0), 0);
  assert.equal(ghostScoreAt(samples, 999), 0);
  assert.equal(ghostScoreAt(samples, 1000), 10);
  assert.equal(ghostScoreAt(samples, 3000), 30);
  assert.equal(ghostScoreAt(samples, 99999), 60);   // past the end → final score
  assert.equal(ghostScoreAt(undefined, 500), 0);
  assert.equal(ghostScoreAt([], 500), 0);
});

test('mergeGhosts keeps the higher falling score and the faster typing time', () => {
  const a = { falling: { score: 300, samples: [[0, 0]], at: 1 }, typing: { ms: 1500, at: 1 } };
  const b = { falling: { score: 500, samples: [[0, 0]], at: 2 }, typing: { ms: 2000, at: 2 } };
  const m = mergeGhosts(a, b);
  assert.equal(m.falling.score, 500);
  assert.equal(m.typing.ms, 1500);
  assert.deepEqual(mergeGhosts(undefined, b).falling.score, 500);
  assert.deepEqual(mergeGhosts(a, undefined), a);
  assert.deepEqual(mergeGhosts(undefined, undefined), {});
});
