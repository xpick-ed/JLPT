export const SOURCES = [
  { name: 'NHK NEWS WEB EASY', url: 'https://www3.nhk.or.jp/news/easy/', level: 'N4–N3', desc: '每日新聞、全文振假名、朗讀語音、難詞查辭典（主打）' },
  { name: 'Watanoc', url: 'https://watanoc.com/', level: 'N5–N3', desc: '免費分級日語雜誌，生活・文化' },
  { name: 'MATCHA（やさしい日本語）', url: 'https://matcha-jp.com/easy', level: 'N4–N3', desc: '觀光・文化，簡易日語版' },
  { name: '福娘童話集', url: 'https://hukumusume.com/douwa/', level: 'N5–N4', desc: '日本童話・昔話短文，附假名' },
  { name: 'NHK NEWS WEB', url: 'https://www3.nhk.or.jp/news/', level: 'N2–N1', desc: '真實時事新聞（無振假名）' },
  { name: '青空文庫', url: 'https://www.aozora.gr.jp/', level: 'N2–N1', desc: '免費經典文學（進階挑戰）' },
];

/** Render the daily-reading launcher: usage hint + source cards + footnote. */
export function mountReading(root) {
  root.innerHTML = `
    <div class="read-wrap">
      <p class="read-hint">每天讀一篇：先不查字通讀一遍抓大意，再回頭查生詞。</p>
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
      <p class="read-foot">以上皆連結至外部網站，於新分頁開啟。</p>
    </div>`;
}
