// Low-level sound playback. Uses Web Audio for synthesized sounds and
// HTMLAudio for custom user-supplied URLs / data URLs.
//
// A single AudioContext is shared across the page, and we attach a
// one-time gesture listener to resume it when the user first clicks /
// taps / types — this is required by browser autoplay policy.

import { VIBRATION_PATTERNS } from './soundLibrary';

let sharedCtx = null;
let unlockBound = false;

function ensureCtx() {
  if (sharedCtx) return sharedCtx;
  const Ctx = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
  if (!Ctx) return null;
  sharedCtx = new Ctx();
  return sharedCtx;
}

function bindUnlockOnce() {
  if (unlockBound || typeof window === 'undefined') return;
  unlockBound = true;
  const unlock = () => {
    const ctx = ensureCtx();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  };
  ['click', 'keydown', 'touchstart', 'pointerdown'].forEach((event) => {
    window.addEventListener(event, unlock, { passive: true });
  });
}

export function initSoundUnlocker() {
  bindUnlockOnce();
}

// Play a synthesized sound (a list of {at, freq, dur, type, peak} notes)
// at the given linear volume (0..1). Returns true if scheduled.
export function playSynth(soundDef, volume = 1) {
  if (!soundDef || !Array.isArray(soundDef.notes) || soundDef.notes.length === 0) {
    return false;
  }
  const ctx = ensureCtx();
  if (!ctx) return false;

  // Aggressively try to resume — context can suspend silently when the
  // tab loses focus.
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});

  const now = ctx.currentTime;
  soundDef.notes.forEach((note) => {
    const start = now + (note.at || 0);
    const stop = start + (note.dur || 0.2);
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = note.type || 'sine';
    osc.frequency.value = note.freq || 880;
    const peak = Math.max(0.0001, (note.peak ?? 0.25) * volume);
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(peak, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(gain).connect(ctx.destination);
    osc.start(start);
    osc.stop(stop + 0.05);
  });
  return true;
}

// Play a custom audio file (URL or data URL) using HTMLAudio.
const audioElCache = new Map();
export function playUrl(url, volume = 1) {
  if (!url || typeof window === 'undefined') return false;
  let el = audioElCache.get(url);
  if (!el) {
    el = new Audio(url);
    el.preload = 'auto';
    audioElCache.set(url, el);
  }
  try {
    el.currentTime = 0;
    el.volume = Math.min(1, Math.max(0, volume));
    const playPromise = el.play();
    if (playPromise && typeof playPromise.catch === 'function') {
      playPromise.catch(() => {/* autoplay blocked, ignore */});
    }
    return true;
  } catch {
    return false;
  }
}

// Vibrate using the matching pattern for a given sound id (or a custom one).
export function vibrate(soundId, customPattern) {
  if (typeof navigator === 'undefined' || typeof navigator.vibrate !== 'function') {
    return false;
  }
  const pattern = customPattern || VIBRATION_PATTERNS[soundId] || [150];
  if (!pattern.length) return false;
  try {
    navigator.vibrate(pattern);
    return true;
  } catch {
    return false;
  }
}

// Convenience: play a sound entry (built-in or custom) by definition.
// Custom sound entries have a `url` field; built-ins have `notes`.
export function playSoundEntry(entry, volume = 1) {
  if (!entry) return false;
  if (entry.url) return playUrl(entry.url, volume);
  return playSynth(entry, volume);
}

// File → data URL helper for "upload custom sound" UI.
export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('Read failed'));
    reader.readAsDataURL(file);
  });
}
