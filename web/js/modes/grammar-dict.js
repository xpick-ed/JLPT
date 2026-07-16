// 文法句型字典: the grammar-cloze deck reorganised as a searchable reference —
// pattern, meaning, 接続, note, example sentences — with a one-tap jump into a
// practice run of exactly that pattern's questions.

import { furiganaToRuby } from '../furigana.js';

/** Group cloze items by pattern; keeps deck order, collects every example. */
export function groupPatterns(pool) {
  const by = new Map();
  for (const it of pool) {
    if (!by.has(it.pattern)) {
      by.set(it.pattern, {
        pattern: it.pattern,
        meaning_zh: it.meaning_zh || '',
        connection: it.connection || '',
        note: it.note || '',
        levels: new Set(),
        items: [],
      });
    }
    const g = by.get(it.pattern);
    g.levels.add(it.level);
    g.items.push(it);
  }
  return [...by.values()];
}

/** Case-insensitive substring filter over pattern + meaning. */
export function filterPatterns(groups, query) {
  const q = (query || '').trim().toLowerCase();
  if (!q) return groups;
  return groups.filter(g =>
    g.pattern.toLowerCase().includes(q) || g.meaning_zh.toLowerCase().includes(q));
}

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

/**
 * Mount the dictionary. pool: grammar-cloze items of the selected levels.
 * onPractice(items) starts a cloze run over one pattern's questions.
 */
export function mountGrammarDict(root, pool, onPractice) {
  const groups = groupPatterns(pool);

  root.innerHTML = `
    <div class="dict-wrap">
      <div class="dict-head">
        <input type="search" class="dict-search" placeholder="搜尋句型或意思（例：わけ、難怪）" autocomplete="off">
        <span class="dict-count">${groups.length} 個句型</span>
      </div>
      <div class="dict-list"></div>
    </div>`;
  const listEl = root.querySelector('.dict-list');
  const searchEl = root.querySelector('.dict-search');
  const countEl = root.querySelector('.dict-count');

  function render(query) {
    const shown = filterPatterns(groups, query);
    countEl.textContent = `${shown.length} 個句型`;
    listEl.innerHTML = shown.map((g, i) => `
      <details class="dict-entry">
        <summary>
          <span class="dict-pattern">${esc(g.pattern)}</span>
          <span class="dict-meaning">${esc(g.meaning_zh)}</span>
          <span class="dict-lv">${[...g.levels].join('・')}</span>
        </summary>
        <div class="dict-body">
          ${g.connection ? `<div class="dict-row"><b>接続</b>${esc(g.connection)}</div>` : ''}
          ${g.note ? `<div class="dict-row"><b>說明</b>${esc(g.note)}</div>` : ''}
          ${g.items.slice(0, 3).map(it => `
            <div class="dict-ex">
              <div class="dict-ex-jp">${furiganaToRuby(it.before)}<b>${esc(it.answer)}</b>${furiganaToRuby(it.after)}</div>
              ${it.ex_zh ? `<div class="dict-ex-zh">${esc(it.ex_zh)}</div>` : ''}
            </div>`).join('')}
          <button type="button" class="practice-btn dict-practice" data-i="${i}">練習這個句型（${g.items.length} 題）→</button>
        </div>
      </details>`).join('');
    listEl.querySelectorAll('.dict-practice').forEach(btn => btn.addEventListener('click', () => {
      onPractice(shown[Number(btn.dataset.i)].items);
    }));
  }

  searchEl.addEventListener('input', () => render(searchEl.value));
  render('');
}
