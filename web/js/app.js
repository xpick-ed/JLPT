import { loadState, saveState, applySync } from './store.js';
import { buildQueue, applyGrade } from './session.js';
import { exchangeSession, pull, push } from './sync.js';
import { getSession, setSession, clearSession, initGoogle, renderButton, getOwner, setOwner, clearOwner } from './auth.js';
import { makeAudio } from './audio.js';
import { makeBgm, normalizeStyle } from './bgm.js';
import { makeCombo, applyAnswer } from './combo.js';
import { ACHIEVEMENTS, evaluateAchievements, questProgress } from './achievements.js';
import { mountVocabTest, mergeTests } from './vocab-test.js';
import { mountExam } from './exam.js';
import { renderChrome, updateStudyStats, updateComboHud, confetti, showToast, setCurrentMode } from './ui.js';
import { mountGrammarDict } from './modes/grammar-dict.js';
import { isWeakCard, recordActivity, dailySummary } from './progress.js';
import { mountMatch } from './modes/match.js';
import { mountTyping } from './modes/typing.js';
import { mountQuiz } from './modes/quiz.js';
import { mountListening } from './modes/listening.js';
import { mountVocabCloze, makeCloze } from './modes/vocab-cloze.js';
import { mountParticle, makeParticleCloze } from './modes/particle.js';
import { mountHomophone, homophonesOf } from './modes/homophone.js';
import { mountDictation, chunkSentence } from './modes/dictation.js';
import { mountShadow } from './modes/shadow.js';
import { mountConjug } from './modes/conjug.js';
import { isConjugatable } from './conjugate.js';
import { mountStrokes } from './modes/strokes.js';
import { mountFalling } from './modes/falling.js';
import { mountGrammarCloze } from './modes/grammar-cloze.js';
import { mountGrammarOrder } from './modes/grammar-order.js';
import { mountReading } from './modes/reading.js';
import { WORKER_URL, GOOGLE_CLIENT_ID } from '../config.js';

const state = { ...loadState() };
const DEVICE_KEY = 'vocabmatch.device';
function getDeviceId() {
  try {
    let id = localStorage.getItem(DEVICE_KEY);
    if (!id) {
      id = globalThis.crypto?.randomUUID?.() || `device-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      localStorage.setItem(DEVICE_KEY, id);
    }
    return id;
  } catch { return 'local'; }
}
const deviceId = getDeviceId();
let mode = 'match';
let data = { vocab: {}, grammar: {}, grammar_order: {} };   // data[deck][lv] = [cards]
// A deck is the data source for the current (content, mode). Grammar's two modes
// read different files, so the source is keyed by deck, not just content.
// 特訓 (drill) modes all study the vocabulary decks.
function deckFor(content, m) {
  if (content !== 'grammar') return 'vocab';
  return m === 'order' ? 'grammar_order' : 'grammar';
}
const DEFAULT_MODE = { vocab: 'match', grammar: 'cloze', drill: 'excloze', reading: 'match' };
const activeDeck = () => deckFor(state.settings.content, mode);
const activeData = () => data[activeDeck()];
const DECK_PREFIX = { vocab: '', grammar: 'grammar_', grammar_order: 'grammar_order_' };
let pool = [];             // filtered candidate cards
let queue = [];            // ids to review this session
let stopFalling = null;
let practiceKind = null;
let lastActivityAt = Date.now();
let audio = makeAudio(state.settings.sound);
const bgm = makeBgm(state.settings.bgm);

// Session-wide combo across every mode; all-time best persists in state.best.
let comboState = { ...makeCombo(), best: state.best?.combo || 0 };
let recordCelebrated = false;   // celebrate once per streak run, not every answer beyond the old best
// Modes play their own SFX; this wrapper lets the global streak raise the
// pitch floor everywhere (match/falling still pass their local combo).
const gameAudio = {
  hit: (c = 0) => audio.hit(Math.max(c, comboState.combo + 1)),
  wrong: () => audio.wrong(),
  clear: () => audio.clear(),
  setMode: m => audio.setMode(m),
  setEnabled: b => audio.setEnabled(b),
};

// 'system' follows prefers-color-scheme (no attribute); 'dark'/'light' force it.
function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === 'dark' || theme === 'light') root.dataset.theme = theme;
  else delete root.dataset.theme;
}
applyTheme(state.settings.theme);

async function loadLevels(deck, levels) {
  const bucket = data[deck];
  const prefix = DECK_PREFIX[deck];
  for (const lv of levels) if (!bucket[lv])
    bucket[lv] = await (await fetch(`data/${prefix}${lv}.json`)).json();
}
function rebuildPool() {
  const cats = state.settings.categories;
  const byLv = activeData();
  pool = state.settings.levels.flatMap(lv => byLv[lv] || [])
    .filter(c => cats.length === 0 || cats.includes(c.category))
    // reading mode (vocab only) pairs kanji ↔ kana, so only kanji words (word≠kana)
    .filter(c => state.settings.content !== 'vocab'
      || state.settings.pairMode !== 'reading' || c.word !== c.kana);
  // 變位 drills verbs only — a mostly-noun queue would just fall back to quiz.
  if (state.settings.content === 'drill' && mode === 'conjug') pool = pool.filter(isConjugatable);
  queue = buildQueue(state, pool.map(c => c.id), Date.now());
  practiceKind = null;
}
const byId = id => pool.find(c => c.id === id);

let pushTimer = null;
async function persist() {
  saveState(state);
  const sess = getSession();
  if (!WORKER_URL || !sess) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => push(WORKER_URL, sess.session, state), 3000);
}
let advancePending = false;
function onResult(id, grade) {
  const now = Date.now();
  const seconds = Math.max(1, (now - lastActivityAt) / 1000);
  lastActivityAt = now;
  const prior = state.cards[id];
  const isRecall = !!(prior && prior.reps > 0);   // seen before → counts toward retention
  const graded = applyGrade(state, id, grade, now);
  const correct = grade !== 'again';
  const prevMultiplier = comboState.multiplier;
  comboState = applyAnswer(comboState, correct);
  if (!correct) recordCelebrated = false;
  const newRecord = correct && !recordCelebrated && comboState.combo > (graded.best?.combo || 0) && comboState.combo >= 5;
  if (newRecord) recordCelebrated = true;
  if (comboState.combo > (graded.best?.combo || 0)) graded.best = { ...(graded.best || {}), combo: comboState.combo, updated: now };
  const reviewedBefore = dailySummary(state).reviewed;
  const questsBefore = questProgress(state, now);
  Object.assign(state, recordActivity(graded, { deviceId, content: state.settings.content, grade, seconds, points: comboState.gained, combo: comboState.combo, recall: isRecall ? correct : null, now }));
  // Newly earned badges: toast + celebrate, then persist with everything else.
  const { earned, newly } = evaluateAchievements(state, now);
  if (newly.length) {
    state.achievements = earned;
    state.updated = now;
    for (const id of newly) {
      const a = ACHIEVEMENTS.find(x => x.id === id);
      if (a) showToast(`${a.icon} 獲得成就「${a.title}」`);
    }
    confetti(document.getElementById('stage'));
  }
  // Quest completions this answer: toast each; finishing all three celebrates.
  const questsAfter = questProgress(state, now);
  const doneNow = questsAfter.filter(q => q.done && !questsBefore.find(p => p.id === q.id)?.done);
  for (const q of doneNow) showToast(`✅ 任務完成「${q.title}」`);
  if (doneNow.length && questsAfter.every(q => q.done)) {
    showToast('🎊 今日任務全部完成！');
    confetti(document.getElementById('stage'));
  }
  persist();
  updateStudyStats(document.getElementById('chrome'), state, activeData);
  updateComboHud(comboState, { newRecord, tierUp: correct && comboState.multiplier > prevMultiplier });
  if (newRecord) confetti(document.getElementById('stage'));
  // Daily-goal crossing: celebrate once, at the answer that reaches the goal.
  const goal = Math.max(1, state.settings.dailyGoal || 50);
  if (reviewedBefore < goal && dailySummary(state).reviewed >= goal) {
    const track = document.querySelector('.today-progress-track');
    if (track) {
      confetti(track);
      track.classList.add('goal-hit');
      setTimeout(() => track.classList.remove('goal-hit'), 1200);
    }
  }
  if (mode !== 'falling' && !advancePending) {
    advancePending = true;
    queueMicrotask(() => { advancePending = false; next(); });
  }
}
function next() {
  const stage = document.getElementById('stage');
  audio.setMode(mode);                 // each mode plays its own SFX voice
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();   // stop any listening-mode TTS
  if (state.settings.content === 'reading') return mountReading(stage);
  if (state.settings.content === 'grammar') {
    if (mode === 'dict') {
      return mountGrammarDict(stage, pool, (items) => {
        // Jump from the dictionary into a cloze run over this pattern only.
        queue = items.map(i => i.id);
        practiceKind = 'pattern';
        mode = 'cloze';
        setCurrentMode('cloze');
        renderAll();
        next();
      });
    }
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const item = byId(id);
    if (!item) return renderDone(stage);
    return mode === 'order'
      ? mountGrammarOrder(stage, item, pool, onResult, gameAudio)
      : mountGrammarCloze(stage, item, pool, onResult, gameAudio);
  }
  if (mode === 'shadow') return mountShadow(stage, pool);   // free listening practice, no queue/SRS
  if (mode === 'strokes') return mountStrokes(stage, pool, state.settings.levels, gameAudio);   // free tracing, no SRS
  if (mode === 'falling') return startFalling();
  if (mode === 'match') {
    const six = queue.splice(0, 6).map(byId).filter(Boolean);
    if (six.length < 1) return renderDone(stage);
    mountMatch(stage, six, onResult, gameAudio, state.settings.pairMode);
  } else {
    const id = queue.shift();
    if (!id) return renderDone(stage);
    const card = byId(id);
    mode === 'typing' ? mountTyping(stage, card, onResult, gameAudio, state.ghosts?.typing || null, (ms) => {
        state.ghosts = { ...(state.ghosts || {}), typing: { ms, at: Date.now() } };
        state.updated = Date.now();
        persist();
      })
      : mode === 'listen' ? mountListening(stage, card, pool, onResult, gameAudio, state.settings.pairMode)
      // 例句挖空/助詞 need a usable example sentence; cards without one
      // (reworded examples, no particle after a noun) get the plain quiz instead.
      : mode === 'excloze' && makeCloze(card) ? mountVocabCloze(stage, card, pool, onResult, gameAudio)
      : mode === 'particle' && makeParticleCloze(card) ? mountParticle(stage, card, onResult, gameAudio)
      : mode === 'homophone' && homophonesOf(card, pool).length ? mountHomophone(stage, card, pool, onResult, gameAudio)
      : mode === 'dictation' && chunkSentence(card.ex) ? mountDictation(stage, card, onResult, gameAudio)
      : mode === 'conjug' && isConjugatable(card) ? mountConjug(stage, card, onResult, gameAudio)
      : mountQuiz(stage, card, pool, onResult, gameAudio, state.settings.pairMode);
  }
}
function makeFallingSupply() {
  let bag = queue.slice();           // snapshot due+new; do NOT drain the shared queue
  return () => {
    while (bag.length) { const c = byId(bag.shift()); if (c) return c; }
    bag = buildPracticeQueue();      // then refill from the whole pool, shuffled, forever
    while (bag.length) { const c = byId(bag.shift()); if (c) return c; }
    return null;
  };
}
function startFalling() {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  const stage = document.getElementById('stage');
  if (pool.length === 0) return renderDone(stage);
  stopFalling = mountFalling(stage, makeFallingSupply(), onResult, gameAudio, onGameOver, state.settings.pairMode, state.ghosts?.falling || null);
}
function onGameOver({ score, maxCombo, samples }) {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  const prevBest = state.ghosts?.falling?.score || 0;
  const newBest = score > 0 && score > prevBest;
  if (newBest) {
    // This run becomes the ghost to race next time.
    state.ghosts = { ...(state.ghosts || {}), falling: { score, samples, at: Date.now() } };
    state.updated = Date.now();
    persist();
  }
  const stage = document.getElementById('stage');
  stage.innerHTML = `
    <div class="done">
      <div class="done-emoji">${newBest ? '👑' : '🎮'}</div>
      <p class="done-msg">${newBest ? '新紀錄！' : '遊戲結束'}</p>
      <p class="done-hint">分數 ${score}　·　最高連擊 ${maxCombo}${newBest
        ? (prevBest ? `　·　舊紀錄 ${prevBest}` : '')
        : (prevBest ? `　·　最佳 ${prevBest}` : '')}</p>
      <button type="button" id="again-btn" class="practice-btn">再玩一次</button>
    </div>`;
  if (newBest) confetti(stage);
  const btn = stage.querySelector('#again-btn');
  if (btn) btn.onclick = () => startFalling();
}
function buildPracticeQueue() {
  // Practice / review-ahead: every card in the current pool, shuffled, ignoring
  // due dates — so you can keep playing after the day's due+new queue is empty.
  const ids = pool.map(c => c.id);
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
function buildWeakQueue() {
  const ids = pool.map(c => c.id).filter(id => isWeakCard(state.cards[id]));
  for (let i = ids.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [ids[i], ids[j]] = [ids[j], ids[i]];
  }
  return ids;
}
function startWeakReview() {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  const weak = buildWeakQueue();
  if (!weak.length) return;
  queue = weak;
  practiceKind = 'weak';
  next();
}
async function startVocabTest() {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  await loadLevels('vocab', ['n5', 'n4', 'n3', 'n2', 'n1']);
  mountVocabTest(
    document.getElementById('stage'),
    data.vocab,
    state.vocabTests || [],
    (record) => {
      state.vocabTests = mergeTests(state.vocabTests, [record]);
      state.updated = Date.now();
      persist();
    },
    () => { rebuildPool(); renderAll(); next(); },
  );
}

function startMockExam() {
  if (stopFalling) { stopFalling(); stopFalling = null; }
  const levels = ['n5', 'n4', 'n3', 'n2', 'n1'];
  const selected = state.settings.levels;
  const defaultLevel = levels.filter(lv => selected.includes(lv)).pop() || 'n3';
  mountExam(document.getElementById('stage'), {
    levels,
    defaultLevel,
    loadDecks: async (lv) => {
      await loadLevels('vocab', [lv]);
      await loadLevels('grammar', [lv]);
      await loadLevels('grammar_order', [lv]);
      return { vocab: data.vocab[lv], cloze: data.grammar[lv], order: data.grammar_order[lv] };
    },
    history: state.exams || [],
    onDone: (record) => {
      state.exams = mergeTests(state.exams, [record]);
      state.updated = Date.now();
      persist();
    },
    onExit: () => { rebuildPool(); renderAll(); next(); },
  });
}

function renderDone(stage) {
  const empty = pool.length === 0;
  const weakDone = !empty && practiceKind === 'weak';
  stage.innerHTML = `
    <div class="done">
      <div class="done-emoji">${empty ? '📚' : weakDone ? '💪' : '🎉'}</div>
      <p class="done-msg">${empty ? '這個範圍沒有內容' : weakDone ? '弱點複習完成' : '今日到期已複習完'}</p>
      <p class="done-hint">${empty
        ? '請在上方至少選一個級別（N5–N1），主題「全部」時涵蓋整級。'
        : weakDone ? '這一輪需要加強的內容都練完了。' : '目前範圍今天的到期內容與新內容都做完了。'}</p>
      ${empty ? '' : '<button type="button" id="practice-btn" class="practice-btn">繼續練習（提前複習）</button>'}
    </div>`;
  const btn = stage.querySelector('#practice-btn');
  if (btn) btn.onclick = () => {
    const q = buildPracticeQueue();
    if (!q.length) { renderDone(stage); return; }
    queue = q;
    practiceKind = 'practice';
    next();
  };
}

async function syncNow(mergeLocal = true) {
  const sess = getSession();
  if (!WORKER_URL || !sess) return;
  const remote = await pull(WORKER_URL, sess.session);
  const next = applySync(state, remote, mergeLocal);
  state.cards = next.cards; state.settings = next.settings; state.updated = next.updated;
  state.daily = next.daily || {};
  saveState(state);
  // Adopt path with a failed/empty pull (remote===null) must NOT push — that would
  // clobber the incoming account's real remote data with an empty blob on a blip.
  if (mergeLocal || remote) push(WORKER_URL, sess.session, state);
}
async function onCredential(credential) {
  const res = await exchangeSession(WORKER_URL, credential);
  if (!res) return;
  const prevOwner = getOwner();
  const mergeLocal = !prevOwner || prevOwner === res.email;   // anon first login, or same account → merge; different account → adopt remote
  setSession(res);
  await syncNow(mergeLocal);
  setOwner(res.email);
  mode = DEFAULT_MODE[state.settings.content] || 'match';
  if (state.settings.content !== 'reading') { await loadLevels(activeDeck(), state.settings.levels); rebuildPool(); }
  renderAll();
  next();
}
function signOut() {
  const sess = getSession();
  if (WORKER_URL && sess) fetch(`${WORKER_URL}/logout`, { method: 'POST', headers: { authorization: `Bearer ${sess.session}` } }).catch(() => {});
  clearSession();
  clearOwner();
  renderAll();
}

function renderAll() {
  renderChrome(document.getElementById('chrome'), state, activeData, {
    onModeChange: async m => { if (stopFalling) { stopFalling(); stopFalling = null; } mode = m; await loadLevels(activeDeck(), state.settings.levels); rebuildPool(); renderAll(); next(); },
    onContentChange: async c => {
      if (stopFalling) { stopFalling(); stopFalling = null; }
      state.settings.content = c;
      mode = DEFAULT_MODE[c] || 'match';
      state.updated = Date.now();
      if (c !== 'reading') { await loadLevels(activeDeck(), state.settings.levels); rebuildPool(); }
      persist(); next();
    },
    onLevelsChange: async lv => { if (stopFalling) { stopFalling(); stopFalling = null; } state.settings.levels = lv; state.updated = Date.now(); await loadLevels(activeDeck(), lv); rebuildPool(); persist(); next(); },
    onCategoriesChange: c => { if (stopFalling) { stopFalling(); stopFalling = null; } state.settings.categories = c; state.updated = Date.now(); rebuildPool(); persist(); next(); },
    onSettingsChange: s => { if (stopFalling) { stopFalling(); stopFalling = null; } Object.assign(state.settings, s); state.updated = Date.now(); audio.setEnabled(state.settings.sound); bgm.setStyle(state.settings.bgm); applyTheme(state.settings.theme); rebuildPool(); persist(); renderAll(); next(); },
    onWeakReview: () => startWeakReview(),
    onVocabTest: () => startVocabTest(),
    onMockExam: () => startMockExam(),
    getAccount: () => getSession(),
    onSignOut: () => signOut(),
    mountSignIn: (el) => renderButton(el),
  });
}

addEventListener('pagehide', () => {
  clearTimeout(pushTimer);
  const sess = getSession();
  if (WORKER_URL && sess) {
    fetch(`${WORKER_URL}/data`, {
      method: 'PUT',
      headers: { authorization: `Bearer ${sess.session}`, 'content-type': 'application/json' },
      body: JSON.stringify(state),
      keepalive: true,
    }).catch(() => {});
  }
});

(async function boot() {
  initGoogle(GOOGLE_CLIENT_ID, onCredential);   // non-blocking; sets up the sign-in callback
  if (WORKER_URL && getSession()) await syncNow();
  mode = DEFAULT_MODE[state.settings.content] || 'match';
  if (state.settings.content !== 'reading') {
    await loadLevels(activeDeck(), state.settings.levels);
    rebuildPool();
  }
  renderAll();
  next();
  // Autoplay is blocked until a user gesture, so if a BGM style was left on,
  // start it on the first interaction. (Changing it in settings is a gesture.)
  if (normalizeStyle(state.settings.bgm) !== 'off') {
    const arm = () => { bgm.start(); removeEventListener('pointerdown', arm); removeEventListener('keydown', arm); };
    addEventListener('pointerdown', arm);
    addEventListener('keydown', arm);
  }
})();

// Register the PWA service worker (offline + installable). Best-effort.
if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}
