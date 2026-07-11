export const DEFAULT_SETTINGS = { newPerDay: 50, levels: ['n2'], categories: [], sound: true, pairMode: 'meaning' };
const KEY = 'vocabmatch.state';

export function emptyState() {
  return { cards: {}, settings: { ...DEFAULT_SETTINGS }, updated: 0 };
}

export function mergeStates(a, b) {
  const cards = { ...a.cards };
  for (const [id, cb] of Object.entries(b.cards)) {
    const ca = cards[id];
    if (!ca || (cb.updated || 0) > (ca.updated || 0)) cards[id] = cb;
  }
  const settings = (b.updated || 0) > (a.updated || 0) ? b.settings : a.settings;
  return { cards, settings, updated: Math.max(a.updated || 0, b.updated || 0) };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const s = JSON.parse(raw);
    s.settings = { ...DEFAULT_SETTINGS, ...(s.settings || {}) };
    s.cards = s.cards || {};
    return s;
  } catch { return emptyState(); }
}

export function saveState(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* private mode: ignore */ }
}
