export function hasKana(s) {
  return /[぀-ヿ]/.test(s);
}

export function normalizeRomaji(s) {
  let t = (s || '').toLowerCase()
    .replace(/[āàá]/g, 'a').replace(/[īìí]/g, 'i').replace(/[ūùú]/g, 'u')
    .replace(/[ēèé]/g, 'e').replace(/[ōòó]/g, 'o')
    .replace(/[^a-z]/g, '');
  t = t.replace(/ou/g, 'o').replace(/oo/g, 'o').replace(/uu/g, 'u').replace(/ei/g, 'e');
  return t;
}

export function checkTyping(input, card) {
  if (hasKana(input)) return input.trim() === card.kana;
  return normalizeRomaji(input) === normalizeRomaji(card.romaji);
}

export function gradeTyping({ correct, hadTypo, elapsedMs, firstTry, revealed }) {
  if (!correct || revealed) return 'again';
  if (firstTry && elapsedMs < 4000) return 'easy';
  if (hadTypo || elapsedMs > 8000) return 'hard';
  return 'good';
}
