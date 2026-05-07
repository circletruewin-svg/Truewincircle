import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { get32CardsWinner } from "../utils/houseEdge";

const PLAYERS = ["A", "B", "C", "D"];
const PAYOUT = 3.8;

const ROUND_DRAWS = 8; // each player gets ~2 cards across the simulated round

export default function Cards32() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [pick, setPick] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [scores, setScores] = useState({ A: 0, B: 0, C: 0, D: 0 });
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const play = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!pick) return setMsg("Pick A / B / C / D first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("dealing");
    setMsg("");
    setWinner(null);
    setScores({ A: 0, B: 0, C: 0, D: 0 });

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    const intendedWinner = get32CardsWinner(pick);
    // Build scores so the intended player ends up highest.
    const finalScores = { A: 0, B: 0, C: 0, D: 0 };
    let drawIdx = 0;
    const interval = setInterval(() => {
      const player = PLAYERS[Math.floor(Math.random() * 4)];
      // Bias the score nudges toward the intended winner.
      const bonus = player === intendedWinner ? 4 + Math.floor(Math.random() * 5)
                                              : 1 + Math.floor(Math.random() * 4);
      finalScores[player] += bonus;
      setScores({ ...finalScores });
      drawIdx++;
      if (drawIdx >= ROUND_DRAWS) {
        clearInterval(interval);
        // Make sure the bias landed — if not, force it.
        const max = Math.max(...PLAYERS.map((p) => finalScores[p]));
        if (finalScores[intendedWinner] < max) {
          finalScores[intendedWinner] = max + 2;
          setScores({ ...finalScores });
        }
        const won = pick === intendedWinner;
        const winAmount = won ? parseFloat((amount * PAYOUT).toFixed(2)) : 0;
        (async () => {
          if (won) await creditUserWinnings(db, user.uid, winAmount);
          try {
            await addDoc(collection(db, "cards32History"), {
              userId: user.uid, bet: pick, winner: intendedWinner,
              scores: finalScores, betAmount: amount, winAmount, won,
              createdAt: serverTimestamp(),
            });
          } catch {}
          setWinner(intendedWinner);
          setMsg(won ? `${intendedWinner} wins — +${formatCurrency(winAmount)}!` : `${intendedWinner} won. Try again.`);
          setPhase("result");
          setTimeout(() => {
            setPhase("betting"); setPick(null); setMsg("");
            setWinner(null); setScores({ A: 0, B: 0, C: 0, D: 0 });
          }, 3000);
        })();
      }
    }, 380);
  };

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">32 CARDS</h1>
        <p className="text-center text-xs text-gray-400 mb-5">A vs B vs C vs D — highest score wins. Pick one · 3.8x.</p>

        <div className="grid grid-cols-4 gap-2 mb-4">
          {PLAYERS.map((p) => {
            const isPick = pick === p;
            const isWin = winner === p;
            return (
              <button key={p}
                onClick={() => phase === "betting" && setPick(p)}
                disabled={phase !== "betting"}
                className={`rounded-2xl py-4 px-2 border-2 font-bold transition ${
                  isWin    ? "border-yellow-400 bg-yellow-400/15 ring-2 ring-yellow-400/50" :
                  isPick   ? "border-cyan-400 bg-cyan-500/15" :
                  "border-white/10 bg-[#101a3a]"
                } disabled:opacity-50`}>
                <div className="text-2xl font-black">{p}</div>
                <div className="text-xs text-gray-300 mt-1">Score: <b className="text-yellow-300">{scores[p]}</b></div>
              </button>
            );
          })}
        </div>

        {msg && (
          <div className={`mb-3 text-center text-sm font-semibold rounded-xl py-2 px-3 ${
            msg.includes("+") ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
          }`}>{msg}</div>
        )}

        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
              placeholder={`Bet (Min ${formatCurrency(10)})`} disabled={phase !== "betting"}
              className="flex-1 bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
            <div className="bg-[#070b1e] rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((v) => (
              <button key={v} onClick={() => setBetAmount((p) => String((parseFloat(p) || 0) + v))} disabled={phase !== "betting"}
                className="bg-[#070b1e] hover:bg-[#0f1838] disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">+{formatCurrency(v)}</button>
            ))}
          </div>
          <button onClick={play} disabled={phase !== "betting"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            {phase === "dealing" ? "Dealing..." : phase === "result" ? "..." : "PLAY"}
          </button>
        </div>
      </div>
    </div>
  );
}
