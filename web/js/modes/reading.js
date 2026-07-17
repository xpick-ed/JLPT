// 閱讀: paste-in smart reader + daily external sources. Pasted text is matched
// against the vocabulary decks (see reader.js) — deck words highlight as
// learned/unlearned, tapping one shows its card and can queue it for study.
// Text stays in the browser; nothing is stored or uploaded.

import { buildMatcher, annotate } from '../reader.js';
import { pitchHtml } from '../pitch.js';

export const SOURCES = [
  { name: 'NHK NEWS WEB EASY', url: 'https://www3.nhk.or.jp/news/easy/', level: 'N4–N3', desc: '每日新聞、全文振假名、朗讀語音、難詞查辭典（主打）' },
  { name: 'Watanoc', url: 'https://watanoc.com/', level: 'N5–N3', desc: '免費分級日語雜誌，生活・文化' },
  { name: 'MATCHA（やさしい日本語）', url: 'https://matcha-jp.com/easy', level: 'N4–N3', desc: '觀光・文化，簡易日語版' },
  { name: '福娘童話集', url: 'https://hukumusume.com/douwa/', level: 'N5–N4', desc: '日本童話・昔話短文，附假名' },
  { name: 'NHK NEWS WEB', url: 'https://www3.nhk.or.jp/news/', level: 'N2–N1', desc: '真實時事新聞（無振假名）' },
  { name: '青空文庫', url: 'https://www.aozora.gr.jp/', level: 'N2–N1', desc: '免費經典文學（進階挑戰）' },
];

let lastText = '';   // survives tab switches within a session

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function sourcesHtml() {
  return `
    <div class="read-grid">
      ${SOURCES.map(s => `
        <a class="read-card" href="${s.url}" target="_blank" rel="noopener noreferrer">
          <div class="read-card-top">
            <span class="read-name">${s.name}</span>
            <span class="read-level">${s.level}</span>
          </div>
          <p class="read-desc">${s.desc}</p>
          <span class="read-go">前往 →</span>
        </a>`).join('')}
    </div>
    <p class="read-foot">以上皆連結至外部網站，於新分頁開啟。讀到的文章可貼回上方閱讀器查詞。</p>`;
}

/**
 * ctx: { loadAllVocab(): Promise<{lv:[cards]}>, isKnown(id), inWordbook(id), onAddWord(card) }
 */
export function mountReading(root, ctx) {
  function inputView() {
    root.innerHTML = `
      <div class="read-wrap">
        <div class="rd-box">
          <h2 class="rd-title">📖 智慧閱讀器</h2>
        <p class="read-hint">把任何日文文章貼進來：會用你的題庫自動標詞——<span class="rd-demo rd-known">已學過</span>、<span class="rd-demo rd-new">還沒學</span>，點詞看釋義、一鍵加入學習佇列。文字只在你的瀏覽器裡處理。</p>
          <textarea class="rd-input" rows="6" placeholder="貼上日文文章…">${esc(lastText)}</textarea>
          <div class="vt-actions"><button type="button" class="btn-primary" id="rd-start">開始閱讀</button></div>
        </div>
        <p class="read-hint">或到這些網站找今天的讀物：</p>
        ${sourcesHtml()}
      </div>`;
    root.querySelector('#rd-start').addEventListener('click', async () => {
      const text = root.querySelector('.rd-input').value.trim();
      if (!text) return;
      lastText = text;
      root.querySelector('#rd-start').textContent = '載入題庫…';
      const decks = await ctx.loadAllVocab();
      const matcher = buildMatcher(Object.values(decks).flat());
      articleView(text, matcher);
    });
  }

  function articleView(text, matcher) {
    const tokens = annotate(text, matcher);
    const hits = tokens.filter(t => t.card);
    const uniq = new Map(hits.map(t => [t.card.id, t.card]));
    const unknown = [...uniq.values()].filter(c => !ctx.isKnown(c.id));
    root.innerHTML = `
      <div class="read-wrap">
        <div class="rd-stats">
          <button type="button" class="btn-ghost" id="rd-back">← 換一篇</button>
          <span>${text.length} 字</span>
          <span>命中 <b>${uniq.size}</b> 詞</span>
          <span>未學 <b class="rd-unknown-count">${unknown.length}</b> 詞</span>
          <span class="rd-legend"><span class="rd-demo rd-known">已學</span><span class="rd-demo rd-new">未學</span></span>
        </div>
        <div class="rd-article">${tokens.map((tk, i) => tk.card
          ? `<button type="button" class="rd-tok ${ctx.isKnown(tk.card.id) ? 'rd-known' : 'rd-new'}" data-i="${i}">${esc(tk.t)}</button>`
          : esc(tk.t).replace(/\n/g, '<br>')).join('')}</div>
        <div class="rd-pop" hidden></div>
      </div>`;
    const pop = root.querySelector('.rd-pop');
    root.querySelector('#rd-back').addEventListener('click', inputView);
    root.querySelectorAll('.rd-tok').forEach(el => el.addEventListener('click', () => {
      const card = tokens[Number(el.dataset.i)].card;
      const known = ctx.isKnown(card.id);
      const queued = ctx.inWordbook(card.id);
      pop.hidden = false;
      pop.innerHTML = `
        <div class="rd-pop-head">
          <span class="rd-pop-word">${esc(card.word)}</span>
          <span class="rd-pop-kana">${pitchHtml(card.kana, card.acc)}</span>
          <span class="rd-pop-lv">${card.level}</span>
          <button type="button" class="rd-pop-close" aria-label="關閉">✕</button>
        </div>
        <div class="rd-pop-zh">${esc(card.zh)}${card.pos ? `　<em>${esc(card.pos)}</em>` : ''}</div>
        <div class="rd-pop-actions">
          ${known ? '<span class="rd-pop-note">✓ 已在複習中</span>'
            : queued ? '<span class="rd-pop-note">✓ 已在學習佇列</span>'
            : '<button type="button" class="btn-primary rd-pop-add">＋ 加入學習</button>'}
        </div>`;
      pop.querySelector('.rd-pop-close').onclick = () => { pop.hidden = true; };
      const add = pop.querySelector('.rd-pop-add');
      if (add) add.onclick = () => {
        ctx.onAddWord(card);
        add.replaceWith(Object.assign(document.createElement('span'), { className: 'rd-pop-note', textContent: '✓ 已加入學習佇列' }));
      };
    }));
  }

  inputView();
}
