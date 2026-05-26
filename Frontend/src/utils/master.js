// Helpers shared between admin's "Master Management" tab and the
// master-side panel. Keeps the few rules of how master accounts work
// in one file so the Firestore rules, signup flow and admin UI can
// stay aligned.

import {
  collection, getDocs, query, where, doc, runTransaction,
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

// Reconcile play-earnings PER PLAYER, split into TWO categories so
// admin can set different earn% for Haruf markets vs casino games.
//
//   master.playEarnPercent        → Haruf markets ka earn %
//   master.playEarnPercentCasino  → baaki saare games (aviator, win
//                                    game, color, dice, roulette,
//                                    teen patti, etc.) ka earn %
//                                    [default 0 — admin opt-in]
//
// Per-player override (splitMasterPct/splitPlayerPct on user doc)
// applies same single rate to BOTH categories (keeps simple).
//
// Idempotent per PLAYER per CATEGORY via two markers on the player's
// user doc: `earnDoneTurnoverHaruf`, `earnDoneTurnoverCasino`. On
// first encounter both markers are seeded to current category
// turnover — no retro credit (old engine already covered history).
//
// Returns { credited } — total freshly credited to the master.
export async function reconcileMasterPlayEarnings(db, master, playerIds) {
  const masterId = master.id || master.uid;
  if (!masterId || !playerIds || playerIds.length === 0) return { credited: 0 };
  const harufPct  = Number(master.playEarnPercent ?? DEFAULT_MASTER_EARN_PCT);
  const casinoPct = Number(master.playEarnPercentCasino ?? 0); // default OFF

  // Per-player per-game turnover in one batched read.
  const { byUser, total: totalTurnover } = await sumPlayerTurnoverBreakdown(db, playerIds);
  const r2 = (n) => Math.round(n * 100) / 100;
  let credited = 0;

  // Legacy master-level marker bump (purana engine starve).
  try {
    await runTransaction(db, async (tx) => {
      const mRef = doc(db, 'users', masterId);
      const mSnap = await tx.get(mRef);
      if (!mSnap.exists()) return;
      const prevLegacy = Number(mSnap.data().playEarnCreditedTurnover || 0);
      if (totalTurnover > prevLegacy) {
        tx.update(mRef, { playEarnCreditedTurnover: r2(totalTurnover) });
      }
    });
  } catch (e) {
    console.warn('legacy-marker starve skipped:', e?.message || e);
  }

  for (const pid of playerIds) {
    const games = byUser[pid]?.games || {};
    const harufT  = r2(games.harufBets || 0);
    const casinoT = r2((byUser[pid]?.total || 0) - harufT);
    try {
      // eslint-disable-next-line no-await-in-loop
      await runTransaction(db, async (tx) => {
        const pRef = doc(db, 'users', pid);
        const mRef = doc(db, 'users', masterId);
        const pSnap = await tx.get(pRef);
        const mSnap = await tx.get(mRef);
        if (!pSnap.exists() || !mSnap.exists()) return;
        const p = pSnap.data();
        const m = mSnap.data();

        const hasOverride = p.splitMasterPct != null || p.splitPlayerPct != null;
        const overrideMasterPct = hasOverride ? Number(p.splitMasterPct || 0) : null;
        const overridePlayerPct = hasOverride ? Number(p.splitPlayerPct || 0) : null;

        // Per-category: (markerField, turnover, defaultMasterPct, idTag)
        const cats = [
          { mark: 'earnDoneTurnoverHaruf',  turn: harufT,  defPct: harufPct,  tag: 'haruf'  },
          { mark: 'earnDoneTurnoverCasino', turn: casinoT, defPct: casinoPct, tag: 'casino' },
        ];

        let pUpdate = {};
        let mDeltaMaster = 0;
        let mDeltaLifetime = 0;
        let pDeltaBal = 0;
        let pDeltaCashback = 0;
        const ledgerWrites = [];

        for (const c of cats) {
          const markerRaw = p[c.mark];
          // First time → seed baseline, credit 0 (no retro).
          if (markerRaw == null) {
            pUpdate[c.mark] = c.turn;
            continue;
          }
          const prev = Number(markerRaw) || 0;
          if (c.turn <= prev) continue; // nothing new in this category
          const delta = r2(c.turn - prev);
          pUpdate[c.mark] = c.turn;

          const mPct = hasOverride ? overrideMasterPct : c.defPct;
          const cPct = hasOverride ? overridePlayerPct : 0;
          const masterCut = r2(delta * (mPct / 100));
          const playerCash = r2(delta * (cPct / 100));

          if (masterCut > 0) {
            mDeltaMaster += masterCut;
            mDeltaLifetime += masterCut;
            const key = Math.round(c.turn * 100);
            ledgerWrites.push([
              `pe_${masterId}_${pid}_${c.tag}_${key}`,
              {
                type: 'play_earning',
                masterId,
                masterName: master.name || null,
                playerId: pid,
                amount: masterCut,
                pct: mPct,
                category: c.tag,
                note: `Auto play-earning @ ${mPct}% (${c.tag} · ${p.name || 'player'})`,
                createdAt: serverTimestamp(),
              },
            ]);
            credited = r2(credited + masterCut);
          }
          if (playerCash > 0) {
            pDeltaBal += playerCash;
            pDeltaCashback += playerCash;
            const key = Math.round(c.turn * 100);
            ledgerWrites.push([
              `cb_${masterId}_${pid}_${c.tag}_${key}`,
              {
                type: 'player_cashback',
                masterId,
                masterName: master.name || null,
                playerId: pid,
                amount: playerCash,
                pct: cPct,
                category: c.tag,
                note: `Player cashback @ ${cPct}% (${c.tag} · ${p.name || 'player'})`,
                createdAt: serverTimestamp(),
              },
            ]);
          }
        }

        // Apply combined player-doc changes.
        if (pDeltaBal > 0) {
          const pb = Number(p.balance ?? p.walletBalance ?? 0);
          const npb = r2(pb + pDeltaBal);
          pUpdate.balance = npb;
          pUpdate.walletBalance = npb;
          pUpdate.cashbackEarned = r2(Number(p.cashbackEarned || 0) + pDeltaCashback);
        }
        if (Object.keys(pUpdate).length > 0) tx.update(pRef, pUpdate);

        // Apply combined master-doc changes.
        if (mDeltaMaster > 0) {
          const mb = Number(m.balance ?? m.walletBalance ?? 0);
          const nmb = r2(mb + mDeltaMaster);
          tx.update(mRef, {
            balance: nmb,
            walletBalance: nmb,
            lifetimeEarned: r2(Number(m.lifetimeEarned || 0) + mDeltaLifetime),
          });
        }

        // Ledger writes inside the same transaction (idempotent ids).
        for (const [id, data] of ledgerWrites) {
          tx.set(doc(db, 'masterLedger', id), data);
        }
      });
    } catch (err) {
      console.warn('per-player earn reconcile skipped for', pid, err?.message || err);
    }
  }

  return { credited };
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
