// 智慧閱讀器 core: match pasted Japanese text against the vocabulary decks.
// Longest-match scanning over word surfaces, plus kanji-stem matching so
// conjugated verbs/adjectives (帰った ← 帰る) still hit. Pure & testable.

const HIRA = /[ぁ-ん]/;
const KANJI = /[一-鿿]/;
const KANA_OR_KANJI_WORD = /[一-鿿ァ-ヶ]/;   // index only words with kanji/katakana (hiragana-only words false-positive too easily)

/**
 * Build the lookup tables. words: exact surface → card. stems: kanji stem of
 * conjugatable words (動x・い形) → card, matched only when okurigana follows.
 */
export function buildMatcher(cards) {
  const words = new Map();
  const stems = new Map();
  let maxLen = 1;
  for (const c of cards) {
    if (!KANA_OR_KANJI_WORD.test(c.word)) continue;
    if (!words.has(c.word)) words.set(c.word, c);
    maxLen = Math.max(maxLen, c.word.length);
    const pos = c.pos || '';
    if (pos.startsWith('動') || pos === 'い形') {
      const stem = c.word.replace(/[ぁ-ん]+$/, '');
      if (stem && stem !== c.word && KANJI.test(stem) && !stems.has(stem)) stems.set(stem, c);
    }
  }
  return { words, stems, maxLen };
}

/**
 * Split text into tokens: { t } for plain runs, { t, card } for matches.
 * Longest surface match wins; stems only match when followed by hiragana.
 */
export function annotate(text, matcher) {
  const { words, stems, maxLen } = matcher;
  const tokens = [];
  let plain = '';
  const flush = () => { if (plain) { tokens.push({ t: plain }); plain = ''; } };
  let i = 0;
  while (i < text.length) {
    let hit = null;
    for (let len = Math.min(maxLen, text.length - i); len >= 1 && !hit; len--) {
      const seg = text.slice(i, i + len);
      const card = words.get(seg);
      if (card) hit = { t: seg, card };
      else if (HIRA.test(text[i + len] || '')) {
        const sc = stems.get(seg);
        if (sc) hit = { t: seg, card: sc };
      }
    }
    if (hit) {
      flush();
      tokens.push(hit);
      i += hit.t.length;
    } else {
      plain += text[i];
      i += 1;
    }
  }
  flush();
  return tokens;
}

/** Wordbook union across devices: dedup by id, keep insertion order, cap. */
export function mergeWordbook(a = [], b = [], cap = 500) {
  const out = [];
  const seen = new Set();
  for (const w of [...a, ...b]) {
    if (!w || !w.id || seen.has(w.id)) continue;
    seen.add(w.id);
    out.push(w);
  }
  return out.slice(-cap);
}
