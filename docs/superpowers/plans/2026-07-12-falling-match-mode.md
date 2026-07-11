# 下落配對模式 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 4th game mode "落下" — Japanese word and Chinese meaning cards fall from the top; tap two matching cards to clear (grade into SRS by speed); a card reaching the floor costs one of 3 lives; 0 lives = game over.

**Architecture:** New `web/js/modes/falling.js` with three pure, unit-tested helpers plus a self-driven `requestAnimationFrame` engine `mountFalling(...)->stop()`. `web/js/app.js` gains a falling branch that hands the engine an infinite card supply, does NOT run the turn-based `next()` while falling, and cleans up the loop on mode switch. A `落下` tab is added in `web/js/ui.js`. Follows the existing per-mode `mount*` pattern.

**Tech Stack:** Vanilla ES-module JS, `node --test` (Node ≥18, no deps), `requestAnimationFrame`, existing Web-Audio `audio` object.

## Global Constraints

- No runtime npm dependencies; tests use only `node --test`. No build step. Native ES modules.
- SRS grade strings are exactly `'again' | 'hard' | 'good' | 'easy'`. Falling mode only ever produces `'easy' | 'good' | 'hard'` (never `'again'` — a landed card is NOT graded).
- Times are epoch/`performance.now()` milliseconds.
- Lives = 3. `gradeFalling`: `<2500 → 'easy'`, `<6000 → 'good'`, else `'hard'`. `nextDifficulty(cleared)`: `fallSpeed = min(180, 60 + cleared*2)` px/s, `spawnInterval = max(700, 1800 - cleared*40)` ms. `isLanded(tileY, tileH, floorY) = tileY + tileH >= floorY`.
- Traditional-Chinese (Taiwan) copy in all UI text.
- Reuse existing modules unchanged: `session.applyGrade`, `store.saveState`, the shared `onResult` path in app.js. Follow the word-tile display rule already used in match mode: show `card.word`; append its reading only when `card.word !== card.kana`.

---

## File Structure

- `web/js/modes/falling.js` — NEW. Pure `gradeFalling`/`nextDifficulty`/`isLanded` (Task 1) + `mountFalling` engine (Task 2).
- `tests/falling.test.mjs` — NEW. Unit tests for the pure helpers.
- `web/js/app.js` — MODIFY. Falling branch, supply, game-over screen, cleanup (Task 3).
- `web/js/ui.js` — MODIFY. Add `落下` mode tab (Task 3).
- `web/style.css` — MODIFY. Falling playfield, tiles, danger line, HUD, game-over (Task 3).

---

## Task 1: Pure falling helpers

**Files:**
- Create: `web/js/modes/falling.js`
- Create: `tests/falling.test.mjs`

**Interfaces:**
- Produces:
  - `gradeFalling(elapsedMs) -> 'easy'|'good'|'hard'`
  - `nextDifficulty(cleared) -> { fallSpeed:number, spawnInterval:number }`
  - `isLanded(tileY, tileH, floorY) -> boolean`
- (Task 2 adds `mountFalling` to the same file; do not add it here.)

- [ ] **Step 1: Write the failing test**

`tests/falling.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeFalling, nextDifficulty, isLanded } from '../web/js/modes/falling.js';

test('gradeFalling by elapsed time', () => {
  assert.equal(gradeFalling(1000), 'easy');
  assert.equal(gradeFalling(2499), 'easy');
  assert.equal(gradeFalling(2500), 'good');
  assert.equal(gradeFalling(5999), 'good');
  assert.equal(gradeFalling(6000), 'hard');
  assert.equal(gradeFalling(99999), 'hard');
});

test('nextDifficulty ramps and clamps', () => {
  assert.deepEqual(nextDifficulty(0), { fallSpeed: 60, spawnInterval: 1800 });
  assert.deepEqual(nextDifficulty(10), { fallSpeed: 80, spawnInterval: 1400 });
  const hot = nextDifficulty(100000);
  assert.equal(hot.fallSpeed, 180);       // clamped
  assert.equal(hot.spawnInterval, 700);   // clamped
});

test('isLanded when tile bottom reaches floor', () => {
  assert.equal(isLanded(400, 60, 500), false); // bottom 460 < 500
  assert.equal(isLanded(440, 60, 500), true);  // bottom 500 >= 500
  assert.equal(isLanded(600, 60, 500), true);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/falling.test.mjs`
Expected: FAIL — cannot find module `../web/js/modes/falling.js`.

- [ ] **Step 3: Write `web/js/modes/falling.js`** (pure helpers only)

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/falling.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/falling.js tests/falling.test.mjs
git commit -m "feat: falling-mode pure helpers (grade/difficulty/landing) with tests"
```

---

## Task 2: Falling engine (`mountFalling`)

> Real-time DOM/rAF — no unit tests; verified by Playwright + the acceptance checklist. Author the visuals with the frontend-design skill to match the existing fancy card style; the code below is the required, complete engine logic.

**Files:**
- Modify: `web/js/modes/falling.js` (append `mountFalling`; keep the three pure helpers unchanged)

**Interfaces:**
- Consumes: `gradeFalling`, `nextDifficulty`, `isLanded` (same file).
- Produces: `mountFalling(root, supply, onResult, audio, onGameOver) -> stop`
  - `root`: HTMLElement stage. `supply()`: returns next card `{id, word, kana, zh}` (infinite). `onResult(id, grade)`: called once per **matched** pair. `audio`: `{hit(combo), wrong(), clear()}`. `onGameOver({score, maxCombo})`: called when lives hit 0. Returns `stop()`: cancels rAF, removes listeners, clears `root`.

- [ ] **Step 1: Append `mountFalling` to `web/js/modes/falling.js`**

```js
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
```

- [ ] **Step 2: Author the CSS** in `web/style.css` for `.falling-mode`, `.fall-hud`, `.fall-field` (position: relative; fills the stage), `.fall-floor` (the danger line at the bottom), `.fall-tile`/`.fall-word`/`.fall-meaning` (height `64px` to match `TILE_H`, glassy rounded like existing cards, `.ft-sub` small reading), `.picked` (highlight), `.shake` (reuse the tile-shake keyframe), `.gone`/`.fall-clear`/`.fall-miss` (fade/pop out). Use the frontend-design skill; keep it consistent with the existing fancy card look.

- [ ] **Step 3: Verify with Playwright** (webapp-testing skill)

Because falling needs the app wired (Task 3), do a **module smoke test** now: `node --check web/js/modes/falling.js` (syntax) and confirm the three pure tests still pass: `node --test tests/falling.test.mjs`. Full in-browser play is verified in Task 3's acceptance.

Run: `node --check web/js/modes/falling.js && node --test tests/falling.test.mjs`
Expected: no syntax error; 3 tests pass.

- [ ] **Step 4: Commit**

```bash
git add web/js/modes/falling.js web/style.css
git commit -m "feat: falling-mode rAF engine + styles"
```

---

## Task 3: Wire falling into the app

> Verified by Playwright + acceptance checklist (no unit test — it's DOM/integration).

**Files:**
- Modify: `web/js/app.js`
- Modify: `web/js/ui.js` (add the `落下` mode tab)
- Modify: `web/style.css` (game-over screen, if not covered in Task 2)

**Interfaces:**
- Consumes: `mountFalling(root, supply, onResult, audio, onGameOver)` from `./modes/falling.js`; existing `applyGrade`, `saveState`, `buildPracticeQueue`, `byId`, `queue`, `pool`, `audio`, `renderDone`.
- Produces: a working `落下` mode reachable from the mode tabs.

- [ ] **Step 1: Add the mode tab in `web/js/ui.js`**

Find where the mode tabs are defined (grep `配對` / `打字` / `四選一` in `web/js/ui.js`) and add a fourth entry `{ key: 'falling', label: '落下' }` (or the matching shape of the existing array) after `四選一`, so the tab bar shows 配對 / 打字 / 四選一 / 落下 and clicking it calls the existing `onModeChange('falling')`.

- [ ] **Step 2: Modify `web/js/app.js`** — import, cleanup handle, and falling branch.

Add the import near the other mode imports:
```js
import { mountFalling } from './modes/falling.js';
```
Add a module-level handle after `let queue = [];`:
```js
let stopFalling = null;
```
Guard the auto-advance in `onResult` so it does NOT run during falling (falling self-drives):
```js
function onResult(id, grade) {
  Object.assign(state, applyGrade(state, id, grade, Date.now()));
  persist();
  if (mode !== 'falling' && !advancePending) {
    advancePending = true;
    queueMicrotask(() => { advancePending = false; next(); });
  }
}
```
Add a falling branch at the top of `next()` (before the `mode === 'match'` block):
```js
  if (mode === 'falling') return startFalling();
```
Add the falling controller functions (near `next`):
```js
function makeFallingSupply() {
  let bag = [];
  return () => {
    while (queue.length) { const c = byId(queue.shift()); if (c) return c; }
    if (!bag.length) bag = buildPracticeQueue();
    while (bag.length) { const c = byId(bag.shift()); if (c) return c; }
    return null;
  };
}
function startFalling() {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  const stage = document.getElementById('stage');
  if (pool.length === 0) return renderDone(stage);
  stopFalling = mountFalling(stage, makeFallingSupply(), onResult, audio, onGameOver);
}
function onGameOver({ score, maxCombo }) {
  if (stopFalling) { stopFalling = null; }
  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="done">
      <div class="done-emoji">🎮</div>
      <p class="done-msg">遊戲結束</p>
      <p class="done-hint">分數 ${score}　·　最高連擊 ${maxCombo}</p>
      <button type="button" id="again-btn" class="practice-btn">再玩一次</button>
    </div>`;
  const btn = stage.querySelector('#again-btn');
  if (btn) btn.onclick = () => startFalling();
}
```
Ensure switching modes stops the loop. In `renderAll`'s `onModeChange` handler, stop falling before switching:
```js
    onModeChange: m => { if (stopFalling) { stopFalling(); stopFalling = null; } mode = m; next(); },
```
(Also call `if (stopFalling) { stopFalling(); stopFalling = null; }` at the start of `onLevelsChange`, `onCategoriesChange`, and `onSettingsChange` handlers, before `next()`, so re-scoping tears down a running game.)

- [ ] **Step 3: Manual + Playwright acceptance** (the gate)

Serve `python3 -m http.server -d web 8000`, open `http://localhost:8000`:
1. A `落下` tab appears; clicking it starts cards falling from the top.
2. Tapping a Japanese card then its matching Chinese card clears both with a pop + sound + combo increment; score rises.
3. Tapping two non-matching cards shakes them, resets combo, and does NOT cost a life.
4. Letting a card reach the floor removes its pair, decrements a heart, plays the wrong sound, and does NOT change that card's SRS (verify no `applyGrade` for it — the graded-card count in `localStorage` only rises on matches).
5. After 3 landed pairs, the game-over screen shows score + 最高連擊 + 再玩一次; 再玩一次 restarts.
6. Switching to another mode (配對/打字/四選一) while playing stops the loop (no console errors, no ghost tiles, and a single rAF — verify by switching back and forth).
7. Speed visibly increases as `score`/cleared grows.
8. Zero console errors throughout.
Also confirm the logic suite is unaffected: `node --test tests/*.test.mjs` → all pass.

- [ ] **Step 4: Commit**

```bash
git add web/js/app.js web/js/ui.js web/style.css
git commit -m "feat: wire 落下 falling mode into app (tab, supply, game-over, cleanup)"
```

---

## Self-Review

- **Spec coverage:** falling.js pure helpers (T1) ✓; rAF engine — spawn pairs, fall, land, match, lives, HUD, difficulty ramp, stop() cleanup (T2) ✓; `落下` tab (T3) ✓; app branch: self-driven (no `next()` advance during falling via the `mode !== 'falling'` guard), supply from queue→pool, game-over + 再玩一次, cleanup on mode/scope switch (T3) ✓; SRS折衷: match→`onResult`+grade, land→no grade (T2 `failPair` never calls onResult) ✓; 3 lives, gradeFalling/nextDifficulty/isLanded exact values ✓; word-tile reading rule (`word !== kana`) ✓.
- **Placeholder scan:** T2 CSS and visual polish are specified with concrete class names + `TILE_H=64` coupling and an acceptance checklist (authored via frontend-design), while all engine logic is complete code. No TODO/TBD in logic.
- **Type consistency:** `mountFalling(root, supply, onResult, audio, onGameOver)->stop` used identically in T2 and T3; `onResult(id, grade)`, `onGameOver({score,maxCombo})` consistent; `stopFalling` handle set/cleared uniformly; pure-helper names match across T1/T2.
