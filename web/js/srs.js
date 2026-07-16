// Scheduling: FSRS-4.5 (open-spaced-repetition) with the published default
// parameters. Cards carry FSRS state as {s: stability(days), d: difficulty
// 1..10}. Legacy SM-2 cards (no s/d) migrate on their next review: stability ≈
// current interval (R(interval)=0.9 by construction), difficulty from ease.
// The SM-2 `ease` field keeps updating as before purely so weak-card
// detection (progress.isWeakCard) stays backward compatible.

export const DAY = 86400000;

// FSRS-4.5 default weights.
export const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;          // so that R(t=S) = 0.9
const MAX_INTERVAL = 36500;

const GRADE = { again: 1, hard: 2, good: 3, easy: 4 };
const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

export function initStability(g, w = FSRS_W) {
  return Math.max(w[g - 1], 0.1);
}
export function initDifficulty(g, w = FSRS_W) {
  return clamp(w[4] - (g - 3) * w[5], 1, 10);
}
export function nextDifficulty(d, g, w = FSRS_W) {
  return clamp(w[7] * initDifficulty(3, w) + (1 - w[7]) * (d - w[6] * (g - 3)), 1, 10);
}
/** Probability of recall after t days at stability s. */
export function retrievability(t, s) {
  return Math.pow(1 + FACTOR * Math.max(0, t) / Math.max(0.1, s), DECAY);
}
/** Interval for 90% target retention — by construction equals the stability. */
export function nextIntervalDays(s) {
  return clamp(Math.round(s), 1, MAX_INTERVAL);
}
export function nextRecallStability(d, s, r, g, w = FSRS_W) {
  const hard = g === 2 ? w[15] : 1;
  const easy = g === 4 ? w[16] : 1;
  return s * (1 + Math.exp(w[8]) * (11 - d) * Math.pow(s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * hard * easy);
}
export function nextForgetStability(d, s, r, w = FSRS_W) {
  const sf = w[11] * Math.pow(d, -w[12]) * (Math.pow(s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
  return Math.min(sf, s);          // a lapse never increases stability
}

/** Estimate FSRS state for a legacy SM-2 card (no s/d yet). */
export function migrateLegacy(card) {
  return {
    s: Math.max(0.5, card.interval || 0.5),
    d: clamp(11 - 3 * (card.ease || 2.5), 1, 10),
  };
}

export function newCard(id, now) {
  return { id, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, updated: now, isNew: true };
}

export function review(card, grade, now) {
  const c = { ...card };
  const g = GRADE[grade];
  const first = !(c.reps > 0);

  // SM-2-compatible ease bookkeeping (weak-card detection only).
  if (grade === 'again') c.ease = Math.max(1.3, (c.ease || 2.5) - 0.2);
  else if (grade === 'hard') c.ease = Math.max(1.3, (c.ease || 2.5) - 0.15);
  else if (grade === 'easy') c.ease = (c.ease || 2.5) + 0.15;

  let s, d;
  if (first) {
    s = initStability(g);
    d = initDifficulty(g);
  } else {
    ({ s, d } = c.s != null && c.d != null ? c : migrateLegacy(c));
    const t = (now - (c.updated || now)) / DAY;
    const r = retrievability(t, s);
    d = nextDifficulty(d, g);
    s = g === 1 ? nextForgetStability(d, s, r) : nextRecallStability(d, s, r, g);
  }
  c.s = Math.round(s * 100) / 100;
  c.d = Math.round(d * 100) / 100;

  if (g === 1) {
    c.lapses += 1;
    c.interval = 0;
    c.due = now + 600000;          // relearn in 10 minutes
  } else {
    c.interval = nextIntervalDays(s);
    c.due = now + c.interval * DAY;
  }
  c.reps += 1;
  c.isNew = false;
  c.lastGrade = grade;
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
