// ═══════════════════════════════════════════════════════════
// houseEdge.js — Weighted Random Result System
//
// Baseline: casino-realistic house edge with a slight upward
// tilt toward the house (industry-typical is 2–10%; this runs
// around 15–25% so the house wins slightly more than a regulated
// casino but not so much that the game feels rigged).
//
// Keep in mind: these defaults are the CLIENT-SIDE fallback that
// is only used when the backend RNG API is unreachable. When
// VITE_BACKEND_URL is configured the server owns every outcome.
// ═══════════════════════════════════════════════════════════

/**
 * User win probability for coin-flip style games (CoinFlip, TeenPatti,
 * DragonTiger, AndarBahar).
 *
 * Option B: 35% user win with 1.9x payout ⇒ ~33% house edge.
 * Heavily house-favoured but still leaves users a real chance to win
 * about 1 bet in 3.
 */
export function shouldUserWin() {
  return Math.random() < 0.35;
}

/**
 * For games with discrete sides (heads/tails, dragon/tiger,
 * andar/bahar). Returns the winning side.
 */
export function getBiasedWinner(userBet, allSides) {
  if (shouldUserWin()) return userBet;
  const losingSides = allSides.filter((s) => s !== userBet);
  return losingSides[Math.floor(Math.random() * losingSides.length)];
}

/**
 * Aviator crash point.
 *
 * Tightened distribution — ~30-45% house edge across the common
 * cash-out range, hard cap at 15x (no more 40x bankroll-eaters).
 * Low cash-outs (1.3x – 1.5x) used to barely break even because the
 * old "early crash" bucket went all the way up to 1.40, so users who
 * cashed out at 1.30 won ~92% of the time. Heavy weighting below
 * 1.20 fixes that.
 *
 *  45% → 1.00 – 1.20  (fast crash — most rounds end early)
 *  22% → 1.20 – 1.60
 *  16% → 1.60 – 2.30
 *  10% → 2.30 – 3.50
 *   5% → 3.50 – 6.00
 *   2% → 6.00 – 15.00 (rare big rounds, capped at 15x)
 *
 * Approximate house edge by cash-out point:
 *   1.3x → ~36%   1.5x → ~42%   2.0x → ~52%   3.0x → ~66%
 */
export function getAviatorCrashPoint() {
  const rand = Math.random();
  if (rand < 0.45) return parseFloat((1.00 + Math.random() * 0.20).toFixed(2));
  if (rand < 0.67) return parseFloat((1.20 + Math.random() * 0.40).toFixed(2));
  if (rand < 0.83) return parseFloat((1.60 + Math.random() * 0.70).toFixed(2));
  if (rand < 0.93) return parseFloat((2.30 + Math.random() * 1.20).toFixed(2));
  if (rand < 0.98) return parseFloat((3.50 + Math.random() * 2.50).toFixed(2));
  return parseFloat((6.00 + Math.random() * 9.00).toFixed(2));
}

/**
 * Color Prediction.
 *
 * Per-colour win rates tuned to each payout so the house keeps a
 * consistent edge regardless of which colour the player picks:
 *   Red (2x)      → 35% win ⇒ ~30% house edge
 *   Green (3x)    → 22% win ⇒ ~34% house edge (was 26% — too generous)
 *   Violet (4.5x) → 14% win ⇒ ~37% house edge
 */
export function getColorWinner(userBet) {
  const winRates = { red: 0.35, green: 0.22, violet: 0.14 };
  if (Math.random() < (winRates[userBet] ?? 0.20)) return userBet;

  const losing = ["red", "green", "violet"].filter((c) => c !== userBet);
  return losing[Math.floor(Math.random() * losing.length)];
}

/**
 * Dice: 1/6 fair = 16.67% win. We run 12% win — payout is 5.5x
 * so this leaves a ~34% house edge (was 14% / 23% edge — too loose).
 */
export function getDiceResult(userBet) {
  const allNumbers = [1, 2, 3, 4, 5, 6];
  if (Math.random() < 0.12) return userBet;
  const others = allNumbers.filter((n) => n !== userBet);
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * Coin Flip — 40% user wins (2x payout ⇒ ~20% house edge).
 */
export function getCoinResult(userBet) {
  return getBiasedWinner(userBet, ["heads", "tails"]);
}

export function calcWinnings(betAmount, multiplier, userWon) {
  if (userWon) {
    return { won: true, winAmount: parseFloat((betAmount * multiplier).toFixed(2)) };
  }
  return { won: false, winAmount: 0 };
}
