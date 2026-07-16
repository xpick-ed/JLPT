const DAY_MS = 86400000;

// Calendar-day keys intentionally use the learner's local timezone.
export function dayKey(now = Date.now()) {
  const d = new Date(now);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function emptyBucket() {
  return { reviewed: 0, correct: 0, seconds: 0, vocab: 0, grammar: 0, score: 0, combo: 0, rev: 0, revOk: 0, updated: 0 };
}

// Activity is kept per device so sync can merge counters without repeatedly
// double-counting them. Each device owns and replaces only its own bucket.
export function recordActivity(state, { deviceId, content, grade, seconds = 0, points = 0, combo = 0, recall = null, now = Date.now() }) {
  const key = dayKey(now);
  const daily = { ...(state.daily || {}) };
  const byDevice = { ...(daily[key] || {}) };
  const prev = { ...emptyBucket(), ...(byDevice[deviceId] || {}) };
  const kind = content === 'grammar' ? 'grammar' : 'vocab';
  byDevice[deviceId] = {
    ...prev,
    reviewed: prev.reviewed + 1,
    correct: prev.correct + (grade === 'again' ? 0 : 1),
    seconds: prev.seconds + Math.max(0, Math.min(120, Math.round(seconds))),
    [kind]: prev[kind] + 1,
    score: prev.score + Math.max(0, Math.round(points)),
    combo: Math.max(prev.combo, combo),   // best streak reached today on this device
    // true retention signal: recall attempts on previously-seen cards only
    rev: prev.rev + (recall === null ? 0 : 1),
    revOk: prev.revOk + (recall === true ? 1 : 0),
    updated: now,
  };
  daily[key] = byDevice;

  // Keep a little over a year of compact aggregates.
  const keys = Object.keys(daily).sort();
  for (const old of keys.slice(0, Math.max(0, keys.length - 400))) delete daily[old];
  return { ...state, daily, updated: now };
}

export function mergeDaily(a = {}, b = {}) {
  const out = {};
  for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
    const devices = { ...(a[key] || {}) };
    for (const [deviceId, remote] of Object.entries(b[key] || {})) {
      const local = devices[deviceId];
      if (!local || (remote.updated || 0) > (local.updated || 0)) devices[deviceId] = remote;
    }
    out[key] = devices;
  }
  return out;
}

export function dailySummary(state, key = dayKey()) {
  const total = emptyBucket();
  for (const bucket of Object.values((state.daily || {})[key] || {})) {
    total.reviewed += bucket.reviewed || 0;
    total.correct += bucket.correct || 0;
    total.seconds += bucket.seconds || 0;
    total.vocab += bucket.vocab || 0;
    total.grammar += bucket.grammar || 0;
    total.score += bucket.score || 0;
    total.combo = Math.max(total.combo, bucket.combo || 0);
    total.rev += bucket.rev || 0;
    total.revOk += bucket.revOk || 0;
    total.updated = Math.max(total.updated, bucket.updated || 0);
  }
  return total;
}

export function currentStreak(state, now = Date.now()) {
  let streak = 0;
  const cursor = new Date(now);
  cursor.setHours(12, 0, 0, 0); // noon avoids DST transitions around midnight
  while (dailySummary(state, dayKey(cursor.getTime())).reviewed > 0) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export function isWeakCard(card) {
  if (!card) return false;
  return card.lastGrade === 'again'
    || card.lastGrade === 'hard'
    || (card.lapses || 0) >= 2
    || (card.ease || 2.5) < 2.3;
}

