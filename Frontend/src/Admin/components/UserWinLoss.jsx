import React, { useEffect, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import { formatCurrency } from "../../utils/formatMoney";
import { summarizeUserHistory, USER_HISTORY_SOURCES } from "../../utils/userHistorySources";

const UserWinLoss = ({ userId }) => {
  const [winLoss, setWinLoss] = useState({ win: 0, loss: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const snapshots = await Promise.all(
          USER_HISTORY_SOURCES.map((source) =>
            getDocs(query(collection(db, source.collection), where("userId", "==", userId)))
          )
        );

        const records = snapshots.flatMap((snapshot, index) =>
          snapshot.docs.map((docSnap) => USER_HISTORY_SOURCES[index].mapRecord(docSnap))
        );

        const summary = summarizeUserHistory(records);
        setWinLoss({ win: summary.win, loss: summary.loss });
      } catch (error) {
        console.error(`Error fetching win/loss for user ${userId}`, error);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [userId]);

  if (loading) {
    return <span className="text-xs text-gray-400">...</span>;
  }

  return (
    <span className="flex items-center gap-2">
      <span className="text-green-500 font-medium text-xs">(W: {formatCurrency(winLoss.win)})</span>
      <span className="text-red-500 font-medium text-xs">(L: {formatCurrency(winLoss.loss)})</span>
    </span>
  );
};

export default UserWinLoss;
