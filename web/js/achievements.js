// Achievement badges + daily quests. Pure derivation from persisted state so
// everything here is unit-testable. Earned badges persist in
// state.achievements = { [id]: earnedAtMs } and merge as a union (earliest
// timestamp wins) so they can never be un-earned by a device swap.

import { currentStreak, dailySummary, dayKey } from './progress.js';

function allDaySummaries(state) {
  return Object.keys(state.daily || {}).map(k => dailySummary(state, k));
}
function maxDay(state, field) {
  return allDaySummaries(state).reduce((m, d) => Math.max(m, d[field] || 0), 0);
}
function totalReviewed(state) {
  return allDaySummaries(state).reduce((n, d) => n + (d.reviewed || 0), 0);
}
function bestDayAccuracy(state, minReviewed) {
  return allDaySummaries(state)
    .filter(d => d.reviewed >= minReviewed)
    .reduce((m, d) => Math.max(m, d.correct / d.reviewed), 0);
}
function masteredCount(state) {
  // srs.js intervals are in days; 21+ days ≈ "mature" in Anki terms.
  return Object.values(state.cards || {}).filter(c => (c.interval || 0) >= 21).length;
}

export const ACHIEVEMENTS = [
  { id: 'streak3',   icon: '🔥', title: '連續 3 天',        desc: '連續學習 3 天',                 check: (s, now) => currentStreak(s, now) >= 3 },
  { id: 'streak7',   icon: '🔥', title: '連續 7 天',        desc: '連續學習 7 天',                 check: (s, now) => currentStreak(s, now) >= 7 },
  { id: 'streak30',  icon: '🏮', title: '連續 30 天',       desc: '連續學習 30 天',                check: (s, now) => currentStreak(s, now) >= 30 },
  { id: 'day50',     icon: '📚', title: '單日 50 題',       desc: '一天內完成 50 題',              check: s => maxDay(s, 'reviewed') >= 50 },
  { id: 'day100',    icon: '💪', title: '單日 100 題',      desc: '一天內完成 100 題',             check: s => maxDay(s, 'reviewed') >= 100 },
  { id: 'day200',    icon: '🚀', title: '單日 200 題',      desc: '一天內完成 200 題',             check: s => maxDay(s, 'reviewed') >= 200 },
  { id: 'combo10',   icon: '⚡', title: '10 連擊',          desc: '連續答對 10 題',                check: s => (s.best?.combo || 0) >= 10 },
  { id: 'combo25',   icon: '⚡', title: '25 連擊',          desc: '連續答對 25 題',                check: s => (s.best?.combo || 0) >= 25 },
  { id: 'combo50',   icon: '🌟', title: '50 連擊',          desc: '連續答對 50 題',                check: s => (s.best?.combo || 0) >= 50 },
  { id: 'total1000', icon: '⛰️', title: '累計 1000 題',     desc: '總共完成 1000 題',              check: s => totalReviewed(s) >= 1000 },
  { id: 'total5000', icon: '🗻', title: '累計 5000 題',     desc: '總共完成 5000 題',              check: s => totalReviewed(s) >= 5000 },
  { id: 'sharp90',   icon: '🎯', title: '神準 90%',         desc: '單日正確率 90% 以上（至少 30 題）', check: s => bestDayAccuracy(s, 30) >= 0.9 },
  { id: 'master100', icon: '🈷️', title: '熟記 100',         desc: '100 張卡片達到 21 天以上複習間隔', check: s => masteredCount(s) >= 100 },
  { id: 'master500', icon: '🏆', title: '熟記 500',         desc: '500 張卡片達到 21 天以上複習間隔', check: s => masteredCount(s) >= 500 },
];

// Evaluate all badges; returns the updated earned map and any newly earned ids.
export function evaluateAchievements(state, now = Date.now()) {
  const earned = { ...(state.achievements || {}) };
  const newly = [];
  for (const a of ACHIEVEMENTS) {
    if (earned[a.id]) continue;
    if (a.check(state, now)) { earned[a.id] = now; newly.push(a.id); }
  }
  return { earned, newly };
}

// Union merge: a badge earned anywhere stays earned; keep the earliest date.
export function mergeAchievements(a = {}, b = {}) {
  const out = { ...a };
  for (const [id, ts] of Object.entries(b)) {
    out[id] = out[id] ? Math.min(out[id], ts) : ts;
  }
  return out;
}

// ---------------------------------------------------------------- daily quests

export const QUEST_DEFS = [
  { id: 'reviewed50', title: '完成 50 題',            goal: 50,  value: d => d.reviewed },
  { id: 'correct30',  title: '答對 30 題',            goal: 30,  value: d => d.correct },
  { id: 'score300',   title: '拿下 300 分',           goal: 300, value: d => d.score },
  { id: 'combo10q',   title: '達成 10 連擊',          goal: 10,  value: d => d.combo },
  { id: 'both15',     title: '單字＋文法各 15 題',    goal: 15,  value: d => Math.min(d.vocab, d.grammar) },
  { id: 'minutes15',  title: '學習 15 分鐘',          goal: 15,  value: d => Math.floor(d.seconds / 60) },
];

// Deterministic small hash so both devices agree on the day's quests.
function hashDay(key) {
  let h = 0;
  for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return h;
}

// Pick 3 distinct quests for the calendar day via a seeded shuffle.
export function questsFor(key) {
  let seed = hashDay(key) || 1;
  const rnd = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;   // LCG
    return seed / 2 ** 32;
  };
  const idx = QUEST_DEFS.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [idx[i], idx[j]] = [idx[j], idx[i]];
  }
  return idx.slice(0, 3).map(i => QUEST_DEFS[i]);
}

// Today's quests with live progress from the daily summary.
export function questProgress(state, now = Date.now()) {
  const key = dayKey(now);
  const d = dailySummary(state, key);
  return questsFor(key).map(q => {
    const value = Math.min(q.goal, q.value(d) || 0);
    return { id: q.id, title: q.title, goal: q.goal, value, done: value >= q.goal };
  });
}
