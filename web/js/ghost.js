// Ghost personal bests: race yourself. Falling keeps the score timeline of
// your best run (the "ghost" score shown live at the same elapsed time);
// typing keeps your fastest clean first-try answer. Persisted in state.ghosts.

/** Step-lookup: the ghost run's score at elapsed time tMs. */
export function ghostScoreAt(samples, tMs) {
  let score = 0;
  for (const [t, s] of samples || []) {
    if (t > tMs) break;
    score = s;
  }
  return score;
}

/** Merge two devices' ghost records: best falling score / fastest typing ms wins. */
export function mergeGhosts(a = {}, b = {}) {
  const out = { ...a };
  if (b.falling && (!out.falling || (b.falling.score || 0) > (out.falling.score || 0))) out.falling = b.falling;
  if (b.typing && (!out.typing || (b.typing.ms || Infinity) < (out.typing.ms || Infinity))) out.typing = b.typing;
  return out;
}
