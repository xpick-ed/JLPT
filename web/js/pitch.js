// Pitch-accent rendering. Data: kanjium accent numbers merged into the decks
// as card.acc (0 = 平板, 1 = 頭高, n = drop after mora n). Rendered as an
// overline on high morae with a tick at the downstep — the OJAD convention.

const SMALL = 'ゃゅょぁぃぅぇぉゎャュョァィゥェォヮ';

/** Split kana into morae (small kana attach to the previous mora). */
export function toMorae(kana) {
  const out = [];
  for (const ch of kana || '') {
    if (out.length && SMALL.includes(ch)) out[out.length - 1] += ch;
    else out.push(ch);
  }
  return out;
}

/** Per-mora pitch pattern: array of 'h'/'l', plus the drop position (or 0). */
export function pitchPattern(kana, acc) {
  const morae = toMorae(kana);
  const n = morae.length;
  if (!n || acc == null || acc < 0) return null;
  const a = Math.min(acc, n);
  const levels = morae.map((_, i) => {
    if (a === 0) return i === 0 ? 'l' : 'h';
    if (a === 1) return i === 0 ? 'h' : 'l';
    return i === 0 ? 'l' : i < a ? 'h' : 'l';
  });
  return { morae, levels, drop: a };
}

/** HTML for kana with its pitch contour; plain kana when accent is unknown. */
export function pitchHtml(kana, acc) {
  const p = pitchPattern(kana, acc);
  if (!p) return kana || '';
  return `<span class="pitch" title="アクセント [${acc}]">${p.morae.map((m, i) =>
    `<span class="mora mora-${p.levels[i]}${p.drop >= 1 && i === p.drop - 1 ? ' mora-drop' : ''}">${m}</span>`
  ).join('')}</span>`;
}
