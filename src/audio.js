// Tiny synthesized sound effects (no audio files needed).
let ctx = null, master = null;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination);
  } catch (e) { ctx = null; }
}

function noiseBuf(dur) {
  const b = ctx.createBuffer(1, Math.max(1, ctx.sampleRate * dur), ctx.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

function burst({ dur = 0.15, freq = 1000, q = 1, gain = 0.5, type = 'lowpass', decay = dur }) {
  if (!ctx) return;
  const src = ctx.createBufferSource(); src.buffer = noiseBuf(dur);
  const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + decay);
  src.connect(f); f.connect(g); g.connect(master); src.start();
}

function tone({ f0 = 200, f1 = 100, dur = 0.2, gain = 0.3, type = 'sine' }) {
  if (!ctx) return;
  const o = ctx.createOscillator(); o.type = type;
  o.frequency.setValueAtTime(f0, ctx.currentTime); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), ctx.currentTime + dur);
  const g = ctx.createGain(); g.gain.setValueAtTime(gain, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + dur);
  o.connect(g); g.connect(master); o.start(); o.stop(ctx.currentTime + dur);
}

export const sfx = {
  swing: () => burst({ dur: 0.12, freq: 2400, type: 'bandpass', q: 0.7, gain: 0.15 }),
  hit: () => { burst({ dur: 0.1, freq: 500, gain: 0.5 }); tone({ f0: 140, f1: 60, dur: 0.12, gain: 0.3 }); },
  chop: () => { burst({ dur: 0.08, freq: 900, type: 'bandpass', q: 2, gain: 0.4 }); tone({ f0: 300, f1: 180, dur: 0.06, gain: 0.15, type: 'triangle' }); },
  mine: () => { burst({ dur: 0.06, freq: 3000, type: 'highpass', gain: 0.3 }); tone({ f0: 1200, f1: 900, dur: 0.08, gain: 0.12, type: 'square' }); },
  shot: (big) => { burst({ dur: big ? 0.35 : 0.2, freq: big ? 1200 : 1800, gain: 0.9, decay: big ? 0.35 : 0.2 }); tone({ f0: 120, f1: 40, dur: 0.2, gain: 0.5 }); },
  bow: () => tone({ f0: 500, f1: 200, dur: 0.1, gain: 0.2, type: 'triangle' }),
  hurt: () => tone({ f0: 260, f1: 120, dur: 0.25, gain: 0.35, type: 'sawtooth' }),
  groan: () => { tone({ f0: 90 + Math.random() * 40, f1: 60, dur: 0.7, gain: 0.18, type: 'sawtooth' }); },
  door: (open) => tone({ f0: open ? 180 : 140, f1: open ? 120 : 90, dur: 0.18, gain: 0.25, type: 'square' }),
  horde: () => { tone({ f0: 60, f1: 40, dur: 2.5, gain: 0.5, type: 'sawtooth' }); burst({ dur: 2, freq: 200, gain: 0.3, decay: 2 }); },
  ui: () => tone({ f0: 700, f1: 900, dur: 0.05, gain: 0.08, type: 'triangle' }),
};
