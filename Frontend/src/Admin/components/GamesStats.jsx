import { useState, useEffect } from "react";
import { db } from "../../firebase";
import { collection, query, orderBy, limit, onSnapshot, getDocs, where, Timestamp } from "firebase/firestore";

const GAME_COLLECTIONS = [
  { id: "aviator",      label: "✈️ Aviator",      col: "aviatorBets"      },
  { id: "colorPredict", label: "🎨 Color Predict", col: "colorBets"        },
  { id: "teenPatti",    label: "🃏 Teen Patti",     col: "teenPattiHistory" },
  { id: "dragonTiger",  label: "🐉 Dragon Tiger",   col: "dtHistory"        },
  { id: "andarBahar",   label: "🎴 Andar Bahar",    col: "abHistory"        },
  { id: "coinFlip",     label: "🪙 Coin Flip",      col: "coinFlipHistory"  },
  { id: "diceRoll",     label: "🎲 Dice Roll",      col: "diceBets"         },
];

export default function GamesStats() {
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [filterDays, setFilterDays] = useState(7);
  const [selectedGame, setSelectedGame] = useState(null);
  const [recentBets, setRecentBets] = useState([]);

  useEffect(() => {
    const fetchAll = async () => {
      setLoading(true);
      const since = Timestamp.fromDate(new Date(Date.now() - filterDays * 24 * 60 * 60 * 1000));
      const allStats = {};
      await Promise.all(GAME_COLLECTIONS.map(async (game) => {
        try {
          const snap = await getDocs(query(collection(db, game.col), where("createdAt", ">=", since)));
          let totalBets = 0, totalWagered = 0, totalPaidOut = 0, totalWon = 0;
          snap.forEach((doc) => {
            const d = doc.data();
            const betAmt = d.betAmount || d.amount || 0;
            const winAmt = d.winAmount || d.win || 0;
            const won = d.won === true || d.status === "won";
            totalBets++;
            totalWagered += parseFloat(betAmt) || 0;
            if (won) { totalWon++; totalPaidOut += parseFloat(winAmt) || 0; }
          });
          allStats[game.id] = { totalBets, totalWagered, totalPaidOut, totalWon };
        } catch (e) {
          allStats[game.id] = { totalBets: 0, totalWagered: 0, totalPaidOut: 0, totalWon: 0 };
        }
      }));
      setStats(allStats);
      setLoading(false);
    };
    fetchAll();
  }, [filterDays]);

  useEffect(() => {
    if (!selectedGame) { setRecentBets([]); return; }
    const game = GAME_COLLECTIONS.find((g) => g.id === selectedGame);
    if (!game) return;
    const unsub = onSnapshot(
      query(collection(db, game.col), orderBy("createdAt", "desc"), limit(20)),
      (snap) => setRecentBets(snap.docs.map((d) => ({ id: d.id, ...d.data() })))
    );
    return () => unsub();
  }, [selectedGame]);

  const totals = Object.values(stats).reduce(
    (acc, s) => ({ bets: acc.bets + (s.totalBets||0), wagered: acc.wagered + (s.totalWagered||0), paidOut: acc.paidOut + (s.totalPaidOut||0), won: acc.won + (s.totalWon||0) }),
    { bets: 0, wagered: 0, paidOut: 0, won: 0 }
  );
  const profit = totals.wagered - totals.paidOut;
  const winRate = totals.bets ? ((totals.won / totals.bets) * 100).toFixed(1) : "0.0";
  const fmt = (n) => `₹${Math.round(n).toLocaleString("en-IN")}`;

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-black text-gray-800">🎮 Games Profit & Stats</h2>
        <div className="flex gap-2">
          {[1, 7, 30].map((d) => (
            <button key={d} onClick={() => setFilterDays(d)}
              className={`px-4 py-1.5 rounded-lg text-sm font-semibold ${filterDays === d ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"}`}>
              {d === 1 ? "Today" : d === 7 ? "7 days" : "30 days"}
            </button>
          ))}
        </div>
      </div>

      {loading ? <div className="text-center py-12 text-gray-400">Loading stats...</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            {[
              { label: "Total Bets", value: totals.bets, color: "bg-blue-50 text-blue-800" },
              { label: "Total Wagered", value: fmt(totals.wagered), color: "bg-indigo-50 text-indigo-800" },
              { label: "Paid Out", value: fmt(totals.paidOut), color: "bg-orange-50 text-orange-800" },
              { label: "🏦 House Profit", value: fmt(profit), color: profit >= 0 ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700" },
            ].map((c) => (
              <div key={c.label} className={`rounded-xl p-4 ${c.color}`}>
                <div className="text-xs font-semibold opacity-75">{c.label}</div>
                <div className="text-xl font-black">{c.value}</div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
              <div className="text-xs font-semibold opacity-75">User Win Rate</div>
              <div className="text-xl font-black">{winRate}%</div>
            </div>
            <div className="rounded-xl p-4 bg-gray-50 text-gray-700">
              <div className="text-xs font-semibold opacity-75">House Edge</div>
              <div className="text-xl font-black">{(100 - parseFloat(winRate)).toFixed(1)}%</div>
            </div>
          </div>

          <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden mb-6">
            <div className="px-4 py-3 bg-gray-50 border-b text-sm font-bold text-gray-600">
              Click any row to see recent bets
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                    <th className="px-4 py-3 text-left">Game</th>
                    <th className="px-4 py-3 text-left">Bets</th>
                    <th className="px-4 py-3 text-left">Wagered</th>
                    <th className="px-4 py-3 text-left">Paid Out</th>
                    <th className="px-4 py-3 text-left">Profit</th>
                    <th className="px-4 py-3 text-left">Win%</th>
                  </tr>
                </thead>
                <tbody>
                  {GAME_COLLECTIONS.map((game) => {
                    const s = stats[game.id] || {};
                    const p = (s.totalWagered||0) - (s.totalPaidOut||0);
                    const wr = s.totalBets ? ((s.totalWon/s.totalBets)*100).toFixed(1) : "0.0";
                    return (
                      <tr key={game.id} onClick={() => setSelectedGame(game.id)}
                        className={`cursor-pointer border-b hover:bg-gray-50 ${selectedGame === game.id ? "bg-blue-50" : ""}`}>
                        <td className="px-4 py-3 font-semibold">{game.label}</td>
                        <td className="px-4 py-3">{s.totalBets||0}</td>
                        <td className="px-4 py-3 font-semibold">{fmt(s.totalWagered||0)}</td>
                        <td className="px-4 py-3">{fmt(s.totalPaidOut||0)}</td>
                        <td className={`px-4 py-3 font-black ${p >= 0 ? "text-green-600" : "text-red-500"}`}>{fmt(p)}</td>
                        <td className="px-4 py-3">
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${parseFloat(wr)<=12?"bg-green-100 text-green-700":"bg-red-100 text-red-600"}`}>{wr}%</span>
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-gray-50 font-black text-gray-800 border-t-2">
                    <td className="px-4 py-3">TOTAL</td>
                    <td className="px-4 py-3">{totals.bets}</td>
                    <td className="px-4 py-3">{fmt(totals.wagered)}</td>
                    <td className="px-4 py-3">{fmt(totals.paidOut)}</td>
                    <td className={`px-4 py-3 text-lg ${profit>=0?"text-green-600":"text-red-500"}`}>{fmt(profit)}</td>
                    <td className="px-4 py-3">{winRate}%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {selectedGame && (
            <div className="bg-white rounded-2xl shadow border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 bg-gray-50 border-b flex justify-between items-center">
                <span className="font-bold text-gray-700">
                  {GAME_COLLECTIONS.find(g=>g.id===selectedGame)?.label} — Recent Bets
                </span>
                <button onClick={() => setSelectedGame(null)} className="text-gray-400 hover:text-gray-600 text-xl font-bold">×</button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                      <th className="px-4 py-2 text-left">User</th>
                      <th className="px-4 py-2 text-left">Bet</th>
                      <th className="px-4 py-2 text-left">Won</th>
                      <th className="px-4 py-2 text-left">Payout</th>
                      <th className="px-4 py-2 text-left">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {recentBets.map((b) => {
                      const won = b.won === true || b.status === "won";
                      const ts = b.createdAt?.toDate?.();
                      return (
                        <tr key={b.id} className="border-b">
                          <td className="px-4 py-2 text-gray-400 text-xs font-mono">{b.userId?.slice(0,10)}...</td>
                          <td className="px-4 py-2 font-semibold">₹{b.betAmount||b.amount||0}</td>
                          <td className="px-4 py-2">{won ? <span className="text-green-600 font-bold">✅</span> : <span className="text-red-500 font-bold">❌</span>}</td>
                          <td className="px-4 py-2">{won ? `₹${b.winAmount||b.win||0}` : "—"}</td>
                          <td className="px-4 py-2 text-gray-400 text-xs">{ts ? ts.toLocaleTimeString("en-IN",{hour:"2-digit",minute:"2-digit"}) : "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
