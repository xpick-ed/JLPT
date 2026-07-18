// 筆順描紅: trace each kanji of the current word stroke by stroke over a faint
// KanjiVG template. A stroke counts when it starts and ends near the template
// stroke's endpoints with a plausible length — forgiving enough for a finger,
// strict enough to enforce stroke order. Free practice: no SRS.

export function kanjiOf(word) {
  return [...(word || '')].filter(ch => ch >= '一' && ch <= '鿿');
}

/**
 * Does a drawn polyline (viewBox coords) match the expected stroke?
 * exp: { x1, y1, x2, y2, len } — template endpoints and length.
 */
export function strokeMatches(exp, pts, tol = 18) {
  if (!exp || !pts || pts.length < 2) return false;
  const d = (a, b, x, y) => Math.hypot(a - x, b - y);
  if (d(pts[0].x, pts[0].y, exp.x1, exp.y1) > tol) return false;
  if (d(pts[pts.length - 1].x, pts[pts.length - 1].y, exp.x2, exp.y2) > tol) return false;
  let len = 0;
  for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  return len >= exp.len * 0.4 && len <= exp.len * 2.5;
}

const cache = {};   // level -> {kanji: [d, ...]}
// build_strokes.py emits each kanji ONCE, at the lowest level that uses it, so
// the per-level files are a partition rather than self-contained sets: an N1
// word written with everyday kanji has its strokes in strokes_n5.json. Always
// load the full union — anything less silently drops most words from tracing.
const STROKE_LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];
async function loadStrokeMaps() {
  const map = {};
  for (const lv of STROKE_LEVELS) {
    if (!cache[lv]) {
      try { cache[lv] = await (await fetch(`data/strokes_${lv}.json`)).json(); }
      catch { cache[lv] = {}; }
    }
    Object.assign(map, cache[lv]);
  }
  delete map._license;
  return map;
}

function shuffle(a) {
  const x = a.slice();
  for (let i = x.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [x[i], x[j]] = [x[j], x[i]];
  }
  return x;
}

export function mountStrokes(root, pool, audio) {
  root.innerHTML = '<div class="done"><div class="done-emoji">✍️</div><p class="done-msg">載入筆順資料…</p></div>';
  let dead = false;
  loadStrokeMaps().then(map => {
    if (dead || !root.isConnected) return;
    const cards = shuffle(pool.filter(c => kanjiOf(c.word).some(ch => map[ch])));
    if (!cards.length) {
      root.innerHTML = '<div class="done"><div class="done-emoji">📚</div><p class="done-msg">這個範圍沒有可描紅的漢字</p></div>';
      return;
    }
    let ci = 0;
    mountCard(cards[ci]);

    function mountCard(card) {
      const chars = kanjiOf(card.word).filter(ch => map[ch]);
      let ki = 0;
      mountKanji();

      function mountKanji() {
        const ch = chars[ki];
        const strokes = map[ch];
        let si = 0;                       // next stroke to trace
        root.innerHTML = `
          <div class="card-wrap strokes-wrap">
            <div class="strokes-head">${card.word}（${card.kana}）— ${card.zh}<span class="strokes-which">第 ${ki + 1}/${chars.length} 字：${ch}</span></div>
            <div class="strokes-stage">
              <svg class="strokes-svg" viewBox="0 0 109 109" aria-label="筆順">
                <line x1="54.5" y1="0" x2="54.5" y2="109" class="strokes-grid"/>
                <line x1="0" y1="54.5" x2="109" y2="54.5" class="strokes-grid"/>
                ${strokes.map((d, i) => `<path class="strokes-tpl" data-i="${i}" d="${d}"/>`).join('')}
              </svg>
              <canvas class="strokes-canvas" width="440" height="440"></canvas>
            </div>
            <div class="strokes-progress">筆畫 <b>${si}</b> / ${strokes.length}</div>
            <div class="vt-actions">
              <button type="button" class="btn-ghost" id="st-anim">看動畫</button>
              <button type="button" class="btn-ghost" id="st-hint">提示這一筆</button>
              <button type="button" class="btn-ghost" id="st-skip">跳過此字</button>
              <button type="button" class="btn-primary" id="st-next">下一詞 →</button>
            </div>
          </div>`;
        const svg = root.querySelector('.strokes-svg');
        const tpls = [...svg.querySelectorAll('.strokes-tpl')];
        const canvas = root.querySelector('.strokes-canvas');
        const ctx = canvas.getContext('2d');
        const progressEl = root.querySelector('.strokes-progress b');
        // template endpoints + lengths, via the browser's path geometry
        const exps = tpls.map(p => {
          const len = p.getTotalLength();
          const a = p.getPointAtLength(0), b = p.getPointAtLength(len);
          return { x1: a.x, y1: a.y, x2: b.x, y2: b.y, len };
        });

        function markDone(i) { tpls[i].classList.add('strokes-done'); }
        function animateStroke(i, dur = 450) {
          const p = tpls[i];
          const len = exps[i].len;
          p.classList.add('strokes-anim');
          p.style.strokeDasharray = String(len);
          p.style.strokeDashoffset = String(len);
          p.getBoundingClientRect();          // flush
          p.style.transition = `stroke-dashoffset ${dur}ms ease`;
          p.style.strokeDashoffset = '0';
          setTimeout(() => {
            p.classList.remove('strokes-anim');
            p.style.transition = p.style.strokeDasharray = p.style.strokeDashoffset = '';
          }, dur + 80);
        }
        root.querySelector('#st-anim').addEventListener('click', () => {
          strokes.forEach((_, i) => setTimeout(() => animateStroke(i), i * 500));
        });
        root.querySelector('#st-hint').addEventListener('click', () => { if (si < strokes.length) animateStroke(si); });
        root.querySelector('#st-skip').addEventListener('click', nextKanji);
        root.querySelector('#st-next').addEventListener('click', () => { ci = (ci + 1) % cards.length; mountCard(cards[ci]); });

        // ----- tracing
        let pts = null;
        const toView = (e) => {
          const r = canvas.getBoundingClientRect();
          return { x: (e.clientX - r.left) / r.width * 109, y: (e.clientY - r.top) / r.height * 109 };
        };
        const px = (v) => v / 109 * canvas.width;
        canvas.addEventListener('pointerdown', (e) => {
          if (si >= strokes.length) return;
          canvas.setPointerCapture(e.pointerId);
          pts = [toView(e)];
        });
        canvas.addEventListener('pointermove', (e) => {
          if (!pts) return;
          const p = toView(e);
          const q = pts[pts.length - 1];
          ctx.strokeStyle = 'rgba(120,120,130,.8)';
          ctx.lineWidth = 10; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.moveTo(px(q.x), px(q.y)); ctx.lineTo(px(p.x), px(p.y)); ctx.stroke();
          pts.push(p);
        });
        canvas.addEventListener('pointerup', () => {
          if (!pts) return;
          const ok = strokeMatches(exps[si], pts);
          pts = null;
          ctx.clearRect(0, 0, canvas.width, canvas.height);
          if (ok) {
            markDone(si);
            si += 1;
            progressEl.textContent = String(si);
            if (si >= strokes.length) {
              audio.hit();
              setTimeout(nextKanji, 650);
            }
          } else {
            audio.wrong();
            svg.classList.add('strokes-nope');
            setTimeout(() => svg.classList.remove('strokes-nope'), 300);
          }
        });

        function nextKanji() {
          ki += 1;
          if (ki < chars.length) mountKanji();
          else { ci = (ci + 1) % cards.length; mountCard(cards[ci]); }
        }
      }
    }
  });
  return () => { dead = true; };
}
