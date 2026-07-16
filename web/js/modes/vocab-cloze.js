// 例句挖空: the card's own example sentence with the target word blanked out;
// pick the word that fits from four choices. Uses the ex/ex_zh fields already
// present in every vocab deck — no extra data or build step.

import { pickDistractors, gradeQuiz } from './quiz.js';
import { furiganaToRuby } from '../furigana.js';
import { particles, stamp } from '../ui.js';
import { pitchHtml } from '../pitch.js';

/**
 * Locate the target word inside its furigana-annotated example sentence and
 * split around it. Handles conjugation by shrinking word/kana together from
 * the right (帰る/かえる matches 帰（かえ）ります), and kana-only words by raw
 * substring. Returns { before, after } (raw furigana text) or null.
 */
export function makeCloze(card) {
  const { word, kana, ex } = card;
  if (!ex || !word) return null;
  let stem = word, kstem = kana || '';
  while (stem.length && kstem.length) {
    const target = `${stem}（${kstem}）`;
    const i = ex.indexOf(target);
    if (i >= 0) return { before: ex.slice(0, i), after: ex.slice(i + target.length) };
    if (stem[stem.length - 1] === kstem[kstem.length - 1]) { stem = stem.slice(0, -1); kstem = kstem.slice(0, -1); }
    else break;
  }
  const j = ex.indexOf(word);
  if (j >= 0) return { before: ex.slice(0, j), after: ex.slice(j + word.length) };
  return null;
}

/**
 * Mount one example-sentence cloze. Caller must ensure makeCloze(card) is
 * non-null (app.js falls back to the plain quiz otherwise).
 */
export function mountVocabCloze(root, card, pool, onResult, audio) {
  const start = performance.now();
  const cloze = makeCloze(card);
  const answer = card.word;
  const options = [answer, ...pickDistractors(card, pool, 3, Math.random, 'word')]
    .map(val => ({ val, correct: val === answer }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap excloze-wrap">
      <div class="cloze-sentence">${furiganaToRuby(cloze.before)}<span class="cloze-blank" aria-label="填空"></span>${furiganaToRuby(cloze.after)}</div>
      <div class="excloze-zh">${card.ex_zh || ''}</div>
      <div class="listen-reveal" hidden></div>
      <div class="options"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');
  const blank = root.querySelector('.cloze-blank');
  const reveal = root.querySelector('.listen-reveal');

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.val;
    b.onclick = () => {
      const elapsedMs = performance.now() - start;
      const grade = gradeQuiz({ correct: opt.correct, elapsedMs });
      b.classList.add(opt.correct ? 'right' : 'wrong');
      if (opt.correct) {
        audio.hit();
        const rect = b.getBoundingClientRect();
        particles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        audio.wrong();
        card_.classList.add('shake');
        const correctBtn = [...box.children].find(c => c.textContent === answer);
        if (correctBtn) correctBtn.classList.add('right');
      }
      blank.textContent = answer;
      blank.classList.add('filled');
      reveal.hidden = false;
      reveal.innerHTML = `${card.word}（${pitchHtml(card.kana, card.acc)}）— ${card.zh}`;
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(card.id, grade), 1200);
    };
    box.appendChild(b);
  }
}
