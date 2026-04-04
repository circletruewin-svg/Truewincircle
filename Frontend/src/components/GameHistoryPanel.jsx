import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import { formatCurrency } from "../utils/formatMoney";
import { toDateValue } from "../utils/dateHelpers";

const defaultMapper = (docSnap) => {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    title: data.betSide || data.betColor || data.betType || data.number || data.result || "Bet",
    subtitle: data.status || data.winner || data.result || "Round",
    amount: Number(data.betAmount ?? data.amount ?? 0),
    payout: Number(data.winAmount ?? data.winnings ?? 0),
    status: data.won === true ? "win" : data.won === false ? "loss" : data.status || "done",
    createdAt: data.createdAt || data.timestamp || null,
  };
};

export default function GameHistoryPanel({ userId, collectionName, title = "Your Recent History", mapRecord = defaultMapper }) {
  const [items, setItems] = useState([]);

  useEffect(() => {
    if (!userId) {
      setItems([]);
      return;
    }

    const historyQuery = query(collection(db, collectionName), where("userId", "==", userId));
    return onSnapshot(historyQuery, (snapshot) => {
      const nextItems = snapshot.docs
        .map((docSnap) => mapRecord(docSnap))
        .filter((item) => item)
        .sort((a, b) => (toDateValue(b.createdAt)?.getTime() || 0) - (toDateValue(a.createdAt)?.getTime() || 0))
        .slice(0, 10);
      setItems(nextItems);
    });
  }, [collectionName, mapRecord, userId]);

  const summary = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.totalBet += Number(item.amount || 0);
        acc.totalPayout += Number(item.payout || 0);
        return acc;
      },
      { totalBet: 0, totalPayout: 0 }
    );
  }, [items]);

  return (
    <div className="mt-6 rounded-2xl border border-gray-800 bg-[#12152b] p-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-lg font-black text-white">{title}</h3>
          <p className="text-xs uppercase tracking-[0.24em] text-gray-400">Latest 10 bets</p>
        </div>
        <div className="flex gap-3 text-xs">
          <span className="rounded-full bg-gray-800 px-3 py-1 text-gray-300">Bet {formatCurrency(summary.totalBet)}</span>
          <span className="rounded-full bg-gray-800 px-3 py-1 text-green-300">Payout {formatCurrency(summary.totalPayout)}</span>
        </div>
      </div>

      {items.length === 0 ? (
        <div className="mt-4 rounded-xl bg-[#0b0d1a] px-4 py-6 text-center text-sm text-gray-400">Abhi tak is game ki koi history nahi hai.</div>
      ) : (
        <div className="mt-4 space-y-2">
          {items.map((item) => {
            const createdAt = toDateValue(item.createdAt);
            const statusClass =
              item.status === "win"
                ? "text-green-400"
                : item.status === "loss"
                  ? "text-red-400"
                  : "text-yellow-300";

            return (
              <div key={item.id} className="grid grid-cols-[1fr_auto] gap-3 rounded-xl bg-[#0b0d1a] px-4 py-3">
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-bold text-white">{item.title}</p>
                    <span className={`text-xs font-semibold uppercase ${statusClass}`}>{item.status}</span>
                  </div>
                  <p className="text-sm text-gray-400">{item.subtitle}</p>
                  <p className="text-xs text-gray-500">{createdAt ? createdAt.toLocaleString("en-IN") : "N/A"}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold text-gray-300">Bet {formatCurrency(item.amount)}</p>
                  <p className={`text-sm font-black ${Number(item.payout || 0) > 0 ? "text-green-400" : "text-gray-400"}`}>
                    {Number(item.payout || 0) > 0 ? `Won ${formatCurrency(item.payout)}` : "No payout"}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
