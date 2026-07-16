// 跟讀 (shadowing): the TTS reads example sentences at a chosen speed; the
// learner repeats aloud. Subtitles and the translation can be hidden to force
// listening. Pure exposure practice — deliberately no grading, no SRS.

import { furiganaToRuby } from '../furigana.js';
import { speakJa, ttsAvailable } from './listening.js';
import { speechText } from './dictation.js';

export const SPEEDS = [
  { rate: 0.7, label: '0.7x' },
  { rate: 0.85, label: '0.85x' },
  { rate: 1.0, label: '1.0x' },
  { rate: 1.15, label: '1.15x' },
];

/** Shuffled cycle over the pool's cards that actually have an example. */
export function shadowQueue(pool, rnd = Math.random) {
  const ids = pool.filter(c => c.ex).map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}

export function mountShadow(root, pool) {
  const order = shadowQueue(pool);
  if (!order.length) {
    root.innerHTML = '<div class="done"><div class="done-emoji">📚</div><p class="done-msg">這個範圍沒有例句</p></div>';
    return;
  }
  const byId = new Map(pool.map(c => [c.id, c]));
  let i = 0;
  let rate = 0.85;
  let showJp = true, showZh = true;
  const supported = ttsAvailable();

  function card() { return byId.get(order[i % order.length]); }
  function play() { speakJa(speechText(card().ex), rate); }

  function render() {
    const c = card();
    root.innerHTML = `
      <div class="card-wrap shadow-wrap">
        <div class="prompt">
          <button type="button" class="listen-play" aria-label="播放">🔊</button>
          <span class="listen-hint">${supported ? '聽一句、跟著唸一句（影子跟讀）' : '此瀏覽器不支援語音合成'}</span>
        </div>
        <div class="chip-row shadow-speeds">
          ${SPEEDS.map(s => `<button type="button" class="chip${s.rate === rate ? ' active' : ''}" data-rate="${s.rate}">${s.label}</button>`).join('')}
        </div>
        <div class="shadow-jp${showJp ? '' : ' shadow-hidden'}">${furiganaToRuby(c.ex)}</div>
        <div class="shadow-zh${showZh ? '' : ' shadow-hidden'}">${c.ex_zh || ''}</div>
        <div class="shadow-word">${c.word}（${c.kana}）— ${c.zh}</div>
        <div class="vt-actions">
          <button type="button" class="btn-ghost" id="sh-jp">${showJp ? '隱藏字幕' : '顯示字幕'}</button>
          <button type="button" class="btn-ghost" id="sh-zh">${showZh ? '隱藏中譯' : '顯示中譯'}</button>
          <button type="button" class="btn-primary" id="sh-next">下一句 →</button>
        </div>
        <div class="shadow-count">${(i % order.length) + 1} / ${order.length}</div>
      </div>`;
    root.querySelector('.listen-play').addEventListener('click', play);
    root.querySelectorAll('.shadow-speeds .chip').forEach(b => b.addEventListener('click', () => {
      rate = Number(b.dataset.rate);
      render();
      play();
    }));
    root.querySelector('#sh-jp').addEventListener('click', () => { showJp = !showJp; render(); });
    root.querySelector('#sh-zh').addEventListener('click', () => { showZh = !showZh; render(); });
    root.querySelector('#sh-next').addEventListener('click', () => { i += 1; render(); play(); });
  }

  render();
  if (supported) play();
}
