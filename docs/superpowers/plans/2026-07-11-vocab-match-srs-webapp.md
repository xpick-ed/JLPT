# JLPT 單字遊戲（配對／打字／四選一 + SRS）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fancy static web game that reviews the repo's JLPT vocab through three modes (match-clear / typing / multiple-choice) backed by one shared SM-2 SRS, with localStorage + passphrase-Worker cross-device sync.

**Architecture:** Vanilla ES-module JS + CSS + Web Audio, no build step, served static on GitHub Pages. Pure-logic modules (SRS, store-merge, sync-hash, session, per-mode grading) are unit-tested with Node's built-in test runner; DOM/visual layers are verified manually. A Cloudflare Worker + KV stores one JSON blob per passphrase hash. Vocab data is pre-built from `data/*.json` into per-level JSON shipped with the site.

**Tech Stack:** ES-module JavaScript, `node --test` (Node ≥18, no deps), Web Audio API, `crypto.subtle`, Cloudflare Workers + KV, Python 3 (data build), GitHub Actions (Pages deploy).

## Global Constraints

- No runtime npm dependencies; tests use only `node --test` (Node ≥18). No bundler/build step for the site.
- All site JS is native ES modules; the same module files are imported by both the browser and Node tests.
- Repo root gains `package.json` with `{"type":"module"}` so `.js` ES modules import cleanly in Node.
- Vocab card `id` = first 12 hex chars of SHA-1 of `word|kana`, computed in `build_web_data.py`; the browser never recomputes ids.
- SRS times are epoch milliseconds. `DAY = 86400000`. Grades are the exact strings `'again' | 'hard' | 'good' | 'easy'`.
- Traditional-Chinese (Taiwan) copy in all UI text.
- Site source lives in `web/`; Worker in `worker/`; tests in `tests/`; generated data in `web/data/`.

---

## File Structure

- `package.json` — `{"type":"module"}` so Node treats `.js` as ESM.
- `build_web_data.py` — builds `web/data/n{5..1}.json` from `data/*.json`.
- `web/index.html` — single page; loads `js/app.js` as a module.
- `web/config.js` — `export const WORKER_URL = ""` (user pastes their Worker URL).
- `web/style.css` — visual system + animations (fancy).
- `web/data/n5.json … n1.json` — generated card arrays (committed).
- `web/js/srs.js` — SM-2 engine (pure).
- `web/js/store.js` — localStorage load/save + pure `mergeStates`.
- `web/js/sync.js` — passphrase hash + pull/push to Worker.
- `web/js/session.js` — build review queue + apply grade (pure).
- `web/js/audio.js` — Web Audio SFX.
- `web/js/ui.js` — top bar (mode/level/category), settings panel, particle/confetti helpers.
- `web/js/modes/match.js` — match-clear: `gradeMatch` (pure) + `mountMatch` (DOM).
- `web/js/modes/typing.js` — typing: `normalizeRomaji`, `checkTyping`, `gradeTyping` (pure) + `mountTyping` (DOM).
- `web/js/modes/quiz.js` — quiz: `pickDistractors`, `gradeQuiz` (pure) + `mountQuiz` (DOM).
- `web/js/app.js` — bootstrap; wires data → session → mode → store → sync → ui.
- `worker/index.js` — Cloudflare Worker (`export default { fetch }`).
- `worker/wrangler.toml`, `worker/README.md` — deploy config + steps.
- `.github/workflows/pages.yml` — deploy `web/` to GitHub Pages.
- `tests/*.test.mjs`, `tests/test_build_data.py` — tests.

---

## Task 1: Test harness bootstrap

**Files:**
- Create: `package.json`
- Create: `tests/smoke.test.mjs`

**Interfaces:**
- Produces: a working `node --test tests/` command for all later tasks.

- [ ] **Step 1: Write the failing test**

`tests/smoke.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';

test('node test runner works', () => {
  assert.equal(1 + 1, 2);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/`
Expected: FAIL — `Cannot find package ... "type"` is fine to ignore, but more likely the run works and passes. If Node warns about module type, continue to Step 3. (The real failure this guards against: no `package.json`, so `.js` ESM imports later break.)

- [ ] **Step 3: Create `package.json`**

```json
{
  "name": "jlpt-vocab-game",
  "private": true,
  "type": "module"
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/`
Expected: PASS (`tests 1`, `pass 1`).

- [ ] **Step 5: Commit**

```bash
git add package.json tests/smoke.test.mjs
git commit -m "chore: add node --test harness and ESM package.json"
```

---

## Task 2: Vocab data build

**Files:**
- Create: `build_web_data.py`
- Create: `tests/test_build_data.py`

**Interfaces:**
- Produces: `web/data/<level>.json`, each a JSON array of
  `{id, level, category, word, kana, romaji, pos, zh, ex, ex_zh}`.
  `id` = first 12 hex of SHA-1(`f"{word}|{kana}"`). Dedup across levels by
  `word|kana`, lowest level wins (n5<n4<n3<n2<n1).

- [ ] **Step 1: Write the failing test**

`tests/test_build_data.py`:
```python
import json, subprocess, sys, hashlib, os

def test_build_produces_valid_level_files():
    subprocess.run([sys.executable, "build_web_data.py"], check=True)
    seen = set()
    for lv in ["n5", "n4", "n3", "n2", "n1"]:
        path = f"web/data/{lv}.json"
        assert os.path.exists(path), f"missing {path}"
        arr = json.load(open(path, encoding="utf-8"))
        assert isinstance(arr, list) and arr, f"{path} empty"
        for e in arr:
            for k in ("id","level","category","word","kana","romaji","pos","zh","ex","ex_zh"):
                assert e.get(k) not in (None, ""), f"{lv} {e.get('word')} missing {k}"
            assert e["level"] == lv.upper()
            want = hashlib.sha1(f"{e['word']}|{e['kana']}".encode()).hexdigest()[:12]
            assert e["id"] == want
            assert e["id"] not in seen, f"dup id {e['id']}"
            seen.add(e["id"])

if __name__ == "__main__":
    test_build_produces_valid_level_files()
    print("ok")
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 tests/test_build_data.py`
Expected: FAIL — `build_web_data.py` does not exist.

- [ ] **Step 3: Write `build_web_data.py`**

```python
#!/usr/bin/env python3
"""Build web/data/<level>.json from data/(n*)_part*.json for the vocab game."""
import glob, json, hashlib, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]

def _pn(p):
    m = re.search(r"_part(\d+)\.json$", p)
    return int(m.group(1)) if m else 0

def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()  # word|kana already emitted at a lower level
    for lv in LEVELS:
        out = []
        for path in sorted(glob.glob(f"data/{lv}_part*.json"), key=_pn):
            doc = json.load(open(path, encoding="utf-8"))
            for cat in doc["categories"]:
                for e in cat["entries"]:
                    key = e["word"] + "|" + e["kana"]
                    if key in seen:
                        continue
                    seen.add(key)
                    out.append({
                        "id": hashlib.sha1(key.encode()).hexdigest()[:12],
                        "level": lv.upper(),
                        "category": cat["category"],
                        "word": e["word"], "kana": e["kana"], "romaji": e["romaji"],
                        "pos": e["pos"], "zh": e["zh"], "ex": e["ex"], "ex_zh": e["ex_zh"],
                    })
        json.dump(out, open(f"web/data/{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: {len(out)} cards")

if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 tests/test_build_data.py`
Expected: prints per-level counts then `ok`.

- [ ] **Step 5: Commit**

```bash
git add build_web_data.py tests/test_build_data.py web/data
git commit -m "feat: build per-level vocab JSON for the game"
```

---

## Task 3: SRS engine (SM-2)

**Files:**
- Create: `web/js/srs.js`
- Create: `tests/srs.test.mjs`

**Interfaces:**
- Produces:
  - `DAY = 86400000`
  - `newCard(id, now) -> {id, ease:2.5, interval:0, due:now, reps:0, lapses:0, updated:now, isNew:true}`
  - `review(card, grade, now) -> card'` where `grade ∈ 'again'|'hard'|'good'|'easy'`
  - `dueQueue(cards, poolIds, now, newPerDay) -> string[]` — due (reviewed, `due<=now`, sorted asc by due) then up to `newPerDay` new ids (not in `cards`, in pool order).

- [ ] **Step 1: Write the failing test**

`tests/srs.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DAY, newCard, review, dueQueue } from '../web/js/srs.js';

const T = 1_000_000_000_000;

test('new card good schedules 1 day', () => {
  const c = review(newCard('a', T), 'good', T);
  assert.equal(c.interval, 1);
  assert.equal(c.due, T + DAY);
  assert.equal(c.reps, 1);
  assert.equal(c.isNew, false);
});

test('new card easy schedules 3 days and raises ease', () => {
  const c = review(newCard('a', T), 'easy', T);
  assert.equal(c.interval, 3);
  assert.ok(c.ease > 2.5);
});

test('again resets interval, adds lapse, due in 10 min', () => {
  let c = review(newCard('a', T), 'good', T);   // interval 1
  c = review(c, 'again', T + DAY);
  assert.equal(c.interval, 0);
  assert.equal(c.lapses, 1);
  assert.equal(c.due, T + DAY + 600000);
  assert.ok(c.ease < 2.5);
});

test('good on mature card multiplies by ease', () => {
  let c = review(newCard('a', T), 'good', T); // interval 1, ease 2.5
  c = review(c, 'good', T + DAY);
  assert.equal(c.interval, Math.round(1 * 2.5));
});

test('ease never drops below 1.3', () => {
  let c = newCard('a', T);
  for (let i = 0; i < 20; i++) c = review(c, 'again', T);
  assert.ok(c.ease >= 1.3);
});

test('dueQueue returns due sorted then new up to newPerDay', () => {
  const cards = {
    x: { id:'x', due: T + 5, updated:T },
    y: { id:'y', due: T - 5, updated:T },
    z: { id:'z', due: T + DAY*10, updated:T }, // not due
  };
  const pool = ['x','y','z','n1','n2','n3'];
  const q = dueQueue(cards, pool, T, 2);
  assert.deepEqual(q.slice(0,2), ['y','x']);      // due, earliest first
  assert.deepEqual(q.slice(2), ['n1','n2']);      // 2 new, pool order
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/srs.test.mjs`
Expected: FAIL — cannot find module `../web/js/srs.js`.

- [ ] **Step 3: Write `web/js/srs.js`**

```js
export const DAY = 86400000;

export function newCard(id, now) {
  return { id, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, updated: now, isNew: true };
}

export function review(card, grade, now) {
  const c = { ...card };
  const first = c.reps === 0;
  if (grade === 'again') {
    c.lapses += 1;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 600000;
  } else {
    if (grade === 'hard') {
      c.interval = first ? 1 : Math.max(1, Math.round(c.interval * 1.2));
      c.ease = Math.max(1.3, c.ease - 0.15);
    } else if (grade === 'good') {
      c.interval = first ? 1 : Math.round(c.interval * c.ease);
    } else if (grade === 'easy') {
      c.interval = first ? 3 : Math.round(c.interval * c.ease * 1.3);
      c.ease = c.ease + 0.15;
    }
    c.due = now + c.interval * DAY;
  }
  c.reps += 1;
  c.isNew = false;
  c.updated = now;
  return c;
}

export function dueQueue(cards, poolIds, now, newPerDay) {
  const due = poolIds
    .filter(id => cards[id] && cards[id].due <= now)
    .sort((a, b) => cards[a].due - cards[b].due);
  const fresh = [];
  for (const id of poolIds) {
    if (fresh.length >= newPerDay) break;
    if (!cards[id]) fresh.push(id);
  }
  return due.concat(fresh);
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/srs.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/srs.js tests/srs.test.mjs
git commit -m "feat: SM-2 SRS engine with tests"
```

---

## Task 4: State store + merge

**Files:**
- Create: `web/js/store.js`
- Create: `tests/store.test.mjs`

**Interfaces:**
- Produces:
  - `DEFAULT_SETTINGS = { newPerDay:50, levels:['n2'], categories:[], sound:true }`
  - `emptyState() -> { cards:{}, settings:{...DEFAULT_SETTINGS}, updated:0 }`
  - `mergeStates(a, b) -> state` — per-card keep larger `updated`; `settings` from whichever state has larger top-level `updated`; `updated = max`.
  - `loadState() -> state` (from `localStorage['vocabmatch.state']` or `emptyState()`)
  - `saveState(state) -> void`

- [ ] **Step 1: Write the failing test**

`tests/store.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mergeStates, emptyState, DEFAULT_SETTINGS } from '../web/js/store.js';

test('emptyState has defaults', () => {
  const s = emptyState();
  assert.deepEqual(s.settings, DEFAULT_SETTINGS);
  assert.deepEqual(s.cards, {});
});

test('mergeStates keeps newer card per id', () => {
  const a = { cards: { x:{id:'x',updated:10,interval:1}, y:{id:'y',updated:5} }, settings:DEFAULT_SETTINGS, updated:10 };
  const b = { cards: { x:{id:'x',updated:20,interval:9}, z:{id:'z',updated:7} }, settings:DEFAULT_SETTINGS, updated:7 };
  const m = mergeStates(a, b);
  assert.equal(m.cards.x.interval, 9);   // b newer
  assert.equal(m.cards.y.updated, 5);    // only in a
  assert.equal(m.cards.z.updated, 7);    // only in b
});

test('mergeStates settings follow larger top-level updated', () => {
  const a = { cards:{}, settings:{newPerDay:50}, updated:10 };
  const b = { cards:{}, settings:{newPerDay:30}, updated:99 };
  assert.equal(mergeStates(a,b).settings.newPerDay, 30);
  assert.equal(mergeStates(a,b).updated, 99);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/store.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `web/js/store.js`**

```js
export const DEFAULT_SETTINGS = { newPerDay: 50, levels: ['n2'], categories: [], sound: true };
const KEY = 'vocabmatch.state';

export function emptyState() {
  return { cards: {}, settings: { ...DEFAULT_SETTINGS }, updated: 0 };
}

export function mergeStates(a, b) {
  const cards = { ...a.cards };
  for (const [id, cb] of Object.entries(b.cards)) {
    const ca = cards[id];
    if (!ca || (cb.updated || 0) > (ca.updated || 0)) cards[id] = cb;
  }
  const settings = (b.updated || 0) > (a.updated || 0) ? b.settings : a.settings;
  return { cards, settings, updated: Math.max(a.updated || 0, b.updated || 0) };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    s.cards = s.cards || {};
    return s;
  } catch { return emptyState(); }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: ignore */ }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/store.test.mjs`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/store.js tests/store.test.mjs
git commit -m "feat: state store with pure mergeStates + tests"
```

---

## Task 5: Session logic

**Files:**
- Create: `web/js/session.js`
- Create: `tests/session.test.mjs`

**Interfaces:**
- Consumes: `srs.dueQueue`, `srs.newCard`, `srs.review`.
- Produces:
  - `buildQueue(state, poolIds, now) -> string[]` — `dueQueue(state.cards, poolIds, now, state.settings.newPerDay)`.
  - `applyGrade(state, id, grade, now) -> state'` — pure; creates card via `newCard` if absent, runs `review`, returns a **new** state with `cards[id]` updated and top-level `updated = now`. Does not save or sync.

- [ ] **Step 1: Write the failing test**

`tests/session.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildQueue, applyGrade } from '../web/js/session.js';
import { emptyState } from '../web/js/store.js';

const T = 1_000_000_000_000;

test('buildQueue surfaces new cards up to newPerDay', () => {
  const s = emptyState();
  s.settings.newPerDay = 2;
  assert.deepEqual(buildQueue(s, ['a','b','c'], T), ['a','b']);
});

test('applyGrade creates then schedules a card immutably', () => {
  const s = emptyState();
  const s2 = applyGrade(s, 'a', 'good', T);
  assert.equal(s.cards.a, undefined);            // original untouched
  assert.equal(s2.cards.a.reps, 1);
  assert.equal(s2.cards.a.interval, 1);
  assert.equal(s2.updated, T);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/session.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `web/js/session.js`**

```js
import { dueQueue, newCard, review } from './srs.js';

export function buildQueue(state, poolIds, now) {
  return dueQueue(state.cards, poolIds, now, state.settings.newPerDay);
}

export function applyGrade(state, id, grade, now) {
  const base = state.cards[id] || newCard(id, now);
  const card = review(base, grade, now);
  return {
    ...state,
    cards: { ...state.cards, [id]: card },
    updated: now,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/session.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/session.js tests/session.test.mjs
git commit -m "feat: session queue + applyGrade with tests"
```

---

## Task 6: Match mode grading

**Files:**
- Create: `web/js/modes/match.js`
- Create: `tests/match.test.mjs`

**Interfaces:**
- Produces: `gradeMatch({ wrongBefore, elapsedMs, firstPickHit }) -> grade`.
  - `wrongBefore > 0` → `'again'`
  - else `elapsedMs > 8000` → `'hard'`
  - else `elapsedMs < 2500 && firstPickHit` → `'easy'`
  - else → `'good'`
- (DOM `mountMatch` added in Task 11; this task ships only the pure grader so scheduling is testable.)

- [ ] **Step 1: Write the failing test**

`tests/match.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeMatch } from '../web/js/modes/match.js';

test('mismatch before clear => again', () => {
  assert.equal(gradeMatch({ wrongBefore: 1, elapsedMs: 1000, firstPickHit: false }), 'again');
});
test('slow clean => hard', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 9000, firstPickHit: false }), 'hard');
});
test('fast first-pick => easy', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 2000, firstPickHit: true }), 'easy');
});
test('normal clean => good', () => {
  assert.equal(gradeMatch({ wrongBefore: 0, elapsedMs: 4000, firstPickHit: true }), 'good');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/match.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `web/js/modes/match.js`** (grader only for now)

```js
export function gradeMatch({ wrongBefore, elapsedMs, firstPickHit }) {
  if (wrongBefore > 0) return 'again';
  if (elapsedMs > 8000) return 'hard';
  if (elapsedMs < 2500 && firstPickHit) return 'easy';
  return 'good';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/match.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/match.js tests/match.test.mjs
git commit -m "feat: match-mode grader with tests"
```

---

## Task 7: Typing mode (normalize + grade)

**Files:**
- Create: `web/js/modes/typing.js`
- Create: `tests/typing.test.mjs`

**Interfaces:**
- Produces:
  - `normalizeRomaji(s) -> string` — lowercase; strip everything except `a-z`; collapse long vowels: `ō→o, û/ū→u, ā→a, ē→e, î/ī→i`; then collapse `ou→o, oo→o, uu→u, ei→e` (length-insensitive).
  - `hasKana(s) -> boolean` — true if `s` contains any Hiragana/Katakana.
  - `checkTyping(input, card) -> boolean` — if `hasKana(input)` compare `input.trim()===card.kana`; else `normalizeRomaji(input)===normalizeRomaji(card.romaji)`.
  - `gradeTyping({ correct, hadTypo, elapsedMs, firstTry, revealed }) -> grade`.
    - `!correct || revealed` → `'again'`
    - `firstTry && elapsedMs < 4000` → `'easy'`
    - `hadTypo || elapsedMs > 8000` → `'hard'`
    - else → `'good'`

- [ ] **Step 1: Write the failing test**

`tests/typing.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeRomaji, hasKana, checkTyping, gradeTyping } from '../web/js/modes/typing.js';

test('normalizeRomaji is long-vowel insensitive', () => {
  assert.equal(normalizeRomaji('kyō'), normalizeRomaji('kyou'));
  assert.equal(normalizeRomaji('kyō'), normalizeRomaji('kyoo'));
  assert.equal(normalizeRomaji('gakkō'), normalizeRomaji('gakkou'));
});
test('checkTyping accepts romaji variants', () => {
  const card = { kana:'きょう', romaji:'kyō' };
  assert.equal(checkTyping('kyou', card), true);
  assert.equal(checkTyping('KYŌ', card), true);
  assert.equal(checkTyping('ashita', card), false);
});
test('checkTyping accepts kana input', () => {
  assert.equal(hasKana('きょう'), true);
  assert.equal(checkTyping('きょう', { kana:'きょう', romaji:'kyō' }), true);
});
test('gradeTyping mapping', () => {
  assert.equal(gradeTyping({ correct:false, revealed:true }), 'again');
  assert.equal(gradeTyping({ correct:true, firstTry:true, elapsedMs:2000 }), 'easy');
  assert.equal(gradeTyping({ correct:true, hadTypo:true, elapsedMs:3000 }), 'hard');
  assert.equal(gradeTyping({ correct:true, firstTry:false, hadTypo:false, elapsedMs:5000 }), 'good');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/typing.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `web/js/modes/typing.js`** (pure fns; DOM `mountTyping` in Task 11)

```js
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/typing.test.mjs`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/typing.js tests/typing.test.mjs
git commit -m "feat: typing-mode normalize + grader with tests"
```

---

## Task 8: Quiz mode (distractors + grade)

**Files:**
- Create: `web/js/modes/quiz.js`
- Create: `tests/quiz.test.mjs`

**Interfaces:**
- Produces:
  - `pickDistractors(card, pool, n=3, rnd=Math.random) -> string[]` — `n` `zh` strings from `pool` cards whose `id!==card.id` and `zh!==card.zh`, preferring same `level` then same `pos`; unique `zh`; fewer than `n` only if pool too small.
  - `gradeQuiz({ correct, elapsedMs }) -> grade`: `!correct`→`'again'`; `correct && elapsedMs<1500`→`'easy'`; `correct && elapsedMs>5000`→`'hard'`; else `'good'`.

- [ ] **Step 1: Write the failing test**

`tests/quiz.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { pickDistractors, gradeQuiz } from '../web/js/modes/quiz.js';

const pool = [
  { id:'a', level:'N2', pos:'名', zh:'貓' },
  { id:'b', level:'N2', pos:'名', zh:'狗' },
  { id:'c', level:'N2', pos:'名', zh:'鳥' },
  { id:'d', level:'N1', pos:'動I', zh:'跑' },
];

test('pickDistractors returns n unique other-meanings', () => {
  const d = pickDistractors(pool[0], pool, 3, () => 0);
  assert.equal(d.length, 3);
  assert.ok(!d.includes('貓'));
  assert.equal(new Set(d).size, 3);
});
test('gradeQuiz mapping', () => {
  assert.equal(gradeQuiz({ correct:false, elapsedMs:1000 }), 'again');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:1000 }), 'easy');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:6000 }), 'hard');
  assert.equal(gradeQuiz({ correct:true, elapsedMs:3000 }), 'good');
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/quiz.test.mjs`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `web/js/modes/quiz.js`** (pure fns; DOM `mountQuiz` in Task 11)

```js
function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(card, pool, n = 3, rnd = Math.random) {
  const others = pool.filter(c => c.id !== card.id && c.zh !== card.zh);
  const sameLevelPos = others.filter(c => c.level === card.level && c.pos === card.pos);
  const sameLevel = others.filter(c => c.level === card.level);
  const ranked = [...shuffle(sameLevelPos, rnd), ...shuffle(sameLevel, rnd), ...shuffle(others, rnd)];
  const out = [];
  for (const c of ranked) {
    if (out.length >= n) break;
    if (!out.includes(c.zh)) out.push(c.zh);
  }
  return out;
}

export function gradeQuiz({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 1500) return 'easy';
  if (elapsedMs > 5000) return 'hard';
  return 'good';
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/quiz.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/quiz.js tests/quiz.test.mjs
git commit -m "feat: quiz-mode distractors + grader with tests"
```

---

## Task 9: Sync — passphrase hash + Worker

**Files:**
- Create: `web/js/sync.js`
- Create: `worker/index.js`
- Create: `tests/sync.test.mjs`

**Interfaces:**
- Produces (`sync.js`):
  - `hashKey(passphrase) -> Promise<string>` — hex SHA-256 via `crypto.subtle`.
  - `pull(workerUrl, key) -> Promise<object|null>` — GET `?key=`; parse JSON; `{}`→`null`; network error→`null`.
  - `push(workerUrl, key, state) -> Promise<boolean>` — PUT `?key=` body JSON; return ok.
- Produces (`worker/index.js`): `export default { fetch(request, env) }`.
  - `GET ?key=K` → 200 body = `env.KV.get(K) || '{}'`, `content-type: application/json`, CORS `*`.
  - `PUT ?key=K` → `env.KV.put(K, await request.text())`, 204, CORS.
  - `OPTIONS` → 204 CORS preflight (allow GET,PUT,OPTIONS). Missing `key` → 400.

- [ ] **Step 1: Write the failing test**

`tests/sync.test.mjs`:
```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { hashKey } from '../web/js/sync.js';
import worker from '../worker/index.js';

test('hashKey is stable hex sha-256', async () => {
  const h = await hashKey('my-pass');
  assert.match(h, /^[0-9a-f]{64}$/);
  assert.equal(h, await hashKey('my-pass'));
  assert.notEqual(h, await hashKey('other'));
});

function fakeEnv() {
  const m = new Map();
  return { KV: { get: k => Promise.resolve(m.get(k) ?? null), put: (k,v) => (m.set(k,v), Promise.resolve()) } };
}

test('worker stores and returns state by key', async () => {
  const env = fakeEnv();
  const put = await worker.fetch(new Request('https://w/?key=abc', { method:'PUT', body:'{"cards":{"x":1}}' }), env);
  assert.equal(put.status, 204);
  const get = await worker.fetch(new Request('https://w/?key=abc'), env);
  assert.equal(get.status, 200);
  assert.deepEqual(await get.json(), { cards:{ x:1 } });
  assert.equal(get.headers.get('access-control-allow-origin'), '*');
});

test('worker unknown key returns empty object', async () => {
  const get = await worker.fetch(new Request('https://w/?key=none'), fakeEnv());
  assert.deepEqual(await get.json(), {});
});

test('worker missing key => 400', async () => {
  const r = await worker.fetch(new Request('https://w/'), fakeEnv());
  assert.equal(r.status, 400);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/sync.test.mjs`
Expected: FAIL — modules not found.

- [ ] **Step 3a: Write `worker/index.js`**

```js
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,PUT,OPTIONS',
  'access-control-allow-headers': 'content-type',
};

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });
    const key = new URL(request.url).searchParams.get('key');
    if (!key) return new Response('missing key', { status: 400, headers: CORS });
    if (request.method === 'PUT') {
      await env.KV.put(key, await request.text());
      return new Response(null, { status: 204, headers: CORS });
    }
    const body = (await env.KV.get(key)) || '{}';
    return new Response(body, { status: 200, headers: { ...CORS, 'content-type': 'application/json' } });
  },
};
```

- [ ] **Step 3b: Write `web/js/sync.js`**

```js
export async function hashKey(passphrase) {
  const data = new TextEncoder().encode(passphrase);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function pull(workerUrl, key) {
  try {
    const r = await fetch(`${workerUrl}?key=${key}`);
    if (!r.ok) return null;
    const s = await r.json();
    return s && Object.keys(s).length ? s : null;
  } catch { return null; }
}

export async function push(workerUrl, key, state) {
  try {
    const r = await fetch(`${workerUrl}?key=${key}`, {
      method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(state),
    });
    return r.ok;
  } catch { return false; }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/sync.test.mjs`
Expected: PASS (4 tests). (Node ≥18 provides global `crypto`, `fetch`, `Request`, `Response`.)

- [ ] **Step 5: Commit**

```bash
git add web/js/sync.js worker/index.js tests/sync.test.mjs
git commit -m "feat: passphrase sync client + Cloudflare Worker with tests"
```

---

## Task 10: Full logic test sweep

**Files:** none (verification gate).

- [ ] **Step 1: Run all JS tests**

Run: `node --test tests/`
Expected: PASS — all tests from Tasks 1,3,4,5,6,7,8,9.

- [ ] **Step 2: Run the data build test**

Run: `python3 tests/test_build_data.py`
Expected: `ok`.

- [ ] **Step 3: Commit (if any fixups were needed)**

```bash
git add -A && git commit -m "test: green logic suite for vocab game" || echo "nothing to commit"
```

---

## Task 11: Audio + UI shell + three mode views + app bootstrap

> This task delivers the browser app (no unit tests — verified by manual acceptance in Step-run). Build the visuals with the **frontend-design skill** for the "fancy" polish; the code below is the required structure and wiring, and the acceptance checklist is the gate.

**Files:**
- Create: `web/index.html`, `web/config.js`, `web/style.css`
- Create: `web/js/audio.js`, `web/js/ui.js`, `web/js/app.js`
- Modify: `web/js/modes/match.js`, `web/js/modes/typing.js`, `web/js/modes/quiz.js` (add `mount*` DOM functions; keep the pure graders unchanged)

**Interfaces:**
- Consumes: everything from Tasks 3–9.
- `audio.js`: `export function makeAudio(enabled) -> { hit(combo), wrong(), clear(), setEnabled(b) }` (Web Audio; short synthesized blips; pitch rises with `combo`).
- Each mode: `export function mountMatch(root, cards, onResult, audio)` / `mountTyping(root, card, onResult, audio)` / `mountQuiz(root, card, pool, onResult, audio)` where `onResult(id, grade)` is called per graded card. Match consumes 6 cards/board; typing & quiz one card.
- `ui.js`: `export function renderChrome(root, state, data, handlers)` (mode tabs, level & category chips, due/new counts, settings panel), `export function confetti(root)`, `export function particles(x,y)`.
- `app.js`: bootstrap — load selected-level data, build pool (apply category filter), `buildQueue`, drive the selected mode, on each `onResult` → `applyGrade` → `saveState` → debounce `push`; on load, if passphrase+`WORKER_URL` set, `pull`+`mergeStates`+`saveState`.

- [ ] **Step 1: `web/config.js`**

```js
export const WORKER_URL = ""; // paste your deployed Worker URL, e.g. https://vocab-sync.yourname.workers.dev
```

- [ ] **Step 2: `web/index.html`** (module entry; minimal structure — style in CSS)

```html
<!doctype html>
<html lang="zh-Hant">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1">
  <title>JLPT 單字遊戲</title>
  <link rel="stylesheet" href="style.css">
</head>
<body>
  <header id="chrome"></header>
  <main id="stage"></main>
  <script type="module" src="js/app.js"></script>
</body>
</html>
```

- [ ] **Step 3: `web/js/audio.js`** (synthesized SFX)

```js
export function makeAudio(enabled) {
  let on = enabled;
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  function blip(freq, dur = 0.08, type = 'triangle', gain = 0.15) {
    if (!on) return;
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(c.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  }
  return {
    hit(combo = 0) { blip(440 + Math.min(combo, 12) * 60); },
    wrong() { blip(160, 0.14, 'sawtooth', 0.12); },
    clear() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12), i * 70)); },
    setEnabled(b) { on = b; },
  };
}
```

- [ ] **Step 4: Add `mountMatch/mountTyping/mountQuiz` DOM views** to the three mode files, using the existing graders. Each computes per-card timing/attempts and calls `onResult(id, grade)`. Use CSS classes for animation; trigger `audio.hit(combo)/wrong()/clear()` and `ui.particles`/`ui.confetti`.

  Reference skeleton for `mountQuiz` (the simplest — mirror the pattern for the others):

```js
import { pickDistractors, gradeQuiz } from '../modes/quiz.js'; // (within quiz.js use local fns)
export function mountQuiz(root, card, pool, onResult, audio) {
  const start = performance.now();
  const options = [card.zh, ...pickDistractors(card, pool, 3)]
    .map(zh => ({ zh, correct: zh === card.zh }))
    .sort(() => Math.random() - 0.5);
  root.innerHTML = `
    <div class="prompt"><span class="jp">${card.word}</span><span class="kana">${card.kana}</span></div>
    <div class="options"></div>`;
  const box = root.querySelector('.options');
  for (const opt of options) {
    const b = document.createElement('button');
    b.className = 'opt'; b.textContent = opt.zh;
    b.onclick = () => {
      const elapsedMs = performance.now() - start;
      const grade = gradeQuiz({ correct: opt.correct, elapsedMs });
      b.classList.add(opt.correct ? 'right' : 'wrong');
      opt.correct ? audio.hit() : audio.wrong();
      [...box.children].forEach(c => (c.disabled = true));
      setTimeout(() => onResult(card.id, grade), 650);
    };
    box.appendChild(b);
  }
}
```

  `mountMatch`: render 12 shuffled cards (6 word + 6 meaning) in a `.grid`; track selected card; on two picks, compare `id`; correct → animate out + `onResult(id, gradeMatch(...))` + `audio.hit(combo)`; wrong → shake + `audio.wrong()` + record `wrongBefore` for both ids; refill when board empty (app supplies next 6). `mountTyping`: `<input>`; on Enter, `checkTyping`; show reveal button; call `onResult(card.id, gradeTyping(...))`.

- [ ] **Step 5: `web/js/ui.js`** — `renderChrome` (mode tabs `配對／打字／四選一`, level chips N5–N1 multi-select bound to `state.settings.levels`, category chips from loaded data, due/new counts, ⚙ settings panel with newPerDay, sync passphrase, sound toggle, reset), plus `confetti(root)` and `particles(x,y)` DOM/CSS helpers. Handlers object: `{ onModeChange, onLevelsChange, onCategoriesChange, onSettingsChange }`.

- [ ] **Step 6: `web/js/app.js`** — bootstrap and wiring:

```js
import { loadState, saveState, mergeStates } from './store.js';
import { buildQueue, applyGrade } from './session.js';
import { hashKey, pull, push } from './sync.js';
import { makeAudio } from './audio.js';
import { renderChrome } from './ui.js';
import { mountMatch } from './modes/match.js';
import { mountTyping } from './modes/typing.js';
import { mountQuiz } from './modes/quiz.js';
import { WORKER_URL } from '../config.js';

const state = { ...loadState() };
let mode = 'match';
let dataByLevel = {};      // { n2: [cards] }
let pool = [];             // filtered candidate cards
let queue = [];            // ids to review this session
let audio = makeAudio(state.settings.sound);

async function loadLevels(levels) {
  for (const lv of levels) if (!dataByLevel[lv])
    dataByLevel[lv] = await (await fetch(`data/${lv}.json`)).json();
}
function rebuildPool() {
  const cats = state.settings.categories;
  pool = state.settings.levels.flatMap(lv => dataByLevel[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category));
  queue = buildQueue(state, pool.map(c => c.id), Date.now());
}
const byId = id => pool.find(c => c.id === id);

let pushTimer = null;
async function persist() {
  saveState(state);
  if (!WORKER_URL || !state.settings.passphrase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => push(WORKER_URL, await hashKey(state.settings.passphrase), state), 3000);
}
function onResult(id, grade) {
  Object.assign(state, applyGrade(state, id, grade, Date.now()));
  persist();
  next();
}
function next() {
  const stage = document.getElementById('stage');
  if (mode === 'match') {
    const six = queue.splice(0, 6).map(byId).filter(Boolean);
    if (six.length < 2) return renderDone(stage);
    mountMatch(stage, six, onResult, audio);
  } else {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const card = byId(id);
    mode === 'typing' ? mountTyping(stage, card, onResult, audio) : mountQuiz(stage, card, pool, onResult, audio);
  }
}
function renderDone(stage) { stage.innerHTML = `<div class="done">今日到期已複習完 🎉</div>`; }

function renderAll() {
  renderChrome(document.getElementById('chrome'), state, dataByLevel, {
    onModeChange: m => { mode = m; next(); },
    onLevelsChange: async lv => { state.settings.levels = lv; state.updated = Date.now(); await loadLevels(lv); rebuildPool(); persist(); next(); },
    onCategoriesChange: c => { state.settings.categories = c; state.updated = Date.now(); rebuildPool(); persist(); next(); },
    onSettingsChange: s => { Object.assign(state.settings, s); state.updated = Date.now(); audio.setEnabled(state.settings.sound); rebuildPool(); persist(); renderAll(); next(); },
  });
}

(async function boot() {
  if (WORKER_URL && state.settings.passphrase) {
    const remote = await pull(WORKER_URL, await hashKey(state.settings.passphrase));
    if (remote) { Object.assign(state, mergeStates(state, remote)); saveState(state); }
  }
  await loadLevels(state.settings.levels);
  rebuildPool();
  renderAll();
  next();
})();
```

- [ ] **Step 7: `web/style.css`** — fancy visual system: vibrant gradient background, glassy rounded cards with soft shadows, spring `transform` keyframes for deal-in / pop-out / shake, combo counter animation, `.right`/`.wrong` flashes, confetti + particle keyframes, responsive grid (`.grid` 3-col on phone, wider on desktop), light/dark via `prefers-color-scheme`. (Author with frontend-design skill.)

- [ ] **Step 8: Manual acceptance (the gate for this task)**

Run: `python3 -m http.server -d web 8000` then open `http://localhost:8000`.
Verify ALL:
  1. Loads with default level N2; mode tabs 配對／打字／四選一 switch the stage.
  2. **配對**: 6 pairs render, matching clears with animation + sound + combo; wrong shakes; board refills; a graded card's `state.cards[id]` appears (check DevTools `localStorage`).
  3. **打字**: typing the reading (romaji `kyou` or kana) accepts; Enter grades; reveal button works.
  4. **四選一**: 4 options, correct highlights, wrong marks correct answer.
  5. Level chips add/remove levels (loads `data/<lv>.json`); category chips filter.
  6. Settings: change newPerDay (queue size changes next session), toggle sound (SFX stop), set a passphrase.
  7. No console errors on any mode.

- [ ] **Step 9: Commit**

```bash
git add web tests
git commit -m "feat: fancy game UI — three mode views, audio, chrome, bootstrap"
```

---

## Task 12: Deploy config — GitHub Pages + Worker docs

**Files:**
- Create: `.github/workflows/pages.yml`
- Create: `worker/wrangler.toml`, `worker/README.md`

- [ ] **Step 1: `.github/workflows/pages.yml`** — publish `web/` to Pages

```yaml
name: Deploy game to Pages
on:
  push:
    branches: [main]
    paths: ['web/**', '.github/workflows/pages.yml']
  workflow_dispatch:
permissions:
  contents: read
  pages: write
  id-token: write
concurrency:
  group: pages
  cancel-in-progress: true
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with: { path: web }
      - id: deployment
        uses: actions/deploy-pages@v4
```

- [ ] **Step 2: `worker/wrangler.toml`**

```toml
name = "vocab-sync"
main = "index.js"
compatibility_date = "2024-01-01"

[[kv_namespaces]]
binding = "KV"
id = "PASTE_YOUR_KV_NAMESPACE_ID"
```

- [ ] **Step 3: `worker/README.md`** — exact deploy steps

```markdown
# 同步 Worker 部署（免費，一次性）

1. 註冊免費 Cloudflare 帳號，安裝 Node，然後 `npm i -g wrangler` 並 `wrangler login`。
2. 建 KV：`wrangler kv namespace create KV` → 把回傳的 `id` 貼進 `wrangler.toml` 的 `id`。
3. 在 `worker/` 執行 `wrangler deploy`。
4. 複製部署後的網址（如 `https://vocab-sync.<you>.workers.dev`），貼到 `web/config.js` 的 `WORKER_URL`。
5. 在遊戲設定輸入一組「同步密碼」；另一台裝置輸入同一組即自動合一。

> 安全性：密碼即存取權，刻意從簡（背單字進度低風險）。
```

- [ ] **Step 4: Enable Pages (manual, one-time)**

In GitHub → repo Settings → Pages → Source = **GitHub Actions**. Push to `main`; the workflow deploys `web/`. Verify the published URL loads the game.

- [ ] **Step 5: Commit**

```bash
git add .github/workflows/pages.yml worker/wrangler.toml worker/README.md
git commit -m "chore: GitHub Pages workflow + Worker deploy docs"
```

---

## Task 13: End-to-end verification

**Files:** none.

- [ ] **Step 1: Full test suite**

Run: `node --test tests/` and `python3 tests/test_build_data.py`
Expected: all PASS / `ok`.

- [ ] **Step 2: Cross-device sync smoke (manual)**

On the deployed URL: set passphrase `P` on device A, grade a few cards; on device B set the same passphrase `P`, reload — the graded cards' schedules appear (merged). Confirm no console errors offline (disable network → game still plays from localStorage).

- [ ] **Step 3: Update `TODO.md` and README pointer, commit**

```bash
git add -A
git commit -m "docs: note vocab game app in TODO"
```

---

## Self-Review

- **Spec coverage:** data build (T2) ✓; SRS SM-2 (T3) ✓; store+merge (T4) ✓; session queue+grade (T5) ✓; three modes match/typing/quiz graders (T6–T8) ✓ + DOM (T11) ✓; passphrase sync + Worker (T9) ✓; audio/UI/chrome/mode-picker/filters/settings/fancy (T11) ✓; hosting Pages + Worker deploy (T12) ✓; error handling: sync failures return null/false and app falls back to localStorage (T9, T11 boot) ✓; localStorage private-mode ignore (T4) ✓; testing strategy (T3–T9 unit, T11 manual gate, T13 e2e) ✓.
- **Placeholder scan:** DOM `mount*` and CSS are specified with skeletons + acceptance criteria rather than full final markup because they are visually iterated with frontend-design; all *testable logic* has complete code. `wrangler.toml` `id` is a user-supplied value by design (documented). No TODO/TBD in logic.
- **Type consistency:** `grade` strings uniform; `onResult(id, grade)` used by all modes and app; `mergeStates/applyGrade/buildQueue/dueQueue/review/newCard` signatures match across tasks; `hashKey/pull/push` match app usage; Worker `fetch(request, env)` matches test + wrangler binding `KV`.
