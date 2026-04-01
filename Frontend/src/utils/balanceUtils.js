// ─────────────────────────────────────────────────────────────
// balanceUtils.js
// Tumhari app mein 2 fields hain:
//   balance      = deposit wallet (Add Cash se aata hai)
//   winningMoney = jeete hue paise (sirf withdraw ho sakta hai)
//
// Rules:
//   - Bet lagane pe: pehle balance se kato, phir winningMoney se
//   - Jeetne pe: winningMoney mein add karo
//   - Haarne pe: already deduct ho chuka hai
// ─────────────────────────────────────────────────────────────

/**

- Total available balance = balance + winningMoney
  */
  export function getTotalBalance(balance, winningMoney) {
  return (balance ?? 0) + (winningMoney ?? 0);
  }

/**

- Deduct bet amount from balance first, then winningMoney
- Returns { newBalance, newWinning }
  */
  export function calcDeduction(amount, balance, winningMoney) {
  const bal = balance ?? 0;
  const win = winningMoney ?? 0;
  if (bal >= amount) {
  return { newBalance: bal - amount, newWinning: win };
  }
  const fromBalance = bal;
  const fromWinning = amount - fromBalance;
  return { newBalance: 0, newWinning: win - fromWinning };
  }

/**

- Add winnings to winningMoney
  */
  export function calcWin(winAmount, winningMoney) {
  return { newWinning: (winningMoney ?? 0) + winAmount };
  }
