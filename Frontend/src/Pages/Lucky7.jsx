import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { getLucky7Card } from "../utils/houseEdge";

const PAYOUT = { low: 1.95, equal: 11, high: 1.95 };

const ZONE = (n) => (n < 7 ? "low" : n > 7 ? "high" : "equal");

function Card({ value, flipped, win }) {
  return (
    <div className={`relative w-32 h-44 rounded-2xl border-2 ${win ? "border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.6)]" : "border-white/15"} bg-gradient-to-br from-[#0e1839] to-[#050a1f] flex items-center justify-center transition-all duration-500 ${flipped ? "" : "rotate-y-180 opacity-60"}`}>
      <span className={`text-6xl font-black ${value === 7 ? "text-yellow-300" : value < 7 ? "text-cyan-300" : "text-rose-300"}`}>
        {flipped ? value : "?"}
      </span>
      {flipped && (
        <span className="absolute bottom-2 text-[10px] uppercase tracking-wider text-gray-400">
          {ZONE(value)}
        </span>
      )}
    </div>
  );
}

export default function Lucky7() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [pick, setPick] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [card, setCard] = useState(null);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setBalance(getUserFunds(snap.data()).total);
    });
  }, [user]);

  const play = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!pick) return setMsg("Pick Low / Equal / High first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("dealing");
    setMsg("");
    setCard(null);

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    const dealt = getLucky7Card(pick);
    const won = ZONE(dealt) === pick;
    const winAmount = won ? parseFloat((amount * PAYOUT[pick]).toFixed(2)) : 0;

    setTimeout(async () => {
      setCard(dealt);
      if (won) await creditUserWinnings(db, user.uid, winAmount);
      await addDoc(collection(db, "lucky7History"), {
        userId: user.uid,
        bet: pick, card: dealt, betAmount: amount, winAmount, won,
        createdAt: serverTimestamp(),
      });
      setMsg(won ? `${dealt} — You won ${formatCurrency(winAmount)}!` : `${dealt} — Better luck next round.`);
      setPhase("result");
      setTimeout(() => {
        setPhase("betting"); setCard(null); setPick(null); setMsg("");
      }, 3000);
    }, 1500);
  };

  const Side = ({ id, label, hint, color }) => (
    <button
      onClick={() => phase === "betting" && setPick(id)}
      disabled={phase !== "betting"}
      className={`flex-1 rounded-2xl py-4 px-3 border-2 transition-all font-bold ${
        pick === id
          ? `${color} ring-4 ring-white/20 scale-105`
          : "bg-[#101a3a] border-white/10 hover:bg-[#142149]"
      } disabled:opacity-50`}
    >
      <div className="text-base">{label}</div>
      <div className="text-[10px] opacity-80">{hint}</div>
      <div className="mt-1 text-yellow-300 text-xs font-black">{PAYOUT[id]}x</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">LUCKY 7</h1>
        <p className="text-center text-xs text-gray-400 mb-5">Card 1-13 dealt. Predict zone — win up to 11x.</p>

        <div className="flex justify-center mb-6">
          <Card value={card ?? "?"} flipped={card != null} win={card != null && ZONE(card) === pick} />
        </div>

        {msg && (
          <div className={`mb-4 text-center text-sm font-semibold rounded-xl py-2 px-3 ${
            msg.includes("won") ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
          }`}>{msg}</div>
        )}

        <div className="flex gap-2 mb-4">
          <Side id="low"   label="LOW"   hint="1-6"  color="bg-cyan-600" />
          <Side id="equal" label="EQUAL" hint="= 7"  color="bg-yellow-500 text-black" />
          <Side id="high"  label="HIGH"  hint="8-13" color="bg-rose-600" />
        </div>

        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder={`Bet (Min ${formatCurrency(10)})`}
              disabled={phase !== "betting"}
              className="flex-1 bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm"
            />
            <div className="bg-[#070b1e] rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((v) => (
              <button key={v} onClick={() => setBetAmount((p) => String((parseFloat(p) || 0) + v))} disabled={phase !== "betting"}
                className="bg-[#070b1e] hover:bg-[#0f1838] disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">+{formatCurrency(v)}</button>
            ))}
          </div>
          <button onClick={play} disabled={phase !== "betting"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            {phase === "dealing" ? "Dealing..." : phase === "result" ? "Result" : "DEAL"}
          </button>
        </div>
      </div>
    </div>
  );
}
