import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EXAM_SPEC, buildExam, scoreExam, verdictFor, SECTION_LABEL } from '../web/js/exam.js';

function decks(v = 30, c = 30, o = 30) {
  return {
    vocab: Array.from({ length: v }, (_, i) => ({ id: `v${i}`, word: `w${i}`, zh: `m${i}` })),
    cloze: Array.from({ length: c }, (_, i) => ({ id: `c${i}`, answer: `a${i}`, distractors: ['x', 'y', 'z'] })),
    order: Array.from({ length: o }, (_, i) => ({ id: `o${i}`, frags: ['1', '2', '3', '4'] })),
  };
}

test('buildExam keeps JLPT section order and the spec counts', () => {
  const qs = buildExam(decks(), EXAM_SPEC, Math.random);
  assert.equal(qs.length, EXAM_SPEC.vocab + EXAM_SPEC.cloze + EXAM_SPEC.order);
  assert.ok(qs.slice(0, EXAM_SPEC.vocab).every(q => q.kind === 'vocab'));
  assert.ok(qs.slice(EXAM_SPEC.vocab, EXAM_SPEC.vocab + EXAM_SPEC.cloze).every(q => q.kind === 'cloze'));
  assert.ok(qs.slice(-EXAM_SPEC.order).every(q => q.kind === 'order'));
  assert.equal(new Set(qs.map(q => q.item.id)).size, qs.length);   // no repeats
});

test('buildExam clamps to short decks', () => {
  const qs = buildExam(decks(5, 3, 1), EXAM_SPEC, Math.random);
  assert.equal(qs.filter(q => q.kind === 'vocab').length, 5);
  assert.equal(qs.filter(q => q.kind === 'cloze').length, 3);
  assert.equal(qs.filter(q => q.kind === 'order').length, 1);
});

test('scoreExam totals per section and overall percent', () => {
  const answers = [
    { kind: 'vocab', correct: true }, { kind: 'vocab', correct: false },
    { kind: 'cloze', correct: true }, { kind: 'order', correct: true },
  ];
  const s = scoreExam(answers);
  assert.equal(s.total, 4);
  assert.equal(s.correct, 3);
  assert.equal(s.pct, 75);
  assert.deepEqual(s.sections.vocab, { asked: 2, correct: 1 });
  assert.deepEqual(s.sections.order, { asked: 1, correct: 1 });
  assert.equal(scoreExam([]).pct, 0);   // time ran out with nothing answered
});

test('verdict bands at 80 / 60', () => {
  assert.equal(verdictFor(80).label, '合格圈內');
  assert.equal(verdictFor(79).label, '及格邊緣');
  assert.equal(verdictFor(60).label, '及格邊緣');
  assert.equal(verdictFor(59).label, '需要加強');
});

test('every section key has a label', () => {
  for (const k of ['vocab', 'cloze', 'order']) assert.ok(SECTION_LABEL[k]);
});
