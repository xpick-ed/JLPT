// Falling-match mode. Pure helpers first; mountFalling (the rAF engine) is
// added in a later task.

export function gradeFalling(elapsedMs) {
  if (elapsedMs < 2500) return 'easy';
  if (elapsedMs < 6000) return 'good';
  return 'hard';
}

export function nextDifficulty(cleared) {
  return {
    fallSpeed: Math.min(180, 60 + cleared * 2),
    spawnInterval: Math.max(700, 1800 - cleared * 40),
  };
}

export function isLanded(tileY, tileH, floorY) {
  return tileY + tileH >= floorY;
}

const LIVES = 3;
const TILE_H = 64;         // must match .fall-tile height in CSS
const MAX_ACTIVE = 8;      // stop spawning above this many live tiles

export function mountFalling(root, supply, onResult, audio, onGameOver) {
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
  let pairs = [];            // { id, spawnedAt, tiles:[el,el], done }
  let selected = null;       // { el, pairId, type }
  let lastSpawn = 0, lastFrame = 0, raf = 0, running = true;

  const floorY = () => field.clientHeight - TILE_H;
  function renderHud() {
    livesEl.textContent = '❤️'.repeat(lives) + '🤍'.repeat(LIVES - lives);
    scoreEl.textContent = String(score);
    comboEl.textContent = String(combo);
    comboWrap.hidden = combo < 2;
  }

  function spawnPair() {
    const c = supply();
    if (!c) return;
    const now = performance.now();
    const pair = { id: c.id, spawnedAt: now, tiles: [], done: false };
    const w = field.clientWidth;
    const lanes = [0.08 + Math.random() * 0.34, 0.55 + Math.random() * 0.34];
    if (Math.random() < 0.5) lanes.reverse();
    const specs = [
      { type: 'word', html: c.word + (c.word !== c.kana ? `<span class="ft-sub">${c.kana}</span>` : '') },
      { type: 'meaning', html: c.zh },
    ];
    specs.forEach((s, i) => {
      const el = document.createElement('button');
      el.type = 'button';
      el.className = `fall-tile fall-${s.type}`;
      el.dataset.pairId = c.id;
      el.dataset.type = s.type;
      el.innerHTML = `<span class="ft-text">${s.html}</span>`;
      el.style.left = (lanes[i] * (w - 120)) + 'px';
      el._y = -TILE_H - i * 40;   // stagger start
      el.style.transform = `translateY(${el._y}px)`;
      field.appendChild(el);
      pair.tiles.push(el);
    });
    pairs.push(pair);
    lastSpawn = now;
  }

  function activeCount() {
    return field.querySelectorAll('.fall-tile:not(.gone)').length;
  }

  function removePair(pair, cls) {
    pair.done = true;
    for (const el of pair.tiles) {
      el.classList.add('gone', cls);
      setTimeout(() => el.remove(), 260);
    }
    pairs = pairs.filter(p => p !== pair);
  }

  function failPair(pair) {
    if (selected && selected.pairId === pair.id) { selected = null; }
    removePair(pair, 'fall-miss');
    lives -= 1;
    combo = 0;
    audio.wrong();
    renderHud();
    if (lives <= 0) end();
  }

  function matchPair(pair) {
    combo += 1; maxCombo = Math.max(maxCombo, combo);
    score += 10 * combo; cleared += 1;
    audio.hit(combo);
    onResult(pair.id, gradeFalling(performance.now() - pair.spawnedAt));
    removePair(pair, 'fall-clear');
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
      const pair = pairs.find(p => p.id === selected.pairId && !p.done);
      selected.el.classList.remove('picked');
      selected = null;
      if (pair) matchPair(pair);
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
    if (now - lastSpawn >= spawnInterval && activeCount() < MAX_ACTIVE) spawnPair();
    const fy = floorY();
    for (const pair of pairs.slice()) {
      if (pair.done) continue;
      let landed = false;
      for (const el of pair.tiles) {
        if (el.classList.contains('gone')) continue;
        el._y += fallSpeed * dt / 1000;
        el.style.transform = `translateY(${el._y}px)`;
        if (isLanded(el._y, TILE_H, fy)) landed = true;
      }
      if (landed) failPair(pair);
    }
    raf = requestAnimationFrame(frame);
  }

  function end() {
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
