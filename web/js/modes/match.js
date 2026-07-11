export function gradeMatch({ wrongBefore, elapsedMs, firstPickHit }) {
  if (wrongBefore > 0) return 'again';
  if (elapsedMs > 8000) return 'hard';
  if (elapsedMs < 2500 && firstPickHit) return 'easy';
  return 'good';
}
