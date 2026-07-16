function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// field is the property distractors are drawn from: 'zh' (meaning) or 'kana' (reading).
export function pickDistractors(card, pool, n = 3, rnd = Math.random, field = 'zh') {
  const others = pool.filter(c => c.id !== card.id && c[field] !== card[field]);
  const sameLevelPos = others.filter(c => c.level === card.level && c.pos === card.pos);
  const sameLevel = others.filter(c => c.level === card.level);
  const ranked = [...shuffle(sameLevelPos, rnd), ...shuffle(sameLevel, rnd), ...shuffle(others, rnd)];
  const out = [];
  for (const c of ranked) {
    if (out.length >= n) break;
    if (!out.includes(c[field])) out.push(c[field]);
  }
  return out;
}

export function gradeQuiz({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 1500) return 'easy';
  if (elapsedMs > 5000) return 'hard';
  return 'good';
}

import { particles, stamp } from '../ui.js';
import { pitchHtml } from '../pitch.js';

/**
 * Mount a single 4-choice quiz card.
 * root: mount point element
 * card: {id, word, kana, zh, ...}
 * pool: full candidate pool (for distractor sourcing)
 * onResult(id, grade)
 * audio: {hit(combo), wrong(), clear()}
 */
export function mountQuiz(root, card, pool, onResult, audio, pairMode = 'meaning') {
  const start = performance.now();
  // 'reading' mode: prompt is the kanji word (kana hidden — it's the answer),
  // options are 4 kana readings. 'meaning' mode: prompt shows word + reading,
  // options are 4 Chinese meanings.
  const reading = pairMode === 'reading';
  const field = reading ? 'kana' : 'zh';
  const answer = card[field];
  const options = [answer, ...pickDistractors(card, pool, 3, Math.random, field)]
    .map(val => ({ val, correct: val === answer }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap quiz-wrap">
      <div class="prompt">
        <span class="jp">${card.word}</span>
        ${reading ? '' : `<span class="kana">${pitchHtml(card.kana, card.acc)}</span>`}
      </div>
      <div class="options"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');

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
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(card.id, grade), 650);
    };
    box.appendChild(b);
  }
}
