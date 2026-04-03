import { doc, runTransaction } from "firebase/firestore";

const roundMoney = (value) => Math.round((Number(value) || 0) * 100) / 100;

export function getUserFunds(userData = {}) {
  const balance = roundMoney(userData.balance ?? userData.walletBalance ?? 0);
  const winningMoney = roundMoney(userData.winningMoney ?? 0);

  return {
    balance,
    winningMoney,
    total: roundMoney(balance + winningMoney),
  };
}

export function buildFundsDeductionUpdate(userData, amount) {
  const { balance, winningMoney, total } = getUserFunds(userData);
  const debitAmount = roundMoney(amount);

  if (debitAmount > total) {
    throw new Error("Insufficient balance");
  }

  let remainingDebit = debitAmount;
  const fromBalance = Math.min(balance, remainingDebit);
  const nextBalance = roundMoney(balance - fromBalance);
  remainingDebit = roundMoney(remainingDebit - fromBalance);
  const nextWinningMoney = roundMoney(winningMoney - remainingDebit);

  return {
    balance: nextBalance,
    winningMoney: nextWinningMoney,
    walletBalance: nextBalance,
  };
}

export function getFundsDeductionResult(userData, amount) {
  const { balance, winningMoney, total } = getUserFunds(userData);
  const debitAmount = roundMoney(amount);

  if (debitAmount > total) {
    throw new Error("Insufficient balance");
  }

  const debitedFromBalance = roundMoney(Math.min(balance, debitAmount));
  const debitedFromWinnings = roundMoney(debitAmount - debitedFromBalance);

  return {
    debitedFromBalance,
    debitedFromWinnings,
    update: {
      balance: roundMoney(balance - debitedFromBalance),
      winningMoney: roundMoney(winningMoney - debitedFromWinnings),
      walletBalance: roundMoney(balance - debitedFromBalance),
    },
  };
}

export function buildWinningsCreditUpdate(userData, amount) {
  const { balance, winningMoney } = getUserFunds(userData);
  const winnings = roundMoney(amount);

  return {
    balance,
    winningMoney: roundMoney(winningMoney + winnings),
    walletBalance: balance,
  };
}

export async function debitUserFunds(db, userId, amount) {
  return runTransaction(db, async (transaction) => {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await transaction.get(userDocRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const update = buildFundsDeductionUpdate(userDoc.data(), amount);
    transaction.update(userDocRef, update);

    return {
      userDocRef,
      funds: getUserFunds({
        ...userDoc.data(),
        ...update,
      }),
    };
  });
}

export async function creditUserWinnings(db, userId, amount) {
  return runTransaction(db, async (transaction) => {
    const userDocRef = doc(db, "users", userId);
    const userDoc = await transaction.get(userDocRef);

    if (!userDoc.exists()) {
      throw new Error("User not found");
    }

    const update = buildWinningsCreditUpdate(userDoc.data(), amount);
    transaction.update(userDocRef, update);

    return {
      userDocRef,
      funds: getUserFunds({
        ...userDoc.data(),
        ...update,
      }),
    };
  });
}
