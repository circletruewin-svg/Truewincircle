import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ADMIN_BUILTIN_SOUNDS,
  VIBRATION_PATTERNS,
} from '../../utils/soundLibrary';
import {
  fileToDataUrl,
  initSoundUnlocker,
  playSoundEntry,
  vibrate as vibrateNow,
} from '../../utils/soundPlayer';

const KEYS = {
  enabled: 'admin_sound_enabled',
  volume: 'admin_sound_volume',
  choice: 'admin_sound_choice',
  vibrate: 'admin_vibrate_enabled',
  custom: 'admin_custom_sounds',
};

// Re-export for callers that imported it from here previously.
export const SOUND_OPTIONS = ADMIN_BUILTIN_SOUNDS;

const readBool = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    return v === null ? fallback : v === 'true';
  } catch { return fallback; }
};
const readNumber = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    if (v === null) return fallback;
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  } catch { return fallback; }
};
const readString = (key, fallback) => {
  try { return localStorage.getItem(key) || fallback; }
  catch { return fallback; }
};
const readJson = (key, fallback) => {
  try {
    const v = localStorage.getItem(key);
    if (!v) return fallback;
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch { return fallback; }
};
const writeStorage = (key, value) => {
  try { localStorage.setItem(key, typeof value === 'string' ? value : String(value)); }
  catch { /* ignore quota errors */ }
};
const writeJson = (key, value) => {
  try { localStorage.setItem(key, JSON.stringify(value)); }
  catch { /* ignore quota errors — likely a too-big custom sound */ }
};

export default function useNotificationSound() {
  const [enabled, setEnabledState] = useState(() => readBool(KEYS.enabled, true));
  const [volume, setVolumeState] = useState(() => {
    const v = readNumber(KEYS.volume, 0.7);
    return Math.min(1, Math.max(0, v));
  });
  const [vibrate, setVibrateState] = useState(() => readBool(KEYS.vibrate, true));
  const [customSounds, setCustomSounds] = useState(() => readJson(KEYS.custom, []));
  const [choice, setChoiceState] = useState(() => readString(KEYS.choice, 'ding'));

  // Combined options = built-in + custom (with id, label, and either notes or url).
  const options = useMemo(() => [...ADMIN_BUILTIN_SOUNDS, ...customSounds], [customSounds]);

  // If the persisted choice no longer exists (e.g. custom sound deleted),
  // gracefully fall back to default.
  useEffect(() => {
    if (!options.some((o) => o.id === choice)) {
      setChoiceState('ding');
    }
  }, [options, choice]);

  // Set up the autoplay-unlock listener once.
  useEffect(() => { initSoundUnlocker(); }, []);

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
    setChoiceState(value);
    writeStorage(KEYS.choice, value);
  }, []);
  const setVibrate = useCallback((value) => {
    setVibrateState(value);
    writeStorage(KEYS.vibrate, value);
  }, []);

  const addCustomSound = useCallback(async ({ label, file, url }) => {
    const trimmed = (label || '').trim();
    if (!trimmed) throw new Error('Please give the sound a name');
    if (!file && !url) throw new Error('Provide a file or a URL');

    const id = `custom-${Date.now().toString(36)}`;
    let resolvedUrl = url;
    if (file) {
      if (!file.type.startsWith('audio/')) throw new Error('Pick an audio file (MP3 / WAV / etc.)');
      // ~1 MB cap so we don't blow past localStorage quota.
      if (file.size > 1_200_000) throw new Error('File too large (max ~1 MB)');
      resolvedUrl = await fileToDataUrl(file);
    }
    const entry = { id, label: `${trimmed} (custom)`, url: resolvedUrl };
    setCustomSounds((prev) => {
      const next = [...prev, entry];
      writeJson(KEYS.custom, next);
      return next;
    });
    return entry;
  }, []);

  const removeCustomSound = useCallback((id) => {
    setCustomSounds((prev) => {
      const next = prev.filter((s) => s.id !== id);
      writeJson(KEYS.custom, next);
      return next;
    });
  }, []);

  const activeSound = useMemo(
    () => options.find((o) => o.id === choice) || ADMIN_BUILTIN_SOUNDS[0],
    [options, choice]
  );

  const play = useCallback(() => {
    if (!enabled) return;
    playSoundEntry(activeSound, volume);
    if (vibrate) {
      vibrateNow(activeSound.id, VIBRATION_PATTERNS[activeSound.id]);
    }
  }, [enabled, volume, vibrate, activeSound]);

  return {
    enabled, setEnabled,
    volume, setVolume,
    choice, setChoice,
    vibrate, setVibrate,
    play,
    options,
    customSounds,
    addCustomSound,
    removeCustomSound,
  };
}
