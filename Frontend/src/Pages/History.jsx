import React, { useEffect, useState } from "react";
import { AlertTriangle, Clock, ShieldX, Trophy } from "lucide-react";
import { db } from "../firebase";
import Loader from "../components/Loader";
import Navbar from "../components/Navbar";
import useAuthStore from "../store/authStore";
import { formatDateTime, toDateValue } from "../utils/dateHelpers";
import { formatCurrency } from "../utils/formatMoney";
import { fetchUserHistoryRecords } from "../utils/userHistorySources";

const History = () => {
  const user = useAuthStore((state) => state.user);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.uid) {
        setError("Please log in to view your history.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const gameRecords = await fetchUserHistoryRecords(db, user);
        const gameItems = gameRecords
          .map((record) => ({
            id: `game-${record.sourceId}-${record.id}`,
            gameName: record.gameName,
            title: record.title,
            status: record.status,
            amount: Number(record.amount || 0),
            payout: Number(record.payout || 0),
            date: toDateValue(record.createdAt),
          }))
          .filter((item) => item.date)
          .sort((a, b) => b.date.getTime() - a.date.getTime());

        setHistory(gameItems);
      } catch (err) {
        console.error("Error fetching bet history:", err);
        setError("Failed to load bet history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user]);

  const renderHistoryItem = (item) => {
    const Icon = item.status === "win" ? <Trophy className="text-yellow-500" /> : item.status === "loss" ? <ShieldX className="text-red-500" /> : <Clock className="text-blue-400" />;
    const amountColor = item.status === "win" ? "text-yellow-400" : item.status === "loss" ? "text-red-400" : "text-blue-300";
    const payoutLabel = item.status === "win" && item.payout > 0 ? `Win ${formatCurrency(item.payout)}` : item.status === "loss" ? "Loss" : "Bet placed";

    const stamp = formatDateTime(item.date);

    return (
      <div key={item.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-4">
          <div className="p-2 rounded-full bg-gray-900">{Icon}</div>
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="text-xs text-gray-400">{stamp.date} {stamp.time}</p>
            <p className="text-xs text-gray-500 mt-0.5">{item.gameName}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-bold text-lg ${amountColor}`}>{formatCurrency(item.amount || 0)}</p>
          <p className="text-xs capitalize font-semibold text-gray-400">
            {payoutLabel}
          </p>
        </div>
      </div>
    );
  };

  if (loading) return <Loader />;

  if (error) {
    return (
      <div className="text-center text-red-400 mt-20 p-4 flex flex-col items-center">
        <AlertTriangle className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-semibold">An Error Occurred</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="font-roboto bg-gray-900 text-white min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto p-4 pt-24">
        <h1 className="text-3xl font-black text-yellow-400 mb-6 text-center">Bet History</h1>

        {history.length === 0 ? (
          <p className="text-center text-gray-400">Aapki abhi tak koi bet history nahi mili.</p>
        ) : (
          <div className="space-y-4">{history.map(renderHistoryItem)}</div>
        )}
      </div>
    </div>
  );
};

export default History;
