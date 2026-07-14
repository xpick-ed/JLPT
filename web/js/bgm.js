// Procedurally-generated ambient background music — no audio files, no license.
// A warm sustained pad + a sparse pentatonic arpeggio, scheduled on the Web
// Audio clock so notes never drift. Calm by design: low volume and consonant
// (pentatonic → any random note fits), meant to sit *under* studying. Several
// selectable styles just re-parameterise the same engine (filter, octave,
// tempo, delay). Mirrors audio.js's makeX(state)+setEnabled/setStyle shape.

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// C-major pentatonic (C D E G A) across two octaves. Every note is consonant
// with the pad, so picking at random never sounds wrong. Styles shift octave.
export const ARP_NOTES = [60, 62, 64, 67, 69, 72, 74, 76];

// Selectable styles. 'off' is a first-class option (no sound). Each real style
// tunes the SAME engine; label is the Traditional-Chinese menu text.
export const BGM_STYLES = {
  off:     { label: '關閉' },
  ambient: { label: '空靈',      arpType: 'triangle', filterHz: 2400, padGain: 0.035, arpGain: 0.060, oct:   0, gap: [1.1, 1.6], atk: 0.40, rel: 2.2, delay: 0.38, fb: 0.30, wet: 0.22, pad: [48, 55, 60] },
  lofi:    { label: 'lo-fi 慵懶', arpType: 'sine',     filterHz: 1300, padGain: 0.048, arpGain: 0.070, oct: -12, gap: [1.4, 1.4], atk: 0.25, rel: 2.6, delay: 0.50, fb: 0.34, wet: 0.26, pad: [43, 50, 55] },
  bright:  { label: '輕快',      arpType: 'triangle', filterHz: 3600, padGain: 0.026, arpGain: 0.055, oct:  12, gap: [0.45, 0.5], atk: 0.05, rel: 1.1, delay: 0.28, fb: 0.22, wet: 0.18, pad: [60, 67, 72] },
};

// Coerce any stored value (incl. the old boolean bgm flag) to a valid style id.
export function normalizeStyle(v) {
  if (v === true) return 'ambient';        // legacy `bgm: true`
  if (typeof v === 'string' && BGM_STYLES[v]) return v;
  return 'off';                            // legacy `false`, unknown, or undefined
}

export function makeBgm(style) {
  let current = normalizeStyle(style);
  let ctx = null;               // one AudioContext, reused across style changes
  let bus = null;               // current voice's input node (lowpass filter)
  let master = null;            // current voice's output gain (fades in/out)
  let padOsc = [];              // current voice's sustained oscillators (+ LFO)
  let timer = 0, nextNote = 0, running = false;

  function ensureCtx() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;      // no Web Audio → silently no-op
    ctx = new AC();
    return true;
  }

  // Build a fresh voice for style S: pad + arp feed a lowpass, which feeds
  // master (→ out) and a gentle feedback delay for space. master fades in.
  function buildVoice(S) {
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = S.filterHz;
    filter.connect(master);

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = S.delay;
    const fb = ctx.createGain(); fb.gain.value = S.fb;
    const wet = ctx.createGain(); wet.gain.value = S.wet;
    filter.connect(delay);
    delay.connect(fb); fb.connect(delay);   // feedback loop
    delay.connect(wet); wet.connect(master);

    bus = filter;

    // Sustained pad with a slow "breathing" LFO on its mix gain.
    const padMix = ctx.createGain();
    padMix.gain.value = S.padGain;
    padMix.connect(bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = S.padGain * 0.55;
    lfo.connect(lfoGain); lfoGain.connect(padMix.gain);
    lfo.start();
    padOsc = [lfo];
    for (const m of S.pad) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = midiToFreq(m);
      o.detune.value = Math.random() * 8 - 4;   // slight spread → warmth
      o.connect(padMix);
      o.start();
      padOsc.push(o);
    }
  }

  // One arp note: soft attack, long release, random stereo placement.
  function scheduleNote(t, S) {
    const m = ARP_NOTES[Math.floor(Math.random() * ARP_NOTES.length)] + S.oct;
    const o = ctx.createOscillator();
    o.type = S.arpType;
    o.frequency.value = midiToFreq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(S.arpGain, t + S.atk);
    g.gain.exponentialRampToValueAtTime(0.0001, t + S.rel);
    o.connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.2 - 0.6;
      g.connect(pan); pan.connect(bus);
    } else {
      g.connect(bus);
    }
    o.start(t);
    o.stop(t + S.rel + 0.1);
  }

  // Look-ahead scheduler (the "two clocks" pattern): queue notes a bit ahead of
  // the audio clock so setInterval jitter never causes gaps.
  function tick() {
    if (!running) return;
    const S = BGM_STYLES[current];
    const ahead = ctx.currentTime + 0.6;
    while (nextNote < ahead) {
      scheduleNote(nextNote, S);
      nextNote += S.gap[0] + Math.random() * S.gap[1];
    }
  }

  function start() {
    const S = BGM_STYLES[current];
    if (!S || current === 'off' || running || !ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    buildVoice(S);
    running = true;
    nextNote = ctx.currentTime + 0.1;
    master.gain.cancelScheduledValues(ctx.currentTime);
    master.gain.setValueAtTime(0.0001, ctx.currentTime);
    master.gain.exponentialRampToValueAtTime(0.12, ctx.currentTime + 2.5);   // fade in
    tick();
    timer = setInterval(tick, 200);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer); timer = 0;
    // Capture this voice's nodes; a later start() reassigns the module refs.
    const m = master, osc = padOsc, c = ctx;
    master = null; bus = null; padOsc = [];
    const now = c.currentTime;
    m.gain.cancelScheduledValues(now);
    m.gain.setValueAtTime(Math.max(m.gain.value, 0.0001), now);
    m.gain.exponentialRampToValueAtTime(0.0001, now + 0.6);   // fade out
    setTimeout(() => {
      for (const o of osc) { try { o.stop(); } catch { /* already stopped */ } }
      try { m.disconnect(); } catch { /* already gone */ }
    }, 800);
  }

  // Switch style: 'off' stops; any other (re)builds the voice with its params.
  function setStyle(next) {
    const norm = normalizeStyle(next);
    if (norm === current && (running || norm === 'off')) return;
    current = norm;
    stop();
    start();
  }

  return { start, stop, setStyle };
}
