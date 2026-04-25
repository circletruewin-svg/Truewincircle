import { createContext, useContext } from 'react';
import useUserSound from '../hooks/useUserSound';

const UserSoundContext = createContext(null);

export function UserSoundProvider({ children }) {
  const value = useUserSound();
  return (
    <UserSoundContext.Provider value={value}>
      {children}
    </UserSoundContext.Provider>
  );
}

// Returns the live user-sound API. Components that mount before the
// provider get a no-op object so they don't crash.
export function useUserSoundContext() {
  const ctx = useContext(UserSoundContext);
  if (ctx) return ctx;
  return {
    enabled: false, setEnabled: () => {},
    volume: 0.7, setVolume: () => {},
    vibrate: false, setVibrate: () => {},
    approvalChoice: 'success', setApprovalChoice: () => {}, approvalOptions: [],
    rejectionChoice: 'sadtone', setRejectionChoice: () => {}, rejectionOptions: [],
    clickChoice: 'tick', setClickChoice: () => {}, clickOptions: [],
    customSounds: [], addCustomSound: async () => {}, removeCustomSound: () => {},
    playApproval: () => {}, playRejection: () => {}, playClick: () => {},
  };
}
