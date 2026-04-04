import React, { useEffect, useMemo, useState } from "react";
import { collection, onSnapshot, query, Timestamp, where } from "firebase/firestore";
import { Activity, RefreshCw, Users, Wallet } from "lucide-react";
import { db } from "../../firebase";
import { calculateGameMetrics, GAME_ANALYTICS_CONFIG } from "../../utils/gameAnalytics";
import { formatAmount } from "../../utils/formatMoney";

const getRange = (preset) => {
  const now = new Date();
  const start = new Date(now);
  const end = new Date(now);

  if (preset === "yesterday") {
    start.setDate(start.getDate() - 1);
    end.setDate(end.getDate() - 1);
  } else if (preset === "7days") {
    start.setDate(start.getDate() - 6);
  }

  start.setHours(0, 0, 0, 0);
  end.setHours(23, 59, 59, 999);
  return { start: Timestamp.fromDate(start), end: Timestamp.fromDate(end) };
};

export default function GamesStats() {
  const [preset, setPreset] = useState("today");
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);

  const range = useMemo(() => getRange(preset), [preset]);

  useEffect(() => {
    setLoading(true);
    const unsubscribers = GAME_ANALYTICS_CONFIG.map((config) => {
      const statsQuery = query(
        collection(db, config.collection),
        where(config.timeField, ">=", range.start),
        where(config.timeField, "<=", range.end)
      );

      return onSnapshot(
        statsQuery,
        (snapshot) => {
          const records = snapshot.docs.map((item) => {
            const data = item.data();
            return {
              userId: data.userId || null,
              betAmount: Number(data[config.betField] || 0),
              payout: Number(config.payoutResolver(data) || 0),
              createdAt: data[config.timeField] || null,
            };
          });

          const summary = calculateGameMetrics(records);
          const latest = records
            .map((item) => item.createdAt?.toDate?.() || null)
            .filter(Boolean)
            .sort((a, b) => b - a)[0];

          setStats((prev) => {
            const next = prev.filter((item) => item.id !== config.id);
            next.push({
              id: config.id,
              label: config.label,
              betCount: summary.betCount,
              players: summary.userIds.size,
              totalWagered: summary.totalWagered,
              totalPayout: summary.totalPayout,
              net: summary.net,
              latest,
            });
            return next.sort((a, b) => a.label.localeCompare(b.label));
          });
          setLoading(false);
        },
        (error) => {
          console.error(`Failed to stream ${config.label} stats:`, error);
          setLoading(false);
        }
      );
    });

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [range]);

  const totals = stats.reduce(
    (acc, item) => ({
      betCount: acc.betCount + (item.betCount || 0),
      players: acc.players + (item.players || 0),
      totalWagered: acc.totalWagered + (item.totalWagered || 0),
      totalPayout: acc.totalPayout + (item.totalPayout || 0),
      net: acc.net + (item.net || 0),
    }),
    { betCount: 0, players: 0, totalWagered: 0, totalPayout: 0, net: 0 }
  );

  return (
    <div className="p-6 space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Live Casino Game Stats</h3>
          <p className="mt-1 text-sm text-gray-600">Har game par kitna laga, kitna payout gaya, aur real-time net kya chal raha hai.</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {[
            { id: "today", label: "Today" },
            { id: "yesterday", label: "Yesterday" },
            { id: "7days", label: "Last 7 Days" },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => setPreset(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${preset === item.id ? "bg-blue-600 text-white" : "bg-white text-gray-700 border border-gray-200 hover:border-blue-300"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Bet Volume</p>
          <p className="mt-3 text-3xl font-black text-gray-900">?{formatAmount(totals.totalWagered)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Total Payout</p>
          <p className="mt-3 text-3xl font-black text-gray-900">?{formatAmount(totals.totalPayout)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Placed Bets</p>
          <p className="mt-3 text-3xl font-black text-gray-900">{totals.betCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Net P/L</p>
          <p className={`mt-3 text-3xl font-black ${totals.net >= 0 ? "text-green-600" : "text-red-500"}`}>?{formatAmount(totals.net)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 2xl:grid-cols-3">
        {stats.map((item) => (
          <div key={item.id} className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h4 className="text-lg font-bold text-gray-900">{item.label}</h4>
                <p className="text-xs uppercase tracking-[0.2em] text-blue-600">Live tracked</p>
              </div>
              <RefreshCw className={`h-4 w-4 text-blue-500 ${loading ? "animate-spin" : ""}`} />
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Wallet className="h-4 w-4" /> Bet Volume</div>
                <p className="mt-2 text-xl font-black text-slate-900">?{formatAmount(item.totalWagered)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Activity className="h-4 w-4" /> Net</div>
                <p className={`mt-2 text-xl font-black ${item.net >= 0 ? "text-green-600" : "text-red-500"}`}>?{formatAmount(item.net)}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Users className="h-4 w-4" /> Players</div>
                <p className="mt-2 text-xl font-black text-slate-900">{item.players}</p>
              </div>
              <div className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500"><Activity className="h-4 w-4" /> Bets</div>
                <p className="mt-2 text-xl font-black text-slate-900">{item.betCount}</p>
              </div>
            </div>

            <div className="mt-4 rounded-xl border border-gray-100 bg-slate-50 px-4 py-3 text-sm text-slate-600">
              <div className="flex items-center justify-between">
                <span>Payout</span>
                <span className="font-semibold text-slate-900">?{formatAmount(item.totalPayout)}</span>
              </div>
              <div className="mt-2 flex items-center justify-between">
                <span>Latest activity</span>
                <span className="font-semibold text-slate-900">{item.latest ? item.latest.toLocaleString("en-IN") : "No bets yet"}</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
