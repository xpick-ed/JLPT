import { dueQueue, newCard, review } from './srs.js';

export function buildQueue(state, poolIds, now) {
  return dueQueue(state.cards, poolIds, now, state.settings.newPerDay);
}

export function applyGrade(state, id, grade, now) {
  const base = state.cards[id] || newCard(id, now);
  const card = review(base, grade, now);
  return {
    ...state,
    cards: { ...state.cards, [id]: card },
    updated: now,
  };
}
