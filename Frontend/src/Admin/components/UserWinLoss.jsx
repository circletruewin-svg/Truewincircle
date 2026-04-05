import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { formatCurrency } from "../../utils/formatMoney";
import { fetchUserHistoryRecords, summarizeUserHistory } from "../../utils/userHistorySources";

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
        const records = await fetchUserHistoryRecords(db, userId);
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
