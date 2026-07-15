import { mergeDaily } from './progress.js';

export const DEFAULT_SETTINGS = { newPerDay: 50, dailyGoal: 50, levels: ['n2'], categories: [], sound: true, bgm: 'off', pairMode: 'reading', theme: 'system', content: 'vocab' };
const KEY = 'vocabmatch.state';

export function emptyState() {
  return { cards: {}, daily: {}, settings: { ...DEFAULT_SETTINGS }, updated: 0 };
}

export function mergeStates(a, b) {
  const cards = { ...a.cards };
  for (const [id, cb] of Object.entries(b.cards)) {
    const ca = cards[id];
    if (!ca || (cb.updated || 0) > (ca.updated || 0)) cards[id] = cb;
  }
  const pickedSettings = (b.updated || 0) > (a.updated || 0) ? b.settings : a.settings;
  const settings = { ...DEFAULT_SETTINGS, ...(pickedSettings || {}) };
  return { cards, daily: mergeDaily(a.daily, b.daily), settings, updated: Math.max(a.updated || 0, b.updated || 0) };
}

// Resolve local vs remote state on sync. mergeLocal=true → merge (same/anonymous
// account). mergeLocal=false → ADOPT the remote wholesale (different account),
// never carrying the previous account's cards; empty when there is no remote.
export function applySync(local, remote, mergeLocal) {
  if (mergeLocal) return remote ? mergeStates(local, remote) : local;
  if (remote) return { cards: remote.cards || {}, daily: remote.daily || {}, settings: { ...DEFAULT_SETTINGS, ...(remote.settings || {}) }, updated: remote.updated || 0 };
  return { cards: {}, daily: {}, settings: { ...DEFAULT_SETTINGS }, updated: 0 };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    s.cards = s.cards || {};
    s.daily = s.daily || {};
    return s;
  } catch { return emptyState(); }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: ignore */ }
}
