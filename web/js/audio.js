// Synthesized SFX. Every mode calls the same three events — hit()/wrong()/
// clear() — but each mode has its own "voice" (timbre + gesture), selected via
// setMode(), so the four vocab modes and the two grammar modes each sound
// distinct without changing any call site. Zero assets, zero license.

export function makeAudio(enabled) {
  let on = enabled;
  let mode = 'match';
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  const now = () => ac().currentTime;

  // One shaped oscillator note. Optional pitch glide (glideTo) for zaps/buzzes.
  function note(freq, t, { dur = 0.12, type = 'triangle', gain = 0.15, glideTo = null } = {}) {
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(c.destination);
    o.start(t); o.stop(t + dur + 0.02);
  }
  const seq = (freqs, gap, opts) => freqs.forEach((f, i) => note(f, now() + i * gap, opts));
  const chord = (freqs, opts) => { const t = now(); freqs.forEach(f => note(f, t, opts)); };

  // Per-mode palette. correct(combo) plays on a right answer, wrong() on a
  // mistake, clear() when a whole board is cleared (only match uses clear()).
  const VOICES = {
    // 配對: soft rounded pop, rising with combo; bright sparkle on top.
    match: {
      correct: (combo) => { const f = 520 + Math.min(combo, 12) * 40; note(f, now(), { type: 'triangle', dur: 0.12, gain: 0.16 }); note(f * 2, now() + 0.02, { type: 'sine', dur: 0.08, gain: 0.05 }); },
      wrong:   () => note(210, now(), { type: 'sine', dur: 0.20, gain: 0.12, glideTo: 150 }),
      clear:   () => seq([523, 659, 784, 1047], 0.08, { type: 'triangle', dur: 0.12, gain: 0.14 }),
    },
    // 打字: typewriter tick then a soft confirm ding.
    typing: {
      correct: () => { note(1250, now(), { type: 'square', dur: 0.025, gain: 0.05 }); note(880, now() + 0.03, { type: 'sine', dur: 0.11, gain: 0.13 }); },
      wrong:   () => note(150, now(), { type: 'sawtooth', dur: 0.13, gain: 0.10 }),
      clear:   () => seq([660, 880], 0.07, { type: 'sine', dur: 0.12, gain: 0.12 }),
    },
    // 四選一: game-show rising two-tone "correct"; descending buzz on wrong.
    quiz: {
      correct: () => { note(660, now(), { type: 'sine', dur: 0.10, gain: 0.14 }); note(990, now() + 0.10, { type: 'sine', dur: 0.17, gain: 0.14 }); },
      wrong:   () => note(320, now(), { type: 'sawtooth', dur: 0.18, gain: 0.12, glideTo: 175 }),
      clear:   () => seq([784, 988, 1319], 0.08, { type: 'sine', dur: 0.13, gain: 0.12 }),
    },
    // 落下: arcade zap that pitches up, rising with combo.
    falling: {
      correct: (combo) => { const f = 440 + Math.min(combo, 12) * 60; note(f, now(), { type: 'triangle', dur: 0.09, gain: 0.16, glideTo: f * 1.5 }); },
      wrong:   () => note(160, now(), { type: 'sawtooth', dur: 0.14, gain: 0.12 }),
      clear:   () => seq([523, 659, 784], 0.07, { type: 'triangle', dur: 0.12, gain: 0.14 }),
    },
    // 文法四選一: warm woody marimba confirm; muted low on wrong.
    cloze: {
      correct: () => { note(587, now(), { type: 'triangle', dur: 0.14, gain: 0.14 }); note(1175, now() + 0.02, { type: 'sine', dur: 0.09, gain: 0.05 }); },
      wrong:   () => note(185, now(), { type: 'sine', dur: 0.17, gain: 0.10, glideTo: 140 }),
      clear:   () => seq([587, 740, 880], 0.08, { type: 'triangle', dur: 0.13, gain: 0.13 }),
    },
    // 排列重組: a satisfying resolved chord when the sentence completes.
    order: {
      correct: () => chord([523, 659, 784], { type: 'triangle', dur: 0.24, gain: 0.09 }),
      wrong:   () => note(196, now(), { type: 'sine', dur: 0.17, gain: 0.10, glideTo: 150 }),
      clear:   () => seq([523, 659, 784, 1047], 0.07, { type: 'triangle', dur: 0.14, gain: 0.12 }),
    },
  };

  const voice = () => VOICES[mode] || VOICES.match;

  return {
    hit(combo = 0) { if (on) voice().correct(combo); },
    wrong() { if (on) voice().wrong(); },
    clear() { if (on) voice().clear(); },
    setMode(m) { if (VOICES[m]) mode = m; },
    setEnabled(b) { on = b; },
  };
}

// The modes that have a distinct SFX voice (reading has none). Exported so a
// test can assert every playable mode is covered.
export const VOICE_IDS = ['match', 'typing', 'quiz', 'falling', 'cloze', 'order'];
