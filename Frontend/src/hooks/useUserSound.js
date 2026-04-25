import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  USER_APPROVAL_SOUNDS,
  USER_REJECTION_SOUNDS,
  USER_CLICK_SOUNDS,
  VIBRATION_PATTERNS,
} from '../utils/soundLibrary';
import {
  fileToDataUrl,
  initSoundUnlocker,
  playSoundEntry,
  vibrate as vibrateNow,
} from '../utils/soundPlayer';

const KEYS = {
  enabled: 'user_sound_enabled',
  volume: 'user_sound_volume',
  vibrate: 'user_vibrate_enabled',
  approvalChoice: 'user_sound_approval',
  rejectionChoice: 'user_sound_rejection',
  clickChoice: 'user_sound_click',
  custom: 'user_custom_sounds',
};

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
const write = (k, v) => { try { localStorage.setItem(k, typeof v === 'string' ? v : String(v)); } catch {} };
const writeJson = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch {} };

export default function useUserSound() {
  const [enabled, setEnabledState] = useState(() => readBool(KEYS.enabled, true));
  const [volume, setVolumeState] = useState(() => Math.min(1, Math.max(0, readNumber(KEYS.volume, 0.7))));
  const [vibrate, setVibrateState] = useState(() => readBool(KEYS.vibrate, true));
  const [customSounds, setCustomSounds] = useState(() => readJson(KEYS.custom, []));

  const [approvalChoice, setApprovalState] = useState(() => readString(KEYS.approvalChoice, 'success'));
  const [rejectionChoice, setRejectionState] = useState(() => readString(KEYS.rejectionChoice, 'sadtone'));
  const [clickChoice, setClickState] = useState(() => readString(KEYS.clickChoice, 'tick'));

  // For each event we expose its built-in pool plus all custom sounds, so
  // a user can use the same uploaded file for any event.
  const approvalOptions = useMemo(() => [...USER_APPROVAL_SOUNDS, ...customSounds], [customSounds]);
  const rejectionOptions = useMemo(() => [...USER_REJECTION_SOUNDS, ...customSounds], [customSounds]);
  const clickOptions = useMemo(() => [...USER_CLICK_SOUNDS, ...customSounds], [customSounds]);

  useEffect(() => { initSoundUnlocker(); }, []);

  // Fall back to defaults if a chosen sound got deleted.
  useEffect(() => {
    if (!approvalOptions.some((o) => o.id === approvalChoice)) setApprovalState('success');
  }, [approvalOptions, approvalChoice]);
  useEffect(() => {
    if (!rejectionOptions.some((o) => o.id === rejectionChoice)) setRejectionState('sadtone');
  }, [rejectionOptions, rejectionChoice]);
  useEffect(() => {
    if (!clickOptions.some((o) => o.id === clickChoice)) setClickState('tick');
  }, [clickOptions, clickChoice]);

  const setEnabled = useCallback((v) => { setEnabledState(v); write(KEYS.enabled, v); }, []);
  const setVolume = useCallback((v) => {
    const c = Math.min(1, Math.max(0, Number(v) || 0));
    setVolumeState(c);
    write(KEYS.volume, c.toFixed(2));
  }, []);
  const setVibrate = useCallback((v) => { setVibrateState(v); write(KEYS.vibrate, v); }, []);
  const setApprovalChoice = useCallback((v) => { setApprovalState(v); write(KEYS.approvalChoice, v); }, []);
  const setRejectionChoice = useCallback((v) => { setRejectionState(v); write(KEYS.rejectionChoice, v); }, []);
  const setClickChoice = useCallback((v) => { setClickState(v); write(KEYS.clickChoice, v); }, []);

  const addCustomSound = useCallback(async ({ label, file, url }) => {
    const trimmed = (label || '').trim();
    if (!trimmed) throw new Error('Please give the sound a name');
    if (!file && !url) throw new Error('Provide a file or a URL');

    const id = `user-custom-${Date.now().toString(36)}`;
    let resolvedUrl = url;
    if (file) {
      if (!file.type.startsWith('audio/')) throw new Error('Pick an audio file (MP3 / WAV / etc.)');
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

  const playFor = useCallback((options, choiceId) => {
    if (!enabled) return;
    const entry = options.find((o) => o.id === choiceId) || options[0];
    if (!entry) return;
    playSoundEntry(entry, volume);
    if (vibrate) vibrateNow(entry.id, VIBRATION_PATTERNS[entry.id]);
  }, [enabled, volume, vibrate]);

  const playApproval = useCallback(() => playFor(approvalOptions, approvalChoice),
    [playFor, approvalOptions, approvalChoice]);
  const playRejection = useCallback(() => playFor(rejectionOptions, rejectionChoice),
    [playFor, rejectionOptions, rejectionChoice]);
  const playClick = useCallback(() => {
    // Click sounds intentionally bypass the master toggle when chosen as
    // "silent", so we still respect that. But we *do* always check enabled
    // so muting kills click feedback too.
    playFor(clickOptions, clickChoice);
  }, [playFor, clickOptions, clickChoice]);

  return {
    enabled, setEnabled,
    volume, setVolume,
    vibrate, setVibrate,
    approvalChoice, setApprovalChoice, approvalOptions,
    rejectionChoice, setRejectionChoice, rejectionOptions,
    clickChoice, setClickChoice, clickOptions,
    customSounds, addCustomSound, removeCustomSound,
    playApproval, playRejection, playClick,
  };
}
