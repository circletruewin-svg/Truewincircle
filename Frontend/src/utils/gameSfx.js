// Lightweight Web Audio synth used by Aviator + Roulette. No audio
// files, no network — every sound is generated from oscillators so
// nothing breaks on mobile data plans or in slow networks. All effects
// honour the global "Mute" toggle so a user who can't be loud (office
// / late night) isn't blasted with engine hum.

let ctx = null;
let muted = false;
try {
  muted = typeof window !== "undefined" && window.localStorage?.getItem("game_sfx_muted") === "1";
} catch { /* ignore — falls back to unmuted */ }

function audio() {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    ctx = new Ctx();
  }
  // Most browsers suspend AudioContext until a user gesture; resume on demand.
  if (ctx.state === "suspended") ctx.resume().catch(() => {});
  return ctx;
}

export function isSfxMuted() { return muted; }
export function setSfxMuted(next) {
  muted = !!next;
  try { window.localStorage?.setItem("game_sfx_muted", muted ? "1" : "0"); } catch {}
}

// One-shot tone. type ∈ "sine" | "triangle" | "square" | "sawtooth".
function beep({ freq = 440, type = "sine", duration = 0.2, gain = 0.18, attack = 0.005, decay = 0.08 } = {}) {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const osc = a.createOscillator();
  const env = a.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  env.gain.setValueAtTime(0, t);
  env.gain.linearRampToValueAtTime(gain, t + attack);
  env.gain.exponentialRampToValueAtTime(0.001, t + duration);
  osc.connect(env).connect(a.destination);
  osc.start(t);
  osc.stop(t + duration + 0.05);
}

// Quick rising chime — used on Aviator cash-out and Roulette wins.
export function playChime() {
  beep({ freq: 660, type: "triangle", duration: 0.14, gain: 0.22 });
  setTimeout(() => beep({ freq: 990, type: "triangle", duration: 0.18, gain: 0.18 }), 90);
}

// Low rumble explosion — Aviator crash.
export function playCrash() {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const noise = a.createBufferSource();
  const buf = a.createBuffer(1, a.sampleRate * 0.6, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buf;
  const lp = a.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.setValueAtTime(400, t);
  lp.frequency.linearRampToValueAtTime(80, t + 0.5);
  const env = a.createGain();
  env.gain.setValueAtTime(0.4, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.6);
  noise.connect(lp).connect(env).connect(a.destination);
  noise.start(t);
  noise.stop(t + 0.7);
}

// Engine hum: a long-running oscillator whose pitch you ramp during
// Aviator's flight. Returns a stop() handle.
export function startEngineHum() {
  if (muted) return () => {};
  const a = audio();
  if (!a) return () => {};
  const t = a.currentTime;
  const osc = a.createOscillator();
  const lfo = a.createOscillator();
  const lfoGain = a.createGain();
  const env = a.createGain();
  osc.type = "sawtooth";
  osc.frequency.setValueAtTime(80, t);
  lfo.type = "sine";
  lfo.frequency.setValueAtTime(7, t);
  lfoGain.gain.setValueAtTime(6, t);
  lfo.connect(lfoGain).connect(osc.frequency);
  env.gain.setValueAtTime(0.0, t);
  env.gain.linearRampToValueAtTime(0.06, t + 0.2);
  osc.connect(env).connect(a.destination);
  osc.start(t);
  lfo.start(t);
  return {
    setPitch(multiplier) {
      if (muted) return;
      const cur = a.currentTime;
      const target = 80 + Math.min(420, Math.log(multiplier) * 70);
      try { osc.frequency.linearRampToValueAtTime(target, cur + 0.08); } catch {}
    },
    stop() {
      const cur = a.currentTime;
      try { env.gain.cancelScheduledValues(cur); } catch {}
      try { env.gain.linearRampToValueAtTime(0.0001, cur + 0.15); } catch {}
      try { osc.stop(cur + 0.2); } catch {}
      try { lfo.stop(cur + 0.2); } catch {}
    },
  };
}

// Click — roulette ball hitting pocket separators while rolling.
export function playClick() {
  beep({ freq: 1400, type: "square", duration: 0.04, gain: 0.08 });
}

// Whoosh — wheel starting / ball release.
export function playWhoosh() {
  if (muted) return;
  const a = audio();
  if (!a) return;
  const t = a.currentTime;
  const noise = a.createBufferSource();
  const buf = a.createBuffer(1, a.sampleRate * 0.4, a.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  noise.buffer = buf;
  const hp = a.createBiquadFilter();
  hp.type = "bandpass";
  hp.frequency.setValueAtTime(1800, t);
  hp.frequency.linearRampToValueAtTime(400, t + 0.4);
  const env = a.createGain();
  env.gain.setValueAtTime(0.15, t);
  env.gain.exponentialRampToValueAtTime(0.001, t + 0.4);
  noise.connect(hp).connect(env).connect(a.destination);
  noise.start(t);
  noise.stop(t + 0.5);
}
