import { particles, stamp } from '../ui.js';
import { furiganaToRuby } from '../furigana.js';

// wrong→again; fast→easy; slow→hard; else good. Higher thresholds than cloze
// because ordering four fragments takes longer than picking one option.
export function gradeOrder({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 6000) return 'easy';
  if (elapsedMs > 15000) return 'hard';
  return 'good';
}

// Element-wise equality of the placed fragment sequence vs the correct order.
export function checkOrder(placed, frags) {
  if (placed.length !== frags.length) return false;
  return placed.every((v, i) => v === frags[i]);
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Post-answer explanation panel: full correct sentence + 句型/接續/用法/中譯 + 下一題.
function explainHtml(item) {
  const full = item.before + item.frags.join('') + item.after;
  const row = (k, v) => v ? `<div class="ex-row"><span class="ex-k">${k}</span><span class="ex-v">${v}</span></div>` : '';
  return `
    <div class="cloze-explain">
      <div class="ord-full">${furiganaToRuby(full)}</div>
      <div class="ex-pattern">${item.pattern}</div>
      ${row('接續', item.connection)}
      ${row('用法', item.note)}
      ${row('中譯', item.ex_zh)}
      <button type="button" class="cloze-next">下一題 →</button>
    </div>`;
}

/**
 * Mount one sentence-ordering round.
 * item: { id, before, frags:[4] (correct order), after, pattern, connection, note, ex_zh }
 * The learner taps the 4 shuffled fragments into 4 slots; when the 4th is placed
 * the full order is auto-checked. onResult(id, grade) fires on 下一題.
 */
export function mountGrammarOrder(root, item, pool, onResult, audio) {
  const start = performance.now();
  const correct = item.frags;                       // correct order (strings)
  const tray = shuffle(correct.map((f, i) => ({ f, i })));  // {fragment, origIndex}
  const placed = [];                                // tray positions, in placed order
  let answered = false;

  root.innerHTML = `
    <div class="card-wrap ord-wrap">
      <div class="ord-sentence">
        <span class="ord-stem">${furiganaToRuby(item.before)}</span>
        <span class="ord-slots"></span>
        <span class="ord-stem">${furiganaToRuby(item.after)}</span>
      </div>
      <div class="ord-tray"></div>
    </div>`;

  const card_ = root.querySelector('.card-wrap');
  const slotsEl = root.querySelector('.ord-slots');
  const trayEl = root.querySelector('.ord-tray');

  function renderSlots() {
    slotsEl.innerHTML = '';
    for (let k = 0; k < correct.length; k++) {
      const slot = document.createElement('button');
      slot.type = 'button';
      slot.className = 'ord-slot' + (k < placed.length ? ' filled' : '');
      slot.innerHTML = k < placed.length ? furiganaToRuby(tray[placed[k]].f) : '';
      if (k < placed.length) slot.onclick = () => { if (answered) return; placed.splice(k, 1); renderSlots(); renderTray(); };
      slotsEl.appendChild(slot);
    }
  }
  function renderTray() {
    trayEl.innerHTML = '';
    tray.forEach((t, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ord-frag';
      b.innerHTML = furiganaToRuby(t.f);
      const used = placed.includes(i);
      b.disabled = used || answered;
      if (used) b.classList.add('used');
      if (!answered && !used) b.onclick = () => {
        placed.push(i);
        renderSlots(); renderTray();
        if (placed.length === correct.length) check();
      };
      trayEl.appendChild(b);
    });
  }

  function check() {
    answered = true;
    const placedFrags = placed.map(i => tray[i].f);
    const ok = checkOrder(placedFrags, correct);
    const grade = gradeOrder({ correct: ok, elapsedMs: performance.now() - start });
    const slotEls = [...slotsEl.querySelectorAll('.ord-slot')];
    if (ok) {
      audio.hit();
      slotEls.forEach(s => s.classList.add('right'));
      const r = card_.getBoundingClientRect();
      particles(r.left + r.width / 2, r.top + r.height / 3);
    } else {
      audio.wrong();
      card_.classList.add('shake');
      // reveal the correct order in the slots
      slotEls.forEach((s, k) => { s.classList.add('reveal'); s.innerHTML = furiganaToRuby(correct[k]); });
    }
    stamp(card_, ok);
    renderTray(); // disables all
    card_.insertAdjacentHTML('beforeend', explainHtml(item));
    const next = card_.querySelector('.cloze-next');
    if (next) { next.addEventListener('click', () => onResult(item.id, grade)); next.focus(); }
  }

  renderSlots();
  renderTray();
}
