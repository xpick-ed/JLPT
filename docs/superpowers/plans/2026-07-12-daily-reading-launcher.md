# 每日閱讀（Daily Reading Launcher）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a 閱讀 content tab that shows a curated panel of external daily-reading links (NHK Web Easy etc.) — pure links, no SRS/deck/backend.

**Architecture:** A new `web/js/modes/reading.js` exports `SOURCES` (constant) and `mountReading(root)` (renders source cards). Reading is a third content-switch option that bypasses the deck/queue model: `app.js` renders the panel directly and skips deck loading; `ui.js` hides the game chrome (mode tabs, level/category chips, stats) when reading is active.

**Tech Stack:** Vanilla ES modules (no build step), `node --test`, Playwright.

## Global Constraints

- Vanilla ES modules, **no build step**; JS tests `node --test tests/*.test.mjs` (glob).
- Traditional-Chinese (Taiwan) UI copy; content label 閱讀.
- External links use `target="_blank" rel="noopener noreferrer"`.
- Do not touch the vocab/grammar decks, SRS, or shipped game modes.

---

### Task 1: `reading.js` module + `SOURCES` test

**Files:**
- Create: `web/js/modes/reading.js`
- Test: `tests/reading.test.mjs`

**Interfaces:**
- Produces: `SOURCES` (array of `{name, url, level, desc}`) and `mountReading(root)` from `web/js/modes/reading.js`.

- [ ] **Step 1: Write the failing test**

Create `tests/reading.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SOURCES } from '../web/js/modes/reading.js';

test('SOURCES is a non-empty list of well-formed entries', () => {
  assert.ok(Array.isArray(SOURCES) && SOURCES.length > 0);
  for (const s of SOURCES) {
    assert.ok(s.name && typeof s.name === 'string');
    assert.match(s.url, /^https:\/\//);
    assert.ok(s.level && typeof s.level === 'string');
    assert.ok(s.desc && typeof s.desc === 'string');
  }
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/reading.test.mjs`
Expected: FAIL — `Cannot find module '.../web/js/modes/reading.js'`.

- [ ] **Step 3: Implement `reading.js`**

Create `web/js/modes/reading.js`:

```js
export const SOURCES = [
  { name: 'NHK NEWS WEB EASY', url: 'https://www3.nhk.or.jp/news/easy/', level: 'N4–N3', desc: '每日新聞、全文振假名、朗讀語音、難詞查辭典（主打）' },
  { name: 'Watanoc', url: 'https://watanoc.com/', level: 'N5–N3', desc: '免費分級日語雜誌，生活・文化' },
  { name: 'MATCHA（やさしい日本語）', url: 'https://matcha-jp.com/easy', level: 'N4–N3', desc: '觀光・文化，簡易日語版' },
  { name: '福娘童話集', url: 'https://hukumusume.com/douwa/', level: 'N5–N4', desc: '日本童話・昔話短文，附假名' },
  { name: 'NHK NEWS WEB', url: 'https://www3.nhk.or.jp/news/', level: 'N2–N1', desc: '真實時事新聞（無振假名）' },
  { name: '青空文庫', url: 'https://www.aozora.gr.jp/', level: 'N2–N1', desc: '免費經典文學（進階挑戰）' },
];

/** Render the daily-reading launcher: usage hint + source cards + footnote. */
export function mountReading(root) {
  root.innerHTML = `
    <div class="read-wrap">
      <p class="read-hint">每天讀一篇：先不查字通讀一遍抓大意，再回頭查生詞。</p>
      <div class="read-grid">
        ${SOURCES.map(s => `
          <a class="read-card" href="${s.url}" target="_blank" rel="noopener noreferrer">
            <div class="read-card-top">
              <span class="read-name">${s.name}</span>
              <span class="read-level">${s.level}</span>
            </div>
            <p class="read-desc">${s.desc}</p>
            <span class="read-go">前往 →</span>
          </a>`).join('')}
      </div>
      <p class="read-foot">以上皆連結至外部網站，於新分頁開啟。</p>
    </div>`;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/reading.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/reading.js tests/reading.test.mjs
git commit -m "feat: reading launcher module (SOURCES + mountReading)"
```

---

### Task 2: `ui.js` — 閱讀 content tab + hide game chrome

**Files:**
- Modify: `web/js/ui.js`

**Interfaces:**
- Consumes: `state.settings.content === 'reading'`; `handlers.onContentChange('reading')` (Task 3).

- [ ] **Step 1: Add 閱讀 to CONTENTS and an empty modes list**

Change:
```js
const CONTENTS = [
  { id: 'vocab', label: '單字' },
  { id: 'grammar', label: '文法' },
];
```
to:
```js
const CONTENTS = [
  { id: 'vocab', label: '單字' },
  { id: 'grammar', label: '文法' },
  { id: 'reading', label: '閱讀' },
];
```
And in `MODES_BY_CONTENT`, add a `reading` entry (empty — reading has no game modes):
```js
  grammar: [
    { id: 'cloze', label: '四選一' },
    { id: 'order', label: '排列重組' },
  ],
  reading: [],
```

- [ ] **Step 2: Guard the currentMode reset for an empty modes list**

In `render()`, change:
```js
    const modes = MODES_BY_CONTENT[s.content] || MODES_BY_CONTENT.vocab;
    if (!modes.some(m => m.id === currentMode)) currentMode = modes[0].id;
```
to:
```js
    const modes = MODES_BY_CONTENT[s.content] || MODES_BY_CONTENT.vocab;
    if (modes.length && !modes.some(m => m.id === currentMode)) currentMode = modes[0].id;
    const reading = s.content === 'reading';
```

- [ ] **Step 3: Hide the mode tabs, filters, and stats when reading**

In the `root.innerHTML` template:

(a) Replace the `<nav class="tabs">…</nav>` block with a conditional:
```js
          ${reading ? '' : `<nav class="tabs" role="tablist" aria-label="遊戲模式">
            ${modes.map(m => `<button type="button" class="tab${m.id === currentMode ? ' active' : ''}" data-mode="${m.id}" role="tab" aria-selected="${m.id === currentMode}">${m.label}</button>`).join('')}
          </nav>`}
```

(b) Replace the entire `<div class="chrome-row chrome-filters"> … </div>` block with:
```js
        ${reading ? '' : `<div class="chrome-row chrome-filters">
          <div class="chip-row levels" role="group" aria-label="級別">
            ${LEVELS.map(lv => `<button type="button" class="chip level-chip${s.levels.includes(lv) ? ' active' : ''}" data-lv="${lv}">${lv.toUpperCase()}</button>`).join('')}
          </div>
          <div class="chip-row categories" role="group" aria-label="分類">
            <button type="button" class="chip cat-chip${s.categories.length === 0 ? ' active' : ''}" data-cat="">全部</button>
            ${cats.map(c => `<button type="button" class="chip cat-chip${s.categories.includes(c) ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>`}
```

(c) Replace the entire `<div class="chrome-row chrome-stats"> … </div>` block with:
```js
        ${reading ? '' : `<div class="chrome-row chrome-stats">
          <span class="stat stat-due">待複習 <b>${due}</b></span>
          <span class="stat stat-new">新單字 <b>${fresh}</b></span>
        </div>`}
```

- [ ] **Step 4: Guard the content-tab click handler against an empty modes list**

Change the `.content-tab` click handler:
```js
    root.querySelectorAll('.content-tab').forEach(btn => btn.addEventListener('click', () => {
      const c = btn.dataset.content;
      if (c === s.content) return;
      currentMode = (MODES_BY_CONTENT[c] || MODES_BY_CONTENT.vocab)[0].id;
      afterAsync(handlers.onContentChange(c));
    }));
```
to:
```js
    root.querySelectorAll('.content-tab').forEach(btn => btn.addEventListener('click', () => {
      const c = btn.dataset.content;
      if (c === s.content) return;
      const ms = MODES_BY_CONTENT[c] || [];
      if (ms.length) currentMode = ms[0].id;
      afterAsync(handlers.onContentChange(c));
    }));
```

- [ ] **Step 5: Syntax-check**

Run: `node --check web/js/ui.js`
Expected: clean. `node --test tests/*.test.mjs` — all pass.

- [ ] **Step 6: Commit**

```bash
git add web/js/ui.js
git commit -m "feat: 閱讀 content tab; hide game chrome when reading"
```

---

### Task 3: `app.js` — render reading panel, bypass deck loading

**Files:**
- Modify: `web/js/app.js`

- [ ] **Step 1: Import `mountReading`**

After `import { mountGrammarOrder } from './modes/grammar-order.js';` add:
```js
import { mountReading } from './modes/reading.js';
```

- [ ] **Step 2: Route reading first in `next()`**

At the very start of `next()`, before the `content === 'grammar'` branch:
```js
function next() {
  const stage = document.getElementById('stage');
  if (state.settings.content === 'reading') return mountReading(stage);
  if (state.settings.content === 'grammar') {
```

- [ ] **Step 3: Skip deck loading for reading in `onContentChange`**

Replace the `onContentChange` handler body's data-loading lines. Change:
```js
    onContentChange: async c => {
      if (stopFalling) { stopFalling(); stopFalling = null; }
      state.settings.content = c;
      mode = c === 'grammar' ? 'cloze' : 'match';
      state.updated = Date.now();
      await loadLevels(activeDeck(), state.settings.levels);
      rebuildPool(); persist(); next();
    },
```
to:
```js
    onContentChange: async c => {
      if (stopFalling) { stopFalling(); stopFalling = null; }
      state.settings.content = c;
      mode = c === 'grammar' ? 'cloze' : 'match';
      state.updated = Date.now();
      if (c !== 'reading') { await loadLevels(activeDeck(), state.settings.levels); rebuildPool(); }
      persist(); next();
    },
```

- [ ] **Step 4: Skip deck loading for reading at boot**

In `boot()`, change:
```js
  if (state.settings.content === 'grammar') mode = 'cloze';
  await loadLevels(activeDeck(), state.settings.levels);
  rebuildPool();
  renderAll();
  next();
```
to:
```js
  if (state.settings.content === 'grammar') mode = 'cloze';
  if (state.settings.content !== 'reading') {
    await loadLevels(activeDeck(), state.settings.levels);
    rebuildPool();
  }
  renderAll();
  next();
```

- [ ] **Step 5: Syntax-check**

Run: `node --check web/js/app.js`
Expected: clean. `node --test tests/*.test.mjs` — all pass.

- [ ] **Step 6: Commit**

```bash
git add web/js/app.js
git commit -m "feat: render reading panel + bypass deck loading for reading content"
```

---

### Task 4: Reading launcher CSS

**Files:**
- Modify: `web/style.css`

- [ ] **Step 1: Append the reading styles**

Add just before the `/* ---- fx: stamp / particle / confetti */` section:

```css
/* ---------------------------------------------------------- daily reading */

.read-wrap { max-width: 720px; margin: 0 auto; }
.read-hint { font-size: 14px; color: var(--ink-dim); margin: 4px 0 18px; line-height: 1.7; }
.read-grid { display: grid; grid-template-columns: 1fr; gap: 12px; }
@media (min-width: 620px) { .read-grid { grid-template-columns: 1fr 1fr; } }
.read-card {
  display: block;
  text-decoration: none;
  color: inherit;
  padding: 16px 18px;
  border-radius: var(--radius-md);
  background: var(--surface);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  transition: transform .12s ease, border-color .15s ease, box-shadow .2s ease;
}
.read-card:hover { transform: translateY(-3px); border-color: var(--border-strong); box-shadow: var(--shadow-lg); }
.read-card-top { display: flex; align-items: baseline; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
.read-name { font-family: var(--font-display); font-size: 16px; font-weight: 700; color: var(--ink); }
.read-level {
  flex: 0 0 auto;
  font-size: 12px;
  font-weight: 700;
  color: var(--shu-ink);
  background: var(--shu);
  border-radius: 999px;
  padding: 2px 9px;
}
.read-desc { font-size: 13px; color: var(--ink-dim); line-height: 1.6; margin: 0 0 10px; }
.read-go { font-size: 13px; font-weight: 700; color: var(--shu); }
.read-foot { font-size: 12px; color: var(--ink-dim); text-align: center; margin-top: 18px; }
```

- [ ] **Step 2: Verify braces balance**

Run: `node -e "const c=require('fs').readFileSync('web/style.css','utf8'); const o=(c.match(/{/g)||[]).length, x=(c.match(/}/g)||[]).length; if(o!==x) throw new Error('brace mismatch '+o+' vs '+x); console.log('braces balanced', o);"`
Expected: prints `braces balanced <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/style.css
git commit -m "style: daily reading source cards"
```

---

### Task 5: Playwright end-to-end verification

**Files:** (no source changes unless a defect is found)

- [ ] **Step 1: Drive the reading flow**

Run (adjust venv path, e.g. `/tmp/pw-venv`):
```bash
cd /home/eslin/claude_projects/JLPT
python3 -m http.server -d web 8155 >/tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid; sleep 1
/tmp/pw-venv/bin/python - <<'EOF'
from playwright.sync_api import sync_playwright
import json
st = json.dumps({"cards":{}, "settings":{"newPerDay":50,"levels":["n2"],"categories":[],"sound":False,"pairMode":"meaning","theme":"system","content":"vocab"}, "updated":0})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":900,"height":820})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8155", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", st)
    pg.reload(wait_until="load"); pg.wait_for_timeout(700)
    pg.click('.content-tab[data-content="reading"]'); pg.wait_for_timeout(500)
    cards = pg.eval_on_selector_all('.read-card','els=>els.length')
    tabs = pg.eval_on_selector_all('.tab','e=>e.length')
    chips = pg.eval_on_selector_all('.level-chip','e=>e.length')
    stats = pg.eval_on_selector_all('.chrome-stats','e=>e.length')
    target = pg.eval_on_selector('.read-card','a=>a.target')
    rel = pg.eval_on_selector('.read-card','a=>a.rel')
    print("reading cards:", cards, "| tabs hidden:", tabs==0, "| chips hidden:", chips==0, "| stats hidden:", stats==0)
    print("first card target/rel:", target, "/", rel)
    pg.screenshot(path="/tmp/shots/reading.png")
    pg.click('.content-tab[data-content="vocab"]'); pg.wait_for_timeout(600)
    print("back to 單字 restores game chrome (tabs):", pg.eval_on_selector_all('.tab','e=>e.length'))
    pg.close(); b.close()
print("ERRORS:", errs)
EOF
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: `reading cards: 6`; tabs/chips/stats all hidden; first card `target=_blank`, `rel` contains `noopener`; switching back to 單字 restores the tabs (>0); **`ERRORS: []`**. Inspect `/tmp/shots/reading.png`.

- [ ] **Step 2: Full suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass (reading + existing).

- [ ] **Step 3: Commit any fixes** (skip if none)

```bash
git add -A && git commit -m "test: Playwright-verify daily reading launcher"
```

---

## Notes for the executor
- Pure links feature — no data generation, no agents, no gates.
- Follow codebase convention: pure data (`SOURCES`) unit-tested; `mountReading` verified via Playwright.
- Keep UI copy Traditional-Chinese; external links `target="_blank" rel="noopener noreferrer"`.
