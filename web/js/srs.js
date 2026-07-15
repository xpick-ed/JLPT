export const DAY = 86400000;

export function newCard(id, now) {
  return { id, ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, updated: now, isNew: true };
}

export function review(card, grade, now) {
  const c = { ...card };
  const first = c.reps === 0;
  if (grade === 'again') {
    c.lapses += 1;
    c.interval = 0;
    c.ease = Math.max(1.3, c.ease - 0.2);
    c.due = now + 600000;
  } else {
    if (grade === 'hard') {
      c.interval = first ? 1 : Math.max(1, Math.round(c.interval * 1.2));
      c.ease = Math.max(1.3, c.ease - 0.15);
    } else if (grade === 'good') {
      c.interval = first ? 1 : Math.round(c.interval * c.ease);
    } else if (grade === 'easy') {
      c.interval = first ? 3 : Math.round(c.interval * c.ease * 1.3);
      c.ease = c.ease + 0.15;
    }
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
