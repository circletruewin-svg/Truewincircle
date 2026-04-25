import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  USER_APPROVAL_SOUNDS,
  USER_REJECTION_SOUNDS,
  USER_CLICK_SOUNDS,
  VIBRATION_PATTERNS,
} from '../utils/soundLibrary';
import {
  initSoundUnlocker,
  playSoundEntry,
  vibrate as vibrateNow,
} from '../utils/soundPlayer';
import {
  DEFAULT_USER_SOUND_CONFIG,
  subscribeUserSoundConfig,
} from '../utils/userSoundConfig';

const MUTE_KEY = 'user_sound_muted';

const readMuted = (defaultMuted) => {
  try {
    const v = localStorage.getItem(MUTE_KEY);
    if (v === null) return defaultMuted;
    return v === 'true';
  } catch { return defaultMuted; }
};
const writeMuted = (v) => {
  try { localStorage.setItem(MUTE_KEY, v ? 'true' : 'false'); } catch {}
};

// Resolve a sound id (built-in or custom from the Firestore config) to a
// playable entry.
const resolveSound = (id, builtIns, customSounds) => {
  return builtIns.find((s) => s.id === id)
    || customSounds.find((s) => s.id === id)
    || builtIns[0];
};

export default function useUserSound() {
  // Admin-controlled config from Firestore.
  const [config, setConfig] = useState(DEFAULT_USER_SOUND_CONFIG);
  // User's local mute toggle (only setting they control).
  const [muted, setMutedState] = useState(() => readMuted(!DEFAULT_USER_SOUND_CONFIG.defaultEnabled));

  useEffect(() => { initSoundUnlocker(); }, []);

  useEffect(() => {
    const unsub = subscribeUserSoundConfig((next) => setConfig(next));
    return () => unsub && unsub();
  }, []);

  const setMuted = useCallback((v) => {
    setMutedState(v);
    writeMuted(v);
  }, []);

  const enabled = !muted;

  const approvalSound = useMemo(
    () => resolveSound(config.approvalSoundId, USER_APPROVAL_SOUNDS, config.customSounds || []),
    [config.approvalSoundId, config.customSounds]
  );
  const rejectionSound = useMemo(
    () => resolveSound(config.rejectionSoundId, USER_REJECTION_SOUNDS, config.customSounds || []),
    [config.rejectionSoundId, config.customSounds]
  );
  const clickSound = useMemo(
    () => resolveSound(config.clickSoundId, USER_CLICK_SOUNDS, config.customSounds || []),
    [config.clickSoundId, config.customSounds]
  );

  const playEntry = useCallback((entry) => {
    if (!enabled || !entry) return;
    playSoundEntry(entry, 1);
    if (config.vibrateAllowed) {
      vibrateNow(entry.id, VIBRATION_PATTERNS[entry.id]);
    }
  }, [enabled, config.vibrateAllowed]);

  const playApproval = useCallback(() => playEntry(approvalSound), [playEntry, approvalSound]);
  const playRejection = useCallback(() => playEntry(rejectionSound), [playEntry, rejectionSound]);
  const playClick = useCallback(() => playEntry(clickSound), [playEntry, clickSound]);

  return {
    muted, setMuted, enabled,
    config,
    playApproval, playRejection, playClick,
  };
}
