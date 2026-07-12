import { particles, stamp } from '../ui.js';

// wrong→again; fast→easy; slow→hard; else good. Mirrors gradeQuiz thresholds.
export function gradeCloze({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 1500) return 'easy';
  if (elapsedMs > 5000) return 'hard';
  return 'good';
}

// 漢字（かな） → <ruby>漢字<rt>かな</rt></ruby>. A run of kanji immediately
// followed by full-width parens becomes ruby; everything else is untouched.
export function furiganaToRuby(s) {
  return String(s).replace(
    /([一-鿿々〆ヶ]+)（([^（）]*)）/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
}

/**
 * Mount one grammar cloze round.
 * item: { id, meaning_zh, before, answer, after, distractors:[3], ... }
 * onResult(id, grade) is called once, after the reveal delay.
 */
export function mountGrammarCloze(root, item, pool, onResult, audio) {
  const start = performance.now();
  const options = [item.answer, ...item.distractors]
    .map(t => ({ t, correct: t === item.answer }))
    .sort(() => Math.random() - 0.5);

  root.innerHTML = `
    <div class="card-wrap cloze-wrap">
      ${item.meaning_zh ? `<div class="cloze-hint">${item.meaning_zh}</div>` : ''}
      <div class="cloze-sentence">${furiganaToRuby(item.before)}<span class="cloze-blank" aria-label="填空"></span>${furiganaToRuby(item.after)}</div>
      <div class="options"></div>
    </div>`;

  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');
  const blank = root.querySelector('.cloze-blank');

  function reveal() {
    if (blank) { blank.textContent = item.answer; blank.classList.add('filled'); }
  }

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.t;
    b.onclick = () => {
      const elapsedMs = performance.now() - start;
      const grade = gradeCloze({ correct: opt.correct, elapsedMs });
      b.classList.add(opt.correct ? 'right' : 'wrong');
      if (opt.correct) {
        audio.hit();
        const rect = b.getBoundingClientRect();
        particles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        audio.wrong();
        card_.classList.add('shake');
        const rightBtn = [...box.children].find(c => c.textContent === item.answer);
        if (rightBtn) rightBtn.classList.add('right');
      }
      reveal();
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(item.id, grade), 700);
    };
    box.appendChild(b);
  }
}
