# 句子排列重組（Grammar Order / 並べ替え）Mode — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review → writing-plans

## Context & Scope

This is **sub-project B** of the grammar game series. Sub-project A (文法四選一
grammar cloze) shipped: a 單字／文法 content switch, grammar-scoped SM-2, and a
623-item cloze bank across N5–N1. B adds a **second grammar mode, 排列重組**
(JLPT 文の並べ替え / sentence ordering), alongside 四選一.

**Freshness model (chosen):** large static pool + reuse of the existing SRS — no
backend, no runtime API cost. The bank is generated once (via the same
generate→adversarial-verify workflow used for cloze); the "keeps updating" feel
comes from a pool large enough that SRS keeps introducing new sentences daily.
No separate daily-rotation mechanism is built.

C (閱讀 reading) remains a later, separate sub-project.

## Goal

Present a scrambled sentence as 4 fragments; the learner taps them into order;
the app checks the **whole ordering** and, after answering, shows the assembled
correct sentence plus an explanation, then advances. Each item is an SRS card in
the grammar-order deck.

## Interaction

- The card shows: an optional fixed **句頭** (`before`), a row of **4 empty
  slots**, an optional fixed **句尾** (`after`), and below, the **4 fragments in
  shuffled order**.
- **Tap to place:** tapping a fragment drops it into the next empty slot
  (left→right); tapping a filled slot returns that fragment to the tray for
  re-placement. No drag. No ★ marker (we grade the full order, so the JLPT
  starred-slot device is unnecessary).
- **Auto-check** when the 4th slot is filled (no 送出 button). One attempt:
  - Correct order → success feedback (audio/particles), reveal stays.
  - Wrong order → mark wrong (shake), then **reveal the correct order** in the
    slots.
- Either way, an **explanation panel** appears (完整正確句子 ＋ 句型／接續／用法／
  中譯) with a **下一題** button, identical in spirit to the cloze mode.
  `onResult(id, grade)` fires when 下一題 is clicked.

## Item Schema

Build output: `web/data/grammar_order_<lv>.json` (`lv` in `n5..n1`), array of:

```json
{
  "id": "8ac31f0b2d44",
  "level": "N3",
  "category": "条件・逆接・仮定",
  "pattern": "〜ば〜ほど",
  "before": "この本（ほん）は",
  "frags": ["読（よ）めば", "読（よ）むほど", "深（ふか）い", "意味（いみ）が"],
  "after": "分（わ）かってくる。",
  "connection": "…",
  "note": "…",
  "ex_zh": "這本書越讀越能體會其深意。"
}
```

- `frags` is **exactly 4** fragments in the **correct order**, furigana preserved
  as `漢字（かな）`.
- Invariants (build-validated where deterministic): `before + frags.join('') +
  after` reconstructs the source example sentence exactly; `frags.length === 4`;
  fragments are non-empty and, within an item, distinct strings.
- **Uniqueness** (only this ordering is grammatical) is enforced by the
  adversarial review step, not the deterministic build.
- `id` = first 12 hex of SHA-1 of `"order|<before+frags.join('')+after>|<lv>"`
  (lowercase `lv`); distinct from cloze ids (`"<pattern>|<lv>"`), so both grammar
  decks can coexist in the shared `state.cards` map.

## Data Generation (offline, one-time)

Same shape as the cloze bank. Source: the grammar example sentences
(`data/grammar_<lv>_part*.json`; fields include `pattern, connection, ex,
meaning_zh, note, ex_zh`).

1. **Generate** — an agent splits `ex` into `before` + 4 `frags` (correct order)
   + `after`, at grammatical boundaries, such that only one ordering is natural.
   Copies `category, pattern, connection, note, ex_zh`.
2. **Verify (adversarial)** — a reviewer confirms: `before+join(frags)+after ==
   ex`; **no other permutation of the 4 fragments is grammatical** (unique
   solution); fragments are non-trivial (not single particles that reorder
   freely); furigana intact. Reject/regenerate; drop the unfixable.
3. **Emit** — `build_grammar_order.py` validates the structural invariants,
   stamps `id`, dedups by the sentence key, writes `web/data/grammar_order_<lv>.json`;
   excluded items are logged (no silent truncation).

Because Japanese word order is flexible, many sentences do not yield a
unique-order 4-split; **yield is expected to be lower than the cloze bank**. That
is acceptable — correctness over coverage.

## App Architecture

### The "deck" concept (small refactor)
Grammar now has **two modes using different data files**, so the data source is
keyed by a **deck** = `deckFor(content, mode)`:

| content | mode  | deck            | data file             |
|---------|-------|-----------------|-----------------------|
| vocab   | any   | `vocab`         | `data/<lv>.json`      |
| grammar | cloze | `grammar`       | `data/grammar_<lv>.json` |
| grammar | order | `grammar_order` | `data/grammar_order_<lv>.json` |

- `app.js`: `data = { vocab:{}, grammar:{}, grammar_order:{} }`; `activeDeck()`
  returns `deckFor(state.settings.content, mode)`; `loadLevels(deck, levels)`
  fetches the deck's file pattern; `rebuildPool()` reads `data[activeDeck()]`.
- `onModeChange` becomes **async**: switching grammar mode (cloze↔order) must
  `await loadLevels(activeDeck, levels)` then `rebuildPool()` before `next()`
  (a new deck may be unloaded). `onContentChange` already loads; it uses the
  first mode of the new content to pick the deck.
- `renderChrome` receives the **active deck's** level-map (as today it receives
  the active content's map), so `computeStats`/`categoriesFor` need no change.

### Modes list (`ui.js`)
`MODES_BY_CONTENT.grammar = [{id:'cloze', label:'四選一'}, {id:'order', label:'排列重組'}]`.

### Routing (`app.js next()`)
Within `content==='grammar'`, branch on `mode`: `'cloze'` → `mountGrammarCloze`,
`'order'` → `mountGrammarOrder`. Both pull the next id from the queue with the
existing empty/missing guards.

### New mode file (`web/js/modes/grammar-order.js`)
- `mountGrammarOrder(root, item, pool, onResult, audio)` — renders slots +
  fragment tray, handles tap-to-place / undo, auto-checks on the 4th placement,
  reveals + explanation + 下一題, calls `onResult(id, grade)` once.
- Pure, unit-tested helpers:
  - `gradeOrder({ correct, elapsedMs })` → `'again'|'hard'|'good'|'easy'`
    (wrong→again; correct & `<6000`ms→easy; `>15000`ms→hard; else good — higher
    thresholds than cloze since ordering takes longer).
  - `checkOrder(placed, frags)` → boolean (element-wise array equality of the
    placed fragment sequence against the correct `frags`).
- `furiganaToRuby` is **extracted to a shared module** `web/js/furigana.js`
  and imported by both `grammar-cloze.js` and `grammar-order.js` (today it lives
  in `grammar-cloze.js`). Behaviour unchanged; its existing tests move/point to
  the new module.

### CSS (`web/style.css`)
Add order-specific styles: the slot row (empty/filled states), the fragment tray
buttons, correct/wrong slot reveal. Reuse the cloze explanation-panel styles
(`.cloze-explain` etc.) — the panel markup is shared.

## Testing

- **Unit** (`node --test tests/*.test.mjs`): `gradeOrder` mapping; `checkOrder`
  (correct sequence true; any swap false; length mismatch false); `furiganaToRuby`
  (moved tests still pass from the shared module).
- **Build**: `tests/test_build_grammar_order.py` — validator accepts a good item,
  rejects `frags.length!=4`, empty fragment, duplicate fragments, and broken
  furigana; `build_level` stamps id / uppercase level / dedups.
- **Playwright**: switch to 文法 → 排列重組; tap fragments into a correct order →
  success + explanation + 下一題 advances; a wrong order reveals the correct one;
  switching between 四選一 and 排列重組 loads the right deck; 0 console errors.

## Out of Scope
- C (閱讀 reading).
- Drag-and-drop ordering, a 送出 button, the ★ starred-slot device, and any
  daily-rotation mechanism (SRS + large pool covers freshness).
- Changes to vocab modes or the shipped cloze mode (beyond extracting the shared
  `furiganaToRuby`).

## Global Constraints
- Vanilla ES modules, **no app build step**; `node --test tests/*.test.mjs`
  (glob, not bare `tests/`).
- SM-2 grade strings exactly `'again'|'hard'|'good'|'easy'`.
- Traditional-Chinese (Taiwan) UI copy; mode label 排列重組.
- `frags` is exactly 4; `before + frags.join('') + after == source ex`; furigana
  preserved as `漢字（かな）`.
- id = first 12 hex of SHA-1(`"order|<full-sentence>|<lv>"`), lowercase `lv`,
  uppercase stored `level`.
- Reuse existing chrome, SRS (`session.js`), sync, theme, fx (`ui.js`), and the
  cloze explanation-panel styles rather than duplicating them.
