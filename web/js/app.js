import { loadState, saveState, mergeStates } from './store.js';
import { buildQueue, applyGrade } from './session.js';
import { hashKey, pull, push } from './sync.js';
import { makeAudio } from './audio.js';
import { renderChrome } from './ui.js';
import { mountMatch } from './modes/match.js';
import { mountTyping } from './modes/typing.js';
import { mountQuiz } from './modes/quiz.js';
import { WORKER_URL } from '../config.js';

const state = { ...loadState() };
let mode = 'match';
let dataByLevel = {};      // { n2: [cards] }
let pool = [];             // filtered candidate cards
let queue = [];            // ids to review this session
let audio = makeAudio(state.settings.sound);

async function loadLevels(levels) {
  for (const lv of levels) if (!dataByLevel[lv])
    dataByLevel[lv] = await (await fetch(`data/${lv}.json`)).json();
}
function rebuildPool() {
  const cats = state.settings.categories;
  pool = state.settings.levels.flatMap(lv => dataByLevel[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category));
  queue = buildQueue(state, pool.map(c => c.id), Date.now());
}
const byId = id => pool.find(c => c.id === id);

let pushTimer = null;
async function persist() {
  saveState(state);
  if (!WORKER_URL || !state.settings.passphrase) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(async () => push(WORKER_URL, await hashKey(state.settings.passphrase), state), 3000);
}
let advancePending = false;
function onResult(id, grade) {
  Object.assign(state, applyGrade(state, id, grade, Date.now()));
  persist();
  if (!advancePending) {
    advancePending = true;
    queueMicrotask(() => { advancePending = false; next(); });
  }
}
function next() {
  const stage = document.getElementById('stage');
  if (mode === 'match') {
    const six = queue.splice(0, 6).map(byId).filter(Boolean);
    if (six.length < 2) return renderDone(stage);
    mountMatch(stage, six, onResult, audio);
  } else {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const card = byId(id);
    mode === 'typing' ? mountTyping(stage, card, onResult, audio) : mountQuiz(stage, card, pool, onResult, audio);
  }
}
function renderDone(stage) { stage.innerHTML = `<div class="done">今日到期已複習完 🎉</div>`; }

function renderAll() {
  renderChrome(document.getElementById('chrome'), state, dataByLevel, {
    onModeChange: m => { mode = m; next(); },
    onLevelsChange: async lv => { state.settings.levels = lv; state.updated = Date.now(); await loadLevels(lv); rebuildPool(); persist(); next(); },
    onCategoriesChange: c => { state.settings.categories = c; state.updated = Date.now(); rebuildPool(); persist(); next(); },
    onSettingsChange: s => { Object.assign(state.settings, s); state.updated = Date.now(); audio.setEnabled(state.settings.sound); rebuildPool(); persist(); renderAll(); next(); },
  });
}

(async function boot() {
  if (WORKER_URL && state.settings.passphrase) {
    const remote = await pull(WORKER_URL, await hashKey(state.settings.passphrase));
    if (remote) { Object.assign(state, mergeStates(state, remote)); saveState(state); }
  }
  await loadLevels(state.settings.levels);
  rebuildPool();
  renderAll();
  next();
})();
