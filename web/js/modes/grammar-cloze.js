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

// Build the post-answer explanation panel (句型/接續/用法/例句中譯) + 下一題 button.
// meaning_zh is omitted here because it is already shown as the pre-answer hint.
function explainHtml(item) {
  const row = (k, v) => v ? `<div class="ex-row"><span class="ex-k">${k}</span><span class="ex-v">${v}</span></div>` : '';
  return `
    <div class="cloze-explain">
      <div class="ex-pattern">${item.pattern}</div>
      ${row('接續', item.connection)}
      ${row('用法', item.note)}
      ${row('中譯', item.ex_zh)}
      <button type="button" class="cloze-next">下一題 →</button>
    </div>`;
}

/**
 * Mount one grammar cloze round.
 * item: { id, meaning_zh, before, answer, after, distractors:[3], pattern, connection, note, ex_zh }
 * After the user answers, the correct answer is revealed and an explanation
 * panel is shown; onResult(id, grade) fires when the user clicks 下一題.
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

  let answered = false;
  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.t;
    b.onclick = () => {
      if (answered) return;
      answered = true;
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
      // Show the explanation and let the user advance when ready.
      card_.insertAdjacentHTML('beforeend', explainHtml(item));
      const next = card_.querySelector('.cloze-next');
      if (next) {
        next.addEventListener('click', () => onResult(item.id, grade));
        next.focus();
      }
    };
    box.appendChild(b);
  }
}
