# 排列重組（Grammar Order / 並べ替え）Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a JLPT 並べ替え sentence-ordering mode (排列重組) as a second grammar mode: tap 4 fragments into order, auto-check the full ordering, then show the assembled sentence + explanation.

**Architecture:** A new self-contained mode file `web/js/modes/grammar-order.js` (pure helpers `gradeOrder`/`checkOrder` + `mountGrammarOrder`). `furiganaToRuby` is extracted to a shared `web/js/furigana.js` used by both grammar modes. The app gains a **deck** concept so grammar's two modes read separate data files (`grammar_<lv>.json` for cloze, `grammar_order_<lv>.json` for order). A deterministic `build_grammar_order.py` validates + emits an agent-generated, adversarially-verified unique-order bank.

**Tech Stack:** Vanilla ES modules (no app build step), `node --test` for JS, Python 3 + `python3 -m unittest` for the build validator, Playwright for end-to-end checks.

## Global Constraints

- Vanilla ES modules, **no app build step**. JS tests: `node --test tests/*.test.mjs` (glob, never bare `tests/`).
- SM-2 grade strings **exactly** `'again'|'hard'|'good'|'easy'`.
- `gradeOrder` thresholds: wrong→`again`, correct & `<6000`ms→`easy`, `>15000`ms→`hard`, else `good`.
- All UI copy in **Traditional Chinese (Taiwan)**; mode label **排列重組**.
- Item id = **first 12 hex of SHA-1 of `"order|<before+frags.join('')+after>|<lv>"`**, `lv` lowercase; stored `level` uppercase (`N3`).
- `frags` is **exactly 4**; `before + frags.join('') + after` reconstructs the source example sentence; furigana preserved as `漢字（かな）` (full-width parens).
- Reuse existing chrome, `session.js` (SRS), `sync.js`, theme, `ui.js` fx (`particles`/`stamp`), and the cloze explanation-panel CSS (`.cloze-explain` etc.).

---

### Task 1: Extract `furiganaToRuby` into a shared module

`furiganaToRuby` currently lives in `web/js/modes/grammar-cloze.js`. Both grammar
modes need it, so move it to `web/js/furigana.js` and repoint.

**Files:**
- Create: `web/js/furigana.js`
- Create: `tests/furigana.test.mjs`
- Modify: `web/js/modes/grammar-cloze.js` (import instead of defining; drop its export of the function)
- Modify: `tests/grammar-cloze.test.mjs` (remove the furigana tests, which move to the new file)

**Interfaces:**
- Produces: `furiganaToRuby(s: string) -> string` from `web/js/furigana.js`.

- [ ] **Step 1: Create the shared module**

Create `web/js/furigana.js`:

```js
// 漢字（かな） → <ruby>漢字<rt>かな</rt></ruby>. A run of kanji immediately
// followed by full-width parens becomes ruby; everything else is untouched.
export function furiganaToRuby(s) {
  return String(s).replace(
    /([一-鿿々〆ヶ]+)（([^（）]*)）/g,
    '<ruby>$1<rt>$2</rt></ruby>'
  );
}
```

- [ ] **Step 2: Move the furigana tests**

Create `tests/furigana.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { furiganaToRuby } from '../web/js/furigana.js';

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

- [ ] **Step 3: Repoint `grammar-cloze.js`**

In `web/js/modes/grammar-cloze.js`: add at the top (after the existing `import { particles, stamp } from '../ui.js';`):

```js
import { furiganaToRuby } from '../furigana.js';
```

Then **delete** the local `export function furiganaToRuby(...) { ... }` block (the comment + function). Leave `gradeCloze` and `mountGrammarCloze` unchanged (they call `furiganaToRuby`, now imported).

- [ ] **Step 4: Remove the moved tests from the cloze test file**

In `tests/grammar-cloze.test.mjs`: remove the `import { gradeCloze, furiganaToRuby }` — change it to `import { gradeCloze } from '../web/js/modes/grammar-cloze.js';` — and delete the five `furiganaToRuby...` test blocks (they now live in `tests/furigana.test.mjs`). Keep the `gradeCloze mapping` test.

- [ ] **Step 5: Run the tests**

Run: `node --test tests/*.test.mjs`
Expected: all pass — `furigana.test.mjs` (5) + `grammar-cloze.test.mjs` (1 gradeCloze) + the rest of the suite. No net change in furigana coverage.

- [ ] **Step 6: Commit**

```bash
git add web/js/furigana.js tests/furigana.test.mjs web/js/modes/grammar-cloze.js tests/grammar-cloze.test.mjs
git commit -m "refactor: extract furiganaToRuby to shared web/js/furigana.js"
```

---

### Task 2: `grammar-order.js` mode file + pure-helper tests

Per the codebase convention, `mount*` is verified via Playwright (Task 7); only
the pure helpers get `node --test` unit tests.

**Files:**
- Create: `web/js/modes/grammar-order.js`
- Test: `tests/grammar-order.test.mjs`

**Interfaces:**
- Consumes: `particles`, `stamp` from `../ui.js`; `furiganaToRuby` from `../furigana.js`.
- Produces:
  - `gradeOrder({ correct: boolean, elapsedMs: number }) -> 'again'|'hard'|'good'|'easy'`
  - `checkOrder(placed: string[], frags: string[]) -> boolean` (element-wise equality)
  - `mountGrammarOrder(root, item, pool, onResult, audio) -> void`
    where `item = { id, level, category, pattern, before, frags:[4], after, connection, note, ex_zh }`

- [ ] **Step 1: Write the failing tests**

Create `tests/grammar-order.test.mjs`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { gradeOrder, checkOrder } from '../web/js/modes/grammar-order.js';

test('gradeOrder mapping', () => {
  assert.equal(gradeOrder({ correct: false, elapsedMs: 3000 }), 'again');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 3000 }), 'easy');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 20000 }), 'hard');
  assert.equal(gradeOrder({ correct: true, elapsedMs: 9000 }), 'good');
});

test('checkOrder true only for the exact sequence', () => {
  const frags = ['a', 'b', 'c', 'd'];
  assert.equal(checkOrder(['a', 'b', 'c', 'd'], frags), true);
  assert.equal(checkOrder(['a', 'c', 'b', 'd'], frags), false);
  assert.equal(checkOrder(['a', 'b', 'c'], frags), false);       // length mismatch
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `node --test tests/grammar-order.test.mjs`
Expected: FAIL — `Cannot find module '.../web/js/modes/grammar-order.js'`.

- [ ] **Step 3: Implement `grammar-order.js`**

Create `web/js/modes/grammar-order.js`:

```js
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
      if (!answered && k < placed.length) slot.onclick = () => { placed.splice(k, 1); renderSlots(); renderTray(); };
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
```

- [ ] **Step 4: Run to verify tests pass**

Run: `node --test tests/grammar-order.test.mjs`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add web/js/modes/grammar-order.js tests/grammar-order.test.mjs
git commit -m "feat: grammar-order mode + gradeOrder/checkOrder helpers"
```

---

### Task 3: Build validator/emitter `build_grammar_order.py`

**Files:**
- Create: `build_grammar_order.py`
- Test: `tests/test_build_grammar_order.py`

**Interfaces:**
- Produces: `validate(item) -> list[str]`; `build_level(items, lv, seen) -> list[dict]`.

- [ ] **Step 1: Write the failing tests**

Create `tests/test_build_grammar_order.py`:

```python
import unittest
from build_grammar_order import validate, build_level

GOOD = {
    "category": "条件・逆接・仮定", "pattern": "〜ば〜ほど",
    "connection": "…", "note": "n", "ex_zh": "越讀越懂。",
    "before": "この本（ほん）は", "after": "分（わ）かってくる。",
    "frags": ["読（よ）めば", "読（よ）むほど", "意味（いみ）が", "深（ふか）く"],
}

class TestValidate(unittest.TestCase):
    def test_good_item_has_no_errors(self):
        self.assertEqual(validate(GOOD), [])
    def test_wrong_frag_count_rejected(self):
        self.assertTrue(validate({**GOOD, "frags": ["a", "b", "c"]}))
    def test_empty_fragment_rejected(self):
        self.assertTrue(validate({**GOOD, "frags": ["a", "", "c", "d"]}))
    def test_duplicate_fragment_rejected(self):
        self.assertTrue(any("distinct" in e for e in validate({**GOOD, "frags": ["a", "a", "c", "d"]})))
    def test_unbalanced_furigana_rejected(self):
        self.assertTrue(any("furigana" in e for e in validate({**GOOD, "before": "この本（ほん"})))

class TestBuildLevel(unittest.TestCase):
    def test_emits_id_and_uppercase_level(self):
        out = build_level([dict(GOOD)], "n3", set())
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["level"], "N3")
        self.assertEqual(len(out[0]["id"]), 12)
    def test_dedups_same_sentence(self):
        seen = set()
        self.assertEqual(len(build_level([dict(GOOD)], "n3", seen)), 1)
        self.assertEqual(len(build_level([dict(GOOD)], "n3", seen)), 0)

if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest tests/test_build_grammar_order.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'build_grammar_order'`.

- [ ] **Step 3: Implement `build_grammar_order.py`**

Create `build_grammar_order.py`:

```python
#!/usr/bin/env python3
"""Validate agent-produced sentence-ordering items and emit web/data/grammar_order_<lv>.json.

Input : data/grammar_order_items/<lv>.json  (flat list of raw item dicts)
Output: web/data/grammar_order_<lv>.json     (validated, id-stamped, deduped)
"""
import glob, json, hashlib, os

LEVELS = ["n5", "n4", "n3", "n2", "n1"]
REQUIRED = ["category", "pattern", "before", "frags", "after",
            "connection", "note", "ex_zh"]


def _balanced(s):
    return s.count("（") == s.count("）")


def validate(item):
    errs = []
    for k in REQUIRED:
        if k not in item:
            errs.append(f"missing key: {k}")
    if errs:
        return errs
    f = item["frags"]
    if not isinstance(f, list) or len(f) != 4 or any(not isinstance(x, str) or not x.strip() for x in f):
        errs.append("frags must be 4 non-empty strings")
    elif len(set(f)) != 4:
        errs.append("frags must be distinct")
    for field in ("before", "after"):
        if not isinstance(item.get(field), str):
            errs.append(f"{field} must be a string")
        elif not _balanced(item[field]):
            errs.append(f"unbalanced furigana parens in {field}")
    if isinstance(f, list) and all(isinstance(x, str) for x in f):
        if not _balanced("".join(f)):
            errs.append("unbalanced furigana parens in frags")
    return errs


def _full(item):
    return item["before"] + "".join(item["frags"]) + item["after"]


def build_level(items, lv, seen):
    out = []
    for raw in items:
        errs = validate(raw)
        if errs:
            print(f"  SKIP [{lv}] {raw.get('pattern','?')}: {'; '.join(errs)}")
            continue
        key = "order|" + _full(raw) + "|" + lv
        if key in seen:
            continue
        seen.add(key)
        out.append({
            "id": hashlib.sha1(key.encode()).hexdigest()[:12],
            "level": lv.upper(),
            "category": raw["category"],
            "pattern": raw["pattern"],
            "before": raw["before"],
            "frags": raw["frags"],
            "after": raw["after"],
            "connection": raw.get("connection", ""),
            "note": raw["note"],
            "ex_zh": raw["ex_zh"],
        })
    return out


def main():
    os.makedirs("web/data", exist_ok=True)
    seen = set()
    for lv in LEVELS:
        path = f"data/grammar_order_items/{lv}.json"
        items = json.load(open(path, encoding="utf-8")) if os.path.exists(path) else []
        out = build_level(items, lv, seen)
        json.dump(out, open(f"web/data/grammar_order_{lv}.json", "w", encoding="utf-8"),
                  ensure_ascii=False, separators=(",", ":"))
        print(f"{lv}: emitted {len(out)} / {len(items)} raw")


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest tests/test_build_grammar_order.py -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add build_grammar_order.py tests/test_build_grammar_order.py
git commit -m "feat: grammar-order bank validator/emitter (build_grammar_order.py)"
```

---

### Task 4: Fixture bank (small N3 batch) via generate→verify

Produce a small N3 order bank so the app + Playwright work end-to-end. This
spawns agents — **confirm with the user before running** (fixture-first was the
agreed approach). The full 5-level bank is Task 8.

**Files:**
- Create: `data/grammar_order_items/n3.json` (agent output; ~12 items)
- Create (by running the builder): `web/data/grammar_order_<lv>.json` (n3 populated, others empty)

- [ ] **Step 1: Extract ~15 N3 source patterns**

Run (walker handles the nested grammar files):
```bash
python3 - <<'EOF'
import json, glob
def walk(o,cat=None):
    if isinstance(o,dict):
        if 'entries' in o:
            for e in o['entries']: yield o.get('category',cat), e
        else:
            for v in o.values(): yield from walk(v,cat)
    elif isinstance(o,list):
        for it in o: yield from walk(it,cat)
recs=[]; seen=set()
for f in sorted(glob.glob('data/grammar_n3_part*.json')):
    for c,e in walk(json.load(open(f))):
        p=e.get('pattern')
        if not p or not e.get('ex') or p in seen: continue
        seen.add(p)
        recs.append({'category':c,'pattern':p,'connection':e.get('connection',''),
                     'ex':e['ex'],'meaning_zh':e.get('meaning_zh',''),'note':e.get('note',''),'ex_zh':e.get('ex_zh','')})
import os; os.makedirs('data/grammar_order_items',exist_ok=True)
json.dump(recs[:15], open('data/grammar_order_items/_src_n3.json','w'), ensure_ascii=False, indent=1)
print('wrote', min(15,len(recs)), 'N3 source patterns')
EOF
```

- [ ] **Step 2: Generate order items (agent)**

Dispatch a generation agent (sonnet). It reads `data/grammar_order_items/_src_n3.json` and, for each pattern whose `ex` can be split into a **4-fragment sentence with a unique correct order**, outputs an item `{category, pattern, connection, note, ex_zh, before, frags:[4], after}` where `before + frags.join('') + after == ex` (furigana preserved), and writes the JSON array to `data/grammar_order_items/n3.raw.json`. Patterns whose example can't form a unique 4-split are skipped.

Generation prompt intent (verbatim):
> 你是 JLPT 出題老師。把每個句型的例句 `ex` 切成「句頭 before＋4 個片段 frags＋句尾 after」，frags 依正確順序排列，且 `before+frags.join+after` 必須完全等於 `ex`（振假名 `漢字（かな）` 原樣保留）。**只有這一種排列文法成立**——若做不到唯一解或切不出剛好 4 段，跳過該題。片段不可是單一助詞這種可自由移動的瑣碎片段。輸出 JSON 陣列到 `data/grammar_order_items/n3.raw.json`。

- [ ] **Step 3: Adversarial verify (agent)**

Dispatch a verifier (opus or sonnet). It reads `n3.raw.json` and certifies each item: `before+frags.join+after == ex` for the source; **no other permutation of the 4 fragments is grammatical** (unique solution); fragments non-trivial; furigana balanced. It writes only certified items to `data/grammar_order_items/n3.json` and reports kept/dropped counts.

- [ ] **Step 4: Build + sanity check**

Run:
```bash
rm -f data/grammar_order_items/_src_n3.json data/grammar_order_items/n3.raw.json
python3 build_grammar_order.py
python3 -c "import json; d=json.load(open('web/data/grammar_order_n3.json')); i=d[0]; print(len(d),'items | e.g.', i['before']+'['+'|'.join(i['frags'])+']'+i['after'])"
```
Expected: `grammar_order_n3.json` has several items; the example prints a plausible before/4-frags/after. Other levels emit empty arrays.

- [ ] **Step 5: Commit**

```bash
git add data/grammar_order_items/n3.json web/data/grammar_order_n5.json web/data/grammar_order_n4.json web/data/grammar_order_n3.json web/data/grammar_order_n2.json web/data/grammar_order_n1.json
git commit -m "data: N3 grammar-order fixture (agent-generated + unique-order verified)"
```

---

### Task 5: `app.js` deck refactor + order routing

**Files:**
- Modify: `web/js/app.js`

**Interfaces:**
- Consumes: `mountGrammarOrder` (Task 2), `web/data/grammar_order_<lv>.json` (Task 4).

- [ ] **Step 1: Import the order mode**

After `import { mountGrammarCloze } from './modes/grammar-cloze.js';` add:
```js
import { mountGrammarOrder } from './modes/grammar-order.js';
```

- [ ] **Step 2: Replace the data map + add the deck helper**

Replace:
```js
let data = { vocab: {}, grammar: {} };   // data[content][lv] = [cards]
const activeData = () => data[state.settings.content];
```
with:
```js
let data = { vocab: {}, grammar: {}, grammar_order: {} };   // data[deck][lv] = [cards]
// A deck is the data source for the current (content, mode). Grammar's two modes
// read different files, so the source is keyed by deck, not just content.
function deckFor(content, m) {
  if (content !== 'grammar') return 'vocab';
  return m === 'order' ? 'grammar_order' : 'grammar';
}
const activeDeck = () => deckFor(state.settings.content, mode);
const activeData = () => data[activeDeck()];
const DECK_PREFIX = { vocab: '', grammar: 'grammar_', grammar_order: 'grammar_order_' };
```

- [ ] **Step 3: Rewrite `loadLevels` to load by deck**

Replace:
```js
async function loadLevels(content, levels) {
  const bucket = data[content];
  const prefix = content === 'grammar' ? 'grammar_' : '';
  for (const lv of levels) if (!bucket[lv])
    bucket[lv] = await (await fetch(`data/${prefix}${lv}.json`)).json();
}
```
with:
```js
async function loadLevels(deck, levels) {
  const bucket = data[deck];
  const prefix = DECK_PREFIX[deck];
  for (const lv of levels) if (!bucket[lv])
    bucket[lv] = await (await fetch(`data/${prefix}${lv}.json`)).json();
}
```

- [ ] **Step 4: Route the order mode in `next()`**

Replace the grammar branch in `next()`:
```js
  if (state.settings.content === 'grammar') {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const item = byId(id);
    if (!item) return renderDone(stage);
    return mountGrammarCloze(stage, item, pool, onResult, audio);
  }
```
with:
```js
  if (state.settings.content === 'grammar') {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const item = byId(id);
    if (!item) return renderDone(stage);
    return mode === 'order'
      ? mountGrammarOrder(stage, item, pool, onResult, audio)
      : mountGrammarCloze(stage, item, pool, onResult, audio);
  }
```

- [ ] **Step 5: Make `onModeChange` async (load the new deck) + fix the other loader calls**

In `renderAll`'s handlers, replace `onModeChange`:
```js
    onModeChange: m => { if (stopFalling) { stopFalling(); stopFalling = null; } mode = m; next(); },
```
with:
```js
    onModeChange: async m => { if (stopFalling) { stopFalling(); stopFalling = null; } mode = m; await loadLevels(activeDeck(), state.settings.levels); rebuildPool(); next(); },
```

Replace `onContentChange`'s `await loadLevels(c, state.settings.levels);` line with:
```js
      await loadLevels(activeDeck(), state.settings.levels);
```
(By then `state.settings.content = c` and `mode` are already set, so `activeDeck()` is correct.)

Replace `onLevelsChange`'s `await loadLevels(state.settings.content, lv);` with:
```js
 await loadLevels(activeDeck(), lv);
```

- [ ] **Step 6: Fix the boot loader (set mode for grammar, load the active deck)**

In `boot()`, replace `await loadLevels(state.settings.content, state.settings.levels);` with:
```js
  if (state.settings.content === 'grammar') mode = 'cloze';
  await loadLevels(activeDeck(), state.settings.levels);
```

- [ ] **Step 7: Syntax-check**

Run: `node --check web/js/app.js`
Expected: clean (exit 0). Then `node --test tests/*.test.mjs` — still all pass (no JS test touches app.js).

- [ ] **Step 8: Commit**

```bash
git add web/js/app.js
git commit -m "feat: deck concept in app.js (grammar cloze vs order data sources)"
```

---

### Task 6: `ui.js` — add the 排列重組 mode tab

**Files:**
- Modify: `web/js/ui.js`

- [ ] **Step 1: Add the mode to the grammar list**

In `MODES_BY_CONTENT`, replace the `grammar` array:
```js
  grammar: [
    { id: 'cloze', label: '四選一' },
  ],
```
with:
```js
  grammar: [
    { id: 'cloze', label: '四選一' },
    { id: 'order', label: '排列重組' },
  ],
```

- [ ] **Step 2: Syntax-check**

Run: `node --check web/js/ui.js`
Expected: clean. `node --test tests/*.test.mjs` still all pass.

- [ ] **Step 3: Commit**

```bash
git add web/js/ui.js
git commit -m "feat: add 排列重組 grammar mode tab"
```

---

### Task 7: Order-mode CSS

**Files:**
- Modify: `web/style.css`

- [ ] **Step 1: Append the order styles**

Add just before the `/* ------- fx: stamp / particle / confetti */` section (right after the `.cloze-next` rules from the cloze block):

```css
/* ---------------------------------------------------------- grammar order */

.ord-wrap { max-width: 600px; }
.ord-sentence {
  font-family: var(--font-display);
  font-size: clamp(16px, 4vw, 21px);
  line-height: 2.2;
  text-align: center;
  margin-bottom: 22px;
}
.ord-stem { white-space: normal; }
.ord-slots { display: inline; }
.ord-slot {
  display: inline-block;
  min-width: 64px;
  min-height: 34px;
  margin: 0 3px;
  padding: 2px 8px;
  border-bottom: 2px dashed var(--border-strong);
  color: var(--ink);
  vertical-align: bottom;
  transition: border-color .15s ease, background .15s ease;
}
.ord-slot.filled { border-bottom-color: var(--shu); cursor: pointer; }
.ord-slot.right { border-bottom-color: var(--shu); color: var(--shu); }
.ord-slot.reveal { border-bottom-style: solid; border-bottom-color: var(--sumi); color: var(--sumi); }
.ord-tray {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  justify-content: center;
}
.ord-frag {
  font-family: var(--font-display);
  font-size: clamp(15px, 3.6vw, 18px);
  font-weight: 700;
  padding: 12px 18px;
  border-radius: var(--radius-md);
  background: var(--surface-strong);
  border: 1px solid var(--border);
  box-shadow: var(--shadow-sm);
  color: var(--ink);
  transition: transform .12s ease, border-color .15s ease, opacity .15s ease;
}
.ord-frag:hover:not(:disabled) { transform: translateY(-2px); border-color: var(--border-strong); }
.ord-frag.used { opacity: 0.35; }
.ord-frag:disabled { cursor: default; }
.ord-full {
  font-family: var(--font-display);
  font-size: 17px;
  line-height: 1.9;
  margin-bottom: 10px;
  color: var(--ink);
}
```

- [ ] **Step 2: Verify braces balance**

Run: `node -e "const c=require('fs').readFileSync('web/style.css','utf8'); const o=(c.match(/{/g)||[]).length, x=(c.match(/}/g)||[]).length; if(o!==x) throw new Error('brace mismatch '+o+' vs '+x); console.log('braces balanced', o);"`
Expected: prints `braces balanced <n>`.

- [ ] **Step 3: Commit**

```bash
git add web/style.css
git commit -m "style: grammar order — slots, fragment tray, reveal"
```

---

### Task 8: Playwright end-to-end verification

**Files:** (no source changes unless a defect is found)

- [ ] **Step 1: Drive the order flow**

Run (adjust venv path, e.g. `/tmp/pw-venv`):
```bash
cd /home/eslin/claude_projects/JLPT
python3 -m http.server -d web 8150 >/tmp/srv.log 2>&1 & echo $! > /tmp/srv.pid; sleep 1
/tmp/pw-venv/bin/python - <<'EOF'
from playwright.sync_api import sync_playwright
import json
st = json.dumps({"cards":{}, "settings":{"newPerDay":50,"levels":["n3"],"categories":[],"sound":False,"pairMode":"meaning","theme":"system","content":"grammar"}, "updated":0})
errs=[]
with sync_playwright() as p:
    b=p.chromium.launch(); pg=b.new_page(viewport={"width":900,"height":820})
    pg.on("pageerror", lambda e: errs.append(str(e)))
    pg.goto("http://localhost:8150", wait_until="load")
    pg.evaluate("s=>localStorage.setItem('vocabmatch.state',s)", st)
    pg.reload(wait_until="load"); pg.wait_for_timeout(700)
    pg.click('.tab[data-mode="order"]'); pg.wait_for_timeout(700)
    slots = pg.eval_on_selector_all('.ord-slot','e=>e.length')
    frags = pg.eval_on_selector_all('.ord-frag','e=>e.length')
    print("slots:", slots, "frags:", frags)
    # place all four fragments in tray order (may or may not be correct)
    for _ in range(4):
        pg.click('.ord-frag:not(:disabled)'); pg.wait_for_timeout(150)
    pg.wait_for_timeout(400)
    panel = pg.eval_on_selector_all('.cloze-explain','e=>e.length')
    hasnext = pg.eval_on_selector_all('.cloze-next','e=>e.length')
    print("after 4 placed -> panel:", panel, "next:", hasnext)
    pg.click('.cloze-next'); pg.wait_for_timeout(500)
    # mode switch cloze <-> order loads the right deck
    pg.click('.tab[data-mode="cloze"]'); pg.wait_for_timeout(500)
    print("cloze sentence present:", pg.eval_on_selector_all('.cloze-sentence','e=>e.length'))
    pg.close(); b.close()
print("ERRORS:", errs)
EOF
kill $(cat /tmp/srv.pid) 2>/dev/null
```
Expected: `slots: 4`, `frags: 4`; after placing four, the explanation panel + 下一題 appear; 下一題 advances; switching to 四選一 shows a cloze sentence (right deck loaded); **`ERRORS: []`**.

- [ ] **Step 2: Full suite**

Run: `node --test tests/*.test.mjs`
Expected: all pass (furigana + grammar-order helpers + existing).

- [ ] **Step 3: Commit any fixes**

```bash
git add -A && git commit -m "test: Playwright-verify grammar order end-to-end"
```
(Skip if no fixes were needed.)

---

### Task 9: Full order bank — all levels (user-gated)

Same generate→verify workflow as the cloze full bank, scoped to sentence-ordering
with the unique-order gate. **Requires user opt-in** (large agent fan-out); confirm
before running.

- [ ] **Step 1: Chunk every level's patterns**

For each level, extract patterns (as in Task 4 Step 1) into `~15`-pattern chunk
files `data/grammar_order_items/_src_<lv>_<i>.json`, and build a manifest of
`{lv, idx, src, gen, ver, count}` chunk descriptors (mirror the cloze full-bank
prep).

- [ ] **Step 2: Run the generate→verify workflow**

Pipeline each chunk through generate (writes `_gen_<lv>_<i>.json`) → adversarial
verify (writes `_ver_<lv>_<i>.json`), using the Task 4 prompts. The verify stage
enforces the **unique-order** property. Pass the manifest as `args` and guard
`const chunks = typeof args === 'string' ? JSON.parse(args) : args;`.

- [ ] **Step 3: Assemble, reconstruct-check, build**

Merge `_ver_<lv>_*.json` per level (plus the Task 4 N3 fixture for n3), drop items
whose `before+frags.join('')+after` != source `ex`, write
`data/grammar_order_items/<lv>.json`, then `python3 build_grammar_order.py`.
Remove the `_src`/`_gen`/`_ver`/`_manifest` scratch. Report per-level counts.

- [ ] **Step 4: Playwright-sanity a couple of new levels**, then commit the bank:
```bash
git add data/grammar_order_items/*.json web/data/grammar_order_*.json
git commit -m "data: full grammar-order bank — all levels"
```

---

## Notes for the executor
- Tasks 4 and 9 spawn agents — confirm with the user before each.
- Follow codebase convention: pure helpers get `node --test`; `mount*` is verified via Playwright.
- Keep UI copy Traditional-Chinese; grade strings exactly `again|hard|good|easy`.
- The explanation panel and its CSS (`.cloze-explain`, `.ex-*`, `.cloze-next`) are shared with the cloze mode — do not duplicate them; `grammar-order.js` reuses those classes.
