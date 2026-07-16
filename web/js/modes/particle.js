// 助詞填空: blank a particle out of the card's example sentence and pick the
// right one from four choices. Particles are only matched right after a kanji
// or a furigana group（…）so we never blank a hiragana that is part of a word.

import { furiganaToRuby } from '../furigana.js';
import { particles, stamp } from '../ui.js';
import { gradeQuiz } from './quiz.js';

// Longest first so から/まで win over が/ま single-char lookalikes.
export const PARTICLES = ['から', 'まで', 'は', 'が', 'を', 'に', 'で', 'と', 'も', 'へ'];

const BOUNDARY = new RegExp(`(）|[一-龯])(${PARTICLES.join('|')})`, 'g');

/**
 * Find blankable particles in the furigana-annotated example. Returns
 * { before, after, answer } for a randomly chosen occurrence, or null.
 */
export function makeParticleCloze(card, rnd = Math.random) {
  const ex = card.ex;
  if (!ex) return null;
  const spots = [];
  BOUNDARY.lastIndex = 0;
  let m;
  while ((m = BOUNDARY.exec(ex))) {
    const at = m.index + m[1].length;
    spots.push({ at, answer: m[2] });
    BOUNDARY.lastIndex = at + m[2].length;   // allow adjacent matches
  }
  if (!spots.length) return null;
  const s = spots[Math.floor(rnd() * spots.length)];
  return { before: ex.slice(0, s.at), after: ex.slice(s.at + s.answer.length), answer: s.answer };
}

/** Three particle distractors, never the answer, stable pool. */
export function particleDistractors(answer, rnd = Math.random) {
  const others = PARTICLES.filter(p => p !== answer);
  for (let i = others.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [others[i], others[j]] = [others[j], others[i]];
  }
  return others.slice(0, 3);
}

/** Mount one particle-cloze question. Caller ensures makeParticleCloze ≠ null. */
export function mountParticle(root, card, onResult, audio) {
  const start = performance.now();
  const cloze = makeParticleCloze(card);
  const options = [cloze.answer, ...particleDistractors(cloze.answer)]
    .map(val => ({ val, correct: val === cloze.answer }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap excloze-wrap">
      <div class="cloze-sentence">${furiganaToRuby(cloze.before)}<span class="cloze-blank particle-blank" aria-label="填助詞"></span>${furiganaToRuby(cloze.after)}</div>
      <div class="excloze-zh">${card.ex_zh || ''}</div>
      <div class="options options-row"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');
  const blank = root.querySelector('.cloze-blank');

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt opt-particle';
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
        const correctBtn = [...box.children].find(c => c.textContent === cloze.answer);
        if (correctBtn) correctBtn.classList.add('right');
      }
      blank.textContent = cloze.answer;
      blank.classList.add('filled');
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(card.id, grade), 1000);
    };
    box.appendChild(b);
  }
}
