// Falling-match mode. Pure helpers first; mountFalling (the rAF engine) below.

export function gradeFalling(elapsedMs) {
  if (elapsedMs < 2500) return 'easy';
  if (elapsedMs < 6000) return 'good';
  return 'hard';
}

export function nextDifficulty(cleared) {
  return {
    fallSpeed: Math.min(50, 22 + cleared * 0.7),
    spawnInterval: Math.max(700, 1200 - cleared * 20),
  };
}

export function isLanded(tileY, tileH, floorY) {
  return tileY + tileH >= floorY;
}

const LIVES = 3;
const TILE_H = 64;         // must match .fall-tile height in CSS
const MAX_ACTIVE = 12;     // stop spawning above this many live tiles

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Falling mode: single tiles fall one at a time from a small shuffled buffer, so
 * a word and its answer arrive decoupled and other pairs' tiles act as decoys.
 * Match two live tiles with the same pairId + different type to clear the pair;
 * a tile reaching the floor purges its whole pair and costs one life.
 */
export function mountFalling(root, supply, onResult, audio, onGameOver, pairMode = 'meaning') {
  root.classList.add('falling-mode');
  root.innerHTML = `
    <div class="fall-hud">
      <span class="fall-lives"></span>
      <span class="fall-score">分數 <b>0</b></span>
      <span class="fall-combo" hidden>連擊 <b>0</b></span>
    </div>
    <div class="fall-field"></div>
    <div class="fall-floor"></div>`;
  const field = root.querySelector('.fall-field');
  const livesEl = root.querySelector('.fall-lives');
  const scoreEl = root.querySelector('.fall-score b');
  const comboWrap = root.querySelector('.fall-combo');
  const comboEl = root.querySelector('.fall-combo b');

  let lives = LIVES, score = 0, combo = 0, maxCombo = 0, cleared = 0;
  let tiles = [];            // live: { el, pairId, type, spawnedAt }
  let buffer = [];           // pending specs: { pairId, type, html }
  const firstSpawn = new Map(); // pairId -> earliest spawn time (for grading)
  let selected = null;       // { el, pairId, type }
  let lastSpawn = 0, lastFrame = 0, raf = 0, running = true;

  const floorY = () => field.clientHeight - TILE_H;
  function renderHud() {
    livesEl.textContent = '❤️'.repeat(lives) + '🤍'.repeat(LIVES - lives);
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
    comboWrap.hidden = combo < 2;
  }

  // Keep the buffer stocked with at least one card's two halves, shuffled so a
  // pair's halves interleave with other pairs (but always spawn close in time).
  function refill() {
    if (buffer.length >= 2) return;
    const c = supply();
    if (!c) return;
    // 'reading' mode: word tile hides the reading (it's the answer), meaning tile
    // shows the kana; 'meaning' mode: word shows kanji+reading, meaning shows zh.
    const showSub = pairMode !== 'reading' && c.word !== c.kana;
    buffer.push(
      { pairId: c.id, type: 'word', html: c.word + (showSub ? `<span class="ft-sub">${c.kana}</span>` : '') },
      { pairId: c.id, type: 'meaning', html: pairMode === 'reading' ? c.kana : c.zh },
    );
    shuffle(buffer);
  }

  function spawnOne() {
    refill();
    const spec = buffer.shift();
    if (!spec) return;
    const now = performance.now();
    const w = field.clientWidth;
    const el = document.createElement('button');
    el.type = 'button';
    el.className = `fall-tile fall-${spec.type}`;
    el.dataset.pairId = spec.pairId;
    el.dataset.type = spec.type;
    el.innerHTML = `<span class="ft-text">${spec.html}</span>`;
    el.style.left = ((0.05 + Math.random() * 0.72) * (w - 120)) + 'px';
    el._y = -TILE_H;
    el.style.transform = `translateY(${el._y}px)`;
    field.appendChild(el);
    tiles.push({ el, pairId: spec.pairId, type: spec.type, spawnedAt: now });
    if (!firstSpawn.has(spec.pairId)) firstSpawn.set(spec.pairId, now);
    lastSpawn = now;
  }

  function removeTile(rec, cls) {
    rec.el.classList.add('gone', cls);
    setTimeout(() => rec.el.remove(), 260);
    tiles = tiles.filter(t => t !== rec);
  }

  // Remove every live tile of a pair, drop any still-buffered half (no orphan),
  // and forget its grade timer.
  function purgePair(pairId, cls) {
    for (const t of tiles.filter(t => t.pairId === pairId)) removeTile(t, cls);
    buffer = buffer.filter(s => s.pairId !== pairId);
    firstSpawn.delete(pairId);
    if (selected && selected.pairId === pairId) selected = null;
  }

  function handleLand(rec) {
    purgePair(rec.pairId, 'fall-miss');
    lives -= 1;
    combo = 0;
    audio.wrong();
    renderHud();
    if (lives <= 0) end();
  }

  function matchPair(pairId) {
    const start = firstSpawn.get(pairId);
    onResult(pairId, gradeFalling(performance.now() - (start ?? performance.now())));
    combo += 1; maxCombo = Math.max(maxCombo, combo);
    score += 10 * combo; cleared += 1;
    audio.hit(combo);
    for (const t of tiles.filter(t => t.pairId === pairId)) removeTile(t, 'fall-clear');
    firstSpawn.delete(pairId);
    renderHud();
  }

  field.addEventListener('click', onClick);
  function onClick(e) {
    const el = e.target.closest('.fall-tile');
    if (!el || el.classList.contains('gone')) return;
    if (selected && selected.el === el) { el.classList.remove('picked'); selected = null; return; }
    if (!selected) { selected = { el, pairId: el.dataset.pairId, type: el.dataset.type }; el.classList.add('picked'); return; }
    const samePair = selected.pairId === el.dataset.pairId;
    const bothTypes = selected.type !== el.dataset.type;
    if (samePair && bothTypes) {
      const pairId = selected.pairId;
      selected.el.classList.remove('picked');
      selected = null;
      matchPair(pairId);
    } else {
      selected.el.classList.remove('picked'); selected.el.classList.add('shake');
      el.classList.add('shake');
      setTimeout(() => { selected && selected.el && selected.el.classList.remove('shake'); el.classList.remove('shake'); }, 320);
      selected = null;
      combo = 0; audio.wrong(); renderHud();
    }
  }

  function frame(now) {
    if (!running) return;
    const dt = lastFrame ? (now - lastFrame) : 16;
    lastFrame = now;
    const { fallSpeed, spawnInterval } = nextDifficulty(cleared);
    if (now - lastSpawn >= spawnInterval && tiles.length < MAX_ACTIVE) spawnOne();
    const fy = floorY();
    for (const rec of tiles.slice()) {
      if (rec.el.classList.contains('gone')) continue;
      rec.el._y += fallSpeed * dt / 1000;
      rec.el.style.transform = `translateY(${rec.el._y}px)`;
      if (isLanded(rec.el._y, TILE_H, fy)) handleLand(rec);
    }
    raf = requestAnimationFrame(frame);
  }

  function end() {
    if (!running) return;
    running = false;
    cancelAnimationFrame(raf);
    onGameOver({ score, maxCombo });
  }
  function stop() {
    running = false;
    cancelAnimationFrame(raf);
    field.removeEventListener('click', onClick);
    root.classList.remove('falling-mode');
    root.innerHTML = '';
  }

  renderHud();
  lastSpawn = performance.now() - 99999; // spawn immediately
  raf = requestAnimationFrame(frame);
  return stop;
}
