import { useEffect, useMemo, useState } from "react";
import {
  collection, onSnapshot, query, where, orderBy, limit,
  doc, getDoc, runTransaction, serverTimestamp,
} from "firebase/firestore";
import { db } from "../firebase";
import useAuthStore from "../store/authStore";
import { toast } from "react-toastify";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { getFundsDeductionResult, getUserFunds } from "../utils/userFunds";

// Single card that represents one cricket match and its four bet types.
function MatchCard({ match, balance, onPick }) {
  const start = match.startTime?.toDate?.();
  const bettingClosed = match.status !== "upcoming" || (start && start.getTime() <= Date.now());

  const fmtTime = (d) => d ? d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "";

  const oddsW = match.odds?.winner || {};
  const oddsT = match.odds?.toss || {};
  const oddsTot = match.odds?.total || {};
  const batsmen = match.odds?.topBatsman || [];

  return (
    <div className="bg-[#0a2d55] rounded-2xl border border-white/10 overflow-hidden">
      <div className="bg-gradient-to-r from-emerald-800 to-blue-900 px-4 py-2 flex items-center justify-between">
        <span className="text-xs uppercase tracking-widest text-emerald-200">🏏 {match.matchType || "T20"}</span>
        <span className="text-xs text-emerald-100">{fmtTime(start)}</span>
      </div>

      <div className="px-4 py-3 text-white">
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-bold">
            {match.teamA?.name} <span className="text-yellow-400 mx-1">vs</span> {match.teamB?.name}
          </div>
          {bettingClosed && (
            <span className="text-[10px] bg-red-500/20 text-red-300 border border-red-500/30 px-2 py-0.5 rounded-full">CLOSED</span>
          )}
        </div>

        {/* Match winner */}
        <div className="mb-3">
          <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Match Winner</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              disabled={bettingClosed}
              onClick={() => onPick(match, "winner", "A", `${match.teamA?.short || match.teamA?.name} to win`, oddsW.A)}
              className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 flex flex-col items-center"
            >
              <span className="font-semibold text-sm">{match.teamA?.short || match.teamA?.name}</span>
              <span className="text-yellow-400 text-xs font-bold">{Number(oddsW.A || 0).toFixed(2)}x</span>
            </button>
            <button
              disabled={bettingClosed}
              onClick={() => onPick(match, "winner", "B", `${match.teamB?.short || match.teamB?.name} to win`, oddsW.B)}
              className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 flex flex-col items-center"
            >
              <span className="font-semibold text-sm">{match.teamB?.short || match.teamB?.name}</span>
              <span className="text-yellow-400 text-xs font-bold">{Number(oddsW.B || 0).toFixed(2)}x</span>
            </button>
          </div>
        </div>

        {/* Toss winner */}
        {oddsT.A && oddsT.B && (
          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Toss Winner</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={bettingClosed}
                onClick={() => onPick(match, "toss", "A", `${match.teamA?.short || match.teamA?.name} to win toss`, oddsT.A)}
                className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 text-xs font-semibold flex justify-between px-3"
              >
                <span>{match.teamA?.short || match.teamA?.name}</span>
                <span className="text-yellow-400">{Number(oddsT.A).toFixed(2)}x</span>
              </button>
              <button
                disabled={bettingClosed}
                onClick={() => onPick(match, "toss", "B", `${match.teamB?.short || match.teamB?.name} to win toss`, oddsT.B)}
                className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 text-xs font-semibold flex justify-between px-3"
              >
                <span>{match.teamB?.short || match.teamB?.name}</span>
                <span className="text-yellow-400">{Number(oddsT.B).toFixed(2)}x</span>
              </button>
            </div>
          </div>
        )}

        {/* Total runs Over/Under */}
        {oddsTot.line != null && (
          <div className="mb-3">
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Total Runs (line {oddsTot.line})</p>
            <div className="grid grid-cols-2 gap-2">
              <button
                disabled={bettingClosed}
                onClick={() => onPick(match, "total", "over", `Over ${oddsTot.line} runs`, oddsTot.over, { line: oddsTot.line })}
                className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 text-xs font-semibold flex justify-between px-3"
              >
                <span>Over {oddsTot.line}</span>
                <span className="text-yellow-400">{Number(oddsTot.over).toFixed(2)}x</span>
              </button>
              <button
                disabled={bettingClosed}
                onClick={() => onPick(match, "total", "under", `Under ${oddsTot.line} runs`, oddsTot.under, { line: oddsTot.line })}
                className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 text-xs font-semibold flex justify-between px-3"
              >
                <span>Under {oddsTot.line}</span>
                <span className="text-yellow-400">{Number(oddsTot.under).toFixed(2)}x</span>
              </button>
            </div>
          </div>
        )}

        {/* Top batsman */}
        {batsmen.length > 0 && (
          <div>
            <p className="text-[11px] uppercase tracking-wider text-gray-400 mb-1">Top Batsman</p>
            <div className="grid grid-cols-2 gap-2">
              {batsmen.map((b) => (
                <button
                  key={b.name}
                  disabled={bettingClosed}
                  onClick={() => onPick(match, "topBatsman", b.name, `${b.name} top batsman`, b.odds)}
                  className="bg-[#042346] hover:bg-[#053163] disabled:opacity-40 rounded-lg py-2 text-xs font-semibold flex justify-between px-3"
                >
                  <span className="truncate mr-2">{b.name}</span>
                  <span className="text-yellow-400">{Number(b.odds).toFixed(2)}x</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// Modal where the user enters their bet amount for a picked selection.
function BetModal({ pick, balance, onClose, onPlaced }) {
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const user = useAuthStore((s) => s.user);

  if (!pick) return null;

  const placeBet = async () => {
    const betAmount = parseFloat(amount);
    if (!user) return toast.error("Please log in first.");
    if (!Number.isFinite(betAmount) || betAmount < 10) return toast.error(`Minimum bet ${formatCurrency(10)}`);
    if (betAmount > balance) return toast.error("Insufficient balance.");

    setLoading(true);
    try {
      // Re-check match is still open before committing.
      const matchRef = doc(db, "matches", pick.match.id);
      const fresh = await getDoc(matchRef);
      if (!fresh.exists() || fresh.data().status !== "upcoming") {
        throw new Error("Match is no longer accepting bets.");
      }
      const start = fresh.data().startTime?.toDate?.();
      if (start && start.getTime() <= Date.now()) {
        throw new Error("Match already started.");
      }

      await runTransaction(db, async (tx) => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await tx.get(userRef);
        if (!userSnap.exists()) throw new Error("User not found.");
        const deduction = getFundsDeductionResult(userSnap.data(), betAmount);
        tx.update(userRef, deduction.update);

        const betRef = doc(collection(db, "sportsBets"));
        tx.set(betRef, {
          userId: user.uid,
          matchId: pick.match.id,
          teamASnapshot: pick.match.teamA?.short || pick.match.teamA?.name,
          teamBSnapshot: pick.match.teamB?.short || pick.match.teamB?.name,
          betType: pick.betType,
          selection: pick.selection,
          selectionLabel: pick.label,
          oddsAtBet: Number(pick.odds),
          betAmount,
          line: pick.extra?.line ?? null,
          debitedFromBalance: deduction.debitedFromBalance,
          debitedFromWinnings: deduction.debitedFromWinnings,
          status: "pending",
          createdAt: serverTimestamp(),
        });
      });
      toast.success(`Bet placed: ${pick.label} @ ${Number(pick.odds).toFixed(2)}x`);
      onPlaced();
    } catch (err) {
      toast.error(err.message || "Failed to place bet.");
    } finally {
      setLoading(false);
    }
  };

  const potential = Number.isFinite(parseFloat(amount)) ? (parseFloat(amount) * Number(pick.odds)).toFixed(2) : "0.00";

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0a2d55] rounded-2xl p-5 border border-white/10 text-white">
        <div className="flex items-start justify-between mb-3">
          <div>
            <p className="text-xs text-gray-400">{pick.match.teamA?.name} vs {pick.match.teamB?.name}</p>
            <p className="font-bold text-lg">{pick.label}</p>
            <p className="text-yellow-400 font-bold">{Number(pick.odds).toFixed(2)}x</p>
          </div>
          <button onClick={onClose} className="text-gray-300 text-2xl leading-none px-2">×</button>
        </div>

        <label className="block text-xs text-gray-400 mb-1">Bet amount</label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder={`Min ${formatCurrency(10)}`}
          className="w-full bg-[#042346] border border-white/10 rounded-lg px-3 py-2.5 text-white mb-3"
        />

        <div className="grid grid-cols-4 gap-2 mb-3">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => setAmount((p) => String((parseFloat(p) || 0) + v))}
              className="bg-[#042346] hover:bg-[#053163] rounded-lg py-1.5 text-xs font-bold"
            >
              +{formatCurrency(v)}
            </button>
          ))}
        </div>

        <div className="flex justify-between text-sm text-gray-300 mb-3">
          <span>Balance: {formatCurrency(balance)}</span>
          <span>Return: <span className="text-green-300 font-semibold">₹{potential}</span></span>
        </div>

        <button
          disabled={loading}
          onClick={placeBet}
          className="w-full bg-yellow-500 text-black font-bold rounded-lg py-3 disabled:opacity-40"
        >
          {loading ? "Placing..." : "Place Bet"}
        </button>
      </div>
    </div>
  );
}

function MyBetsPanel({ matches }) {
  const user = useAuthStore((s) => s.user);
  const [bets, setBets] = useState([]);

  useEffect(() => {
    if (!user?.uid) { setBets([]); return; }
    const q = query(
      collection(db, "sportsBets"),
      where("userId", "==", user.uid),
      orderBy("createdAt", "desc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => setBets(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => unsub();
  }, [user?.uid]);

  if (!bets.length) return null;

  return (
    <div className="mt-4">
      <h3 className="text-sm font-bold text-yellow-400 mb-2">MY RECENT BETS</h3>
      <div className="space-y-2">
        {bets.map((b) => (
          <div key={b.id} className={`rounded-lg p-3 border text-xs flex justify-between items-center ${
            b.status === "won" ? "bg-green-900/30 border-green-600/40" :
            b.status === "lost" ? "bg-red-900/30 border-red-600/40" :
            b.status === "refunded" ? "bg-gray-800/40 border-gray-600/40" :
            "bg-[#0a2d55] border-white/10"
          }`}>
            <div className="text-white">
              <div className="font-semibold">{b.selectionLabel}</div>
              <div className="text-gray-300 text-[11px]">{b.teamASnapshot} vs {b.teamBSnapshot} • {Number(b.oddsAtBet).toFixed(2)}x</div>
            </div>
            <div className="text-right">
              <div className="text-white">{formatCurrency(b.betAmount)}</div>
              <div className={`font-bold ${
                b.status === "won" ? "text-green-300" :
                b.status === "lost" ? "text-red-300" :
                b.status === "refunded" ? "text-gray-300" :
                "text-yellow-400"
              }`}>
                {b.status === "won" ? `+${formatCurrency(b.winAmount)}` :
                 b.status === "lost" ? `-${formatCurrency(b.betAmount)}` :
                 b.status === "refunded" ? "Refunded" :
                 "Pending"}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function SportsBetting() {
  const user = useAuthStore((s) => s.user);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [balance, setBalance] = useState(0);
  const [pick, setPick] = useState(null); // { match, betType, selection, label, odds, extra }

  useEffect(() => {
    if (!user?.uid) return undefined;
    const unsub = onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setBalance(getUserFunds(snap.data()).total);
    });
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("status", "==", "upcoming"),
      orderBy("startTime", "asc"),
      limit(20)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const onPick = (match, betType, selection, label, odds, extra = {}) => {
    setPick({ match, betType, selection, label, odds, extra });
  };

  return (
    <div className="min-h-screen bg-[#042346] text-white pb-10 pt-20">
      <Navbar />
      <div className="max-w-3xl mx-auto px-4">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-black text-yellow-400">🏏 CRICKET BETTING</h1>
            <p className="text-xs text-gray-400">IPL & all cricket matches</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] text-gray-400">Balance</p>
            <p className="font-bold text-green-300">{formatCurrency(balance)}</p>
          </div>
        </div>

        {loading ? (
          <p className="text-center text-gray-400 py-10">Loading matches…</p>
        ) : matches.length === 0 ? (
          <div className="text-center py-10 bg-[#0a2d55] rounded-xl border border-white/10">
            <p className="text-gray-300">No matches available right now.</p>
            <p className="text-xs text-gray-500 mt-1">New matches are published by the admin — check back soon.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {matches.map((m) => (
              <MatchCard key={m.id} match={m} balance={balance} onPick={onPick} />
            ))}
          </div>
        )}

        <MyBetsPanel matches={matches} />
      </div>

      {pick && <BetModal pick={pick} balance={balance} onClose={() => setPick(null)} onPlaced={() => setPick(null)} />}
    </div>
  );
}
