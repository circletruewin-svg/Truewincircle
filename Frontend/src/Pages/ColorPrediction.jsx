import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getBiasedWinner } from "../utils/houseEdge";

const COLORS = [
  { id: "red",    label: "RED",    emoji: "🔴", mult: 2,   bg: "bg-red-600",    ring: "ring-red-400"    },
  { id: "green",  label: "GREEN",  emoji: "🟢", mult: 3,   bg: "bg-green-600",  ring: "ring-green-400"  },
  { id: "violet", label: "VIOLET", emoji: "🟣", mult: 4.5, bg: "bg-purple-600", ring: "ring-purple-400" },
];

const ROUND_SEC = 30; // seconds per round

export default function ColorPrediction() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betColor, setBetColor] = useState(null);
  const [phase, setPhase] = useState("betting"); // betting | result
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC);
  const [winnerColor, setWinnerColor] = useState(null);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);

  const betColorRef = useRef(null);
  const betAmtRef = useRef(null);
  const hasBetRef = useRef(false);
  const balanceRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => { betColorRef.current = betColor; }, [betColor]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(s.data().walletBalance || 0);
    });
  }, [user]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "colorHistory"), orderBy("createdAt", "desc"), limit(15)),
      (s) => setHistory(s.docs.map((d) => d.data()))
    );
  }, []);

  useEffect(() => {
    startRound();
    return () => clearInterval(timerRef.current);
  }, []);

  const startRound = () => {
    setPhase("betting");
    setBetColor(null);
    betColorRef.current = null;
    betAmtRef.current = null;
    hasBetRef.current = false;
    setWinnerColor(null);
    setMsg("");
    setSpinning(false);
    setTimeLeft(ROUND_SEC);

    let t = ROUND_SEC;
    timerRef.current = setInterval(() => {
      t--;
      setTimeLeft(t);
      if (t <= 0) {
        clearInterval(timerRef.current);
        runResult();
      }
    }, 1000);
  };

  const runResult = async () => {
    setPhase("result");
    setSpinning(true);

    const userBet = betColorRef.current;
    const winner = userBet
      ? getBiasedWinner(userBet, ["red", "green", "violet"])
      : ["red", "green", "violet"][Math.floor(Math.random() * 3)];

    // Simulate spinning delay
    setTimeout(async () => {
      setSpinning(false);
      setWinnerColor(winner);

      if (hasBetRef.current && userBet) {
        const won = winner === userBet;
        const colorData = COLORS.find((c) => c.id === winner);
        const amt = betAmtRef.current;
        let winAmt = 0;

        if (won) {
          winAmt = parseFloat((amt * colorData.mult).toFixed(2));
          setMsg(`🎉 ${winner.toUpperCase()} wins! +₹${winAmt}`);
          await updateDoc(doc(db, "users", user.uid), { walletBalance: balanceRef.current + winAmt });
        } else {
          setMsg(`😞 ${winner.toUpperCase()} wins. Lost ₹${amt}`);
        }

        await addDoc(collection(db, "colorBets"), {
          userId: user.uid, betColor: userBet, winnerColor: winner,
          betAmount: amt, winAmount: winAmt, won, createdAt: serverTimestamp(),
        });
      }

      await addDoc(collection(db, "colorHistory"), {
        winner, createdAt: serverTimestamp(),
      });

      setTimeout(() => startRound(), 3500);
    }, 2000);
  };

  const placeBet = async (color) => {
    const amt = parseFloat(betAmount);
    if (!amt || amt < 10) return setMsg("Min bet ₹10");
    if (amt > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting" || hasBetRef.current) return;

    setBetColor(color);
    betColorRef.current = color;
    betAmtRef.current = amt;
    hasBetRef.current = true;
    await updateDoc(doc(db, "users", user.uid), { walletBalance: balance - amt });
    setMsg(`✅ Bet ₹${amt} on ${color.toUpperCase()}!`);
  };

  const timerPct = (timeLeft / ROUND_SEC) * 100;
  const timerColor = timeLeft > 10 ? "bg-green-500" : timeLeft > 5 ? "bg-yellow-500" : "bg-red-500 animate-pulse";

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">🎨 COLOR PREDICTION</h1>

        {/* History */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {history.map((h, i) => (
            <div key={i} className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold
              ${h.winner === "red" ? "bg-red-600" : h.winner === "green" ? "bg-green-600" : "bg-purple-600"}`}>
              {h.winner?.[0].toUpperCase()}
            </div>
          ))}
        </div>

        {/* Timer bar */}
        <div className="bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
          <div className={`h-2 rounded-full transition-all duration-1000 ${timerColor}`}
            style={{ width: `${timerPct}%` }} />
        </div>

        <div className="text-center mb-4">
          {phase === "betting" ? (
            <span className="text-lg font-bold text-white">
              Bet closes in <span className="text-yellow-400 text-2xl">{timeLeft}s</span>
            </span>
          ) : spinning ? (
            <span className="text-xl font-bold text-yellow-300 animate-pulse">🎲 Picking winner...</span>
          ) : (
            <span className={`text-2xl font-black ${
              winnerColor === "red" ? "text-red-400" : winnerColor === "green" ? "text-green-400" : "text-purple-400"
            }`}>
              {winnerColor?.toUpperCase()} WINS!
            </span>
          )}
        </div>

        {/* Spinning wheel visual */}
        <div className="flex justify-center mb-6">
          <div className={`w-28 h-28 rounded-full border-4 border-yellow-500 flex items-center justify-center text-5xl
            shadow-2xl ${spinning ? "animate-spin" : ""}
            ${winnerColor === "red" ? "bg-red-700" : winnerColor === "green" ? "bg-green-700" : winnerColor === "violet" ? "bg-purple-700" : "bg-gray-800"}`}>
            {spinning ? "🎰" : winnerColor ? COLORS.find((c) => c.id === winnerColor)?.emoji : "🎯"}
          </div>
        </div>

        {/* Message */}
        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        {/* Bet amount */}
        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800 mb-3">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Bet amount (Min ₹10)"
              disabled={phase !== "betting" || hasBetRef.current}
              className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">₹{balance}</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[50, 100, 200, 500].map((a) => (
              <button key={a} onClick={() => setBetAmount(a.toString())}
                disabled={phase !== "betting" || hasBetRef.current}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">
                ₹{a}
              </button>
            ))}
          </div>
        </div>

        {/* Color Buttons */}
        <div className="grid grid-cols-3 gap-3">
          {COLORS.map((c) => (
            <button key={c.id} onClick={() => placeBet(c.id)}
              disabled={phase !== "betting" || hasBetRef.current}
              className={`${c.bg} ${betColor === c.id ? `ring-4 ${c.ring}` : ""}
                rounded-2xl py-5 flex flex-col items-center gap-1 font-bold
                disabled:opacity-40 disabled:cursor-not-allowed
                hover:opacity-90 active:scale-95 transition-all`}>
              <span className="text-3xl">{c.emoji}</span>
              <span className="text-sm">{c.label}</span>
              <span className="text-xs font-black opacity-80">{c.mult}x</span>
              {betColor === c.id && <span className="text-xs">✅ Bet</span>}
            </button>
          ))}
        </div>

        {/* Payout info */}
        <div className="mt-4 bg-[#12152b] rounded-xl p-3 border border-gray-800 text-xs text-gray-500 text-center">
          RED = 2x &nbsp;|&nbsp; GREEN = 3x &nbsp;|&nbsp; VIOLET = 4.5x
        </div>
      </div>
    </div>
  );
}
