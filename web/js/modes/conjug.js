// 變位特訓: given a verb and a target form, type the conjugation in kana.
// Verb classes come from the deck's pos tags; forms scale with the card's level.

import { conjugate, verbClass, dictForm, formsForLevel } from '../conjugate.js';
import { gradeTyping } from './typing.js';
import { stamp } from '../ui.js';

/** Mount one conjugation question. Caller ensures isConjugatable(card). */
export function mountConjug(root, card, onResult, audio) {
  const start = performance.now();
  const cls = verbClass(card);
  const kana = dictForm(card);
  const forms = formsForLevel(card.level);
  const form = forms[Math.floor(Math.random() * forms.length)];
  const answer = conjugate(kana, cls, form.id);
  let attempts = 0, hadTypo = false, done = false;

  root.innerHTML = `
    <div class="card-wrap typing-wrap conjug-wrap">
      <div class="prompt">
        <span class="jp">${card.word}</span>
        <span class="kana">${kana}　·　${card.zh}</span>
      </div>
      <div class="conjug-target">改成 <b>${form.label}</b></div>
      <div class="type-row">
        <input type="text" class="type-input" placeholder="輸入${form.label}（假名）" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="type-feedback" aria-live="polite"></div>
      <div class="type-actions">
        <button type="button" class="btn-ghost reveal-btn">顯示答案</button>
      </div>
      <button type="button" class="cloze-next conjug-next" hidden>下一題 →</button>
    </div>`;

  const input = root.querySelector('.type-input');
  const feedback = root.querySelector('.type-feedback');
  const card_ = root.querySelector('.card-wrap');
  const nextBtn = root.querySelector('.conjug-next');
  input.focus();

  function finish(grade, correct) {
    if (done) return;
    done = true;
    input.disabled = true;
    root.querySelector('.reveal-btn').disabled = true;
    stamp(card_, correct);
    // A correct answer keeps the pace snappy; revealing the answer waits for
    // the learner to actually read it and click on.
    if (correct) {
      setTimeout(() => onResult(card.id, grade), 500);
    } else {
      nextBtn.hidden = false;
      nextBtn.focus();
      nextBtn.onclick = () => onResult(card.id, grade);
    }
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || done) return;
    attempts += 1;
    const correct = input.value.trim() === answer;
    if (correct) {
      const elapsedMs = performance.now() - start;
      const grade = gradeTyping({ correct: true, hadTypo, elapsedMs, firstTry: attempts === 1, revealed: false });
      card_.classList.add('correct-flash');
      audio.hit();
      feedback.textContent = answer;
      feedback.className = 'type-feedback ok';
      finish(grade, true);
    } else {
      hadTypo = true;
      audio.wrong();
      card_.classList.add('shake');
      setTimeout(() => card_.classList.remove('shake'), 420);
      feedback.textContent = '再試一次';
      feedback.className = 'type-feedback bad';
      input.select();
    }
  });

  root.querySelector('.reveal-btn').addEventListener('click', () => {
    if (done) return;
    feedback.textContent = answer;
    feedback.className = 'type-feedback revealed';
    finish('again', false);
  });
}
