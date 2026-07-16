import { stamp } from '../ui.js';
import { pitchHtml } from '../pitch.js';

export function hasKana(s) {
  return /[぀-ヿ]/.test(s);
}

export function normalizeRomaji(s) {
  let t = (s || '').toLowerCase()
    .replace(/[āàá]/g, 'a').replace(/[īìí]/g, 'i').replace(/[ūùú]/g, 'u')
    .replace(/[ēèé]/g, 'e').replace(/[ōòó]/g, 'o')
    .replace(/[^a-z]/g, '');
  t = t.replace(/ou/g, 'o').replace(/oo/g, 'o').replace(/uu/g, 'u').replace(/ei/g, 'e');
  return t;
}

export function checkTyping(input, card) {
  if (hasKana(input)) return input.trim() === card.kana;
  return normalizeRomaji(input) === normalizeRomaji(card.romaji);
}

export function gradeTyping({ correct, hadTypo, elapsedMs, firstTry, revealed }) {
  if (!correct || revealed) return 'again';
  if (firstTry && elapsedMs < 4000) return 'easy';
  if (hadTypo || elapsedMs > 8000) return 'hard';
  return 'good';
}

/**
 * Mount a single typing-recall card.
 * root: mount point element
 * card: {id, word, kana, romaji, zh, ...}
 * onResult(id, grade)
 * audio: {hit(combo), wrong(), clear()}
 * pb: {ms} — fastest clean first-try answer ever; onNewBest(ms) fires when beaten.
 */
export function mountTyping(root, card, onResult, audio, pb = null, onNewBest = null) {
  const start = performance.now();
  let attempts = 0;
  let hadTypo = false;
  let done = false;

  root.innerHTML = `
    <div class="card-wrap typing-wrap">
      ${pb ? `<div class="type-pb">⚡ 最速 ${(pb.ms / 1000).toFixed(1)}s</div>` : ''}
      <div class="prompt">
        <span class="jp">${card.word}</span>
        <span class="pos">${card.pos || ''}</span>
      </div>
      <div class="zh-hint">${card.zh}</div>
      <div class="type-row">
        <input type="text" class="type-input" placeholder="輸入讀音（かな或 romaji）" autocomplete="off" autocapitalize="off" spellcheck="false">
      </div>
      <div class="type-feedback" aria-live="polite"></div>
      <div class="type-actions">
        <button type="button" class="btn-ghost reveal-btn">顯示答案</button>
      </div>
    </div>`;

  const input = root.querySelector('.type-input');
  const feedback = root.querySelector('.type-feedback');
  const card_ = root.querySelector('.card-wrap');
  input.focus();

  function finish(grade, correct) {
    if (done) return;
    done = true;
    input.disabled = true;
    root.querySelector('.reveal-btn').disabled = true;
    stamp(card_, correct);
    setTimeout(() => onResult(card.id, grade), correct ? 380 : 550);
  }

  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || done) return;
    attempts += 1;
    const correct = checkTyping(input.value, card);
    if (correct) {
      const elapsedMs = performance.now() - start;
      const grade = gradeTyping({ correct: true, hadTypo, elapsedMs, firstTry: attempts === 1, revealed: false });
      card_.classList.add('correct-flash');
      audio.hit();
      feedback.innerHTML = `${pitchHtml(card.kana, card.acc)}（${card.romaji}）`;
      feedback.className = 'type-feedback ok';
      // Race yourself: a clean first-try answer faster than the record sets a new PB.
      if (attempts === 1 && !hadTypo && (!pb || elapsedMs < pb.ms)) {
        feedback.innerHTML += `　⚡ 新最速 ${(elapsedMs / 1000).toFixed(1)}s！`;
        if (onNewBest) onNewBest(Math.round(elapsedMs));
      }
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
    feedback.textContent = `${card.kana}（${card.romaji}）`;
    feedback.className = 'type-feedback revealed';
    const grade = gradeTyping({ correct: false, hadTypo, elapsedMs: performance.now() - start, firstTry: attempts === 0, revealed: true });
    finish(grade, false);
  });
}
