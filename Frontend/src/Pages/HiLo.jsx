import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { getHiLoNextCard, hiLoMultiplier } from "../utils/houseEdge";

const randInit = () => 2 + Math.floor(Math.random() * 11); // start mid-deck

function CardFace({ value, glow }) {
  const colour = value <= 6 ? "text-cyan-300" : value === 7 ? "text-yellow-300" : "text-rose-300";
  return (
    <div className={`w-32 h-44 rounded-2xl border-2 ${glow ? "border-yellow-400 shadow-[0_0_24px_rgba(250,204,21,0.6)]" : "border-white/15"} bg-gradient-to-br from-[#0e1839] to-[#050a1f] flex items-center justify-center`}>
      <span className={`text-6xl font-black ${colour}`}>{value}</span>
    </div>
  );
}

export default function HiLo() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [phase, setPhase] = useState("betting"); // betting → playing → result
  const [current, setCurrent] = useState(randInit());
  const [streak, setStreak] = useState(0);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);
  const stake = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const start = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      return setMsg(err.message || "Could not place bet.");
    }
    stake.current = amount;
    setStreak(0);
    setCurrent(randInit());
    setPhase("playing");
    setMsg("Higher ya Lower? Cash out anytime.");
  };

  const guess = async (dir) => {
    if (phase !== "playing") return;
    const next = getHiLoNextCard(current, dir);
    const won = (dir === "higher" && next > current) || (dir === "lower" && next < current);
    const push = next === current;
    if (push) {
      setCurrent(next);
      setMsg(`Push! Same card — try again.`);
      return;
    }
    if (won) {
      const newStreak = streak + 1;
      setStreak(newStreak);
      setCurrent(next);
      setMsg(`✓ ${dir.toUpperCase()} — multiplier ${hiLoMultiplier(newStreak)}x`);
    } else {
      // Lost — record history and end round.
      setCurrent(next);
      setStreak(0);
      setMsg(`✗ Lost! Card was ${next}.`);
      setPhase("result");
      try {
        await addDoc(collection(db, "hiLoHistory"), {
          userId: user.uid,
          startCard: current, endCard: next, direction: dir,
          streak, betAmount: stake.current, winAmount: 0, won: false,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setTimeout(() => { setPhase("betting"); setMsg(""); setCurrent(randInit()); }, 2400);
    }
  };

  const cashOut = async () => {
    if (phase !== "playing" || streak === 0) {
      setMsg("Win at least 1 to cash out.");
      return;
    }
    const mult = hiLoMultiplier(streak);
    const winAmount = parseFloat((stake.current * mult).toFixed(2));
    try {
      await creditUserWinnings(db, user.uid, winAmount);
    } catch (err) {
      setMsg(err.message || "Cashout failed");
      return;
    }
    setMsg(`Cashed out ${mult}x → +${formatCurrency(winAmount)}`);
    try {
      await addDoc(collection(db, "hiLoHistory"), {
        userId: user.uid,
        endCard: current, streak, betAmount: stake.current, winAmount,
        won: true, createdAt: serverTimestamp(),
      });
    } catch {}
    setPhase("result");
    setTimeout(() => { setPhase("betting"); setMsg(""); setStreak(0); }, 2400);
  };

  const playing = phase === "playing";
  const mult = hiLoMultiplier(streak);

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">HI-LO</h1>
        <p className="text-center text-xs text-gray-400 mb-5">Predict next card — Higher or Lower.</p>

        <div className="flex justify-center mb-4">
          <CardFace value={current} glow={playing && streak > 0} />
        </div>

        <div className="flex justify-between items-center mb-4 text-sm">
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Streak</div>
            <div className="font-bold text-yellow-300">{streak}</div>
          </div>
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Multiplier</div>
            <div className="font-bold text-emerald-300">{mult}x</div>
          </div>
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Stake</div>
            <div className="font-bold text-white">{formatCurrency(stake.current || 0)}</div>
          </div>
        </div>

        {msg && (
          <div className="mb-4 text-center text-sm font-semibold rounded-xl py-2 px-3 bg-yellow-500/10 text-yellow-300">{msg}</div>
        )}

        {playing ? (
          <>
            <div className="flex gap-2 mb-3">
              <button onClick={() => guess("lower")}  disabled={current === 1}  className="flex-1 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-30 rounded-xl py-3 font-black">▼ LOWER</button>
              <button onClick={() => guess("higher")} disabled={current === 13} className="flex-1 bg-rose-600 hover:bg-rose-500 disabled:opacity-30 rounded-xl py-3 font-black">HIGHER ▲</button>
            </div>
            <button onClick={cashOut} disabled={streak === 0} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
              CASH OUT {streak > 0 && `· ${formatCurrency(parseFloat((stake.current * mult).toFixed(2)))}`}
            </button>
          </>
        ) : (
          <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
            <div className="flex gap-2 mb-3">
              <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
                placeholder={`Bet (Min ${formatCurrency(10)})`}
                className="flex-1 bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm" />
              <div className="bg-[#070b1e] rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
            </div>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {[50, 100, 200, 500].map((v) => (
                <button key={v} onClick={() => setBetAmount((p) => String((parseFloat(p) || 0) + v))}
                  className="bg-[#070b1e] hover:bg-[#0f1838] rounded-lg py-1.5 text-xs font-bold">+{formatCurrency(v)}</button>
              ))}
            </div>
            <button onClick={start} disabled={phase === "result"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">START ROUND</button>
          </div>
        )}
      </div>
    </div>
  );
}
