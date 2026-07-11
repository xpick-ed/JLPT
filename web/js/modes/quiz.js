function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function pickDistractors(card, pool, n = 3, rnd = Math.random) {
  const others = pool.filter(c => c.id !== card.id && c.zh !== card.zh);
  const sameLevelPos = others.filter(c => c.level === card.level && c.pos === card.pos);
  const sameLevel = others.filter(c => c.level === card.level);
  const ranked = [...shuffle(sameLevelPos, rnd), ...shuffle(sameLevel, rnd), ...shuffle(others, rnd)];
  const out = [];
  for (const c of ranked) {
    if (out.length >= n) break;
    if (!out.includes(c.zh)) out.push(c.zh);
  }
  return out;
}

export function gradeQuiz({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 1500) return 'easy';
  if (elapsedMs > 5000) return 'hard';
  return 'good';
}
