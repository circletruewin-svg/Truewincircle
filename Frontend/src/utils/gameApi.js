// ═══════════════════════════════════════════════════════════
// gameApi.js — calls the server-authoritative game endpoints.
//
// If VITE_BACKEND_URL is set at build time, games route their
// outcomes through the backend (server-side RNG, authoritative
// payouts). If it is not set, callers can fall back to the
// local client logic — useful for local development.
// ═══════════════════════════════════════════════════════════

import { getAuth } from 'firebase/auth';

const BASE_URL = (import.meta?.env?.VITE_BACKEND_URL || '').replace(/\/$/, '');

export function isServerRngEnabled() {
  return !!BASE_URL;
}

async function authedFetch(path, body) {
  const user = getAuth().currentUser;
  if (!user) throw new Error('Not logged in');
  const token = await user.getIdToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}

export const gameApi = {
  coinFlip: (userBet, betAmount) => authedFetch('/api/game/coinflip', { userBet, betAmount }),
  dice:     (userBet, betAmount) => authedFetch('/api/game/dice',     { userBet, betAmount }),
  color:    (userBet, betAmount) => authedFetch('/api/game/color',    { userBet, betAmount }),
  aviatorCashout: (roundId, betAmount, multiplier) =>
    authedFetch('/api/game/aviator/cashout', { roundId, betAmount, multiplier }),
};
