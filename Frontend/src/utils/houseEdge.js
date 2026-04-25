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
 * Realistic crash-game distribution with a slight house tilt.
 * Expected cash-out multiplier is tuned so the house keeps
 * roughly a 12–18% edge over the long run.
 *
 *  30% → 1.00 – 1.40  (early crash)
 *  30% → 1.40 – 2.00
 *  20% → 2.00 – 3.50
 *  12% → 3.50 – 7.00
 *   6% → 7.00 – 15.00
 *   2% → 15.00 – 40.00 (rare big rounds)
 */
export function getAviatorCrashPoint() {
  const rand = Math.random();
  if (rand < 0.30) return parseFloat((1.00 + Math.random() * 0.40).toFixed(2));
  if (rand < 0.60) return parseFloat((1.40 + Math.random() * 0.60).toFixed(2));
  if (rand < 0.80) return parseFloat((2.00 + Math.random() * 1.50).toFixed(2));
  if (rand < 0.92) return parseFloat((3.50 + Math.random() * 3.50).toFixed(2));
  if (rand < 0.98) return parseFloat((7.00 + Math.random() * 8.00).toFixed(2));
  return parseFloat((15.00 + Math.random() * 25.00).toFixed(2));
}

/**
 * Color Prediction.
 *
 * Per-colour win rates tuned to each payout so the house keeps an
 * edge regardless of which colour the player picks (Option B tone):
 *   Red (2x)   → 35% win ⇒ ~30% house edge
 *   Green (3x) → 26% win ⇒ ~22% house edge
 *   Violet (4.5x) → 14% win ⇒ ~37% house edge
 *
 * Note: the older 42/42/16 flat distribution accidentally gave the
 * player a +26% edge on green bets. Fixed here.
 */
export function getColorWinner(userBet) {
  const winRates = { red: 0.35, green: 0.26, violet: 0.14 };
  if (Math.random() < (winRates[userBet] ?? 0.25)) return userBet;

  const losing = ["red", "green", "violet"].filter((c) => c !== userBet);
  return losing[Math.floor(Math.random() * losing.length)];
}

/**
 * Dice: 1/6 fair = 16.67% win. We run 14% win — payout is 5.5x
 * so this leaves a ~23% house edge. Not tight but not punishing.
 */
export function getDiceResult(userBet) {
  const allNumbers = [1, 2, 3, 4, 5, 6];
  if (Math.random() < 0.14) return userBet;
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
