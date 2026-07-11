import { DEFAULT_SETTINGS } from './store.js';

const LEVELS = ['n5', 'n4', 'n3', 'n2', 'n1'];
const MODES = [
  { id: 'match', label: '配對' },
  { id: 'typing', label: '打字' },
  { id: 'quiz', label: '四選一' },
  { id: 'falling', label: '落下' },
];

let currentMode = 'match';
let settingsOpen = false;

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
    .map(c => c.id);
  const now = Date.now();
  const due = poolIds.filter(id => state.cards[id] && state.cards[id].due <= now).length;
  const freshIds = poolIds.filter(id => !state.cards[id]);
  const fresh = Math.min(freshIds.length, state.settings.newPerDay);
  return { due, fresh };
}

export function renderChrome(root, state, dataByLevel, handlers) {
  function afterAsync(maybePromise) {
    Promise.resolve(maybePromise).then(render);
  }

  function render() {
    const { due, fresh } = computeStats(state, dataByLevel);
    const cats = categoriesFor(state, dataByLevel);
    const s = state.settings;

    root.innerHTML = `
      <div class="chrome-inner">
        <div class="chrome-row chrome-top">
          <div class="brand"><span class="hanko" aria-hidden="true">字</span><span class="brand-name">JLPT 單字道場</span></div>
          <nav class="tabs" role="tablist" aria-label="遊戲模式">
            ${MODES.map(m => `<button type="button" class="tab${m.id === currentMode ? ' active' : ''}" data-mode="${m.id}" role="tab" aria-selected="${m.id === currentMode}">${m.label}</button>`).join('')}
          </nav>
          <button type="button" class="gear-btn" aria-label="設定" aria-expanded="${settingsOpen}">⚙</button>
        </div>
        <div class="chrome-row chrome-filters">
          <div class="chip-row levels" role="group" aria-label="級別">
            ${LEVELS.map(lv => `<button type="button" class="chip level-chip${s.levels.includes(lv) ? ' active' : ''}" data-lv="${lv}">${lv.toUpperCase()}</button>`).join('')}
          </div>
          <div class="chip-row categories" role="group" aria-label="分類">
            <button type="button" class="chip cat-chip${s.categories.length === 0 ? ' active' : ''}" data-cat="">全部</button>
            ${cats.map(c => `<button type="button" class="chip cat-chip${s.categories.includes(c) ? ' active' : ''}" data-cat="${c}">${c}</button>`).join('')}
          </div>
        </div>
        <div class="chrome-row chrome-stats">
          <span class="stat stat-due">待複習 <b>${due}</b></span>
          <span class="stat stat-new">新單字 <b>${fresh}</b></span>
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
            <span>同步密語（passphrase）</span>
            <input type="text" id="set-passphrase" placeholder="留空＝不同步" autocomplete="off">
          </label>
          <label class="field field-row">
            <span>音效</span>
            <input type="checkbox" id="set-sound" ${s.sound ? 'checked' : ''}>
          </label>
          <label class="field">
            <span>配對內容（配對／落下）</span>
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

    root.querySelector('.gear-btn').addEventListener('click', () => {
      settingsOpen = !settingsOpen;
      render();
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
    const pass = root.querySelector('#set-passphrase');
    if (pass) pass.value = s.passphrase || '';
    if (pass) pass.addEventListener('change', () => {
      handlers.onSettingsChange({ passphrase: pass.value.trim() });
    });
    const snd = root.querySelector('#set-sound');
    if (snd) snd.addEventListener('change', () => {
      handlers.onSettingsChange({ sound: snd.checked });
    });
    const pm = root.querySelector('#set-pairmode');
    if (pm) {
      pm.value = s.pairMode || 'meaning';
      pm.addEventListener('change', () => handlers.onSettingsChange({ pairMode: pm.value }));
    }
    const reset = root.querySelector('#set-reset');
    if (reset) reset.addEventListener('click', () => {
      if (!confirm('確定要將設定重置為預設值嗎？（不會刪除學習進度）')) return;
      handlers.onSettingsChange({ ...DEFAULT_SETTINGS, passphrase: '' });
    });
    const close = root.querySelector('#set-close');
    if (close) close.addEventListener('click', () => {
      settingsOpen = false;
      render();
    });
  }

  render();
}
