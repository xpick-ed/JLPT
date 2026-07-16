// 同音辨析: same reading, different kanji (観念/概念…). Prompt is the reading
// plus THIS card's meaning; pick the kanji that carries that meaning. Options
// are the card's real homophones, padded with look-alike words when the group
// is small. After answering, every option reveals its own meaning.

import { pickDistractors, gradeQuiz } from './quiz.js';
import { particles, stamp } from '../ui.js';

/** Other cards in the pool with the same reading but a different written form. */
export function homophonesOf(card, pool) {
  if (!card || card.word === card.kana) return [];
  return pool.filter(c => c.kana === card.kana && c.word !== card.word && c.word !== c.kana);
}

/** Mount one homophone question. Caller ensures homophonesOf() is non-empty. */
export function mountHomophone(root, card, pool, onResult, audio) {
  const start = performance.now();
  const twins = homophonesOf(card, pool);
  const zhByWord = new Map(pool.map(c => [c.word, c.zh]));
  const answer = card.word;
  const optionWords = [answer, ...twins.map(c => c.word)].slice(0, 4);
  if (optionWords.length < 4) {
    for (const w of pickDistractors(card, pool, 4 - optionWords.length, Math.random, 'word')) {
      if (!optionWords.includes(w)) optionWords.push(w);
    }
  }
  const options = optionWords
    .map(val => ({ val, correct: val === answer }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap homophone-wrap">
      <div class="prompt">
        <span class="jp">${card.kana}</span>
        <span class="kana">同音異字 — 選出符合意思的寫法</span>
      </div>
      <div class="zh-hint">${card.zh}</div>
      <div class="options"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.innerHTML = `<span class="opt-word">${opt.val}</span>`;
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
      }
      // Reveal every option's meaning — the comparison IS the lesson.
      for (const c of box.children) {
        const w = c.querySelector('.opt-word')?.textContent;
        if (w === answer) c.classList.add('right');
        const zh = zhByWord.get(w);
        if (zh) c.insertAdjacentHTML('beforeend', `<span class="opt-zh">${zh}</span>`);
        c.disabled = true;
      }
      stamp(b, opt.correct);
      setTimeout(() => onResult(card.id, grade), 1500);
    };
    box.appendChild(b);
  }
}
