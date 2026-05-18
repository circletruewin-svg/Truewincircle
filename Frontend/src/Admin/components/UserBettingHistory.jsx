import React, { useEffect, useMemo, useState, useCallback } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../../firebase";
import Loader from "../../components/Loader";
import { formatCurrency } from "../../utils/formatMoney";
import { formatDateTime, toDateValue } from "../../utils/dateHelpers";
import { fetchUserHistoryRecords, summarizeUserHistory } from "../../utils/userHistorySources";

const UserBettingHistory = ({ userIdentity, userId }) => {
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Filters (client-side; full history is already fetched).
  const [gameFilter, setGameFilter] = useState("all");
  const [rangePreset, setRangePreset] = useState("all"); // all|today|yesterday|last7|custom
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  const targetIdentity = userIdentity || userId;

  const fetchAllBetHistory = useCallback(async () => {
    if (!targetIdentity) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const gameRecords = await fetchUserHistoryRecords(db, targetIdentity);
      setHistory(
        [...gameRecords].sort(
          (a, b) => (toDateValue(b.createdAt)?.getTime() || 0) - (toDateValue(a.createdAt)?.getTime() || 0)
        )
      );
    } catch (error) {
      console.error("Error fetching bet history:", error);
    } finally {
      setLoading(false);
    }
  }, [targetIdentity]);

  useEffect(() => { fetchAllBetHistory(); }, [fetchAllBetHistory, refreshKey]);

  // Live tail on harufBets for THIS user so the moment a market is
  // settled / a new bet placed, the panel re-fetches the full bet
  // feed and the row's status flips from pending → win/loss without
  // anybody clicking Refresh.
  useEffect(() => {
    const uid = typeof targetIdentity === 'string' ? targetIdentity : targetIdentity?.uid;
    if (!uid) return undefined;
    const q = query(collection(db, "harufBets"), where("userId", "==", uid));
    return onSnapshot(q, () => setRefreshKey((k) => k + 1), () => {});
  }, [targetIdentity]);

  // Distinct game / market names present in this user's history.
  const gameOptions = useMemo(() => {
    const set = new Set();
    history.forEach((b) => { if (b.gameName) set.add(b.gameName); });
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [history]);

  // [start, end] Date bounds for the active preset / custom range.
  const dateBounds = useMemo(() => {
    const startOfDay = (d) => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
    const endOfDay = (d) => { const x = new Date(d); x.setHours(23, 59, 59, 999); return x; };
    const now = new Date();
    if (rangePreset === "today") return [startOfDay(now), endOfDay(now)];
    if (rangePreset === "yesterday") {
      const y = new Date(now); y.setDate(y.getDate() - 1);
      return [startOfDay(y), endOfDay(y)];
    }
    if (rangePreset === "last7") {
      const s = new Date(now); s.setDate(s.getDate() - 6);
      return [startOfDay(s), endOfDay(now)];
    }
    if (rangePreset === "custom") {
      const s = fromDate ? startOfDay(new Date(fromDate)) : null;
      const e = toDate ? endOfDay(new Date(toDate)) : null;
      return [s, e];
    }
    return [null, null]; // 'all'
  }, [rangePreset, fromDate, toDate]);

  const filtered = useMemo(() => {
    const [start, end] = dateBounds;
    return history.filter((b) => {
      if (gameFilter !== "all" && b.gameName !== gameFilter) return false;
      if (start || end) {
        const d = toDateValue(b.createdAt);
        if (!d) return false;
        if (start && d < start) return false;
        if (end && d > end) return false;
      }
      return true;
    });
  }, [history, gameFilter, dateBounds]);

  const filteredBetTotal = useMemo(
    () => filtered.reduce((s, b) => s + Number(b.amount || 0), 0),
    [filtered],
  );

  if (loading) {
    return <div className="flex justify-center items-center p-8"><Loader /></div>;
  }

  const summary = summarizeUserHistory(filtered);
  const presetBtn = (key, label) => (
    <button
      onClick={() => { setRangePreset(key); if (key !== "custom") { setFromDate(""); setToDate(""); } }}
      className={`text-xs font-semibold px-3 py-1.5 rounded-full border ${
        rangePreset === key
          ? "bg-blue-600 text-white border-blue-600"
          : "bg-white text-gray-700 border-gray-300 hover:bg-gray-100"
      }`}
    >{label}</button>
  );

  return (
    <div className="bg-gray-50 p-4 md:p-6 rounded-lg shadow-lg mt-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">Betting History</h2>
        <button
          onClick={() => setRefreshKey((k) => k + 1)}
          className="text-xs bg-blue-600 hover:bg-blue-700 text-white font-semibold px-3 py-1.5 rounded"
        >🔄 Refresh</button>
      </div>

      {/* Filters */}
      <div className="bg-white border border-gray-200 rounded-lg p-3 mb-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Game / Market</label>
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm min-w-[160px]"
            >
              <option value="all">All games</option>
              {gameOptions.map((g) => <option key={g} value={g}>{g}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[200px]">
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">Period</label>
            <div className="flex flex-wrap gap-1.5">
              {presetBtn("all", "All")}
              {presetBtn("today", "Today")}
              {presetBtn("yesterday", "Yesterday")}
              {presetBtn("last7", "Last 7 days")}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">From</label>
            <input
              type="date"
              value={fromDate}
              max={toDate || undefined}
              onChange={(e) => { setFromDate(e.target.value); setRangePreset("custom"); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="block text-[10px] uppercase tracking-wide text-gray-500 mb-1">To</label>
            <input
              type="date"
              value={toDate}
              min={fromDate || undefined}
              onChange={(e) => { setToDate(e.target.value); setRangePreset("custom"); }}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm"
            />
          </div>
          {(gameFilter !== "all" || rangePreset !== "all") && (
            <button
              onClick={() => { setGameFilter("all"); setRangePreset("all"); setFromDate(""); setToDate(""); }}
              className="text-xs font-semibold px-3 py-1.5 rounded-full bg-gray-200 hover:bg-gray-300 text-gray-700"
            >✕ Clear filters</button>
          )}
        </div>
        <p className="text-xs text-gray-500">
          Showing <b>{filtered.length}</b> bets · Total lagaya: <b>{formatCurrency(filteredBetTotal)}</b>
          {gameFilter !== "all" ? <> · <b>{gameFilter}</b></> : null}
        </p>
      </div>

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

      {filtered.length === 0 ? (
        <p className="text-gray-500 text-center py-4">
          {history.length === 0
            ? "No bet history found for this user."
            : "In filters me koi bet nahi mili — filter badlein ya Clear karein."}
        </p>
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
              {filtered.map((bet) => {
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
