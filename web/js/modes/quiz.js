function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(card, pool, n = 3, rnd = Math.random) {
  const others = pool.filter(c => c.id !== card.id && c.zh !== card.zh);
  const sameLevelPos = others.filter(c => c.level === card.level && c.pos === card.pos);
  const sameLevel = others.filter(c => c.level === card.level);
  const ranked = [...shuffle(sameLevelPos, rnd), ...shuffle(sameLevel, rnd), ...shuffle(others, rnd)];
  const out = [];
  for (const c of ranked) {
    if (out.length >= n) break;
    if (!out.includes(c.zh)) out.push(c.zh);
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

/**
 * Mount a single 4-choice quiz card.
 * root: mount point element
 * card: {id, word, kana, zh, ...}
 * pool: full candidate pool (for distractor sourcing)
 * onResult(id, grade)
 * audio: {hit(combo), wrong(), clear()}
 */
export function mountQuiz(root, card, pool, onResult, audio) {
  const start = performance.now();
  const options = [card.zh, ...pickDistractors(card, pool, 3)]
    .map(zh => ({ zh, correct: zh === card.zh }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap quiz-wrap">
      <div class="prompt">
        <span class="jp">${card.word}</span>
        <span class="kana">${card.kana}</span>
      </div>
      <div class="options"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.zh;
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
        const correctBtn = [...box.children].find(c => c.textContent === card.zh);
        if (correctBtn) correctBtn.classList.add('right');
      }
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(card.id, grade), 650);
    };
    box.appendChild(b);
  }
}
