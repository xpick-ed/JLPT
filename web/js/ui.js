import { DEFAULT_SETTINGS } from './store.js';
import { BGM_STYLES, normalizeStyle } from './bgm.js';
import { currentStreak, dailySummary, isWeakCard } from './progress.js';
import { ACHIEVEMENTS, questProgress } from './achievements.js';
import { heatmapCells, intensity, levelMastery, totals } from './stats.js';

function esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c])); }

const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];
const CONTENTS = [
  { id: 'vocab', label: '單字' },
  { id: 'grammar', label: '文法' },
  { id: 'drill', label: '特訓' },
  { id: 'reading', label: '閱讀' },
];
const MODES_BY_CONTENT = {
  vocab: [
    { id: 'match', label: '配對' },
    { id: 'typing', label: '打字' },
    { id: 'quiz', label: '四選一' },
    { id: 'falling', label: '落下' },
  ],
  grammar: [
    { id: 'cloze', label: '四選一' },
    { id: 'order', label: '排列重組' },
    { id: 'dict', label: '字典' },
  ],
  // 特訓: study-focused single-card modes over the vocabulary decks.
  drill: [
    { id: 'excloze', label: '例句' },
    { id: 'particle', label: '助詞' },
    { id: 'homophone', label: '同音' },
    { id: 'listen', label: '聽力' },
    { id: 'dictation', label: '聽寫' },
    { id: 'shadow', label: '跟讀' },
  ],
  reading: [],
};

let currentMode = 'match';
let settingsOpen = false;
let trophyOpen = false;

/** Programmatic mode switch (e.g. dictionary → practice) keeps the tabs in sync. */
export function setCurrentMode(m) { currentMode = m; }

// Theme toggle cycles system → dark → light → system.
const THEME_ORDER = ['system', 'dark', 'light'];
const THEME_META = {
  system: { icon: '◐', title: '主題：跟隨系統（點擊切換）' },
  dark:   { icon: '☾', title: '主題：深色（點擊切換）' },
  light:  { icon: '☀', title: '主題：淺色（點擊切換）' },
};

function fxLayer() {
  return document.getElementById('fx-layer') || document.body;
}

/** Small red 丸 (correct) / ink 叉 (wrong) hanko-style stamp thumped onto `el`. */
export function stamp(el, ok) {
  if (!el) return;
  const rect = el.getBoundingClientRect();
  const mark = document.createElement('div');
  mark.className = `stamp-mark ${ok ? 'stamp-ok' : 'stamp-no'}`;
  mark.textContent = ok ? '◯' : '✕';
  mark.style.left = `${rect.left + rect.width / 2}px`;
  mark.style.top = `${rect.top + rect.height / 2}px`;
  fxLayer().appendChild(mark);
  setTimeout(() => mark.remove(), 650);
}

/** Small burst of ink/vermilion/gold particles at viewport coords (x, y). */
export function particles(x, y) {
  const layer = fxLayer();
  const colors = ['var(--shu)', 'var(--kin)', 'var(--ink)'];
  const n = 12;
  for (let i = 0; i < n; i++) {
    const p = document.createElement('span');
    p.className = 'particle';
    const angle = (Math.PI * 2 * i) / n + Math.random() * 0.5;
    const dist = 40 + Math.random() * 50;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist}px`);
    p.style.left = `${x}px`;
    p.style.top = `${y}px`;
    p.style.background = colors[i % colors.length];
    layer.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}

/** Falling torn-washi confetti filling `root`'s bounding box. */
export function confetti(root) {
  const target = root || fxLayer();
  const rect = target.getBoundingClientRect ? target.getBoundingClientRect() : { left: 0, top: 0, width: innerWidth, height: 0 };
  const layer = fxLayer();
  const colors = ['var(--shu)', 'var(--kin)', 'var(--ink)', 'var(--surface-strong)'];
  const n = 60;
  for (let i = 0; i < n; i++) {
    const c = document.createElement('span');
    c.className = 'confetti-piece';
    const left = rect.left + Math.random() * (rect.width || innerWidth);
    c.style.left = `${left}px`;
    c.style.top = `${Math.max(rect.top, 0) - 20}px`;
    c.style.background = colors[i % colors.length];
    c.style.setProperty('--rot', `${Math.random() * 720 - 360}deg`);
    c.style.setProperty('--drift', `${Math.random() * 160 - 80}px`);
    c.style.animationDuration = `${1400 + Math.random() * 900}ms`;
    c.style.animationDelay = `${Math.random() * 250}ms`;
    layer.appendChild(c);
    setTimeout(() => c.remove(), 2800);
  }
}

/** Transient top-center notification (achievements, quest completions). */
export function showToast(text) {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    document.body.appendChild(stack);
  }
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = text;
  stack.appendChild(t);
  setTimeout(() => t.classList.add('toast-out'), 2600);
  setTimeout(() => t.remove(), 3100);
}

function questItemsHtml(state) {
  return questProgress(state).map(q => `
    <div class="quest${q.done ? ' quest-done' : ''}">
      <span class="quest-check">${q.done ? '✓' : '○'}</span>
      <span class="quest-title">${esc(q.title)}</span>
      <span class="quest-count">${q.value}/${q.goal}</span>
      <span class="quest-bar"><span style="width:${Math.round(q.value / q.goal * 100)}%"></span></span>
    </div>`).join('');
}

function statsHtml(state, dataByLevel) {
  const cells = heatmapCells(state, { weeks: 20 });
  const t = totals(state);
  const hours = (t.seconds / 3600).toFixed(1);
  const mastery = levelMastery(state, dataByLevel, state.settings.levels);
  return `
    <div class="stats-totals">
      <span>累計 <b>${t.reviewed}</b> 題</span>
      <span>學習 <b>${hours}</b> 小時</span>
      <span>活躍 <b>${t.days}</b> 天</span>
      <span>最佳連擊 <b>${t.bestCombo}</b></span>
    </div>
    <div class="heatmap" role="img" aria-label="近 20 週每日學習熱力圖">
      ${cells.map(c => `<span class="hm hm-${intensity(c.count)}" title="${c.key}：${c.count} 題"></span>`).join('')}
    </div>
    ${mastery.length ? `<div class="mastery-list">
      ${mastery.map(m => `
        <div class="mastery">
          <span class="mastery-lv">${m.lv.toUpperCase()}</span>
          <span class="mastery-bar">
            <span class="mastery-seen" style="width:${Math.round(m.seen / m.total * 100)}%"></span>
            <span class="mastery-mature" style="width:${Math.round(m.mature / m.total * 100)}%"></span>
          </span>
          <span class="mastery-nums">${m.seen}/${m.total}<em>熟 ${m.mature}</em></span>
        </div>`).join('')}
      <div class="mastery-legend"><span class="lg lg-seen"></span>已學過　<span class="lg lg-mature"></span>已熟記（21 天+ 間隔）</div>
    </div>` : ''}`;
}

/** Fixed HUD for the global cross-mode streak; appears from 2 in a row. */
export function updateComboHud(c, { newRecord = false, tierUp = false } = {}) {
  const hud = document.getElementById('combo-hud');
  if (!hud) return;
  if (c.combo < 2) {
    hud.hidden = true;
    hud.classList.remove('combo-hud-hot', 'combo-hud-record');
    return;
  }
  hud.hidden = false;
  if (tierUp) {
    const r = hud.getBoundingClientRect();
    particles(r.left + r.width / 2, r.top + r.height / 2);
  }
  hud.innerHTML = `
    <span class="combo-hud-n">${c.combo}</span><span class="combo-hud-label">連擊</span>
    ${c.multiplier > 1 ? `<span class="combo-hud-x">×${c.multiplier}</span>` : ''}
    ${c.gained ? `<span class="combo-hud-gain">+${c.gained}</span>` : ''}
    ${newRecord ? '<span class="combo-hud-newbest">新紀錄！</span>' : ''}`;
  hud.classList.toggle('combo-hud-hot', c.combo >= 10);
  hud.classList.toggle('combo-hud-record', newRecord);
  hud.classList.remove('combo-hud-pop');
  void hud.offsetWidth;                      // restart the pop animation
  hud.classList.add('combo-hud-pop');
}

function categoriesFor(state, dataByLevel) {
  const seen = new Set();
  const cats = [];
  for (const lv of state.settings.levels) {
    for (const c of dataByLevel[lv] || []) {
      if (!seen.has(c.category)) { seen.add(c.category); cats.push(c.category); }
    }
  }
  return cats;
}

function computeStats(state, dataByLevel) {
  const cats = state.settings.categories;
  const poolIds = state.settings.levels.flatMap(lv => dataByLevel[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category))
    .filter(c => state.settings.content !== 'vocab'
      || state.settings.pairMode !== 'reading' || c.word !== c.kana)
    .map(c => c.id);
  const now = Date.now();
  const due = poolIds.filter(id => state.cards[id] && state.cards[id].due <= now).length;
  const freshIds = poolIds.filter(id => !state.cards[id]);
  const fresh = Math.min(freshIds.length, state.settings.newPerDay);
  const weak = poolIds.filter(id => isWeakCard(state.cards[id])).length;
  const today = dailySummary(state);
  const goal = Math.max(1, state.settings.dailyGoal || DEFAULT_SETTINGS.dailyGoal);
  return { due, fresh, weak, today, goal, streak: currentStreak(state) };
}

function setText(root, selector, value) {
  const el = root.querySelector(selector);
  if (el) el.textContent = String(value);
}

// Update counters after each answer without rebuilding the whole navigation.
export function updateStudyStats(root, state, getData) {
  if (!root) return;
  const { due, fresh, weak, today, goal, streak } = computeStats(state, getData());
  const accuracy = today.reviewed ? Math.round(today.correct / today.reviewed * 100) : 0;
  const progress = Math.min(100, Math.round(today.reviewed / goal * 100));
  setText(root, '[data-stat="due"]', due);
  setText(root, '[data-stat="fresh"]', fresh);
  setText(root, '[data-stat="reviewed"]', today.reviewed);
  setText(root, '[data-stat="goal"]', goal);
  setText(root, '[data-stat="accuracy"]', `${accuracy}%`);
  setText(root, '[data-stat="score"]', today.score || 0);
  setText(root, '[data-stat="streak"]', streak);
  setText(root, '[data-stat="weak"]', weak);
  const bar = root.querySelector('.today-progress-fill');
  if (bar) bar.style.width = `${progress}%`;
  const meter = root.querySelector('.today-progress-track');
  if (meter) meter.setAttribute('aria-valuenow', String(progress));
  const weakBtn = root.querySelector('.weak-review-btn');
  if (weakBtn) weakBtn.disabled = weak === 0;
  const questBox = root.querySelector('.quest-list');
  if (questBox) questBox.innerHTML = questItemsHtml(state);   // live quest progress while the panel is open
}

export function renderChrome(root, state, getData, handlers) {
  function afterAsync(maybePromise) {
    Promise.resolve(maybePromise).then(render);
  }

  function render() {
    const dataByLevel = getData();
    const { due, fresh, weak, today, goal, streak } = computeStats(state, dataByLevel);
    const accuracy = today.reviewed ? Math.round(today.correct / today.reviewed * 100) : 0;
    const progress = Math.min(100, Math.round(today.reviewed / goal * 100));
    const cats = categoriesFor(state, dataByLevel);
    const s = state.settings;
    const modes = MODES_BY_CONTENT[s.content] || MODES_BY_CONTENT.vocab;
    if (modes.length && !modes.some(m => m.id === currentMode)) currentMode = modes[0].id;
    const reading = s.content === 'reading';
    const account = handlers.getAccount ? handlers.getAccount() : null;

    root.innerHTML = `
      <div class="chrome-inner">
        <div class="chrome-row chrome-top">
          <div class="brand"><span class="hanko" aria-hidden="true">学</span><span class="brand-name">JLPT 學習道場</span></div>
          <div class="content-switch" role="tablist" aria-label="內容">
            ${CONTENTS.map(c => `<button type="button" class="content-tab${c.id === s.content ? ' active' : ''}" data-content="${c.id}" role="tab" aria-selected="${c.id === s.content}">${c.label}</button>`).join('')}
          </div>
          ${reading ? '' : `<nav class="tabs" role="tablist" aria-label="遊戲模式">
            ${modes.map(m => `<button type="button" class="tab${m.id === currentMode ? ' active' : ''}" data-mode="${m.id}" role="tab" aria-selected="${m.id === currentMode}">${m.label}</button>`).join('')}
          </nav>`}
          <div class="chrome-actions">
            <button type="button" class="trophy-btn" aria-label="任務與成就" aria-expanded="${trophyOpen}">🏅</button>
            <button type="button" class="theme-btn" aria-label="切換主題" title="${THEME_META[s.theme]?.title || THEME_META.system.title}">${THEME_META[s.theme]?.icon || THEME_META.system.icon}</button>
            <button type="button" class="gear-btn" aria-label="設定" aria-expanded="${settingsOpen}">⚙</button>
          </div>
        </div>
        ${reading ? '' : `<div class="chrome-row chrome-filters">
          <div class="chip-row levels" role="group" aria-label="級別">
            ${LEVELS.map(lv => `<button type="button" class="chip level-chip${s.levels.includes(lv) ? ' active' : ''}" data-lv="${lv}">${lv.toUpperCase()}</button>`).join('')}
          </div>
          <div class="chip-row categories" role="group" aria-label="分類">
            <button type="button" class="chip cat-chip${s.categories.length === 0 ? ' active' : ''}" data-cat="">全部</button>
            ${cats.map(c => `<button type="button" class="chip cat-chip${s.categories.includes(c) ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>`}
        ${reading ? '' : `<div class="chrome-row today-progress">
          <div class="today-progress-main">
            <div class="today-progress-label"><span>今日進度</span><b><span data-stat="reviewed">${today.reviewed}</span> / <span data-stat="goal">${goal}</span></b></div>
            <div class="today-progress-track" role="progressbar" aria-label="今日學習進度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${progress}">
              <span class="today-progress-fill" style="width:${progress}%"></span>
            </div>
          </div>
          <div class="today-metrics" aria-label="今日學習摘要">
            <span>正確率 <b data-stat="accuracy">${accuracy}%</b></span>
            <span>分數 <b data-stat="score">${today.score || 0}</b></span>
            <span>連續 <b data-stat="streak">${streak}</b> 天</span>
          </div>
        </div>
        <div class="chrome-row chrome-stats">
          <span class="stat stat-due">待複習 <b data-stat="due">${due}</b></span>
          <span class="stat stat-new">新內容 <b data-stat="fresh">${fresh}</b></span>
          <button type="button" class="weak-review-btn" ${weak ? '' : 'disabled'}>弱點複習 <b data-stat="weak">${weak}</b></button>
        </div>`}
      </div>
      <div class="settings-panel trophy-panel"${trophyOpen ? '' : ' hidden'}>
        <div class="settings-inner">
          <h2>今日任務</h2>
          <div class="quest-list">${questItemsHtml(state)}</div>
          <h2>學習統計</h2>
          <div class="stats-block">${statsHtml(state, dataByLevel)}</div>
          <div class="vt-launch">
            <button type="button" class="btn-ghost vocab-test-btn">📏 詞彙量檢定</button>
            ${(state.vocabTests || []).length ? (() => {
              const last = state.vocabTests[state.vocabTests.length - 1];
              return `<span class="vt-last">上次 ${new Date(last.at).toLocaleDateString()}：約 ${last.size} 詞</span>`;
            })() : '<span class="vt-last">測測你目前的詞彙量</span>'}
          </div>
          <div class="vt-launch">
            <button type="button" class="btn-ghost mock-exam-btn">📝 模擬考</button>
            ${(state.exams || []).length ? (() => {
              const last = state.exams[state.exams.length - 1];
              return `<span class="vt-last">上次 ${new Date(last.at).toLocaleDateString()}：${(last.level || '').toUpperCase()} ${last.pct} 分</span>`;
            })() : '<span class="vt-last">計時混合卷，考前實戰演練</span>'}
          </div>
          <h2>成就徽章</h2>
          <div class="badge-grid">
            ${ACHIEVEMENTS.map(a => {
              const ts = (state.achievements || {})[a.id];
              return `<div class="badge${ts ? ' badge-earned' : ''}" title="${esc(a.desc)}${ts ? `　${new Date(ts).toLocaleDateString()} 獲得` : '（未解鎖）'}">
                <span class="badge-icon">${a.icon}</span>
                <span class="badge-title">${esc(a.title)}</span>
              </div>`;
            }).join('')}
          </div>
          <div class="settings-actions">
            <button type="button" class="btn-primary" id="trophy-close">完成</button>
          </div>
        </div>
      </div>
      <div class="settings-panel"${settingsOpen ? '' : ' hidden'}>
        <div class="settings-inner">
          <h2>設定</h2>
          <label class="field">
            <span>每日新字上限</span>
            <input type="number" id="set-newperday" min="1" max="500" value="${s.newPerDay}">
          </label>
          <label class="field">
            <span>每日學習目標（題）</span>
            <input type="number" id="set-dailygoal" min="1" max="500" value="${s.dailyGoal || DEFAULT_SETTINGS.dailyGoal}">
          </label>
          <div class="field">
            <span>帳號</span>
            ${account
              ? `<div class="account-in">
                   <div class="account-id"><b>${esc(account.name || '')}</b><span>${esc(account.email || '')}</span></div>
                   <button type="button" class="btn-ghost" id="set-signout">登出</button>
                 </div>`
              : `<div id="g-signin" class="g-signin"></div><p class="account-hint">登入後跨裝置同步進度</p>`}
          </div>
          <label class="field field-row">
            <span>音效</span>
            <input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}>
          </label>
          <label class="field">
            <span>背景音樂</span>
            <select id="set-bgm">
              ${Object.entries(BGM_STYLES).map(([id, st]) => `<option value="${id}">${esc(st.label)}</option>`).join('')}
            </select>
          </label>
          <label class="field">
            <span>配對內容（配對／落下／四選一）</span>
            <select id="set-pairmode">
              <option value="meaning">中文意思</option>
              <option value="reading">假名讀音（只出漢字詞）</option>
            </select>
          </label>
          <div class="settings-actions">
            <button type="button" class="btn-ghost" id="set-reset">重置設定</button>
            <button type="button" class="btn-primary" id="set-close">完成</button>
          </div>
        </div>
      </div>
    `;

    root.querySelectorAll('.tab').forEach(btn => btn.addEventListener('click', () => {
      currentMode = btn.dataset.mode;
      render();
      handlers.onModeChange(currentMode);
    }));

    root.querySelectorAll('.content-tab').forEach(btn => btn.addEventListener('click', () => {
      const c = btn.dataset.content;
      if (c === s.content) return;
      const ms = MODES_BY_CONTENT[c] || [];
      if (ms.length) currentMode = ms[0].id;
      afterAsync(handlers.onContentChange(c));
    }));

    root.querySelector('.gear-btn').addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      if (settingsOpen) trophyOpen = false;
      render();
    });

    root.querySelector('.trophy-btn').addEventListener('click', () => {
      trophyOpen = !trophyOpen;
      if (trophyOpen) settingsOpen = false;
      render();
    });
    const trophyClose = root.querySelector('#trophy-close');
    if (trophyClose) trophyClose.addEventListener('click', () => {
      trophyOpen = false;
      render();
    });
    const vtBtn = root.querySelector('.vocab-test-btn');
    if (vtBtn) vtBtn.addEventListener('click', () => {
      trophyOpen = false;
      render();
      if (handlers.onVocabTest) handlers.onVocabTest();
    });
    const examBtn = root.querySelector('.mock-exam-btn');
    if (examBtn) examBtn.addEventListener('click', () => {
      trophyOpen = false;
      render();
      if (handlers.onMockExam) handlers.onMockExam();
    });

    root.querySelector('.theme-btn').addEventListener('click', () => {
      const next = THEME_ORDER[(THEME_ORDER.indexOf(s.theme) + 1) % THEME_ORDER.length];
      handlers.onSettingsChange({ theme: next });
    });

    root.querySelectorAll('.level-chip').forEach(btn => btn.addEventListener('click', () => {
      const lv = btn.dataset.lv;
      let levels = s.levels.includes(lv) ? s.levels.filter(x => x !== lv) : [...s.levels, lv];
      if (levels.length === 0) levels = [lv]; // keep at least one level selected
      afterAsync(handlers.onLevelsChange(levels));
    }));

    root.querySelectorAll('.cat-chip').forEach(btn => btn.addEventListener('click', () => {
      const cat = btn.dataset.cat;
      let categories;
      if (cat === '') categories = [];
      else categories = s.categories.includes(cat) ? s.categories.filter(x => x !== cat) : [...s.categories, cat];
      afterAsync(handlers.onCategoriesChange(categories));
    }));

    const npd = root.querySelector('#set-newperday');
    if (npd) npd.addEventListener('change', () => {
      const v = Math.max(1, parseInt(npd.value, 10) || DEFAULT_SETTINGS.newPerDay);
      handlers.onSettingsChange({ newPerDay: v });
    });
    const dailyGoal = root.querySelector('#set-dailygoal');
    if (dailyGoal) dailyGoal.addEventListener('change', () => {
      const v = Math.max(1, parseInt(dailyGoal.value, 10) || DEFAULT_SETTINGS.dailyGoal);
      handlers.onSettingsChange({ dailyGoal: v });
    });
    const weakReview = root.querySelector('.weak-review-btn');
    if (weakReview) weakReview.addEventListener('click', async () => {
      // Weak review is a finite study session; leave the endless falling arcade
      // mode for a regular four-choice session before building the weak queue.
      if (currentMode === 'falling') {
        currentMode = 'quiz';
        render();
        await handlers.onModeChange('quiz');
      }
      if (handlers.onWeakReview) handlers.onWeakReview();
    });
    const signout = root.querySelector('#set-signout');
    if (signout) signout.addEventListener('click', () => handlers.onSignOut());
    const snd = root.querySelector('#set-sound');
    if (snd) snd.addEventListener('change', () => {
      handlers.onSettingsChange({ sound: snd.checked });
    });
    const bgm = root.querySelector('#set-bgm');
    if (bgm) {
      bgm.value = normalizeStyle(s.bgm);
      bgm.addEventListener('change', () => handlers.onSettingsChange({ bgm: bgm.value }));
    }
    const pm = root.querySelector('#set-pairmode');
    if (pm) {
      pm.value = s.pairMode || 'meaning';
      pm.addEventListener('change', () => handlers.onSettingsChange({ pairMode: pm.value }));
    }
    const reset = root.querySelector('#set-reset');
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('確定要將設定重置為預設值嗎？（不會刪除學習進度）')) return;
      handlers.onSettingsChange({ ...DEFAULT_SETTINGS, content: s.content });
    });
    const close = root.querySelector('#set-close');
    if (close) close.addEventListener('click', () => {
      settingsOpen = false;
      render();
    });
    const gmount = root.querySelector('#g-signin');
    if (gmount && handlers.mountSignIn) handlers.mountSignIn(gmount);
  }

  render();
}
