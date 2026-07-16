// 聽力 mode: the browser's speech synthesis reads the word aloud (ja-JP);
// the learner picks the matching meaning (meaning pairMode) or the matching
// kanji spelling (reading pairMode) from four choices. Zero assets — TTS only.

import { pickDistractors } from './quiz.js';
import { particles, stamp } from '../ui.js';

// Prefer a Japanese voice; null just means "let the engine pick by lang".
export function pickJaVoice(voices) {
  if (!Array.isArray(voices)) return null;
  return voices.find(v => /^ja-JP$/i.test(v.lang || ''))
    || voices.find(v => /^ja/i.test(v.lang || ''))
    || null;
}

// Listening needs a little more time than reading a prompt.
export function gradeListening({ correct, elapsedMs }) {
  if (!correct) return 'again';
  if (elapsedMs < 2500) return 'easy';
  if (elapsedMs > 9000) return 'hard';
  return 'good';
}

export function ttsAvailable() {
  return typeof speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined';
}

/** Shared Japanese TTS for every speech mode (listening/dictation/shadowing). */
export function speakJa(text, rate = 0.9) {
  if (!ttsAvailable()) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  const v = pickJaVoice(speechSynthesis.getVoices());
  if (v) u.voice = v;
  speechSynthesis.speak(u);
}
const speak = speakJa;

/**
 * Mount a single listening question.
 * card: {id, word, kana, zh, ...}; pool for distractors; onResult(id, grade).
 * pairMode 'meaning' → options are Chinese meanings; 'reading' → kanji spellings.
 */
export function mountListening(root, card, pool, onResult, audio, pairMode = 'meaning') {
  const start = performance.now();
  const wordVariant = pairMode === 'reading';
  const field = wordVariant ? 'word' : 'zh';
  const answer = card[field];
  const options = [answer, ...pickDistractors(card, pool, 3, Math.random, field)]
    .map(val => ({ val, correct: val === answer }))
    .sort(() => Math.random() - 0.5);
  const supported = ttsAvailable();

  root.innerHTML = `
    <div class="card-wrap listen-wrap">
      <div class="prompt">
        <button type="button" class="listen-play" aria-label="再聽一次">🔊</button>
        <span class="listen-hint">${supported
          ? `聽發音，選出正確的${wordVariant ? '寫法' : '意思'}`
          : '此瀏覽器不支援語音合成，改為顯示假名'}</span>
        ${supported ? '' : `<span class="kana">${card.kana}</span>`}
      </div>
      <div class="listen-reveal" hidden></div>
      <div class="options"></div>
    </div>`;
  const box = root.querySelector('.options');
  const card_ = root.querySelector('.card-wrap');
  const reveal = root.querySelector('.listen-reveal');
  const play = root.querySelector('.listen-play');

  const sayIt = () => speak(card.kana);
  play.addEventListener('click', sayIt);
  if (supported) sayIt();

  for (const opt of options) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'opt';
    b.textContent = opt.val;
    b.onclick = () => {
      const elapsedMs = performance.now() - start;
      const grade = gradeListening({ correct: opt.correct, elapsedMs });
      b.classList.add(opt.correct ? 'right' : 'wrong');
      if (opt.correct) {
        audio.hit();
        const rect = b.getBoundingClientRect();
        particles(rect.left + rect.width / 2, rect.top + rect.height / 2);
      } else {
        audio.wrong();
        card_.classList.add('shake');
        const correctBtn = [...box.children].find(c => c.textContent === answer);
        if (correctBtn) correctBtn.classList.add('right');
      }
      stamp(b, opt.correct);
      [...box.children].forEach(c => (c.disabled = true));
      reveal.hidden = false;
      reveal.textContent = `${card.word}（${card.kana}）— ${card.zh}`;
      setTimeout(() => { if (ttsAvailable()) speechSynthesis.cancel(); onResult(card.id, grade); }, 1300);
    };
    box.appendChild(b);
  }
}
