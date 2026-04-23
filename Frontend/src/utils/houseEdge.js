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
 * User win probability for coin-flip style games.
 * Heads/Tails fair = 50%. We run ~40% — house keeps a ~10%
 * edge which matches typical casino-table house advantage
 * scaled up slightly.
 */
export function shouldUserWin() {
  return Math.random() < 0.40;
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
 * Red and green each expected ~45%, violet ~10% in a fair game.
 * We weight violet higher than the natural 10% to give the house
 * a small edge while keeping the payouts worthwhile.
 */
export function getColorWinner(userBet) {
  const rand = Math.random();
  // Fair-ish distribution: red 42%, green 42%, violet 16%.
  let winner;
  if (rand < 0.42) winner = "red";
  else if (rand < 0.84) winner = "green";
  else winner = "violet";

  // Apply a mild bias: if the user bet the headline-payout
  // colour (violet) and the dice fell violet, flip a 35% chance
  // to send them to red or green instead. Keeps violet a real
  // outcome without letting it over-pay.
  if (winner === "violet" && userBet === "violet" && Math.random() < 0.35) {
    winner = Math.random() < 0.5 ? "red" : "green";
  }
  return winner;
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
