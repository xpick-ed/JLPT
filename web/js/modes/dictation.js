// 聽寫重組: the example sentence is read aloud (TTS); the learner rebuilds it
// from shuffled fragments. Sentence-level listening — closer to real 聽解 than
// single-word audio. Audio disambiguates the order, so exact-order grading is fair.

import { furiganaToRuby } from '../furigana.js';
import { speakJa, ttsAvailable } from './listening.js';
import { stamp } from '../ui.js';

// Same particle-boundary idea as the particle mode: cut AFTER particles that
// follow a kanji or a furigana group, and after punctuation.
const CUT_AFTER = /(）|[一-龯])(から|まで|は|が|を|に|で|と|も|へ)/g;

/** Strip furigana so TTS reads the plain sentence (kanji + kana). */
export function speechText(ex) {
  return (ex || '').replace(/（[^）]*）/g, '');
}

/**
 * Split the furigana-annotated example into 3–5 orderable fragments, cutting
 * after particles and punctuation, then merging tiny pieces. Returns null when
 * the sentence is too short to make a meaningful reorder.
 */
export function chunkSentence(ex) {
  if (!ex) return null;
  const cuts = new Set();
  CUT_AFTER.lastIndex = 0;
  let m;
  while ((m = CUT_AFTER.exec(ex))) {
    cuts.add(m.index + m[0].length);
    CUT_AFTER.lastIndex = m.index + m[0].length;
  }
  for (let i = 0; i < ex.length; i++) if ('、。'.includes(ex[i])) cuts.add(i + 1);
  const points = [...cuts].sort((a, b) => a - b).filter(p => p > 0 && p < ex.length);
  let frags = [];
  let prev = 0;
  for (const p of points) { frags.push(ex.slice(prev, p)); prev = p; }
  frags.push(ex.slice(prev));
  frags = frags.filter(f => f.length);
  // cap at 5 fragments (fold the tail into the fifth) …
  const merged = [];
  for (const f of frags) {
    if (merged.length >= 5) merged[merged.length - 1] += f;
    else merged.push(f);
  }
  // … then fold any fragment shorter than 2 visible chars into a neighbour
  const visible = f => f.replace(/（[^）]*）/g, '').length;
  for (let i = merged.length - 1; i >= 0 && merged.length > 1; i--) {
    if (visible(merged[i]) >= 2) continue;
    if (i > 0) { merged[i - 1] += merged[i]; merged.splice(i, 1); }
    else { merged[1] = merged[0] + merged[1]; merged.splice(0, 1); }
  }
  if (merged.length < 3) return null;
  return merged;
}

/** Mount one dictation question. Caller ensures chunkSentence(card.ex) ≠ null. */
export function mountDictation(root, card, onResult, audio) {
  const start = performance.now();
  const frags = chunkSentence(card.ex).map((f, idx) => ({ f, idx }));
  const shuffled = frags.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const supported = ttsAvailable();
  const placed = [];

  root.innerHTML = `
    <div class="card-wrap vt-wrap dictation-wrap">
      <div class="prompt">
        <button type="button" class="listen-play" aria-label="再聽一次">🔊</button>
        <span class="listen-hint">${supported ? '聽句子，把片段排回原句' : '此瀏覽器不支援語音合成，依中譯排序'}</span>
      </div>
      <div class="excloze-zh">${card.ex_zh || ''}</div>
      <div class="cloze-sentence exam-order-line"><span class="exam-placed"></span></div>
      <div class="exam-frags"></div>
      <div class="listen-reveal" hidden></div>
      <button type="button" class="vt-skip" id="dict-reset">重排</button>
    </div>`;
  const fragBox = root.querySelector('.exam-frags');
  const placedEl = root.querySelector('.exam-placed');
  const reveal = root.querySelector('.listen-reveal');
  const card_ = root.querySelector('.card-wrap');

  const sayIt = () => speakJa(speechText(card.ex), 0.85);
  root.querySelector('.listen-play').addEventListener('click', sayIt);
  if (supported) sayIt();

  function finish() {
    const correct = placed.every((p, k) => p.idx === k);
    const elapsedMs = performance.now() - start;
    const grade = !correct ? 'again' : elapsedMs < 9000 ? 'easy' : elapsedMs < 20000 ? 'good' : 'hard';
    if (correct) audio.hit();
    else {
      audio.wrong();
      card_.classList.add('shake');
      reveal.hidden = false;
      reveal.innerHTML = `正解：${furiganaToRuby(card.ex)}`;
    }
    stamp(placedEl, correct);
    fragBox.innerHTML = '';
    root.querySelector('#dict-reset').disabled = true;
    setTimeout(() => { if (ttsAvailable()) speechSynthesis.cancel(); onResult(card.id, grade); }, correct ? 900 : 2200);
  }

  function render() {
    placedEl.innerHTML = placed.map(p => furiganaToRuby(p.f)).join('');
    fragBox.innerHTML = '';
    for (const fr of shuffled) {
      if (placed.includes(fr)) continue;
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt exam-frag';
      b.innerHTML = furiganaToRuby(fr.f);
      b.onclick = () => {
        placed.push(fr);
        placed.length === frags.length ? finish() : render();
      };
      fragBox.appendChild(b);
    }
  }
  root.querySelector('#dict-reset').addEventListener('click', () => { placed.length = 0; render(); });
  render();
}
