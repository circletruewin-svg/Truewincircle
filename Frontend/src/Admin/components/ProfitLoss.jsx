import React, { useEffect, useMemo, useState } from "react";
import { Calendar, CircleDollarSign, Gamepad2, Receipt, TrendingDown, TrendingUp } from "lucide-react";
import { collection, onSnapshot } from "firebase/firestore";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { db } from "../../firebase";
import Loader from "../../components/Loader";
import { calculateGameMetrics, filterAnalyticsRecords, GAME_ANALYTICS_CONFIG } from "../../utils/gameAnalytics";
import { formatCurrency } from "../../utils/formatMoney";
import { getPresetRange } from "../../utils/dateHelpers";

const buildEmptyRows = () =>
  GAME_ANALYTICS_CONFIG.map((config) => ({
    id: config.id,
    label: config.label,
    betCount: 0,
    totalWagered: 0,
    totalPayout: 0,
    net: 0,
  }));

export default function ProfitLoss() {
  const [gameFilter, setGameFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const initialRange = getPresetRange("today");
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);
  const [rows, setRows] = useState(buildEmptyRows);

  const summary = useMemo(() => {
    return rows.reduce(
      (acc, item) => ({
        totalCollection: acc.totalCollection + item.totalWagered,
        loss: acc.loss + item.totalPayout,
        profit: acc.profit + item.net,
        betCount: acc.betCount + item.betCount,
      }),
      { totalCollection: 0, loss: 0, profit: 0, betCount: 0 }
    );
  }, [rows]);

  const setDateRange = (filter) => {
    const { start, end } = getPresetRange(filter);
    setStartDate(start);
    setEndDate(end);
  };

  useEffect(() => {
    setLoading(true);
    const rawData = {};

    const recalculateRows = () => {
      const selectedConfigs =
        gameFilter === "all"
          ? GAME_ANALYTICS_CONFIG
          : GAME_ANALYTICS_CONFIG.filter((config) => config.id === gameFilter);

      const nextRows = selectedConfigs.map((config) => {
        const records = (rawData[config.id] || []).flatMap((entry) => entry.records);
        const filtered = filterAnalyticsRecords(records, startDate, endDate);
        const metrics = calculateGameMetrics(filtered);

        return {
          id: config.id,
          label: config.label,
          betCount: metrics.betCount,
          totalWagered: metrics.totalWagered,
          totalPayout: metrics.totalPayout,
          net: metrics.net,
        };
      });

      setRows(nextRows);
      setLoading(false);
    };

    const unsubscribers = GAME_ANALYTICS_CONFIG.flatMap((config) =>
      config.sources.map((source) =>
        onSnapshot(
          collection(db, source.collection),
          (snapshot) => {
            rawData[config.id] = [
              ...(rawData[config.id] || []).filter((entry) => entry.collection !== source.collection),
              {
                collection: source.collection,
                records: snapshot.docs.map((item) => source.mapRecord(item.data())),
              },
            ];
            recalculateRows();
          },
          (error) => {
            console.error(`Failed to stream profit/loss for ${config.label} from ${source.collection}:`, error);
            setLoading(false);
          }
        )
      )
    );

    return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
  }, [startDate, endDate, gameFilter]);

  return (
    <div className="w-full p-6 grid grid-cols-1 gap-6">
      <div className="rounded-2xl p-6 bg-gray-900 border border-gray-700 shadow-lg text-white">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4">
          <h2 className="text-xl font-semibold flex items-center gap-2">
            <CircleDollarSign className="w-5 h-5" />
            Game Summary
          </h2>
        </div>

        <div className="mb-4 p-4 rounded-xl bg-gray-800 flex flex-wrap items-center justify-start gap-4">
          <div className="flex items-center gap-2">
            <Gamepad2 className="w-4 h-4 text-gray-400" />
            <select
              value={gameFilter}
              onChange={(e) => setGameFilter(e.target.value)}
              className="p-2 rounded-md bg-gray-700 text-gray-200 outline-none"
              disabled={loading}
            >
              <option value="all">All Games</option>
              {GAME_ANALYTICS_CONFIG.map((config) => (
                <option key={config.id} value={config.id}>
                  {config.label}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <button onClick={() => setDateRange("today")} className="p-2 rounded-md bg-gray-700 hover:bg-yellow-500 hover:text-black transition-colors">
              Today
            </button>
            <button onClick={() => setDateRange("yesterday")} className="p-2 rounded-md bg-gray-700 hover:bg-yellow-500 hover:text-black transition-colors">
              Yesterday
            </button>
            <button onClick={() => setDateRange("7days")} className="p-2 rounded-md bg-gray-700 hover:bg-yellow-500 hover:text-black transition-colors">
              Last 7 Days
            </button>
          </div>

          <div className="flex items-center gap-2">
            <Calendar className="w-4 h-4 text-gray-400" />
            <DatePicker
              selected={startDate}
              onChange={(date) => setStartDate(date)}
              selectsStart
              startDate={startDate}
              endDate={endDate}
              className="p-2 rounded-md bg-gray-700 text-gray-200 w-32"
            />
            <span className="text-gray-400">to</span>
            <DatePicker
              selected={endDate}
              onChange={(date) => setEndDate(date)}
              selectsEnd
              startDate={startDate}
              endDate={endDate}
              minDate={startDate}
              className="p-2 rounded-md bg-gray-700 text-gray-200 w-32"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex justify-center items-center h-48">
            <Loader />
          </div>
        ) : (
          <>
            <div className="space-y-3 text-gray-300 text-sm">
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Total amount collected:
                </span>
                <span className="font-semibold text-gray-100">{formatCurrency(summary.totalCollection)}</span>
              </p>
              <p className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-2">
                  <Receipt className="w-4 h-4" /> Total amount paid out:
                </span>
                <span className="font-semibold text-gray-100">{formatCurrency(summary.loss)}</span>
              </p>
              <p className="flex items-center justify-between gap-2 text-green-400">
                <span className="flex items-center gap-2">
                  <TrendingUp className="w-4 h-4" /> Net profit:
                </span>
                <span className="font-bold">{formatCurrency(summary.profit)}</span>
              </p>
              <p className="flex items-center justify-between gap-2 text-red-400">
                <span className="flex items-center gap-2">
                  <TrendingDown className="w-4 h-4" /> Total payouts:
                </span>
                <span className="font-bold">{formatCurrency(summary.loss)}</span>
              </p>
              <p className="flex items-center justify-between gap-2 pt-2 border-t border-gray-700 mt-2">
                <span className="flex items-center gap-2 font-semibold text-base">
                  <CircleDollarSign className="w-5 h-5 text-yellow-400" /> Total bets placed:
                </span>
                <span className="font-bold text-lg text-gray-100">{summary.betCount}</span>
              </p>
            </div>

            <div className="mt-6 overflow-x-auto rounded-xl border border-gray-700">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-800 text-gray-200">
                  <tr>
                    <th className="px-4 py-3 text-left">Game</th>
                    <th className="px-4 py-3 text-right">Bets</th>
                    <th className="px-4 py-3 text-right">Collected</th>
                    <th className="px-4 py-3 text-right">Payout</th>
                    <th className="px-4 py-3 text-right">Net</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-800 text-gray-300">
                      <td className="px-4 py-3 font-semibold text-white">{row.label}</td>
                      <td className="px-4 py-3 text-right">{row.betCount}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.totalWagered)}</td>
                      <td className="px-4 py-3 text-right">{formatCurrency(row.totalPayout)}</td>
                      <td className={`px-4 py-3 text-right font-bold ${row.net >= 0 ? "text-green-400" : "text-red-400"}`}>
                        {formatCurrency(row.net)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
