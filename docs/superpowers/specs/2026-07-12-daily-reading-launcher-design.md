# 每日閱讀（Daily Reading Launcher）— Design

**Date:** 2026-07-12
**Status:** Approved (design), pending spec review → writing-plans

## Context & Scope

Sub-project C, revised. Instead of an authored 読解 (reading-comprehension) bank,
the user chose **approach ①**: a curated launcher linking to existing,
daily-updated, learner-oriented Japanese reading sources (NHK NEWS WEB EASY and
friends). **Pure reading** — no comprehension questions, no SRS, no data
generation, no backend, zero cost. External sites open in a new tab.

The app already has a top content switch (單字／文法), a deck-based data model for
the game modes, and a token-driven modern theme. Reading is a **third pillar**
that is *not* a game: it has no deck, no levels, no queue.

## Goal

Add a 閱讀 entry to the top content switch. Selecting it shows a clean panel of
source cards (name, level tag, one-line 中文 description, 前往 button) plus a short
usage hint. Nothing else — the learner taps a card and reads on the source site.

## Placement & Chrome Behaviour

- The content switch becomes **單字／文法／閱讀** (`CONTENTS` gains `{id:'reading', label:'閱讀'}`).
- `MODES_BY_CONTENT.reading = []` (reading has no game modes).
- When `content === 'reading'`, the chrome **hides** the mode-tabs nav, the
  filter row (level + category chips), and the stats row (待複習／新字) — none apply
  to reading. The brand, content switch, theme toggle, and gear remain.
- The `#stage` renders the reading panel instead of a game.

## Sources (curated constant)

A constant array `SOURCES` in the new module, each `{ name, url, level, desc }`
(desc in Traditional Chinese). Covering N5→N1:

| name | url | level | desc |
|------|-----|-------|------|
| NHK NEWS WEB EASY | https://www3.nhk.or.jp/news/easy/ | N4–N3 | 每日新聞、全文振假名、朗讀語音、難詞查辭典（主打） |
| Watanoc | https://watanoc.com/ | N5–N3 | 免費分級日語雜誌，生活・文化 |
| MATCHA（やさしい日本語） | https://matcha-jp.com/easy | N4–N3 | 觀光・文化，簡易日語版 |
| 福娘童話集 | https://hukumusume.com/douwa/ | N5–N4 | 日本童話・昔話短文，附假名 |
| NHK NEWS WEB | https://www3.nhk.or.jp/news/ | N2–N1 | 真實時事新聞（無振假名） |
| 青空文庫 | https://www.aozora.gr.jp/ | N2–N1 | 免費經典文學（進階挑戰） |

Links open with `target="_blank" rel="noopener noreferrer"`. The panel shows a
top usage hint (每天讀一篇、先不查字通讀、再回頭查生詞) and a small footer note that
these link to external sites.

## Architecture

### New module `web/js/modes/reading.js`
- Exports `SOURCES` (the constant array) and `mountReading(root)` — renders the
  panel: usage hint + a grid of source cards (each an anchor `<a>` opening the
  url in a new tab) + the external-site footnote. Pure presentation; no
  callbacks, no SRS, no audio.

### `web/js/ui.js`
- `CONTENTS` gains the 閱讀 entry; `MODES_BY_CONTENT.reading = []`.
- In `render()`: when `s.content === 'reading'`, omit the `<nav class="tabs">`,
  the `.chrome-filters` row, and the `.chrome-stats` row from the emitted markup.
  (The `currentMode` reset guard already tolerates an empty modes list — guard it
  so an empty list doesn't index `modes[0]`.)

### `web/js/app.js`
- `next()`: if `state.settings.content === 'reading'`, `mountReading(stage)` and
  return — before any deck/queue logic.
- `onContentChange`: if `c === 'reading'`, set content, **skip** `loadLevels`/
  `rebuildPool` (no deck), `persist()`, and render (next → reading panel). For
  non-reading targets, behaviour is unchanged.
- `deckFor`/`activeDeck` are never exercised for reading because `next()` and
  `onContentChange` short-circuit first; no deck entry is added for reading.
- Boot: if a persisted `content === 'reading'`, `next()` renders the panel
  without loading any deck.

### CSS (`web/style.css`)
Source-card styles (`.read-*`): the panel wrapper, usage hint, the card grid,
each card (name + level chip + desc + 前往 affordance), hover, and the footnote —
all using existing theme tokens.

## Testing
- **Unit** (`node --test tests/*.test.mjs`): `reading.test.mjs` asserts `SOURCES`
  is non-empty and every entry has a `name`, an `https://` `url`, a `level`, and
  a non-empty `desc`. (`mountReading` is DOM — verified via Playwright.)
- **Playwright**: switch to 閱讀 → the panel shows the source cards; the mode
  tabs / level chips / stats are hidden; each card is an anchor with
  `target="_blank"` and `rel` containing `noopener`; switching back to 單字 restores
  the game chrome; 0 console errors.

## Out of Scope
- Comprehension questions, in-app article rendering, fetching/proxying external
  feeds, AI-generated articles, SRS, and any backend (all explicitly declined —
  approach ① is links only).

## Global Constraints
- Vanilla ES modules, **no build step**; `node --test tests/*.test.mjs`.
- Traditional-Chinese (Taiwan) UI copy; content label 閱讀.
- External links use `target="_blank" rel="noopener noreferrer"`.
- Reuse existing chrome/theme tokens; do not touch the vocab/grammar decks, SRS,
  or the shipped game modes.
