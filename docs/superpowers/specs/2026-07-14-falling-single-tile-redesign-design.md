# 落下模式重設計（單張逐一落下）＋ 配對預設 — Design

**Date:** 2026-07-14
**Status:** Approved (design), pending spec review → writing-plans

## Scope

Three changes to the existing app:
1. **Default `pairMode` → `reading`**: `DEFAULT_SETTINGS.pairMode` becomes `'reading'`
   (settings 配對內容 defaults to 假名讀音). One-line.
2. **Falling mode spawns single tiles** (not pre-paired) so a word and its answer
   arrive decoupled and other pairs' tiles act as on-screen decoys — you can
   mis-select.
3. **Falling feel**: slower fall, taller field (longer distance), more concurrent
   tiles — so there is time to judge (and mis-judge).

Only `web/js/store.js`, `web/js/modes/falling.js`, `web/style.css`, and the
falling unit test change. Matching, scoring, SRS grading, lives, combo, and
`app.js`'s `makeFallingSupply`/`startFalling` are unchanged.

## Current behaviour (for contrast)
`spawnPair()` pulls one card and drops **both** its tiles (word + its
meaning/reading) at the same instant in adjacent lanes as one `pair`. Matches are
visually obvious. A tile only costs a life when it **lands**; a wrong click just
shakes and resets combo.

## Change 2 — single-tile spawning from a small shuffled buffer

`falling.js` (`mountFalling`) keeps the same match rule (click two live tiles
with the **same `pairId` and different `type`** → clear) but changes spawning and
landing:

- **Live tiles**: `tiles = []` of `{ el, pairId, type, spawnedAt }` (was `pairs`
  of two-tile objects).
- **Buffer**: `buffer = []` of pending tile-specs `{ pairId, type, html, cardSpawnedAt }`.
  `refill()` — when `buffer.length < 2`, `supply()` a card; if it returns one,
  build its **two** specs (word + meaning, per `pairMode`, same rendering as
  today) and push both, then shuffle the buffer.
- **`spawnOne()`** (called once per spawn tick): `refill()`; if the buffer is
  empty, do nothing; else `shift()` one spec and create one DOM tile at a random
  lane, starting above the top. Push a `{el,pairId,type,spawnedAt:now}` record to
  `tiles`.
- **Winnability**: because the buffer is small and holds both halves of any not-
  yet-fully-spawned pair, a tile's matching partner always spawns within a few
  ticks — well before the (slow) tile lands down the (tall) field. No pure,
  never-matchable decoys; the decoys are other real pairs' halves.
- **Landing** (`handleLand(tile)`): a tile reaching the floor purges its whole
  pair — remove the landed tile **and** any same-`pairId` tile still in `tiles`
  **and** any same-`pairId` spec still in `buffer` (so no orphan spawns later),
  lose **one** life, reset combo, `audio.wrong()`; end if lives ≤ 0. (One pair =
  one life, same as today.) Clear `selected` if it referenced a purged tile.
- **Matching** (`matchPair(pairId)`): both tiles are on screen (the player clicked
  them); remove both (`fall-clear`), score `+10*combo`, `cleared++`,
  `onResult(pairId, gradeFalling(now - earliest of the pair's two spawnedAt))`.
- **Wrong click**: unchanged — shake both, reset combo, `audio.wrong()`, no life
  lost.

## Change 3 — tuning

- `nextDifficulty(cleared)` (pure, unit-tested):
  - `fallSpeed: Math.min(90, 34 + cleared * 1.5)` (was `min(180, 60 + cleared*2)` — roughly halved).
  - `spawnInterval: Math.max(900, 2000 - cleared * 30)` (single-tile cadence; was `max(700, 1800 - cleared*40)`).
- `MAX_ACTIVE`: `8 → 10` (more tiles / decoys on screen; now counts single tiles).
- `web/style.css` `.falling-mode` height: `min(68vh, 600px)` → `min(80vh, 720px)`
  (longer fall distance; `TILE_H` and start-above-top logic unchanged).

## Change 1 — default pairMode
`web/js/store.js`: `DEFAULT_SETTINGS.pairMode: 'meaning'` → `'reading'`. Existing
saved states keep their own value (loadState merges defaults under saved).

## Testing
- **Unit** (`node --test`): `nextDifficulty` returns the new values at
  `cleared=0` (`{fallSpeed:34, spawnInterval:2000}`), caps `fallSpeed` at 90 for
  large `cleared`, and floors `spawnInterval` at 900. `gradeFalling`/`isLanded`
  unchanged (existing tests stay green). `store.test.mjs` default-settings
  assertion updated to `pairMode: 'reading'`.
- **Playwright**: enter 落下; confirm tiles spawn **one at a time** (tile count
  rises by ~1 per interval, not by 2), a correct match clears both halves, a tile
  reaching the floor removes its pair and drops a life, and the field is visibly
  taller; 0 console errors. (Random spawn order → assert structural behaviour, not
  exact tiles.)

## Out of scope
- Pure never-matchable decoy tiles (would be unwinnable — explicitly rejected).
- Changes to other modes, SRS, or `app.js` supply/queue logic.

## Global Constraints
- Vanilla ES modules, no build step; `node --test tests/*.test.mjs`.
- Grade strings exactly `'again'|'hard'|'good'|'easy'` (falling uses easy/good/hard).
- Traditional-Chinese UI copy.
- One pair = one life on landing (unchanged); wrong click never costs a life.
- Reuse `pairMode` rendering and existing `audio`/SRS wiring.
