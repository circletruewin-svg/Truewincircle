// Helpers shared between admin's "Master Management" tab and the
// master-side panel. Keeps the few rules of how master accounts work
// in one file so the Firestore rules, signup flow and admin UI can
// stay aligned.

import {
  collection, getDocs, query, where, doc, runTransaction, addDoc,
  serverTimestamp,
} from 'firebase/firestore';

// Every collection where a player's bet amount lands, plus the field
// that holds the stake. Used for turnover (play) totals — master
// earn % and the earnings views all read from this single list so
// nothing gets missed when a new game is added (just add a row here).
export const TURNOVER_SOURCES = [
  { col: 'harufBets',        amt: 'betAmount', ts: 'timestamp'  },
  { col: 'aviatorBets',      amt: 'betAmount', ts: 'createdAt'  },
  { col: 'sportsBets',       amt: 'betAmount', ts: 'createdAt'  },
  { col: 'colorBets',        amt: 'betAmount', ts: 'createdAt'  },
  { col: 'diceBets',         amt: 'betAmount', ts: 'createdAt'  },
  { col: 'wingame_bets',     amt: 'amount',    ts: 'createdAt'  },
  { col: 'rouletteBets',     amt: 'betAmount', ts: 'createdAt'  },
  { col: 'coinFlipHistory',  amt: 'betAmount', ts: 'createdAt'  },
  { col: 'teenPattiHistory', amt: 'betAmount', ts: 'createdAt'  },
  { col: 'dtHistory',        amt: 'betAmount', ts: 'createdAt'  },
  { col: 'abHistory',        amt: 'betAmount', ts: 'createdAt'  },
  { col: 'lucky7History',    amt: 'betAmount', ts: 'createdAt'  },
  { col: 'hiLoHistory',      amt: 'betAmount', ts: 'createdAt'  },
  { col: 'minesHistory',     amt: 'betAmount', ts: 'createdAt'  },
  { col: 'rouletteHistory',  amt: 'betAmount', ts: 'createdAt'  },
  { col: 'baccaratHistory',  amt: 'betAmount', ts: 'createdAt'  },
  { col: 'plinkoHistory',    amt: 'betAmount', ts: 'createdAt'  },
  { col: 'cards32History',   amt: 'betAmount', ts: 'createdAt'  },
];

// Sum a master's players' turnover across ALL game collections,
// optionally bounded to [start, end] (JS Dates). Returns the total
// stake. Used by both the reconcile (lifetime) and the earnings
// views (date range).
export async function sumPlayerTurnover(db, playerIds, start, end) {
  if (!playerIds || playerIds.length === 0) return 0;
  const chunks = [];
  for (let i = 0; i < playerIds.length; i += 30) chunks.push(playerIds.slice(i, i + 30));

  // Fire every (collection × chunk) query in parallel instead of
  // sequentially — turns ~18 round-trips-in-series into one batch so
  // the earnings views feel instant.
  const tasks = [];
  for (const chunk of chunks) {
    for (const src of TURNOVER_SOURCES) {
      tasks.push(
        getDocs(query(collection(db, src.col), where('userId', 'in', chunk)))
          .then((snap) => {
            let s = 0;
            snap.forEach((d) => {
              const data = d.data();
              if (start && end) {
                const t = data[src.ts]?.toDate?.();
                if (!t || t < start || t > end) return;
              }
              s += Number(data[src.amt] || 0);
            });
            return s;
          })
          .catch(() => 0),
      );
    }
  }
  const results = await Promise.all(tasks);
  const total = results.reduce((a, b) => a + b, 0);
  return Math.round(total * 100) / 100;
}

// Friendly display name for each turnover collection.
export const GAME_LABELS = {
  harufBets: 'Haruf', aviatorBets: 'Aviator', sportsBets: 'Cricket / Sports',
  colorBets: 'Color', diceBets: 'Dice', wingame_bets: 'Win Game (1-12)',
  rouletteBets: 'Roulette', coinFlipHistory: 'Coin Flip',
  teenPattiHistory: 'Teen Patti', dtHistory: 'Dragon Tiger',
  abHistory: 'Andar Bahar', lucky7History: 'Lucky 7', hiLoHistory: 'Hi-Lo',
  minesHistory: 'Mines', rouletteHistory: 'Roulette', baccaratHistory: 'Baccarat',
  plinkoHistory: 'Plinko', cards32History: '32 Cards',
};

// Same data as sumPlayerTurnover, but grouped so the admin can see
// WHICH player and WHICH game produced the master's earnings.
// Returns: { total, byUser: { [uid]: { total, games: { [col]: amount } } } }
export async function sumPlayerTurnoverBreakdown(db, playerIds, start, end) {
  const empty = { total: 0, byUser: {} };
  if (!playerIds || playerIds.length === 0) return empty;
  const chunks = [];
  for (let i = 0; i < playerIds.length; i += 30) chunks.push(playerIds.slice(i, i + 30));

  const tasks = [];
  for (const chunk of chunks) {
    for (const src of TURNOVER_SOURCES) {
      tasks.push(
        getDocs(query(collection(db, src.col), where('userId', 'in', chunk)))
          .then((snap) => {
            const rows = [];
            snap.forEach((d) => {
              const data = d.data();
              if (start && end) {
                const t = data[src.ts]?.toDate?.();
                if (!t || t < start || t > end) return;
              }
              rows.push({
                uid: data.userId,
                col: src.col,
                amt: Number(data[src.amt] || 0),
              });
            });
            return rows;
          })
          .catch(() => []),
      );
    }
  }
  const all = (await Promise.all(tasks)).flat();
  const byUser = {};
  let total = 0;
  for (const r of all) {
    if (!r.uid || !(r.amt > 0)) continue;
    total += r.amt;
    if (!byUser[r.uid]) byUser[r.uid] = { total: 0, games: {} };
    byUser[r.uid].total += r.amt;
    byUser[r.uid].games[r.col] = (byUser[r.uid].games[r.col] || 0) + r.amt;
  }
  const round = (n) => Math.round(n * 100) / 100;
  total = round(total);
  for (const u of Object.values(byUser)) {
    u.total = round(u.total);
    for (const k of Object.keys(u.games)) u.games[k] = round(u.games[k]);
  }
  return { total, byUser };
}

// Default "master earn %" — a master automatically earns this share
// of their players' total PLAY (turnover), credited straight into
// their points balance. This is SEPARATE from the admin's commission
// %. Admin can override per master in Master Management.
export const DEFAULT_MASTER_EARN_PCT = 10;

// How much of a master's balance they're allowed to request a
// withdrawal of. Earned (play-commission) points are LOCKED — only
// the bought / admin-deposited portion can be cashed back. We treat
// lifetimeEarned as a hard floor: withdrawable = balance −
// lifetimeEarned, never negative. Conservative on purpose.
export function masterWithdrawable(master) {
  const bal = Number(master?.balance ?? master?.walletBalance ?? 0);
  const earned = Number(master?.lifetimeEarned || 0);
  return Math.max(0, Math.round((bal - earned) * 100) / 100);
}

// Reconcile a master's play-earnings. Idempotent: a marker
// (playEarnCreditedTurnover) on the master doc records how much
// turnover has already been paid out on, so running this repeatedly
// only ever credits the *new* play since last run — no double
// credit even if admin + master panels both call it.
//
// Returns the amount freshly credited (0 if nothing new).
//
// NOTE: caller should be the admin panel (admin is auth'd and
// trusted to write balances). Master panel only displays.
export async function reconcileMasterPlayEarnings(db, master, playerIds) {
  const masterId = master.id || master.uid;
  const pct = Number(master.playEarnPercent ?? DEFAULT_MASTER_EARN_PCT);
  if (!masterId || pct <= 0 || !playerIds || playerIds.length === 0) return 0;

  // Lifetime turnover across EVERY game collection.
  const turnover = await sumPlayerTurnover(db, playerIds);

  let credited = 0;
  await runTransaction(db, async (tx) => {
    const ref = doc(db, 'users', masterId);
    const snap = await tx.get(ref);
    if (!snap.exists()) return;
    const data = snap.data();
    const prevTurnover = Number(data.playEarnCreditedTurnover || 0);
    if (turnover <= prevTurnover) return; // nothing new
    const deltaTurnover = turnover - prevTurnover;
    const earn = Math.round(deltaTurnover * (pct / 100) * 100) / 100;
    if (earn <= 0) {
      // Still advance the marker so we don't recompute forever.
      tx.update(ref, { playEarnCreditedTurnover: turnover });
      return;
    }
    const bal = Number(data.balance ?? data.walletBalance ?? 0);
    const nb = Math.round((bal + earn) * 100) / 100;
    // lifetimeEarned is the running total of play-commission ever
    // credited. It only ever goes UP and is used to lock that much
    // of the balance from master withdrawal requests (earned points
    // can't be cashed out — only handed to players).
    const prevLifetime = Number(data.lifetimeEarned || 0);
    tx.update(ref, {
      balance: nb,
      walletBalance: nb,
      playEarnCreditedTurnover: turnover,
      lifetimeEarned: Math.round((prevLifetime + earn) * 100) / 100,
    });
    credited = earn;
  });

  if (credited > 0) {
    try {
      await addDoc(collection(db, 'masterLedger'), {
        type: 'play_earning',
        masterId,
        masterName: master.name || null,
        amount: credited,
        pct,
        note: `Auto play-earning @ ${pct}% of turnover`,
        createdAt: serverTimestamp(),
      });
    } catch { /* ledger is best-effort */ }
  }
  // Return rich result so callers can show a clear toast / diagnose.
  return { turnover, credited, pct };
}

// Unique short code stamped on every master account, used in the
// referral link `?m=<code>`. 8 chars from a vowel-free alphabet so
// it's hard to confuse 0 / O or 1 / I. Phone-shareable.
const CODE_ALPHABET = "23456789BCDFGHJKLMNPQRSTVWXYZ";
export function generateMasterCode() {
  let out = "";
  for (let i = 0; i < 8; i++) {
    out += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return out;
}

// `master.balance` is the "points to distribute" pool. When admin
// tops up a master, this goes up. When the master approves a
// deposit or manually credits a player, this goes down. Game wins /
// losses never touch this — the house absorbs those, by design.
export const MASTER_BALANCE_FIELDS = Object.freeze({
  available: "balance",
});

// Build the share link a master can drop into WhatsApp etc. Picks
// up the current origin so it works on staging / vercel previews
// without us hard-coding "truewincircle.in".
export function buildMasterReferralLink(masterCode, origin) {
  const base = origin || (typeof window !== "undefined" ? window.location.origin : "");
  return `${base.replace(/\/$/, "")}/?m=${masterCode}`;
}

// localStorage key used to remember "this visitor came in via a
// master's link" across page loads (capture on landing → apply
// after OTP success).
export const PENDING_MASTER_KEY = "pendingMasterCode";

// Stamp / read / clear helpers so callers don't sprinkle raw
// localStorage access everywhere.
export function rememberMasterCode(code) {
  if (!code || typeof window === "undefined") return;
  try { window.localStorage.setItem(PENDING_MASTER_KEY, String(code).toUpperCase()); } catch {}
}
export function readPendingMasterCode() {
  if (typeof window === "undefined") return null;
  try { return window.localStorage.getItem(PENDING_MASTER_KEY) || null; } catch { return null; }
}
export function clearPendingMasterCode() {
  if (typeof window === "undefined") return;
  try { window.localStorage.removeItem(PENDING_MASTER_KEY); } catch {}
}
