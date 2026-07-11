import { particles, stamp, confetti } from '../ui.js';

export function gradeMatch({ wrongBefore, elapsedMs, firstPickHit }) {
  if (wrongBefore > 0) return 'again';
  if (elapsedMs > 8000) return 'hard';
  if (elapsedMs < 2500 && firstPickHit) return 'easy';
  return 'good';
}

function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Mount a 6-pair (12-tile) matching board.
 * root: mount point element
 * cards: up to 6 {id, word, kana, zh, ...}
 * onResult(id, grade): called once per matched pair
 * audio: {hit(combo), wrong(), clear()}
 */
export function mountMatch(root, cards, onResult, audio) {
  const tiles = [];
  for (const c of cards) {
    tiles.push({ id: c.id, type: 'word', text: c.word, sub: c.kana });
    tiles.push({ id: c.id, type: 'meaning', text: c.zh, sub: '' });
  }
  const order = shuffle(tiles);

  root.innerHTML = `
    <div class="match-wrap">
      <div class="combo-badge" hidden><span class="combo-n">0</span><span class="combo-label">連擊</span></div>
      <div class="grid match-grid">
        ${order.map((t, i) => `
          <button type="button" class="tile tile-${t.type}" data-id="${t.id}" data-type="${t.type}" style="--deal-i:${i}">
            <span class="tile-text">${t.text}</span>
            ${t.sub ? `<span class="tile-sub">${t.sub}</span>` : ''}
          </button>`).join('')}
      </div>
    </div>`;

  const grid = root.querySelector('.match-grid');
  const comboBadge = root.querySelector('.combo-badge');
  const comboN = root.querySelector('.combo-n');

  let combo = 0;
  let selected = null; // { el, id, at }
  let wrongBefore = {}; // id -> count
  let matchedPairs = 0;
  let locked = false;
  const pending = []; // {id, grade} buffered until board fully clears

  function setCombo(n) {
    combo = n;
    comboN.textContent = String(combo);
    comboBadge.hidden = combo < 2;
    comboBadge.classList.toggle('combo-hot', combo >= 5);
  }

  grid.addEventListener('click', (e) => {
    const btn = e.target.closest('.tile');
    if (!btn || locked || btn.classList.contains('cleared') || btn.disabled) return;

    if (!selected) {
      selected = { el: btn, id: btn.dataset.id, at: performance.now() };
      btn.classList.add('picked');
      return;
    }

    if (selected.el === btn) return; // same tile re-clicked

    const isMatch = selected.id === btn.dataset.id;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2;

    if (isMatch) {
      locked = true;
      const elapsedMs = performance.now() - selected.at;
      const id = btn.dataset.id;
      const firstPickHit = !wrongBefore[id];
      const grade = gradeMatch({ wrongBefore: wrongBefore[id] || 0, elapsedMs, firstPickHit });
      combo += 1;
      setCombo(combo);
      audio.hit(combo);
      [selected.el, btn].forEach(el => el.classList.add('correct-pop'));
      particles(cx, cy);
      stamp(btn, true);
      setTimeout(() => {
        [selected.el, btn].forEach(el => el.classList.add('cleared'));
        matchedPairs += 1;
        selected = null;
        locked = false;
        // Defer onResult until the whole board is cleared: app.js's next()
        // unconditionally rebuilds the board on every onResult call, so
        // firing it mid-board would wipe out the remaining unmatched tiles.
        pending.push({ id, grade });
        if (matchedPairs * 2 === order.length) {
          audio.clear();
          confetti(root);
          setTimeout(() => {
            for (const p of pending) onResult(p.id, p.grade);
          }, 550);
        }
      }, 360);
    } else {
      locked = true;
      const bothIds = [selected.id, btn.dataset.id];
      bothIds.forEach(id => { wrongBefore[id] = (wrongBefore[id] || 0) + 1; });
      setCombo(0);
      audio.wrong();
      const prevSelected = selected.el;
      [prevSelected, btn].forEach(el => el.classList.add('shake'));
      stamp(btn, false);
      setTimeout(() => {
        [prevSelected, btn].forEach(el => { el.classList.remove('shake', 'picked'); });
        selected = null;
        locked = false;
      }, 420);
    }
  });
}
