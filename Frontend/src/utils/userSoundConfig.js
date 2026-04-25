// Helpers around the global user-sound configuration document.
// Admin updates this doc to control which sounds users hear when their
// deposit/withdrawal is approved/rejected and when they tap quick-bet
// buttons. Users only read this doc — they can't change it.

import { doc, getDoc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';

export const USER_SOUND_DOC_PATH = ['settings', 'userSoundConfig'];

export const DEFAULT_USER_SOUND_CONFIG = {
  approvalSoundId: 'success',
  rejectionSoundId: 'sadtone',
  clickSoundId: 'tick',
  customSounds: [],          // [{id, label, url}]
  vibrateAllowed: true,      // whether vibration on mobile is permitted
  defaultEnabled: true,      // whether sound is on by default for new users
};

const userSoundDocRef = () => doc(db, ...USER_SOUND_DOC_PATH);

export function subscribeUserSoundConfig(onChange) {
  return onSnapshot(
    userSoundDocRef(),
    (snap) => {
      if (snap.exists()) {
        onChange({ ...DEFAULT_USER_SOUND_CONFIG, ...snap.data() });
      } else {
        onChange({ ...DEFAULT_USER_SOUND_CONFIG });
      }
    },
    () => onChange({ ...DEFAULT_USER_SOUND_CONFIG }),
  );
}

export async function loadUserSoundConfig() {
  try {
    const snap = await getDoc(userSoundDocRef());
    if (snap.exists()) return { ...DEFAULT_USER_SOUND_CONFIG, ...snap.data() };
  } catch { /* ignore */ }
  return { ...DEFAULT_USER_SOUND_CONFIG };
}

export async function saveUserSoundConfig(partial) {
  const ref = userSoundDocRef();
  await setDoc(
    ref,
    { ...partial, updatedAt: serverTimestamp() },
    { merge: true },
  );
}
