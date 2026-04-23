// ═══════════════════════════════════════════════════════════
// sportsSettlement.js — settle all pending bets for a match.
//
// Bet types supported in V1:
//   - "winner"      : A or B
//   - "toss"        : A or B
//   - "total"       : over or under (line set per match)
//   - "topBatsman"  : batsman name from the predefined list
//
// Called from the admin panel when a result is entered. Uses a
// Firestore transaction so that even if multiple admins click
// "Settle" simultaneously, every user is paid exactly once.
// ═══════════════════════════════════════════════════════════

import {
  doc, collection, query, where, getDocs, runTransaction, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import { createNotification } from "./notifications";

export const SPORTS_BET_TYPES = ["winner", "toss", "total", "topBatsman"];

/**
 * Decide if a bet is a winner based on the declared match result.
 * Returns true, false, or "refund" (when the bet type wasn't resolved —
 * e.g. match cancelled, or total runs not set).
 */
function evaluateBet(bet, result) {
  if (result.winner === "cancelled") return "refund";

  switch (bet.betType) {
    case "winner":
      return bet.selection === result.winner;

    case "toss":
      if (!result.tossWinner) return "refund";
      return bet.selection === result.tossWinner;

    case "total": {
      if (result.totalRuns === null || result.totalRuns === undefined) return "refund";
      const line = Number(bet.line);
      const actual = Number(result.totalRuns);
      if (!Number.isFinite(line) || !Number.isFinite(actual)) return "refund";
      if (actual === line) return "refund"; // push
      if (bet.selection === "over")  return actual > line;
      if (bet.selection === "under") return actual < line;
      return false;
    }

    case "topBatsman":
      if (!result.topBatsman) return "refund";
      return bet.selection === result.topBatsman;

    default:
      return false;
  }
}

/**
 * Settle every pending bet on a match. Called from admin after a
 * match is declared finished.
 *
 * @param {string} matchId
 * @param {object} result  — { winner, tossWinner, totalRuns, topBatsman }
 */
export async function settleMatch(matchId, result) {
  const matchRef = doc(db, "matches", matchId);

  const pending = await getDocs(
    query(
      collection(db, "sportsBets"),
      where("matchId", "==", matchId),
      where("status", "==", "pending")
    )
  );

  if (pending.empty) {
    // Still mark the match settled + store the result so the card
    // disappears from "upcoming" on the user side.
    await runTransaction(db, async (tx) => {
      tx.update(matchRef, {
        status: result.winner === "cancelled" ? "cancelled" : "settled",
        result,
        settledAt: serverTimestamp(),
      });
    });
    return { settled: 0, paidUsers: 0 };
  }

  // Group winnings by user so we can add to winningMoney once per user.
  const creditByUser = new Map();
  const notifyList = []; // [{ userId, title, body }]
  const betUpdates = []; // [{ ref, data }]
  const refundByUser = new Map();

  for (const snap of pending.docs) {
    const bet = snap.data();
    const verdict = evaluateBet(
      { ...bet, line: bet.line },
      result
    );

    if (verdict === true) {
      const winnings = Number((bet.betAmount * bet.oddsAtBet).toFixed(2));
      creditByUser.set(bet.userId, (creditByUser.get(bet.userId) || 0) + winnings);
      betUpdates.push({
        ref: snap.ref,
        data: { status: "won", winAmount: winnings, settledAt: serverTimestamp() },
      });
      notifyList.push({
        userId: bet.userId,
        title: `You won ₹${winnings.toFixed(2)}!`,
        body: `${bet.selectionLabel} paid out at ${bet.oddsAtBet}x.`,
      });
    } else if (verdict === "refund") {
      refundByUser.set(bet.userId, (refundByUser.get(bet.userId) || 0) + Number(bet.betAmount));
      betUpdates.push({
        ref: snap.ref,
        data: { status: "refunded", winAmount: 0, settledAt: serverTimestamp() },
      });
      notifyList.push({
        userId: bet.userId,
        title: `Bet refunded ₹${Number(bet.betAmount).toFixed(2)}`,
        body: `${bet.selectionLabel}: result could not be settled, stake returned.`,
      });
    } else {
      betUpdates.push({
        ref: snap.ref,
        data: { status: "lost", winAmount: 0, settledAt: serverTimestamp() },
      });
      // No notification for losses — avoids spam.
    }
  }

  // Firestore writeBatch caps at 500 operations, so chunk conservatively.
  const chunks = [];
  const flat = [...betUpdates];
  while (flat.length) chunks.push(flat.splice(0, 400));

  for (const chunk of chunks) {
    const batch = writeBatch(db);
    chunk.forEach(({ ref, data }) => batch.update(ref, data));
    await batch.commit();
  }

  // Credit winners + refunds. Do both in one transaction per user so
  // we don't race against concurrent bet placements.
  const allUserIds = new Set([...creditByUser.keys(), ...refundByUser.keys()]);
  for (const userId of allUserIds) {
    const userRef = doc(db, "users", userId);
    const creditWinnings = creditByUser.get(userId) || 0;
    const refundBalance = refundByUser.get(userId) || 0;

    await runTransaction(db, async (tx) => {
      const snap = await tx.get(userRef);
      if (!snap.exists()) return;
      const data = snap.data();
      const updates = {};
      if (creditWinnings > 0) {
        updates.winningMoney = Number(data.winningMoney || 0) + creditWinnings;
      }
      if (refundBalance > 0) {
        // Refunds go back to balance (where the bet originally came from,
        // balance first policy). This intentionally mirrors other games.
        updates.balance = Number(data.balance || 0) + refundBalance;
      }
      if (Object.keys(updates).length) tx.update(userRef, updates);
    });
  }

  // Mark the match settled.
  await runTransaction(db, async (tx) => {
    tx.update(matchRef, {
      status: result.winner === "cancelled" ? "cancelled" : "settled",
      result,
      settledAt: serverTimestamp(),
    });
  });

  // Fire notifications last (non-critical, best-effort).
  await Promise.all(
    notifyList.map((n) =>
      createNotification(n.userId, { type: "win", title: n.title, body: n.body, link: "/sports" })
    )
  );

  return {
    settled: pending.size,
    paidUsers: creditByUser.size,
    refundedUsers: refundByUser.size,
  };
}
