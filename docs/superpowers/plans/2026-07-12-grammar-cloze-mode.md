# 文法四選一（Grammar Cloze）Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JLPT 問題1-style grammar cloze mode under a new 單字／文法 content switch, with its own SM-2 progress, fed by an agent-generated + reviewed item bank.

**Architecture:** New self-contained mode file `web/js/modes/grammar-cloze.js` (mirrors the existing `mountQuiz` pattern) plus pure helpers `gradeCloze`/`furiganaToRuby`. A one-time offline pipeline generates + adversarially reviews cloze items into `data/grammar_cloze_items/<lv>.json`, which a deterministic `build_grammar_cloze.py` validates and emits to `web/data/grammar_<lv>.json`. `app.js`/`ui.js` gain a `content` dimension (`vocab`|`grammar`) that swaps the data source and mode-tab list; grammar cards share the existing `state.cards` SM-2 map.

**Tech Stack:** Vanilla ES modules (no build step for the app), `node --test` for JS, Python 3 + `python3 -m unittest` for the build validator, Playwright for end-to-end checks.

## Global Constraints

- Vanilla ES modules, **no app build step**. JS tests: `node --test tests/*.test.mjs` (glob, never bare `tests/`).
- SM-2 grade strings **exactly** `'again'|'hard'|'good'|'easy'`.
- `gradeCloze` thresholds match `gradeQuiz`: wrong→`again`, `<1500`ms→`easy`, `>5000`ms→`hard`, else `good`.
- All UI copy in **Traditional Chinese (Taiwan)**.
- Item id = **first 12 hex chars of SHA-1 of `"<pattern>|<lv>"`**, where `lv` is lowercase (`n3`); stored `level` field is uppercase (`N3`), matching the vocab convention in `build_web_data.py`.
- Item invariant: `before + answer + after` reconstructs the source example sentence exactly; furigana preserved as `漢字（かな）` (full-width parens `（`/`）`).
- Reuse existing chrome, `session.js` (SRS), `sync.js`, theme, and `ui.js` fx (`particles`/`stamp`) — do not duplicate them.
- `pairMode` (reading/meaning) applies to **vocab only**; grammar ignores it.

---

### Task 1: Grammar-cloze mode file (`grammar-cloze.js`) + pure-helper tests

The mode file exports the mount function and two pure helpers. Per the existing
codebase convention, `mount*` functions are verified via Playwright (Task 8),
and only the pure helpers get `node --test` unit tests (as with
`pickDistractors`/`gradeQuiz` in `quiz.js`).

**Files:**
- Create: `web/js/modes/grammar-cloze.js`
- Test: `tests/grammar-cloze.test.mjs`

**Interfaces:**
- Produces:
  - `gradeCloze({ correct: boolean, elapsedMs: number }) -> 'again'|'hard'|'good'|'easy'`
  - `furiganaToRuby(s: string) -> string` (converts `漢字（かな）` runs to `<ruby>漢字<rt>かな</rt></ruby>`)
  - `mountGrammarCloze(root: Element, item, pool, onResult: (id,grade)=>void, audio) -> void`
    where `item = { id, level, category, pattern, meaning_zh, before, answer, after, distractors:[3], note, ex_zh }`
- Consumes: `particles`, `stamp` from `../ui.js` (existing exports).

- [ ] **Step 1: Write the failing tests**

Create `tests/grammar-cloze.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeCloze, furiganaToRuby } from '../web/js/modes/grammar-cloze.js';

test('gradeCloze mapping', () => {
  assert.equal(gradeCloze({ correct: false, elapsedMs: 800 }), 'again');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 800 }), 'easy');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 6000 }), 'hard');
  assert.equal(gradeCloze({ correct: true, elapsedMs: 3000 }), 'good');
});

test('furiganaToRuby converts single kanji+reading', () => {
  assert.equal(furiganaToRuby('住（す）む'), '<ruby>住<rt>す</rt></ruby>む');
});
test('furiganaToRuby converts a jukugo run', () => {
  assert.equal(furiganaToRuby('三年（さんねん）'), '<ruby>三年<rt>さんねん</rt></ruby>');
});
test('furiganaToRuby leaves plain text and kana untouched', () => {
  assert.equal(furiganaToRuby('わけだ。'), 'わけだ。');
});
test('furiganaToRuby leaves an unbalanced paren as-is', () => {
  assert.equal(furiganaToRuby('住（す'), '住（す');
});
test('furiganaToRuby handles a full mixed sentence', () => {
  assert.equal(
    furiganaToRuby('日本語（にほんご）が上手（じょうず）な'),
    '<ruby>日本語<rt>にほんご</rt></ruby>が<ruby>上手<rt>じょうず</rt></ruby>な'
  );
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test tests/grammar-cloze.test.mjs`
Expected: FAIL — `Cannot find module '.../web/js/modes/grammar-cloze.js'`.

- [ ] **Step 3: Implement `grammar-cloze.js`**

Create `web/js/modes/grammar-cloze.js`:

```js
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

/**
 * Mount one grammar cloze round.
 * item: { id, meaning_zh, before, answer, after, distractors:[3], ... }
 * onResult(id, grade) is called once, after the reveal delay.
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

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.t;
    b.onclick = () => {
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
      setTimeout(() => onResult(item.id, grade), 700);
    };
    box.appendChild(b);
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test tests/grammar-cloze.test.mjs`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/grammar-cloze.js tests/grammar-cloze.test.mjs
git commit -m "feat: grammar-cloze mode + gradeCloze/furiganaToRuby helpers"
```

---

### Task 2: `content` setting in the store

**Files:**
- Modify: `web/js/store.js:1`
- Test: `tests/store.test.mjs`

**Interfaces:**
- Produces: `DEFAULT_SETTINGS.content === 'vocab'`; loaded state always has a `content` field (via the existing `{ ...DEFAULT_SETTINGS, ...saved }` merge in `loadState`).

- [ ] **Step 1: Add the failing test**

Append to `tests/store.test.mjs`:

```js
test('DEFAULT_SETTINGS has content vocab and loadState fills it', () => {
  assert.equal(DEFAULT_SETTINGS.content, 'vocab');
});
```

Ensure the file imports `DEFAULT_SETTINGS` (add to the existing import from `../web/js/store.js` if missing).

- [ ] **Step 2: Run to verify it fails**

Run: `node --test tests/store.test.mjs`
Expected: FAIL — `DEFAULT_SETTINGS.content` is `undefined`.

- [ ] **Step 3: Add the field**

In `web/js/store.js`, edit the `DEFAULT_SETTINGS` line to add `content: 'vocab'`:

```js
export const DEFAULT_SETTINGS = { newPerDay: 50, levels: ['n2'], categories: [], sound: true, pairMode: 'meaning', theme: 'system', content: 'vocab' };
```

- [ ] **Step 4: Run to verify it passes**

Run: `node --test tests/store.test.mjs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add web/js/store.js tests/store.test.mjs
git commit -m "feat: add content (vocab|grammar) setting"
```

---

### Task 3: Build validator/emitter `build_grammar_cloze.py`

Deterministic, TDD'd. Reads flat raw items from `data/grammar_cloze_items/<lv>.json`
(produced in Task 4), validates each against the item invariants, computes `id`,
dedups by `pattern|lv` (lower level wins, as vocab does), and emits
`web/data/grammar_<lv>.json`. Excluded items are logged, never silently dropped.

**Files:**
- Create: `build_grammar_cloze.py`
- Test: `tests/test_build_grammar_cloze.py`

**Interfaces:**
- Produces:
  - `validate(item: dict) -> list[str]` (returns list of error strings; empty = valid)
  - `build_level(items: list[dict], lv: str, seen: set) -> list[dict]` (validated emitted items with `id`/`level`; mutates `seen` with `pattern|lv` keys; skips invalid + already-seen)

- [ ] **Step 1: Write the failing tests**

Create `tests/test_build_grammar_cloze.py`:

```python
import unittest
from build_grammar_cloze import validate, build_level

GOOD = {
    "category": "判断・説明・当然", "pattern": "〜わけだ",
    "meaning_zh": "難怪…", "note": "n", "ex_zh": "難怪日語這麼好。",
    "before": "日本語（にほんご）が上手（じょうず）な", "answer": "わけだ", "after": "。",
    "distractors": ["はずがない", "ことだ", "ものだ"],
}

class TestValidate(unittest.TestCase):
    def test_good_item_has_no_errors(self):
        self.assertEqual(validate(GOOD), [])

    def test_answer_in_distractors_rejected(self):
        bad = {**GOOD, "distractors": ["わけだ", "ことだ", "ものだ"]}
        self.assertTrue(any("distractor" in e for e in validate(bad)))

    def test_wrong_distractor_count_rejected(self):
        bad = {**GOOD, "distractors": ["ことだ", "ものだ"]}
        self.assertTrue(validate(bad))

    def test_empty_before_or_answer_rejected(self):
        self.assertTrue(validate({**GOOD, "before": ""}))
        self.assertTrue(validate({**GOOD, "answer": ""}))

    def test_unbalanced_furigana_parens_rejected(self):
        bad = {**GOOD, "before": "日本語（にほんごが上手な"}
        self.assertTrue(any("furigana" in e for e in validate(bad)))

class TestBuildLevel(unittest.TestCase):
    def test_emits_id_and_uppercase_level(self):
        seen = set()
        out = build_level([dict(GOOD)], "n3", seen)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["level"], "N3")
        self.assertEqual(len(out[0]["id"]), 12)

    def test_dedups_same_pattern_across_calls(self):
        seen = set()
        build_level([dict(GOOD)], "n3", seen)
        out2 = build_level([dict(GOOD)], "n2", seen)  # pattern|n2 is new key → still emitted
        self.assertEqual(len(out2), 1)
        # same lv twice → deduped
        seen2 = set()
        first = build_level([dict(GOOD)], "n3", seen2)
        second = build_level([dict(GOOD)], "n3", seen2)
        self.assertEqual(len(first), 1)
        self.assertEqual(len(second), 0)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests/test_build_grammar_cloze.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_grammar_cloze'`.

- [ ] **Step 3: Implement `build_grammar_cloze.py`**

Create `build_grammar_cloze.py`:

```python
#!/usr/bin/env python3
"""Validate agent-produced cloze items and emit web/data/grammar_<lv>.json.

Input : data/grammar_cloze_items/<lv>.json  (flat list of raw item dicts)
Output: web/data/grammar_<lv>.json          (validated, id-stamped, deduped)
"""
import glob, json, hashlib, os, re

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
REQUIRED = ["category", "pattern", "meaning_zh", "before", "answer", "after",
            "distractors", "note", "ex_zh"]


def _balanced_furigana(s):
    return s.count("（") == s.count("）")


def validate(item):
    errs = []
    for k in REQUIRED:
        if k not in item:
            errs.append(f"missing key: {k}")
    if errs:
        return errs
    if not isinstance(item["before"], str) or not item["before"].strip():
        errs.append("empty before")
    if not isinstance(item["answer"], str) or not item["answer"].strip():
        errs.append("empty answer")
    if not isinstance(item["after"], str):
        errs.append("after must be a string")
    d = item["distractors"]
    if not isinstance(d, list) or len(d) != 3 or any(not isinstance(x, str) or not x.strip() for x in d):
        errs.append("distractors must be 3 non-empty strings")
    else:
        if item["answer"] in d:
            errs.append("answer appears in distractors")
        opts = [item["answer"], *d]
        if len(set(opts)) != 4:
            errs.append("options not unique")
    for field in ("before", "after"):
        if isinstance(item.get(field), str) and not _balanced_furigana(item[field]):
            errs.append(f"unbalanced furigana parens in {field}")
    return errs


def build_level(items, lv, seen):
    out = []
    for raw in items:
        errs = validate(raw)
        if errs:
            print(f"  SKIP [{lv}] {raw.get('pattern','?')}: {'; '.join(errs)}")
            continue
        key = raw["pattern"] + "|" + lv
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": hashlib.sha1(key.encode()).hexdigest()[:12],
            "level": lv.upper(),
            "category": raw["category"],
            "pattern": raw["pattern"],
            "meaning_zh": raw["meaning_zh"],
            "before": raw["before"],
            "answer": raw["answer"],
            "after": raw["after"],
            "distractors": raw["distractors"],
            "note": raw["note"],
            "ex_zh": raw["ex_zh"],
        })
    return out


def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()
    for lv in LEVELS:
        path = f"data/grammar_cloze_items/{lv}.json"
        items = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        out = build_level(items, lv, seen)
        json.dump(out, open(f"web/data/grammar_{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: emitted {len(out)} / {len(items)} raw")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest tests/test_build_grammar_cloze.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add build_grammar_cloze.py tests/test_build_grammar_cloze.py
git commit -m "feat: grammar-cloze bank validator/emitter (build_grammar_cloze.py)"
```

---

### Task 4: Generate + review the cloze item bank

This is the content-generation task. It produces
`data/grammar_cloze_items/<lv>.json` for every level, then runs the Task 3
builder to emit `web/data/grammar_<lv>.json`. Because it spawns many agents, it
**requires the user's explicit opt-in**; run it as a Workflow (generate →
adversarial verify pipeline) or as a batch of dispatched agents. Confirm the
approach with the user before starting.

**Files:**
- Create: `data/grammar_cloze_items/n5.json` … `n1.json` (agent output; flat lists)
- Create (by running the builder): `web/data/grammar_n5.json` … `n1.json`

**Source & walker:** read `data/grammar_<lv>_part*.json`. Structure is nested;
collect `(category, entry)` with:

```python
def walk(o, cat=None):
    if isinstance(o, dict):
        if "entries" in o:
            for e in o["entries"]:
                yield o.get("category", cat), e
        else:
            for v in o.values():
                yield from walk(v, cat)
    elif isinstance(o, list):
        for it in o:
            yield from walk(it, cat)
```

- [ ] **Step 1: Generation agent — one item per pattern**

For each `(category, entry)` (fields `pattern, connection, ex, meaning_zh, note, ex_zh`), an agent returns JSON:

```
{ "category": <category>, "pattern": <entry.pattern>, "meaning_zh": <entry.meaning_zh>,
  "note": <entry.note>, "ex_zh": <entry.ex_zh>,
  "before": <text before the grammar in ex, furigana preserved>,
  "answer": <the exact grammar surface removed from ex, no 〜>,
  "after":  <text after the grammar in ex, furigana preserved>,
  "distractors": [<3 real JLPT grammar expressions, surface form, that do NOT fit before+after>] }
```

Generation prompt (verbatim intent):
> 你是 JLPT 出題老師。以下是一個文法句型與其例句。請把例句在「該句型出現處」切成 before／answer／after 三段（`before + answer + after` 必須完全等於原例句，振假名 `漢字（かな）` 原樣保留），answer 是要挖掉的文法部分（不含 〜）。再給 3 個「同級、似是而非、但放進這個空格文法上不成立」的干擾選項（surface 形，不含 〜）。只輸出上面的 JSON。
> pattern: `{pattern}` / connection: `{connection}` / 例句: `{ex}` / 意思: `{meaning_zh}`

- [ ] **Step 2: Adversarial review agent — verify exactly one answer fits**

A second agent (or verify stage) receives the generated item and the source `ex`, and must confirm ALL of:
1. `before + answer + after == ex` (exact).
2. Exactly ONE of the 4 options grammatically fits `before` ___ `after`; the 3 distractors do NOT fit.
3. Furigana parens intact and balanced in `before`/`after`.
4. Distractors are real JLPT grammar of the same level, not nonsense.

It returns `{ "ok": true }` or `{ "ok": false, "reason": ... }`. On `false`, regenerate (bounded retries, e.g. 2). Drop patterns that still fail and log them.

- [ ] **Step 3: Write per-level files and build**

Write validated items grouped by level to `data/grammar_cloze_items/<lv>.json`, then:

Run: `python3 build_grammar_cloze.py`
Expected: prints `n5..n1: emitted M / N raw` with M/N ≥ 0.95 for each populated level. Any `SKIP` lines are acceptable and expected for a small tail.

- [ ] **Step 4: Sanity check the emitted bank**

Run:
```bash
python3 -c "
import json
for lv in ['n5','n4','n3','n2','n1']:
    d=json.load(open(f'web/data/grammar_{lv}.json'))
    print(lv, len(d), 'e.g.', d[0]['before']+'___'+d[0]['after'], '=', d[0]['answer']) if d else print(lv,0)
"
```
Expected: each level prints a plausible count and a well-formed cloze example.

- [ ] **Step 5: Commit**

```bash
git add data/grammar_cloze_items web/data/grammar_n5.json web/data/grammar_n4.json web/data/grammar_n3.json web/data/grammar_n2.json web/data/grammar_n1.json
git commit -m "data: agent-generated + reviewed grammar cloze bank"
```

---

### Task 5: `app.js` — content dimension, data loading, routing

**Files:**
- Modify: `web/js/app.js`

**Interfaces:**
- Consumes: `mountGrammarCloze` (Task 1), `DEFAULT_SETTINGS.content` (Task 2), `web/data/grammar_<lv>.json` (Task 4).
- Produces: `handlers.onContentChange(content)` for `ui.js` (Task 6); passes `activeData()` (the active content's `{lv:[cards]}`) as the third arg to `renderChrome`.

- [ ] **Step 1: Add the grammar-cloze import**

At the top of `web/js/app.js`, after the other mode imports, add:

```js
import { mountGrammarCloze } from './modes/grammar-cloze.js';
```

- [ ] **Step 2: Replace the data map + loader**

Replace:
```js
let dataByLevel = {};      // { n2: [cards] }
```
with:
```js
let data = { vocab: {}, grammar: {} };   // data[content][lv] = [cards]
const activeData = () => data[state.settings.content];
```

Replace `loadLevels`:
```js
async function loadLevels(levels) {
  for (const lv of levels) if (!dataByLevel[lv])
    dataByLevel[lv] = await (await fetch(`data/${lv}.json`)).json();
}
```
with:
```js
async function loadLevels(content, levels) {
  const bucket = data[content];
  const prefix = content === 'grammar' ? 'grammar_' : '';
  for (const lv of levels) if (!bucket[lv])
    bucket[lv] = await (await fetch(`data/${prefix}${lv}.json`)).json();
}
```

- [ ] **Step 3: Update `rebuildPool` to use active content**

Replace `rebuildPool`:
```js
function rebuildPool() {
  const cats = state.settings.categories;
  pool = state.settings.levels.flatMap(lv => dataByLevel[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category))
    // reading mode pairs kanji ↔ its kana reading, so only kanji words (word≠kana)
    .filter(c => state.settings.pairMode !== 'reading' || c.word !== c.kana);
  queue = buildQueue(state, pool.map(c => c.id), Date.now());
}
```
with:
```js
function rebuildPool() {
  const cats = state.settings.categories;
  const byLv = activeData();
  pool = state.settings.levels.flatMap(lv => byLv[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category))
    // reading mode (vocab only) pairs kanji ↔ kana, so only kanji words (word≠kana)
    .filter(c => state.settings.content !== 'vocab'
      || state.settings.pairMode !== 'reading' || c.word !== c.kana);
  queue = buildQueue(state, pool.map(c => c.id), Date.now());
}
```

- [ ] **Step 4: Route grammar in `next()`**

At the very start of `next()`, before the `if (mode === 'falling')` line, add a grammar branch:
```js
function next() {
  const stage = document.getElementById('stage');
  if (state.settings.content === 'grammar') {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const item = byId(id);
    if (!item) return renderDone(stage);
    return mountGrammarCloze(stage, item, pool, onResult, audio);
  }
  if (mode === 'falling') return startFalling();
  // ... existing vocab branches unchanged ...
```

(`onResult`'s auto-advance guard `mode !== 'falling'` already advances for grammar, which is what we want — one item at a time.)

- [ ] **Step 5: Add `onContentChange` + fix the other loader calls**

In `renderAll`'s handlers object, add (mirroring `onLevelsChange`; note it does NOT call `renderAll` — `ui.js`'s `afterAsync` re-renders the chrome):
```js
    onContentChange: async c => {
      if (stopFalling) { stopFalling(); stopFalling = null; }
      state.settings.content = c;
      mode = c === 'grammar' ? 'cloze' : 'match';
      state.updated = Date.now();
      await loadLevels(c, state.settings.levels);
      rebuildPool(); persist(); next();
    },
```

In the same handlers object, update `onLevelsChange` to pass content:
```js
    onLevelsChange: async lv => { if (stopFalling) { stopFalling(); stopFalling = null; } state.settings.levels = lv; state.updated = Date.now(); await loadLevels(state.settings.content, lv); rebuildPool(); persist(); next(); },
```

Update the `renderChrome` call's third argument from `dataByLevel` to `activeData()`:
```js
  renderChrome(document.getElementById('chrome'), state, activeData(), {
```

- [ ] **Step 6: Fix the boot loader call**

In `boot()`, replace `await loadLevels(state.settings.levels);` with:
```js
  await loadLevels(state.settings.content, state.settings.levels);
```

- [ ] **Step 7: Syntax-check**

Run: `node --check web/js/app.js`
Expected: no output (exit 0).

- [ ] **Step 8: Commit**

```bash
git add web/js/app.js
git commit -m "feat: content dimension in app.js (vocab|grammar data, routing)"
```

---

### Task 6: `ui.js` — 單字／文法 switch + content-dependent mode tabs

**Files:**
- Modify: `web/js/ui.js`

**Interfaces:**
- Consumes: `handlers.onContentChange` (Task 5); `state.settings.content`.
- The `dataByLevel` param it already receives is now the **active content's** level map (app passes `activeData()`), so `computeStats`/`categoriesFor` need no change.

- [ ] **Step 1: Replace the fixed MODES with per-content maps + content list**

Replace:
```js
const MODES = [
  { id: 'match', label: '配對' },
  { id: 'typing', label: '打字' },
  { id: 'quiz', label: '四選一' },
  { id: 'falling', label: '落下' },
];

let currentMode = 'match';
```
with:
```js
const CONTENTS = [
  { id: 'vocab', label: '單字' },
  { id: 'grammar', label: '文法' },
];
const MODES_BY_CONTENT = {
  vocab: [
    { id: 'match', label: '配對' },
    { id: 'typing', label: '打字' },
    { id: 'quiz', label: '四選一' },
    { id: 'falling', label: '落下' },
  ],
  grammar: [
    { id: 'cloze', label: '四選一' },
  ],
};

let currentMode = 'match';
```

- [ ] **Step 2: Render the content switch + content-scoped mode tabs**

Inside `render()`, right after `const s = state.settings;`, add:
```js
    const modes = MODES_BY_CONTENT[s.content] || MODES_BY_CONTENT.vocab;
    if (!modes.some(m => m.id === currentMode)) currentMode = modes[0].id;
```

Replace the `<nav class="tabs">…</nav>` block that maps over `MODES` with one that maps over `modes`, and add the content switch just before the brand's closing — specifically, replace the `.chrome-top` row content so it reads:
```js
        <div class="chrome-row chrome-top">
          <div class="brand"><span class="hanko" aria-hidden="true">字</span><span class="brand-name">JLPT 單字道場</span></div>
          <div class="content-switch" role="tablist" aria-label="內容">
            ${CONTENTS.map(c => `<button type="button" class="content-tab${c.id === s.content ? ' active' : ''}" data-content="${c.id}" role="tab" aria-selected="${c.id === s.content}">${c.label}</button>`).join('')}
          </div>
          <nav class="tabs" role="tablist" aria-label="遊戲模式">
            ${modes.map(m => `<button type="button" class="tab${m.id === currentMode ? ' active' : ''}" data-mode="${m.id}" role="tab" aria-selected="${m.id === currentMode}">${m.label}</button>`).join('')}
          </nav>
          <div class="chrome-actions">
            <button type="button" class="theme-btn" aria-label="切換主題" title="${THEME_META[s.theme]?.title || THEME_META.system.title}">${THEME_META[s.theme]?.icon || THEME_META.system.icon}</button>
            <button type="button" class="gear-btn" aria-label="設定" aria-expanded="${settingsOpen}">⚙</button>
          </div>
        </div>
```

- [ ] **Step 3: Wire the content-switch clicks**

After the `.tab` click handler block, add:
```js
    root.querySelectorAll('.content-tab').forEach(btn => btn.addEventListener('click', () => {
      const c = btn.dataset.content;
      if (c === s.content) return;
      currentMode = (MODES_BY_CONTENT[c] || MODES_BY_CONTENT.vocab)[0].id;
      afterAsync(handlers.onContentChange(c));
    }));
```

- [ ] **Step 4: Syntax-check**

Run: `node --check web/js/ui.js`
Expected: no output (exit 0).

- [ ] **Step 5: Commit**

```bash
git add web/js/ui.js
git commit -m "feat: 單字/文法 content switch + content-scoped mode tabs"
```

---

### Task 7: Cloze CSS (blank slot + ruby + hint)

**Files:**
- Modify: `web/style.css`

- [ ] **Step 1: Append the cloze + content-switch styles**

Add at the end of the "typing & quiz cards" section of `web/style.css`:

```css
/* ---------------------------------------------------------- grammar cloze */

.content-switch {
  display: flex;
  gap: 3px;
  background: var(--surface-2);
  padding: 4px;
  border-radius: 999px;
  border: 1px solid var(--border);
}
.content-tab {
  padding: 7px 14px;
  border-radius: 999px;
  font-size: 14px;
  font-weight: 600;
  color: var(--ink-dim);
  transition: color .18s ease, background .22s ease;
  white-space: nowrap;
}
.content-tab.active { color: var(--ink); background: var(--surface-strong); }

.cloze-wrap { max-width: 560px; }
.cloze-hint {
  font-size: 13px;
  color: var(--ink-dim);
  margin-bottom: 16px;
}
.cloze-sentence {
  font-family: var(--font-display);
  font-size: clamp(17px, 4.4vw, 22px);
  line-height: 2.1;
  margin-bottom: 24px;
  text-align: center;
}
.cloze-sentence rt { font-size: 0.5em; color: var(--ink-dim); font-weight: 500; }
.cloze-blank {
  display: inline-block;
  min-width: 72px;
  margin: 0 5px;
  border-bottom: 2px dashed var(--shu);
  color: var(--shu);
  font-weight: 700;
  vertical-align: bottom;
}
.cloze-blank.filled { border-bottom-style: solid; }
```

- [ ] **Step 2: Commit**

```bash
git add web/style.css
git commit -m "style: grammar cloze card + 單字/文法 switch styling"
```

---

### Task 8: Playwright end-to-end verification

**Files:**
- (No source changes unless a defect is found.)

- [ ] **Step 1: Serve and drive the grammar flow**

Run (adjust venv path to the machine's Playwright venv, e.g. `/tmp/pw-venv`):
```bash
cd /home/eslin/claude_projects/JLPT
python3 -m http.server -d web 8140 >/tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid; sleep 1
/tmp/pw-venv/bin/python - <<'EOF'
from playwright.sync_api import sync_playwright
import json
st = json.dumps({"cards":{}, "settings":{"newPerDay":50,"levels":["n3"],"categories":[],"sound":False,"pairMode":"meaning","theme":"system","content":"vocab"}, "updated":0})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":900,"height":760})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8140", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", st)
    pg.reload(wait_until="load"); pg.wait_for_timeout(800)
    pg.click('.content-tab[data-content="grammar"]'); pg.wait_for_timeout(800)
    tabs = pg.eval_on_selector_all('.tab', 'els=>els.map(e=>e.textContent)')
    sentence = pg.text_content('.cloze-sentence')
    opts = pg.eval_on_selector_all('.opt', 'els=>els.map(e=>e.textContent)')
    print("grammar mode tabs:", tabs)
    print("cloze sentence:", sentence)
    print("options:", opts)
    pg.click('.opt'); pg.wait_for_timeout(900)   # answer first option
    pg.screenshot(path="/tmp/shots/grammar-cloze.png")
    pg.close(); b.close()
print("pageerrors:", errs)
EOF
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: grammar tabs `['四選一']`; a cloze sentence containing a blank; 4 kana/grammar options; **`pageerrors: []`**. Inspect `/tmp/shots/grammar-cloze.png` — the blank fills with the answer after clicking, correct/wrong stamp shows.

- [ ] **Step 2: Confirm the full JS suite still passes**

Run: `node --test tests/*.test.mjs`
Expected: all pass (existing + the 6 new grammar-cloze tests + the store test).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A
git commit -m "test: Playwright-verify grammar cloze end-to-end"
```

(If no fixes were needed, skip the commit.)

---

## Notes for the executor
- Task 4 (bank generation) is the one non-code task and needs user opt-in for the agent fan-out; confirm before running it. Every other task is deterministic and TDD'd.
- Follow the existing mode conventions: pure helpers get `node --test`; `mount*` is verified only via Playwright.
- Keep UI copy Traditional-Chinese; keep grade strings exactly `again|hard|good|easy`.
