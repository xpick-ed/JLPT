# 文法四選一（Grammar Cloze）Mode — Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review → writing-plans

## Context & Scope

The JLPT web app (`web/`, vanilla ES modules, SM-2 SRS, sync, theme) currently
teaches **vocabulary** via four modes (配對／打字／四選一／落下) with a
reading/meaning `pairMode` toggle. The user wants **grammar** game modes. Three
features were requested; they are decomposed into independent sub-projects:

- **A. 文法四選一（grammar cloze）** — this spec. Reuses the 557+ existing grammar
  patterns. Ships first.
- **B. 句子排列重組（★ 並べ替え）** — future. Slots in as a *second grammar mode*
  under the same 文法 content area. Needs its own generated+reviewed item bank.
- **C. 閱讀（読解）** — future, separate larger project (authored passages + Q&A).

This spec covers **only A**. It is designed so B can be added as another grammar
mode without rework.

## Goal

A JLPT 問題1-style cloze drill: show an example sentence with the grammar
expression removed, offer four grammar expressions, pick the one that fits.
Grammar lives under a top-level 單字／文法 switch with its own SRS progress.

## Why an agent-built item bank (not deterministic blanking)

A probe over all 717 pattern+example pairs showed:

- Deterministically locating the pattern's surface form in the example and
  blanking it works **cleanly for only ~77%**. The other ~23% fail because the
  example **conjugates** the dictionary-form pattern (〜を余儀なくされる → 例句
  「余儀なくされた」, 〜極まる → 「極まって」, 〜てやまない → 「やみません」).
- **Random distractors are unsafe**: a same-category pattern drawn at runtime
  can *also* grammatically fit the blank (「上手な___」: わけだ correct, but はずだ
  also parses), producing multiple-correct items that mislead an exam candidate.

Therefore the bank is **agent-generated and adversarially reviewed** once,
offline, so runtime rendering is dumb and reliable. This mirrors the existing
vocab/grammar-book generate+review pipeline.

## Item Schema

Build output: `web/data/grammar_<lv>.json` for `lv` in `n5..n1`, each an array of:

```json
{
  "id": "3f2a1c9d4e5b",
  "level": "n3",
  "category": "判断・説明・当然",
  "pattern": "〜わけだ",
  "meaning_zh": "難怪…、也就是說…、當然…",
  "before": "三年（さんねん）も住（す）んでいたのか。日本語（にほんご）が上手（じょうず）な",
  "after": "。",
  "answer": "わけだ",
  "distractors": ["はずがない", "ことだ", "ものだ"],
  "note": "表示根據前提得出的必然結論",
  "ex_zh": "住了三年啊，難怪日語這麼好。"
}
```

- `id` = first 12 hex chars of SHA-1 of `"<pattern>|<level>"` (mirrors the vocab
  id scheme `word|kana`), so a pattern's SRS card is stable across rebuilds.
- The blank is expressed as the **split** `before` / `after` (furigana preserved
  as `漢字（かな）`). Rendering inserts the option slot between them — no in-band
  sentinel to parse. `after` may be empty (e.g. pattern at sentence end without
  trailing punctuation).
- `distractors` are exactly 3 grammar expressions (surface forms, no 〜) that are
  real JLPT patterns and do **not** fit `before`+`after`.
- Invariant: `before + answer + after` reconstructs the original example
  sentence (the build validates this).

## Data Build (offline, one-time)

Source: `data/grammar_<lv>_part*.json` (fields `pattern, reading, meaning_zh,
connection, ex, ex_zh, note`). Walk all nested `entries`.

1. **Generate** — one agent per pattern (batched): given
   `pattern / connection / ex / meaning_zh`, return `before`, `answer`, `after`
   (splitting `ex` at the grammar expression, furigana preserved) plus 3
   JLPT-style `distractors` that are wrong **in this sentence**. Carry through
   `category`, `meaning_zh`, `ex_zh`, `note`.
2. **Verify (adversarial)** — a reviewer agent confirms: exactly one option fits
   the blank; distractors are plausible-but-wrong same-level patterns;
   `before+answer+after` equals the source `ex`; furigana intact. Reject →
   regenerate (bounded retries).
3. **Emit** — validated items merged and written per level to
   `web/data/grammar_<lv>.json`.

A `build_grammar_cloze.py` (or equivalent) validation pass then asserts, for
every emitted item: non-empty `before`/`answer`; exactly 3 distractors; `answer`
∉ `distractors`; 4 unique options; balanced furigana parens;
`before+answer+after` non-trivial. Failing items are **excluded and logged**
(count reported — no silent truncation).

The orchestration tool for steps 1–2 (a Workflow vs. a batch of dispatched
agents) is chosen at execution time and requires the user's explicit opt-in; it
does not affect the app-code design below.

## App Architecture

### State (`store.js`)
- `DEFAULT_SETTINGS.content = 'vocab'` (`'vocab' | 'grammar'`).
- Grammar cards share the existing `state.cards` SM-2 map — ids never collide
  with vocab ids (different hash inputs). Due/new stats are computed over the
  **active content's** pool. `newPerDay` is shared.
- `pairMode` remains vocab-only and is ignored in grammar.

### Data loading (`app.js`)
- Replace the flat `dataByLevel` with `data = { vocab: {}, grammar: {} }`
  (`data[content][level] = [cards]`). Load lazily per (content, level).
- `rebuildPool()` selects `data[state.settings.content]` and filters by level /
  category as today; grammar ignores the reading-mode filter.

### Chrome (`ui.js`)
- Add a **content switch** (單字／文法) in the top row (segmented control,
  same visual language as the mode tabs).
- The **mode tab list depends on content**: vocab → 配對／打字／四選一／落下;
  grammar → 四選一 (later + 排列重組).
- `categoriesFor` / `computeStats` read the active content's data.
- Switching content resets the current mode to that content's first mode.

### New mode (`web/js/modes/grammar-cloze.js`)
- `mountGrammarCloze(root, item, pool, onResult, audio)` — renders the cloze
  card and one round; calls `onResult(id, grade)` once.
- Pure, unit-tested helpers:
  - `gradeCloze({ correct, elapsedMs })` → `'again'|'hard'|'good'|'easy'`
    (same thresholds as `gradeQuiz`: wrong→again, <1500→easy, >5000→hard,
    else good).
  - `furiganaToRuby(s)` → converts `漢字（かな）` runs to
    `<ruby>漢字<rt>かな</rt></ruby>`; leaves non-furigana text untouched.
- Render: optional `meaning_zh` hint, the sentence
  `furiganaToRuby(before)` + blank slot + `furiganaToRuby(after)`, and four
  option buttons = `shuffle([answer, ...distractors])`. On click: mark
  right/wrong (reveal correct), stamp/particles reused from `ui.js`, grade,
  then `onResult` after a short delay. Mirrors `mountQuiz`.
- Reuses the existing `.card-wrap` / `.options` / `.opt` styles; adds only
  minimal cloze-specific CSS (the blank slot, ruby sizing).

### Routing (`app.js`)
- When `content==='grammar'` and mode is `cloze`, `next()` pulls the next id
  from the grammar queue and mounts `mountGrammarCloze`.

## Testing

- **Unit** (`node --test tests/*.test.mjs`):
  - `gradeCloze` mapping.
  - `furiganaToRuby`: single kanji+reading, jukukugo run, mixed sentence,
    string with no furigana (unchanged), unbalanced paren (left as-is).
  - option assembly: `shuffle([answer,...distractors])` yields 4 unique, exactly
    one equals `answer`.
- **Build validation**: a test over a small fixture confirms the validator
  rejects bad items (missing distractor, answer in distractors, broken furigana)
  and accepts good ones.
- **Playwright**: switch to 文法 → 四選一; answer correct then wrong; confirm SRS
  advances (due count changes), content switch flips mode list and stats, 0
  console errors.

## Out of Scope (this sub-project)
- 句子排列重組 (B) and 閱讀 (C).
- Grammar-specific listening or production drills.
- Editing the existing vocab modes.

## Global Constraints
- Vanilla ES modules, **no build step** for the app; `node --test tests/*.test.mjs`
  (glob, not bare `tests/`).
- Grade strings exactly `'again'|'hard'|'good'|'easy'`.
- Traditional-Chinese (Taiwan) UI copy.
- Reuse existing chrome, SRS (`session.js`), sync, theme, and fx (`ui.js`)
  rather than duplicating them.
- id = first 12 hex of SHA-1(`"<pattern>|<level>"`).
