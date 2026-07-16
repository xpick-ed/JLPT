// Japanese verb conjugation engine. Classes come straight from the deck's pos
// field (動I = godan, 動II = ichidan, 動III/名／動III = suru・kuru), so there is
// no guessing — only the well-known irregulars need special cases.

export const FORMS = [
  { id: 'masu', label: 'ます形', minLevel: 5 },
  { id: 'te', label: 'て形', minLevel: 5 },
  { id: 'ta', label: 'た形', minLevel: 5 },
  { id: 'nai', label: 'ない形', minLevel: 5 },
  { id: 'potential', label: '可能形', minLevel: 4 },
  { id: 'volitional', label: '意向形', minLevel: 4 },
  { id: 'ba', label: 'ば形', minLevel: 4 },
  { id: 'passive', label: '受身形', minLevel: 3 },
  { id: 'causative', label: '使役形', minLevel: 3 },
];

// godan ending → [a, i, e, o] row kana
const ROWS = {
  'う': ['わ', 'い', 'え', 'お'],
  'く': ['か', 'き', 'け', 'こ'],
  'ぐ': ['が', 'ぎ', 'げ', 'ご'],
  'す': ['さ', 'し', 'せ', 'そ'],
  'つ': ['た', 'ち', 'て', 'と'],
  'ぬ': ['な', 'に', 'ね', 'の'],
  'ぶ': ['ば', 'び', 'べ', 'ぼ'],
  'む': ['ま', 'み', 'め', 'も'],
  'る': ['ら', 'り', 'れ', 'ろ'],
};
const TE_GODAN = {
  'く': 'いて', 'ぐ': 'いで', 'す': 'して',
  'う': 'って', 'つ': 'って', 'る': 'って',
  'ぬ': 'んで', 'ぶ': 'んで', 'む': 'んで',
};

/** Verb class from the deck's pos tag, or null when not a verb. */
export function verbClass(card) {
  const pos = card.pos || '';
  if (pos === '動I') return 'godan';
  if (pos === '動II') return 'ichidan';
  if (pos === '動III' || pos === '名／動III') return 'suru';
  return null;
}

/** Kana dictionary form a drill conjugates (名／動III nouns gain する). */
export function dictForm(card) {
  const cls = verbClass(card);
  if (!cls) return null;
  if (cls === 'suru' && !card.kana.endsWith('する') && card.kana !== 'くる') return card.kana + 'する';
  return card.kana;
}

function godan(kana, form) {
  const end = kana.slice(-1);
  const stem = kana.slice(0, -1);
  const row = ROWS[end];
  if (!row) return null;
  const iku = kana.endsWith('いく') || kana === 'いく';   // 行く euphonics
  switch (form) {
    case 'masu': return stem + row[1] + 'ます';
    case 'te': return iku ? stem + 'って' : stem + TE_GODAN[end];
    case 'ta': return (iku ? stem + 'って' : stem + TE_GODAN[end]).replace(/て$/, 'た').replace(/で$/, 'だ');
    case 'nai': return kana === 'ある' ? 'ない' : stem + row[0] + 'ない';
    case 'potential': return stem + row[2] + 'る';
    case 'volitional': return stem + row[3] + 'う';
    case 'ba': return stem + row[2] + 'ば';
    case 'passive': return stem + row[0] + 'れる';
    case 'causative': return stem + row[0] + 'せる';
    default: return null;
  }
}

function ichidan(kana, form) {
  const stem = kana.slice(0, -1);
  switch (form) {
    case 'masu': return stem + 'ます';
    case 'te': return stem + 'て';
    case 'ta': return stem + 'た';
    case 'nai': return stem + 'ない';
    case 'potential': return stem + 'られる';
    case 'volitional': return stem + 'よう';
    case 'ba': return stem + 'れば';
    case 'passive': return stem + 'られる';
    case 'causative': return stem + 'させる';
    default: return null;
  }
}

const SURU = { masu: 'します', te: 'して', ta: 'した', nai: 'しない', potential: 'できる', volitional: 'しよう', ba: 'すれば', passive: 'される', causative: 'させる' };
const KURU = { masu: 'きます', te: 'きて', ta: 'きた', nai: 'こない', potential: 'こられる', volitional: 'こよう', ba: 'くれば', passive: 'こられる', causative: 'こさせる' };

/** Conjugate a kana dictionary form; null when unsupported. */
export function conjugate(kana, cls, form) {
  if (!kana || !cls) return null;
  if (cls === 'suru') {
    if (kana === 'くる') return KURU[form] || null;
    if (!kana.endsWith('する')) return null;
    const head = kana.slice(0, -2);
    return SURU[form] ? head + SURU[form] : null;
  }
  if (cls === 'ichidan') return kana.endsWith('る') ? ichidan(kana, form) : null;
  if (cls === 'godan') return godan(kana, form);
  return null;
}

/** Forms a card's JLPT level should drill (N5 → basics only, N3+ → everything). */
export function formsForLevel(level) {
  const n = Number(String(level || 'N5').replace(/\D/g, '')) || 5;
  return FORMS.filter(f => f.minLevel >= n);
}

/** True when the drill can ask this card anything at all. */
export function isConjugatable(card) {
  const cls = verbClass(card);
  const kana = dictForm(card);
  return !!(cls && kana && conjugate(kana, cls, 'masu'));
}
