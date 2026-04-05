import { collection, getDocs, query, where } from "firebase/firestore";
import { toDateValue } from "./dateHelpers";

const safeQueryDocs = async (db, collectionName, clauses = []) => {
  try {
    const constraints = clauses.map(([field, op, value]) => where(field, op, value));
    const snapshot = await getDocs(query(collection(db, collectionName), ...constraints));
    return snapshot.docs;
  } catch (error) {
    console.error(`Failed to fetch ${collectionName}:`, error);
    return [];
  }
};

export async function fetchFinancialHistory(db, userId) {
  const [depositDocs, withdrawalDocs, transactionDocs] = await Promise.all([
    safeQueryDocs(db, "top-ups", [["userId", "==", userId]]),
    safeQueryDocs(db, "withdrawals", [["userId", "==", userId]]),
    safeQueryDocs(db, "transactions", [["userId", "==", userId]]),
  ]);

  const deposits = depositDocs
    .map((docSnap) => {
      const data = docSnap.data();
      const date = toDateValue(data.createdAt);
      if (!date) return null;
      return {
        id: `deposit-${docSnap.id}`,
        type: "deposit",
        title: "Deposit",
        subtitle: data.status || "pending",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  const withdrawals = withdrawalDocs
    .map((docSnap) => {
      const data = docSnap.data();
      const date = toDateValue(data.createdAt);
      if (!date) return null;
      return {
        id: `withdrawal-${docSnap.id}`,
        type: "withdrawal",
        title: data.method === "upi" ? "Withdrawal (UPI)" : data.method === "bank" ? "Withdrawal (Bank)" : "Withdrawal",
        subtitle: data.status || "pending",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  const referralBonuses = transactionDocs
    .map((docSnap) => {
      const data = docSnap.data();
      if (data.type !== "referral_bonus") return null;
      const date = toDateValue(data.createdAt);
      if (!date) return null;
      return {
        id: `referral-${docSnap.id}`,
        type: "referral_bonus",
        title: "Referral Bonus",
        subtitle: "Received",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  return [...deposits, ...withdrawals, ...referralBonuses];
}
