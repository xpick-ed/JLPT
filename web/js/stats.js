// Study-statistics derivations for the dashboard: GitHub-style activity
// heatmap, per-level mastery, and lifetime totals. Pure state-in/data-out.

import { dayKey, dailySummary } from './progress.js';

const DAY_MS = 86400000;

/**
 * Cells for a weekday-aligned heatmap: columns are weeks (oldest → newest),
 * rows Sunday–Saturday. The first cell is a Sunday, the last cell is today,
 * so the final column may be partial. Each cell: { key, count }.
 */
export function heatmapCells(state, { weeks = 20, now = Date.now() } = {}) {
  const end = new Date(now);
  end.setHours(12, 0, 0, 0);              // noon dodges DST edges
  const cellCount = (weeks - 1) * 7 + end.getDay() + 1;   // back to a Sunday
  const cells = [];
  for (let i = cellCount - 1; i >= 0; i--) {
    const key = dayKey(end.getTime() - i * DAY_MS);
    cells.push({ key, count: dailySummary(state, key).reviewed });
  }
  return cells;
}

/** Bucket a day's reviewed count into 5 visual intensities (0 = none). */
export function intensity(count) {
  if (count >= 100) return 4;
  if (count >= 50) return 3;
  if (count >= 20) return 2;
  if (count >= 1) return 1;
  return 0;
}

/**
 * Per-level progress over the currently loaded decks:
 * seen = cards reviewed at least once, mature = 21+ day interval.
 */
export function levelMastery(state, dataByLevel, levels) {
  return levels
    .filter(lv => (dataByLevel[lv] || []).length)
    .map(lv => {
      const deck = dataByLevel[lv];
      let seen = 0, mature = 0;
      for (const c of deck) {
        const card = state.cards[c.id];
        if (!card || !card.reps) continue;
        seen += 1;
        if ((card.interval || 0) >= 21) mature += 1;
      }
      return { lv, total: deck.length, seen, mature };
    });
}

/**
 * True-retention series for the last `days` days: recall attempts on
 * previously-seen cards only. rate is null on days without attempts.
 */
export function retentionSeries(state, days = 30, now = Date.now()) {
  const out = [];
  for (let i = days - 1; i >= 0; i--) {
    const key = dayKey(now - i * DAY_MS);
    const d = dailySummary(state, key);
    out.push({ key, n: d.rev || 0, rate: d.rev ? d.revOk / d.rev : null });
  }
  return out;
}

/** Overall retention across the retained history; null with no data. */
export function overallRetention(state) {
  let rev = 0, ok = 0;
  for (const key of Object.keys(state.daily || {})) {
    const d = dailySummary(state, key);
    rev += d.rev || 0;
    ok += d.revOk || 0;
  }
  return rev ? ok / rev : null;
}

/** FSRS difficulty histogram over reviewed cards: 5 buckets from easy to hard. */
export function difficultyBuckets(state) {
  const buckets = [0, 0, 0, 0, 0];   // [1,2.8) [2.8,4.6) [4.6,6.4) [6.4,8.2) [8.2,10]
  for (const c of Object.values(state.cards || {})) {
    if (c.d == null) continue;
    buckets[Math.min(4, Math.floor((c.d - 1) / 1.8))] += 1;
  }
  return buckets;
}

/** Lifetime totals across the retained daily history (~400 days). */
export function totals(state) {
  let reviewed = 0, seconds = 0, days = 0;
  for (const key of Object.keys(state.daily || {})) {
    const d = dailySummary(state, key);
    if (!d.reviewed) continue;
    reviewed += d.reviewed;
    seconds += d.seconds;
    days += 1;
  }
  return { reviewed, seconds, days, bestCombo: state.best?.combo || 0 };
}
