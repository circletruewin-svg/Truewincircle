// Runs on any admin page. Watches game_state/win_game_1_to_12 and
// automatically advances the round when its phase timer expires —
// so rounds keep moving even if no player has the /wingame page open.
//
// This is the client-side substitute for a Cloud Function scheduled
// tick. Admin is almost always logged in on the panel, so as long
// as the admin browser stays open, rounds advance every ~5 min like
// clockwork.
//
// House edge: 70% of rounds pick the least-popular number (house
// wins everything). 30% are a fair 1-in-12 pick.
//
// We DO NOT settle individual bets here. Each user's browser has
// its own sweep in WinGame.jsx that reads /wingame_rounds/{roundId}
// and settles their own open bets when they next visit. Keeping
// settlement per-user avoids double-credit races.

import { useEffect } from 'react';
import {
  doc, onSnapshot, runTransaction, Timestamp, setDoc,
  collection, query, where, getDocs,
} from 'firebase/firestore';
import { db } from '../firebase';

const BETTING_DURATION_SECONDS = 5 * 60;
const RESULTS_DURATION_SECONDS = 1 * 60;
const HOUSE_BIAS_PROBABILITY = 0.70;

const gsRef = () => doc(db, 'game_state', 'win_game_1_to_12');

async function pickAutoWinner(roundId) {
  try {
    const snap = await getDocs(query(
      collection(db, 'wingame_bets'),
      where('roundId', '==', roundId),
    ));
    const volume = {};
    for (let i = 1; i <= 12; i++) volume[i] = 0;
    snap.forEach((d) => {
      const bet = d.data();
      if (typeof bet.number === 'number' && bet.number >= 1 && bet.number <= 12
          && typeof bet.amount === 'number') {
        volume[bet.number] = (volume[bet.number] || 0) + bet.amount;
      }
    });
    if (Math.random() < HOUSE_BIAS_PROBABILITY) {
      const minVol = Math.min(...Object.values(volume));
      const cands = Object.entries(volume)
        .filter(([, v]) => v === minVol)
        .map(([n]) => Number(n));
      return cands[Math.floor(Math.random() * cands.length)];
    }
    return Math.floor(Math.random() * 12) + 1;
  } catch {
    return Math.floor(Math.random() * 12) + 1;
  }
}

async function advanceIfExpired(data) {
  const now = Timestamp.now();
  let end = data.phaseEndTime;
  if (!end || typeof end.seconds !== 'number') return;
  if (end.seconds - now.seconds > 0) return; // Not expired

  const roundIdToEnd = data.roundId;

  if (data.phase === 'betting') {
    try {
      await runTransaction(db, async (tx) => {
        const s = await tx.get(gsRef());
        if (!s.exists()) return;
        const cur = s.data();
        if (cur.phase !== 'betting' || cur.roundId !== roundIdToEnd) return;
        const newEnd = new Date(Date.now() + RESULTS_DURATION_SECONDS * 1000);
        tx.update(gsRef(), { phase: 'results', phaseEndTime: newEnd });
      });
    } catch (e) {
      if (e.code !== 'aborted') console.warn('Auto-tick betting→results:', e.message);
    }
  } else if (data.phase === 'results') {
    let winningNumber = data.winningNumber;
    try {
      if (winningNumber == null) {
        winningNumber = await pickAutoWinner(roundIdToEnd);
        let claimed = false;
        await runTransaction(db, async (tx) => {
          const s = await tx.get(gsRef());
          if (!s.exists()) return;
          const cur = s.data();
          if (cur.phase !== 'results' || cur.roundId !== roundIdToEnd) return;
          if (cur.winningNumber != null) {
            winningNumber = cur.winningNumber;
            return;
          }
          if (cur.forcedWinner != null) {
            winningNumber = cur.forcedWinner;
          }
          tx.update(gsRef(), { winnerProcessed: true, winningNumber });
          claimed = true;
        });
        if (!claimed && winningNumber == null) return;
      }

      // Stamp the round result so every user's browser can settle
      // their own bets whenever they next open the site.
      try {
        await setDoc(doc(db, 'wingame_rounds', String(roundIdToEnd)), {
          roundId: roundIdToEnd,
          result: winningNumber,
          settledAt: new Date(),
        }, { merge: true });
      } catch (e) {
        console.warn('Persist round result failed:', e.message);
      }

      // Move to the next round.
      const newEnd = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
      await setDoc(gsRef(), {
        roundId: Date.now(),
        phase: 'betting',
        phaseEndTime: newEnd,
        lastWinningNumber: winningNumber,
      });
    } catch (e) {
      if (e.code !== 'aborted') console.warn('Auto-tick results→betting:', e.message);
    }
  }
}

export default function useWinGameAutoTick(enabled) {
  useEffect(() => {
    if (!enabled) return undefined;
    let latest = null;
    const unsub = onSnapshot(gsRef(), (snap) => {
      if (snap.exists()) latest = snap.data();
    });
    // Poll every 20 sec — catches expired timers even if the snapshot
    // handler already fired earlier.
    const iv = setInterval(() => {
      if (latest) advanceIfExpired(latest);
    }, 20 * 1000);
    // Also try once right at mount so a long-stuck round unsticks
    // as soon as admin opens the panel.
    const kickoff = setTimeout(() => { if (latest) advanceIfExpired(latest); }, 3 * 1000);
    return () => {
      unsub();
      clearInterval(iv);
      clearTimeout(kickoff);
    };
  }, [enabled]);
}
