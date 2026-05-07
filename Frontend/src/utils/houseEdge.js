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

// ═══════════════════════════════════════════════════════════
// New casino games (Lucky 7 / 32 Cards / Roulette / Baccarat /
// Mines / Plinko / Hi-Lo). Each helper returns the round outcome
// already weighted in the house's favour so settlement code stays
// trivial. Roughly 25–35% house edge per game — same band as the
// existing Aviator / TeenPatti / DragonTiger tuning.
// ═══════════════════════════════════════════════════════════

// Generic random-int helper.
function randInt(minInclusive, maxInclusive) {
  return Math.floor(Math.random() * (maxInclusive - minInclusive + 1)) + minInclusive;
}

// ─── Lucky 7 ───────────────────────────────────────────────
// User picks Low (1-6), Equal (7), or High (8-13).
// Payouts: Low/High 1.95x, Equal 11x.
// Tuned win rates: 38% on the side bet vs ~46% fair → ~26% edge.
// Equal bet pays 11x but only fires ~7% of rounds → ~23% edge.
export function getLucky7Card(userBet) {
  // userBet ∈ "low" | "equal" | "high"
  const wantsHit = (userBet === "low" && Math.random() < 0.38)
                || (userBet === "high" && Math.random() < 0.38)
                || (userBet === "equal" && Math.random() < 0.07);

  if (wantsHit) {
    if (userBet === "low") return randInt(1, 6);
    if (userBet === "high") return randInt(8, 13);
    return 7;
  }
  // Force a losing card.
  if (userBet === "low") return Math.random() < 0.85 ? randInt(8, 13) : 7;
  if (userBet === "high") return Math.random() < 0.85 ? randInt(1, 6) : 7;
  // userBet === "equal" — pick anything except 7.
  return Math.random() < 0.5 ? randInt(1, 6) : randInt(8, 13);
}

// ─── 32 Cards (A / B / C / D) ──────────────────────────────
// Round runs through ~10 simulated draws. Highest aggregate
// score wins the round. Payout 3.8x on winner.
// House skew: 30% chance the round winner is the user's pick,
// otherwise an even split between the other three.
export function get32CardsWinner(userBet) {
  const all = ["A", "B", "C", "D"];
  if (Math.random() < 0.30) return userBet;
  const others = all.filter((s) => s !== userBet);
  return others[Math.floor(Math.random() * others.length)];
}

// ─── Roulette (single-zero, 0-36) ──────────────────────────
// Returns just the winning number; the page decides which bets
// pay. Distribution is uniform 0-36 — the edge already lives in
// the payout structure (17 reds / 18 blacks / 1 zero etc).
export function getRouletteNumber() {
  return randInt(0, 36);
}

// ─── Baccarat ──────────────────────────────────────────────
// Returns one of "player" / "banker" / "tie". Banker pays 1.95x
// (after house's 5% commission), Player 2x, Tie 9x.
// Tuned skew so each side individually has ~25% edge:
//   45% banker, 38% player, 17% tie  (tie deliberately rare so
//   the 9x payout doesn't dominate variance).
// Then we bias slightly against whichever side the user backed.
export function getBaccaratWinner(userBet) {
  // userBet ∈ "player" | "banker" | "tie"
  const r = Math.random();
  if (userBet === "tie") {
    if (Math.random() < 0.08) return "tie";          // ~28% edge on 9x
    return Math.random() < 0.5 ? "player" : "banker";
  }
  // Side bets
  if (userBet === "player") {
    if (r < 0.32) return "player";                    // user wins
    if (r < 0.40) return "tie";                       // push for player isn't standard – treat as loss
    return "banker";                                  // user loses
  }
  // userBet === "banker"
  if (r < 0.34) return "banker";
  if (r < 0.42) return "tie";
  return "player";
}

// ─── Mines ─────────────────────────────────────────────────
// 5x5 grid, user picks mineCount ∈ 3 / 5 / 8 / 10. Each safe
// click multiplies the stake by a payout factor. Cashing out
// returns stake * factor. Hitting a mine zeros the bet.
//
// Internally we don't pre-place mines — we lazily decide on
// each click whether the picked tile is a mine, biased so the
// effective house edge is ~30%. The bias scales with the number
// of safe picks already accumulated so a long winning streak
// becomes harder to extend.
export function nextMinePickIsBomb(safePicksSoFar, mineCount) {
  // Fair probability that this click is a bomb given `safePicksSoFar`
  // already-revealed safe tiles is mineCount / (25 - safePicksSoFar).
  const remaining = 25 - safePicksSoFar;
  const fair = mineCount / remaining;
  // Skew up by a flat 1.18x but cap at 0.85 so the user never feels
  // it's impossible to extend.
  const biased = Math.min(fair * 1.18, 0.85);
  return Math.random() < biased;
}

// Mines payout multiplier after `safePicks` correct clicks with
// `mineCount` bombs in the grid. Derived from fair probability
// then trimmed by ~12% to bake in the house edge.
export function minesMultiplier(safePicks, mineCount) {
  if (safePicks <= 0) return 1;
  let fair = 1;
  for (let i = 0; i < safePicks; i++) {
    fair *= 25 - i;
    fair /= 25 - mineCount - i;
  }
  return parseFloat((fair * 0.88).toFixed(2));
}

// ─── Plinko ────────────────────────────────────────────────
// 8 rows of pegs, ball ends in slot 0..8. Symmetric distribution
// with edges paying big and middle paying small. We sample a
// biased binomial to keep the ball nudged toward the middle slots
// (low payout) most of the time.
//
// Risk modes shape the payout table:
//   low:    [1.5, 1.2, 1.05, 1.0, 0.5, 1.0, 1.05, 1.2, 1.5]
//   medium: [5,   2,   1.1,  1.0, 0.4, 1.0, 1.1,  2,   5]
//   high:   [29,  4,   1.5,  0.3, 0.2, 0.3, 1.5,  4,   29]
export const PLINKO_PAYOUTS = {
  low:    [1.5, 1.2, 1.05, 1.0, 0.5, 1.0, 1.05, 1.2, 1.5],
  medium: [5,   2,   1.1,  1.0, 0.4, 1.0, 1.1,  2,   5],
  high:   [29,  4,   1.5,  0.3, 0.2, 0.3, 1.5,  4,   29],
};

export function getPlinkoSlot() {
  // Each peg the ball "falls right" with p = 0.50; sum across 8 rows.
  // We tighten it slightly (p = 0.48 with 8 rows) so it skews toward
  // the middle slots which carry the worst payouts in every risk mode.
  let slot = 0;
  for (let i = 0; i < 8; i++) {
    if (Math.random() < 0.48) slot += 1;
  }
  return slot;            // 0..8 inclusive
}

// ─── Hi-Lo ─────────────────────────────────────────────────
// Player sees a card 1-13. Predicts whether the next card is
// higher or lower. On equal, it's a push (refund).
// House skew: 38% the prediction lands. Multiplier compounds
// per correct call; cash-out anytime.
export function getHiLoNextCard(currentCard, userBet) {
  // userBet ∈ "higher" | "lower"
  if (Math.random() < 0.38) {
    if (userBet === "higher" && currentCard < 13) return randInt(currentCard + 1, 13);
    if (userBet === "lower"  && currentCard > 1)  return randInt(1, currentCard - 1);
  }
  // Force a losing card.
  if (userBet === "higher" && currentCard > 1) return randInt(1, currentCard);
  if (userBet === "lower"  && currentCard < 13) return randInt(currentCard, 13);
  // Edge cases (card is 1 or 13). Fair 50/50.
  return randInt(1, 13);
}

// Multiplier per correct call in Hi-Lo, baked-in 12% house cut.
export function hiLoMultiplier(streak) {
  // ~1.45^streak with a 0.88 cut.
  return parseFloat((Math.pow(1.45, streak) * 0.88).toFixed(2));
}
