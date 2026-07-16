// 詞彙量檢定: a short stratified placement test. Samples words from every
// level's deck, asks 4-choice meaning questions, corrects for guessing, and
// extrapolates an estimated vocabulary size mapped to a JLPT level. Runs
// completely outside the SRS — no grades, no daily activity.

export const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];

// Approximate incremental vocabulary each JLPT band adds (commonly cited
// cumulative targets: 800 / 1500 / 3750 / 6000 / 10000).
export const LEVEL_INCREMENTS = { n5: 800, n4: 700, n3: 2250, n2: 2250, n1: 4000 };
export const LEVEL_CUMULATIVE = { n5: 800, n4: 1500, n3: 3750, n2: 6000, n1: 10000 };

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Stratified sample: perLevel cards from each non-empty level, shuffled. */
export function sampleTest(decks, perLevel = 8, rnd = Math.random) {
  const questions = [];
  for (const lv of LEVELS) {
    const deck = decks[lv] || [];
    for (const card of shuffle(deck, rnd).slice(0, perLevel)) questions.push({ card, level: lv });
  }
  return shuffle(questions, rnd);
}

/** Correct a raw 4-choice accuracy for guessing (chance = 25%). */
export function correctForGuessing(raw) {
  return Math.max(0, (raw - 0.25) / 0.75);
}

/**
 * results: [{ level, correct }] → per-level corrected rates, estimated
 * vocabulary size, and the highest JLPT band whose cumulative target the
 * estimate reaches (null when below N5).
 */
export function estimate(results) {
  const rates = {};
  let size = 0;
  for (const lv of LEVELS) {
    const rs = results.filter(r => r.level === lv);
    if (!rs.length) { rates[lv] = 0; continue; }
    const raw = rs.filter(r => r.correct).length / rs.length;
    const rate = correctForGuessing(raw);
    rates[lv] = rate;
    size += rate * LEVEL_INCREMENTS[lv];
  }
  size = Math.round(size / 10) * 10;
  let recommended = null;
  for (const lv of LEVELS) if (size >= LEVEL_CUMULATIVE[lv]) recommended = lv;
  return { size, rates, recommended };
}

/** Union test histories from two devices by timestamp; keep the last `cap`. */
export function mergeTests(a = [], b = [], cap = 20) {
  const byAt = new Map();
  for (const t of [...a, ...b]) if (t && t.at) byAt.set(t.at, t);
  return [...byAt.values()].sort((x, y) => x.at - y.at).slice(-cap);
}

// ---------------------------------------------------------------- interactive flow

import { pickDistractors } from './modes/quiz.js';
import { stamp } from './ui.js';

const LEVEL_LABEL = { n5: 'N5', n4: 'N4', n3: 'N3', n2: 'N2', n1: 'N1' };

/**
 * Run the placement test on `root`. decks: {lv: [cards]} (all levels loaded).
 * history: prior test records for the result screen. onDone(record) fires once
 * with { at, size, rates, recommended }; onExit() when the learner leaves.
 */
export function mountVocabTest(root, decks, history, onDone, onExit) {
  const questions = sampleTest(decks);
  const results = [];

  function intro() {
    root.innerHTML = `
      <div class="card-wrap vt-wrap">
        <h2 class="vt-title">📏 詞彙量檢定</h2>
        <p class="vt-desc">${questions.length} 題四選一（每級抽樣），約 4 分鐘。<br>結果只作估計，不影響複習排程。</p>
        <div class="vt-actions">
          <button type="button" class="btn-ghost" id="vt-cancel">返回</button>
          <button type="button" class="btn-primary" id="vt-start">開始</button>
        </div>
      </div>`;
    root.querySelector('#vt-start').onclick = () => question(0);
    root.querySelector('#vt-cancel').onclick = () => onExit();
  }

  function question(i) {
    if (i >= questions.length) return finish();
    const { card, level } = questions[i];
    const answer = card.zh;
    const options = [answer, ...pickDistractors(card, decks[level] || [], 3, Math.random, 'zh')]
      .map(val => ({ val, correct: val === answer }))
      .sort(() => Math.random() - 0.5);
    root.innerHTML = `
      <div class="card-wrap vt-wrap">
        <div class="vt-progress">第 ${i + 1} / ${questions.length} 題</div>
        <div class="prompt">
          <span class="jp">${card.word}</span>
          ${card.word === card.kana ? '' : `<span class="kana">${card.kana}</span>`}
        </div>
        <div class="options"></div>
        <button type="button" class="vt-skip">不認識，跳過 →</button>
      </div>`;
    const box = root.querySelector('.options');
    for (const opt of options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'opt';
      b.textContent = opt.val;
      b.onclick = () => {
        results.push({ level, correct: opt.correct });
        stamp(b, opt.correct);
        [...box.children].forEach(c => (c.disabled = true));
        setTimeout(() => question(i + 1), 350);
      };
      box.appendChild(b);
    }
    root.querySelector('.vt-skip').onclick = () => {
      results.push({ level, correct: false });
      question(i + 1);
    };
  }

  function finish() {
    const { size, rates, recommended } = estimate(results);
    const record = { at: Date.now(), size, rates, recommended };
    onDone(record);
    const all = mergeTests(history, [record]);
    root.innerHTML = `
      <div class="card-wrap vt-wrap">
        <h2 class="vt-title">檢定結果</h2>
        <div class="vt-size">約 <b>${size}</b> 詞</div>
        <div class="vt-reco">${recommended ? `已達 ${LEVEL_LABEL[recommended]} 詞彙量門檻` : '尚未達 N5 詞彙量門檻，繼續加油！'}</div>
        <div class="mastery-list vt-rates">
          ${LEVELS.map(lv => `
            <div class="mastery">
              <span class="mastery-lv">${LEVEL_LABEL[lv]}</span>
              <span class="mastery-bar"><span class="mastery-mature" style="width:${Math.round(rates[lv] * 100)}%"></span></span>
              <span class="mastery-nums">${Math.round(rates[lv] * 100)}%</span>
            </div>`).join('')}
        </div>
        ${all.length > 1 ? `<div class="vt-history">
          <h3>歷史紀錄</h3>
          ${all.slice(-6).reverse().map(t => `<div class="vt-hrow"><span>${new Date(t.at).toLocaleDateString()}</span><b>${t.size} 詞</b></div>`).join('')}
        </div>` : ''}
        <div class="vt-actions"><button type="button" class="btn-primary" id="vt-done">完成</button></div>
      </div>`;
    root.querySelector('#vt-done').onclick = () => onExit();
  }

  intro();
}
