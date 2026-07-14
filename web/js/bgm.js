// Procedurally-generated ambient background music — no audio files, no license.
// A warm sustained pad + a sparse pentatonic arpeggio, scheduled on the Web
// Audio clock so notes never drift. Calm by design: low volume, slow, and
// consonant (pentatonic → any random note fits), meant to sit *under* studying
// rather than grab attention. Mirrors audio.js's makeX(enabled)+setEnabled shape.

export function midiToFreq(m) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

// C-major pentatonic (C D E G A) across two octaves. Every note is consonant
// with the pad, so picking at random never sounds wrong.
export const ARP_NOTES = [60, 62, 64, 67, 69, 72, 74, 76];
const PAD_NOTES = [48, 55, 60];   // C3 root, G3 fifth, C4 octave

export function makeBgm(enabled) {
  let on = enabled;
  let ctx = null;               // one AudioContext, reused across on/off toggles
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

  // Build a fresh voice: pad + arp feed a lowpass, which feeds master (→ out)
  // and a gentle feedback delay for space. master starts near-silent to fade in.
  function buildVoice() {
    master = ctx.createGain();
    master.gain.value = 0.0001;
    master.connect(ctx.destination);

    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 2400;
    filter.connect(master);

    const delay = ctx.createDelay(1.0);
    delay.delayTime.value = 0.38;
    const fb = ctx.createGain(); fb.gain.value = 0.30;
    const wet = ctx.createGain(); wet.gain.value = 0.22;
    filter.connect(delay);
    delay.connect(fb); fb.connect(delay);   // feedback loop
    delay.connect(wet); wet.connect(master);

    bus = filter;

    // Sustained pad with a slow "breathing" LFO on its mix gain.
    const padMix = ctx.createGain();
    padMix.gain.value = 0.035;
    padMix.connect(bus);
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.06;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.02;
    lfo.connect(lfoGain); lfoGain.connect(padMix.gain);
    lfo.start();
    padOsc = [lfo];
    for (const m of PAD_NOTES) {
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
  function scheduleNote(t) {
    const m = ARP_NOTES[Math.floor(Math.random() * ARP_NOTES.length)];
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = midiToFreq(m);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.06, t + 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 2.2);
    o.connect(g);
    if (ctx.createStereoPanner) {
      const pan = ctx.createStereoPanner();
      pan.pan.value = Math.random() * 1.2 - 0.6;
      g.connect(pan); pan.connect(bus);
    } else {
      g.connect(bus);
    }
    o.start(t);
    o.stop(t + 2.3);
  }

  // Look-ahead scheduler (the "two clocks" pattern): queue notes a bit ahead of
  // the audio clock so setInterval jitter never causes gaps.
  function tick() {
    if (!running) return;
    const ahead = ctx.currentTime + 0.6;
    while (nextNote < ahead) {
      scheduleNote(nextNote);
      nextNote += 1.1 + Math.random() * 1.6;   // sparse: ~1.1–2.7s apart
    }
  }

  function start() {
    if (!on || running || !ensureCtx()) return;
    if (ctx.state === 'suspended') ctx.resume();
    buildVoice();
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

  function setEnabled(b) {
    on = b;
    if (b) start(); else stop();
  }

  return { start, stop, setEnabled };
}
