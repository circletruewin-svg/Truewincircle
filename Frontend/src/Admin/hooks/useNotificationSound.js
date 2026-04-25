import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

const KEYS = {
  enabled: 'admin_sound_enabled',
  volume: 'admin_sound_volume',
  choice: 'admin_sound_choice',
  vibrate: 'admin_vibrate_enabled',
};

// Each "sound" is a sequence of {at, freq, dur, type, peak} segments
// scheduled on a Web Audio context. peak is multiplied by user volume.
export const SOUND_OPTIONS = [
  {
    id: 'ding',
    label: 'Ding (default)',
    notes: [
      { at: 0.00, freq: 880,  dur: 0.40, type: 'sine', peak: 0.30 },
      { at: 0.22, freq: 1175, dur: 0.40, type: 'sine', peak: 0.30 },
    ],
  },
  {
    id: 'chime',
    label: 'Chime (soft)',
    notes: [
      { at: 0.00, freq: 1568, dur: 0.50, type: 'sine', peak: 0.22 },
      { at: 0.18, freq: 2093, dur: 0.50, type: 'sine', peak: 0.22 },
      { at: 0.36, freq: 2637, dur: 0.55, type: 'sine', peak: 0.22 },
    ],
  },
  {
    id: 'bell',
    label: 'Bell',
    notes: [
      { at: 0.00, freq: 1760, dur: 0.90, type: 'triangle', peak: 0.28 },
      { at: 0.06, freq: 2637, dur: 0.85, type: 'triangle', peak: 0.18 },
    ],
  },
  {
    id: 'alert',
    label: 'Alert (urgent)',
    notes: [
      { at: 0.00, freq: 880, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.20, freq: 660, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.40, freq: 880, dur: 0.18, type: 'square', peak: 0.22 },
      { at: 0.60, freq: 660, dur: 0.18, type: 'square', peak: 0.22 },
    ],
  },
  {
    id: 'cash',
    label: 'Cash register',
    notes: [
      { at: 0.00, freq: 1318, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.10, freq: 1568, dur: 0.18, type: 'sine', peak: 0.30 },
      { at: 0.20, freq: 2093, dur: 0.20, type: 'sine', peak: 0.30 },
      { at: 0.32, freq: 2637, dur: 0.40, type: 'sine', peak: 0.30 },
    ],
  },
];

const VIBRATION_PATTERNS = {
  ding: [180, 80, 180],
  chime: [120, 60, 120, 60, 120],
  bell: [400],
  alert: [120, 80, 120, 80, 120, 80, 120],
  cash: [80, 40, 80, 40, 80, 40, 200],
};

const readBool = (key, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return stored === 'true';
  } catch {
    return fallback;
  }
};

const readNumber = (key, fallback) => {
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    const n = Number(stored);
    return Number.isFinite(n) ? n : fallback;
  } catch {
    return fallback;
  }
};

const readString = (key, fallback) => {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
};

const writeStorage = (key, value) => {
  try {
    localStorage.setItem(key, String(value));
  } catch {
    /* ignore */
  }
};

export default function useNotificationSound() {
  const [enabled, setEnabledState] = useState(() => readBool(KEYS.enabled, true));
  const [volume, setVolumeState] = useState(() => {
    const v = readNumber(KEYS.volume, 0.7);
    return Math.min(1, Math.max(0, v));
  });
  const [choice, setChoiceState] = useState(() => {
    const stored = readString(KEYS.choice, 'ding');
    return SOUND_OPTIONS.some(o => o.id === stored) ? stored : 'ding';
  });
  const [vibrate, setVibrateState] = useState(() => readBool(KEYS.vibrate, true));

  const audioCtxRef = useRef(null);
  const unlockedRef = useRef(false);

  const ensureCtx = () => {
    if (audioCtxRef.current) return audioCtxRef.current;
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return null;
    audioCtxRef.current = new Ctx();
    return audioCtxRef.current;
  };

  // Browsers require a user gesture before audio can play. Resume the
  // AudioContext on the first click / key / touch so subsequent automatic
  // notifications go through without being blocked.
  useEffect(() => {
    const unlock = () => {
      if (unlockedRef.current) return;
      const ctx = ensureCtx();
      if (!ctx) return;
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      unlockedRef.current = true;
    };
    window.addEventListener('click', unlock);
    window.addEventListener('keydown', unlock);
    window.addEventListener('touchstart', unlock);
    return () => {
      window.removeEventListener('click', unlock);
      window.removeEventListener('keydown', unlock);
      window.removeEventListener('touchstart', unlock);
    };
  }, []);

  const setEnabled = useCallback((value) => {
    setEnabledState(value);
    writeStorage(KEYS.enabled, value);
  }, []);

  const setVolume = useCallback((value) => {
    const clamped = Math.min(1, Math.max(0, Number(value) || 0));
    setVolumeState(clamped);
    writeStorage(KEYS.volume, clamped.toFixed(2));
  }, []);

  const setChoice = useCallback((value) => {
    if (!SOUND_OPTIONS.some(o => o.id === value)) return;
    setChoiceState(value);
    writeStorage(KEYS.choice, value);
  }, []);

  const setVibrate = useCallback((value) => {
    setVibrateState(value);
    writeStorage(KEYS.vibrate, value);
  }, []);

  const activeSound = useMemo(
    () => SOUND_OPTIONS.find(o => o.id === choice) || SOUND_OPTIONS[0],
    [choice]
  );

  const play = useCallback(() => {
    if (!enabled) return;
    const ctx = ensureCtx();
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume().catch(() => {});
      const now = ctx.currentTime;
      activeSound.notes.forEach(note => {
        const start = now + note.at;
        const stop = start + note.dur;
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = note.type || 'sine';
        osc.frequency.value = note.freq;
        const peak = Math.max(0.0001, note.peak * volume);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(peak, start + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.0001, stop);
        osc.connect(gain).connect(ctx.destination);
        osc.start(start);
        osc.stop(stop + 0.05);
      });
    }
    if (vibrate && typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
      const pattern = VIBRATION_PATTERNS[activeSound.id] || VIBRATION_PATTERNS.ding;
      try { navigator.vibrate(pattern); } catch { /* ignore */ }
    }
  }, [enabled, volume, vibrate, activeSound]);

  return {
    enabled, setEnabled,
    volume, setVolume,
    choice, setChoice,
    vibrate, setVibrate,
    play,
    options: SOUND_OPTIONS,
  };
}
