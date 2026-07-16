// 考前教練: exam countdown, an auto-generated daily menu from the learner's
// actual due/weak counts, a 30-day review-load forecast, and a weekly
// mock-exam nudge. Pure derivations over persisted state.

import { dayKey, dailySummary } from './progress.js';

const DAY_MS = 86400000;

/** Whole days from now (local) until the exam date; null when unset/invalid. */
export function daysUntil(dateStr, now = Date.now()) {
  if (!dateStr) return null;
  const target = new Date(`${dateStr}T00:00:00`);
  if (isNaN(target)) return null;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / DAY_MS);
}

/**
 * Review load for the next `days` days: [{ key, count }], with everything
 * already overdue folded into today's bar.
 */
export function dueForecast(cards, days = 30, now = Date.now()) {
  const buckets = new Map();
  for (let i = 0; i < days; i++) buckets.set(dayKey(now + i * DAY_MS), 0);
  const todayK = dayKey(now);
  for (const c of Object.values(cards || {})) {
    if (!c.due) continue;
    const k = c.due <= now ? todayK : dayKey(c.due);
    if (buckets.has(k)) buckets.set(k, buckets.get(k) + 1);
  }
  return [...buckets.entries()].map(([key, count]) => ({ key, count }));
}

/**
 * Today's menu from live stats {due, fresh, weak, goal} + today's summary.
 * Each item: { label, target, value, done }.
 */
export function todayMenu(state, { due, fresh, weak, goal }, now = Date.now()) {
  const today = dailySummary(state, dayKey(now));
  const items = [];
  items.push({ label: `完成今日題量（到期 ${due}・新字 ${fresh}）`, target: Math.max(1, goal), value: today.reviewed, done: today.reviewed >= Math.max(1, goal) });
  if (weak > 0) items.push({ label: `弱點複習（現有 ${weak} 題）`, kind: 'weak', done: false });
  items.push({ label: '文法至少 15 題', target: 15, value: today.grammar, done: today.grammar >= 15 });
  return items;
}

/** Suggest a mock exam when none was taken in the past 7 days. */
export function mockExamNudge(exams = [], now = Date.now()) {
  const last = exams.length ? exams[exams.length - 1].at : 0;
  return now - last > 7 * DAY_MS;
}
