import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDistractors, gradeQuiz } from '../web/js/modes/quiz.js';

const pool = [
  { id:'a', level:'N2', pos:'名', zh:'貓', kana:'ねこ' },
  { id:'b', level:'N2', pos:'名', zh:'狗', kana:'いぬ' },
  { id:'c', level:'N2', pos:'名', zh:'鳥', kana:'とり' },
  { id:'d', level:'N1', pos:'動I', zh:'跑', kana:'はしる' },
];

test('pickDistractors returns n unique other-meanings', () => {
  const d = pickDistractors(pool[0], pool, 3, () => 0);
  assert.equal(d.length, 3);
  assert.ok(!d.includes('貓'));
  assert.equal(new Set(d).size, 3);
});
test('pickDistractors reading field returns kana readings', () => {
  const d = pickDistractors(pool[0], pool, 3, () => 0, 'kana');
  assert.equal(d.length, 3);
  assert.ok(!d.includes('ねこ'));           // never the answer's own reading
  assert.ok(d.every(k => ['いぬ','とり','はしる'].includes(k)));
  assert.equal(new Set(d).size, 3);
});
test('gradeQuiz mapping', () => {
  assert.equal(gradeQuiz({ correct:false, elapsedMs:1000 }), 'again');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:1000 }), 'easy');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:6000 }), 'hard');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:3000 }), 'good');
});
