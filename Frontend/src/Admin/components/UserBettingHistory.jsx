import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import Loader from "../../components/Loader";
import { formatCurrency } from "../../utils/formatMoney";
import { formatDateTime, toDateValue } from "../../utils/dateHelpers";
import { fetchUserHistoryRecords, summarizeUserHistory } from "../../utils/userHistorySources";

const UserBettingHistory = ({ userId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAllBetHistory = async () => {
      if (!userId) {
        setLoading(false);
        return;
      }

      setLoading(true);
      try {
        const allBets = await fetchUserHistoryRecords(db, userId);
        setHistory(allBets);
      } catch (error) {
        console.error("Error fetching combined bet history:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchAllBetHistory();
  }, [userId]);

  if (loading) {
    return <div className="flex justify-center items-center p-8"><Loader /></div>;
  }

  const summary = summarizeUserHistory(history);

  return (
    <div className="bg-gray-50 p-4 md:p-6 rounded-lg shadow-lg mt-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">Combined Betting History</h2>

      <div className="grid grid-cols-2 gap-4 mb-4">
        <div className="bg-green-100 p-4 rounded-lg">
          <p className="text-sm text-green-800">Total Wins</p>
          <p className="text-2xl font-bold text-green-600">{summary.winCount}</p>
          <p className="text-sm font-semibold text-green-700">+{formatCurrency(summary.win)}</p>
        </div>
        <div className="bg-red-100 p-4 rounded-lg">
          <p className="text-sm text-red-800">Total Losses</p>
          <p className="text-2xl font-bold text-red-600">{summary.lossCount}</p>
          <p className="text-sm font-semibold text-red-700">-{formatCurrency(summary.loss)}</p>
        </div>
      </div>

      {history.length === 0 ? (
        <p className="text-gray-500 text-center py-4">No betting history found for this user.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left min-w-[820px]">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600 text-sm">
                <th className="p-3">Game</th>
                <th className="p-3">Round</th>
                <th className="p-3">Date/Time</th>
                <th className="p-3 text-right">Bet</th>
                <th className="p-3 text-right">Payout</th>
                <th className="p-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {history.map((bet) => {
                const stamp = formatDateTime(bet.createdAt);
                return (
                  <tr key={`${bet.gameName}-${bet.id}`} className="border-b border-gray-200 last:border-0 hover:bg-gray-100">
                    <td className="p-3 font-semibold">{bet.gameName}</td>
                    <td className="p-3">
                      <div className="font-semibold text-gray-800">{bet.title}</div>
                      <div className="text-xs text-gray-500">{bet.subtitle}</div>
                    </td>
                    <td className="p-3 text-xs text-gray-600">
                      <div>{stamp.date}</div>
                      <div>{stamp.time}</div>
                    </td>
                    <td className="p-3 text-right">{formatCurrency(bet.amount)}</td>
                    <td className={`p-3 text-right font-bold ${Number(bet.payout || 0) > 0 ? "text-green-500" : "text-gray-500"}`}>
                      {Number(bet.payout || 0) > 0 ? formatCurrency(bet.payout) : "-"}
                    </td>
                    <td className={`p-3 text-center font-semibold capitalize ${
                      bet.status === 'win' ? 'text-green-500' : 
                      bet.status === 'loss' ? 'text-red-500' :
                      'text-gray-500'
                    }`}>
                      {bet.status}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};

export default UserBettingHistory;
