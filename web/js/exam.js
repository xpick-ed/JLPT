// 模擬考: a timed, JLPT-style mixed paper for one level — vocabulary meaning,
// grammar cloze, and sentence ordering, answered without feedback, scored at
// submission. Runs entirely outside the SRS. History persists in state.exams.

import { pickDistractors } from './modes/quiz.js';
import { furiganaToRuby } from './furigana.js';
import { mergeTests } from './vocab-test.js';

export const EXAM_SPEC = { vocab: 20, cloze: 15, order: 5, timeLimitMs: 15 * 60 * 1000 };

function shuffle(arr, rnd) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Sample a sequential paper from one level's decks:
 * decks = { vocab: [...], cloze: [...], order: [...] } → [{ kind, item }].
 * Sections stay in JLPT order (語彙 → 文法 → 並べ替え); counts clamp to deck size.
 */
export function buildExam(decks, spec = EXAM_SPEC, rnd = Math.random) {
  const pick = (arr, n) => shuffle(arr || [], rnd).slice(0, n);
  return [
    ...pick(decks.vocab, spec.vocab).map(item => ({ kind: 'vocab', item })),
    ...pick(decks.cloze, spec.cloze).map(item => ({ kind: 'cloze', item })),
    ...pick(decks.order, spec.order).map(item => ({ kind: 'order', item })),
  ];
}

/** answers: [{ kind, correct }] → totals and a per-section breakdown. */
export function scoreExam(answers) {
  const sections = {};
  let correct = 0;
  for (const a of answers) {
    const s = (sections[a.kind] ||= { asked: 0, correct: 0 });
    s.asked += 1;
    if (a.correct) { s.correct += 1; correct += 1; }
  }
  const total = answers.length;
  return { total, correct, pct: total ? Math.round(correct / total * 100) : 0, sections };
}

export function verdictFor(pct) {
  if (pct >= 80) return { label: '合格圈內', hint: '維持節奏，考前做整卷計時演練即可。' };
  if (pct >= 60) return { label: '及格邊緣', hint: '把下面的錯題弱項補強，再測一次。' };
  return { label: '需要加強', hint: '先回到弱點複習與文法模式打底，再回來模擬。' };
}

export const SECTION_LABEL = { vocab: '文字・語彙', cloze: '文法（四選一）', order: '文法（並べ替え）' };
const LEVEL_LABEL = { n5: 'N5', n4: 'N4', n3: 'N3', n2: 'N2', n1: 'N1' };

// ---------------------------------------------------------------- interactive flow

function fmtTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/**
 * Mount the mock exam. opts:
 *   levels: selectable levels; defaultLevel; loadDecks(lv) → Promise<decks>;
 *   history: prior exam records; onDone(record); onExit().
 */
export function mountExam(root, { levels, defaultLevel, loadDecks, history, onDone, onExit }) {
  let level = defaultLevel;

  function intro() {
    root.innerHTML = `
      <div class="card-wrap vt-wrap">
        <h2 class="vt-title">📝 模擬考</h2>
        <p class="vt-desc">單級 ${EXAM_SPEC.vocab + EXAM_SPEC.cloze + EXAM_SPEC.order} 題（語彙 ${EXAM_SPEC.vocab}・文法 ${EXAM_SPEC.cloze}・並べ替え ${EXAM_SPEC.order}），限時 ${EXAM_SPEC.timeLimitMs / 60000} 分鐘。<br>作答中不顯示對錯，交卷後給成績與錯題。不影響複習排程。</p>
        <div class="chip-row exam-levels">
          ${levels.map(lv => `<button type="button" class="chip${lv === level ? ' active' : ''}" data-lv="${lv}">${LEVEL_LABEL[lv]}</button>`).join('')}
        </div>
        <div class="vt-actions">
          <button type="button" class="btn-ghost" id="ex-cancel">返回</button>
          <button type="button" class="btn-primary" id="ex-start">開始</button>
        </div>
      </div>`;
    root.querySelectorAll('.exam-levels .chip').forEach(b => b.onclick = () => { level = b.dataset.lv; intro(); });
    root.querySelector('#ex-cancel').onclick = () => onExit();
    root.querySelector('#ex-start').onclick = async () => {
      const decks = await loadDecks(level);
      run(buildExam(decks, EXAM_SPEC), decks);
    };
  }

  function run(questions, decks) {
    const answers = [];
    const wrong = [];
    const startedAt = performance.now();
    let submitted = false;

    const timerEl = () => root.querySelector('.exam-timer');
    const timer = setInterval(() => {
      const el = timerEl();
      if (!el) { clearInterval(timer); return; }      // stage was remounted → self-clean
      const left = EXAM_SPEC.timeLimitMs - (performance.now() - startedAt);
      el.textContent = fmtTime(left);
      el.classList.toggle('exam-timer-low', left < 60000);
      if (left <= 0) submit();                        // time up → grade what's answered
    }, 250);

    function head(i) {
      return `<div class="exam-head">
        <span class="vt-progress">第 ${i + 1} / ${questions.length} 題</span>
        <span class="exam-timer">${fmtTime(EXAM_SPEC.timeLimitMs - (performance.now() - startedAt))}</span>
      </div>`;
    }
    function record(q, correct, chosen, correctText) {
      answers.push({ kind: q.kind, correct });
      if (!correct) wrong.push({ q, chosen, correctText });
    }

    function question(i) {
      if (submitted) return;
      if (i >= questions.length) return submit();
      const q = questions[i];
      if (q.kind === 'vocab') {
        const card = q.item;
        const answer = card.zh;
        const options = [answer, ...pickDistractors(card, decks.vocab, 3, Math.random, 'zh')]
          .map(val => ({ val, correct: val === answer })).sort(() => Math.random() - 0.5);
        root.innerHTML = `
          <div class="card-wrap vt-wrap">${head(i)}
            <div class="prompt"><span class="jp">${card.word}</span>${card.word === card.kana ? '' : `<span class="kana">${card.kana}</span>`}</div>
            <div class="options"></div>
          </div>`;
        const box = root.querySelector('.options');
        for (const opt of options) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'opt'; b.textContent = opt.val;
          b.onclick = () => { record(q, opt.correct, opt.val, answer); question(i + 1); };
          box.appendChild(b);
        }
      } else if (q.kind === 'cloze') {
        const item = q.item;
        const options = shuffle([item.answer, ...item.distractors], Math.random);
        root.innerHTML = `
          <div class="card-wrap vt-wrap">${head(i)}
            <div class="cloze-sentence">${furiganaToRuby(item.before)}<span class="cloze-blank" aria-label="填空"></span>${furiganaToRuby(item.after)}</div>
            <div class="excloze-zh">${item.ex_zh || ''}</div>
            <div class="options"></div>
          </div>`;
        const box = root.querySelector('.options');
        for (const val of options) {
          const b = document.createElement('button');
          b.type = 'button'; b.className = 'opt'; b.textContent = val;
          b.onclick = () => { record(q, val === item.answer, val, item.answer); question(i + 1); };
          box.appendChild(b);
        }
      } else {
        const item = q.item;
        const frags = shuffle(item.frags.map((f, idx) => ({ f, idx })), Math.random);
        const placed = [];
        root.innerHTML = `
          <div class="card-wrap vt-wrap">${head(i)}
            <div class="cloze-sentence exam-order-line">${furiganaToRuby(item.before)}<span class="exam-placed"></span>${furiganaToRuby(item.after)}</div>
            <div class="excloze-zh">${item.ex_zh || ''}</div>
            <div class="exam-frags"></div>
            <button type="button" class="vt-skip" id="ex-reset">重排</button>
          </div>`;
        const fragBox = root.querySelector('.exam-frags');
        const placedEl = root.querySelector('.exam-placed');
        function renderFrags() {
          placedEl.innerHTML = placed.map(p => furiganaToRuby(p.f)).join('');
          fragBox.innerHTML = '';
          for (const fr of frags) {
            if (placed.includes(fr)) continue;
            const b = document.createElement('button');
            b.type = 'button'; b.className = 'opt exam-frag';
            b.innerHTML = furiganaToRuby(fr.f);
            b.onclick = () => {
              placed.push(fr);
              if (placed.length === item.frags.length) {
                const correct = placed.every((p, k) => p.idx === k);
                record(q, correct, placed.map(p => p.f).join(''), item.frags.join(''));
                question(i + 1);
              } else renderFrags();
            };
            fragBox.appendChild(b);
          }
        }
        root.querySelector('#ex-reset').onclick = () => { placed.length = 0; renderFrags(); };
        renderFrags();
      }
    }

    function submit() {
      if (submitted) return;
      submitted = true;
      clearInterval(timer);
      const seconds = Math.round((performance.now() - startedAt) / 1000);
      const score = scoreExam(answers);
      const record_ = { at: Date.now(), level, pct: score.pct, correct: score.correct, total: questions.length, sections: score.sections, seconds };
      onDone(record_);
      result(score, record_, seconds);
    }

    function result(score, record_, seconds) {
      const v = verdictFor(score.pct);
      const all = mergeTests(history, [record_]);
      root.innerHTML = `
        <div class="card-wrap vt-wrap exam-result">
          <h2 class="vt-title">${LEVEL_LABEL[level]} 模擬考結果</h2>
          <div class="vt-size"><b>${score.pct}</b> 分</div>
          <div class="vt-reco">${v.label}（答對 ${score.correct}/${score.total}，用時 ${fmtTime(seconds * 1000)}）</div>
          <p class="vt-desc">${v.hint}</p>
          <div class="mastery-list vt-rates">
            ${Object.entries(score.sections).map(([k, s]) => `
              <div class="mastery">
                <span class="mastery-lv exam-sec">${SECTION_LABEL[k]}</span>
                <span class="mastery-bar"><span class="mastery-mature" style="width:${s.asked ? Math.round(s.correct / s.asked * 100) : 0}%"></span></span>
                <span class="mastery-nums">${s.correct}/${s.asked}</span>
              </div>`).join('')}
          </div>
          ${wrong.length ? `<div class="exam-wrong">
            <h3>錯題（${wrong.length}）</h3>
            ${wrong.map(w => `
              <div class="exam-wrow">
                <div class="exam-wq">${w.q.kind === 'vocab'
                  ? `${w.q.item.word}（${w.q.item.kana}）`
                  : furiganaToRuby((w.q.item.before || '') + '＿＿' + (w.q.item.after || ''))}</div>
                <div class="exam-wa">正解：<b>${w.q.kind === 'order' ? furiganaToRuby(w.correctText) : w.correctText}</b>${w.q.item.zh ? `　${w.q.item.zh}` : w.q.item.meaning_zh ? `　${w.q.item.meaning_zh}` : ''}</div>
              </div>`).join('')}
          </div>` : ''}
          ${all.length > 1 ? `<div class="vt-history">
            <h3>歷史紀錄</h3>
            ${all.slice(-6).reverse().map(t => `<div class="vt-hrow"><span>${new Date(t.at).toLocaleDateString()}　${LEVEL_LABEL[t.level] || ''}</span><b>${t.pct} 分</b></div>`).join('')}
          </div>` : ''}
          <div class="vt-actions"><button type="button" class="btn-primary" id="ex-done">完成</button></div>
        </div>`;
      root.querySelector('#ex-done').onclick = () => onExit();
    }

    question(0);
  }

  intro();
}
