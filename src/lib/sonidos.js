// Sonidos y vibración
const Audio_ = () => window.AudioContext || window.webkitAudioContext;

export function beep() {
  try {
    const c = new (Audio_())(); const o = c.createOscillator(); const g = c.createGain();
    o.connect(g); g.connect(c.destination); o.frequency.value = 520;
    g.gain.setValueAtTime(.12, c.currentTime); g.gain.exponentialRampToValueAtTime(.001, c.currentTime + .1);
    o.start(); o.stop(c.currentTime + .1);
  } catch (e) {}
}
export function vibrate() { if (navigator.vibrate) navigator.vibrate(30); }
export function feedback() { beep(); vibrate(); }

export function sonidoCaja() {
  try {
    const ctx = new (Audio_())();
    // Caja registradora: tonos descendentes + campana
    const notas = [
      { freq: 1200, t: 0, dur: .06, vol: .3 },
      { freq: 900, t: .06, dur: .06, vol: .25 },
      { freq: 600, t: .12, dur: .06, vol: .2 },
      { freq: 1800, t: .2, dur: .15, vol: .4 },
      { freq: 1800, t: .35, dur: .3, vol: .2 },
    ];
    notas.forEach(n => {
      const o = ctx.createOscillator(); const g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.type = n.freq > 1000 ? 'sine' : 'square';
      o.frequency.value = n.freq;
      g.gain.setValueAtTime(n.vol, ctx.currentTime + n.t);
      g.gain.exponentialRampToValueAtTime(.001, ctx.currentTime + n.t + n.dur);
      o.start(ctx.currentTime + n.t); o.stop(ctx.currentTime + n.t + n.dur + .05);
    });
  } catch (e) { beep(); }
  if (navigator.vibrate) navigator.vibrate([100, 50, 100, 50, 200]);
}

export function sonidoAlerta() {
  try {
    const c = new (Audio_())();
    [523, 659, 784].forEach((freq, i) => {
      const o = c.createOscillator(); const g = c.createGain();
      o.connect(g); g.connect(c.destination); o.frequency.value = freq;
      g.gain.setValueAtTime(.15, c.currentTime + i * .15);
      g.gain.exponentialRampToValueAtTime(.001, c.currentTime + i * .15 + .12);
      o.start(c.currentTime + i * .15); o.stop(c.currentTime + i * .15 + .12);
    });
  } catch (e) {}
}
