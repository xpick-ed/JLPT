export function makeAudio(enabled) {
  let on = enabled;
  let ctx = null;
  const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());
  function blip(freq, dur = 0.08, type = 'triangle', gain = 0.15) {
    if (!on) return;
    const c = ac(), o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = gain;
    o.connect(g); g.connect(c.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, c.currentTime + dur);
    o.stop(c.currentTime + dur);
  }
  return {
    hit(combo = 0) { blip(440 + Math.min(combo, 12) * 60); },
    wrong() { blip(160, 0.14, 'sawtooth', 0.12); },
    clear() { [523, 659, 784].forEach((f, i) => setTimeout(() => blip(f, 0.12), i * 70)); },
    setEnabled(b) { on = b; },
  };
}
