// Global cross-mode combo & scoring. Every answered question (any mode) feeds
// applyAnswer(); a correct answer extends the streak and earns BASE_POINTS ×
// the current multiplier tier, a miss resets the streak. Pure state-in /
// state-out so it can be unit tested.

export const BASE_POINTS = 10;

// Multiplier tiers: 0–4 → ×1, 5–9 → ×2, 10–19 → ×3, 20+ → ×4.
export function multiplierFor(combo) {
  if (combo >= 20) return 4;
  if (combo >= 10) return 3;
  if (combo >= 5) return 2;
  return 1;
}

export function makeCombo() {
  return { combo: 0, best: 0, score: 0, gained: 0, multiplier: 1 };
}

export function applyAnswer(s, correct) {
  if (!correct) return { ...s, combo: 0, gained: 0, multiplier: 1 };
  const combo = s.combo + 1;
  const multiplier = multiplierFor(combo);
  const gained = BASE_POINTS * multiplier;
  return {
    combo,
    best: Math.max(s.best || 0, combo),
    score: (s.score || 0) + gained,
    gained,
    multiplier,
  };
}

// Merge two persisted personal-best records (either side may be missing).
export function mergeBest(a = {}, b = {}) {
  return {
    combo: Math.max(a.combo || 0, b.combo || 0),
    updated: Math.max(a.updated || 0, b.updated || 0),
  };
}
