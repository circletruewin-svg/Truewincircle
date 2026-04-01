// ═══════════════════════════════════════════════════════════
// houseEdge.js — Weighted Random Result System
// House wins 90% of the time. User wins ~10% of the time.
// Import this in every game file.
// ═══════════════════════════════════════════════════════════

/**
 * Returns true if the user should WIN (10% chance)
 * Returns false if the user should LOSE (90% chance)
 */
export function shouldUserWin() {
  return Math.random() < 0.10; // 10% win probability
}

/**
 * For games with sides (e.g. heads/tails, andar/bahar, dragon/tiger)
 * Returns the WINNING side, biased AGAINST the user's bet.
 *
 * @param {string} userBet - what the user bet on
 * @param {string[]} allSides - all possible sides e.g. ["heads","tails"]
 * @returns {string} winning side
 */
export function getBiasedWinner(userBet, allSides) {
  if (shouldUserWin()) {
    return userBet; // user wins (10%)
  }
  // user loses (90%) — pick any side that is NOT the user's bet
  const losingSides = allSides.filter((s) => s !== userBet);
  return losingSides[Math.floor(Math.random() * losingSides.length)];
}

/**
 * For Aviator: returns a crash point biased to crash early (before user cashes out)
 * Most crashes happen between 1.01x and 1.5x (bad for user)
 * Only rarely goes above 2x
 *
 * Distribution:
 *  50% → crash between 1.01 – 1.30  (user almost always loses)
 *  25% → crash between 1.30 – 1.80
 *  15% → crash between 1.80 – 3.00
 *   8% → crash between 3.00 – 8.00
 *   2% → crash between 8.00 – 20.00 (rare big rounds to keep users hooked)
 */
export function getAviatorCrashPoint() {
  const rand = Math.random();
  if (rand < 0.50) return parseFloat((1.01 + Math.random() * 0.29).toFixed(2));
  if (rand < 0.75) return parseFloat((1.30 + Math.random() * 0.50).toFixed(2));
  if (rand < 0.90) return parseFloat((1.80 + Math.random() * 1.20).toFixed(2));
  if (rand < 0.98) return parseFloat((3.00 + Math.random() * 5.00).toFixed(2));
  return parseFloat((8.00 + Math.random() * 12.00).toFixed(2));
}

/**
 * For Color Prediction: returns winning color biased against user
 * Colors: red, green, violet
 * If user bet red → likely green/violet wins
 */
export function getColorWinner(userBet) {
  const allColors = ["red", "green", "violet"];
  return getBiasedWinner(userBet, allColors);
}

/**
 * For Dice: returns winning number biased against user's choice
 */
export function getDiceResult(userBet) {
  const allNumbers = [1, 2, 3, 4, 5, 6];
  if (shouldUserWin()) return userBet;
  const others = allNumbers.filter((n) => n !== userBet);
  return others[Math.floor(Math.random() * others.length)];
}

/**
 * For Coin Flip
 */
export function getCoinResult(userBet) {
  return getBiasedWinner(userBet, ["heads", "tails"]);
}

/**
 * Utility: deduct balance and record bet in Firestore
 * Returns { won, winAmount }
 */
export function calcWinnings(betAmount, multiplier, userWon) {
  if (userWon) {
    return { won: true, winAmount: parseFloat((betAmount * multiplier).toFixed(2)) };
  }
  return { won: false, winAmount: 0 };
}
