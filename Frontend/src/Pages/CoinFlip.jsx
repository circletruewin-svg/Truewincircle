import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getCoinResult } from "../utils/houseEdge";

export default function CoinFlip() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betSide, setBetSide] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [result, setResult] = useState(null);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [flipping, setFlipping] = useState(false);
  const [betLocked, setBetLocked] = useState(false);
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(s.data().walletBalance || 0);
    });
  }, [user]);

  useEffect(() => {
    return onSnapshot(
      query(collection(db, "coinFlipHistory"), orderBy("createdAt", "desc"), limit(15)),
      (s) => setHistory(s.docs.map((d) => d.data()))
    );
  }, []);

  const flip = async () => {
    const amt = parseFloat(betAmount);
    if (!betSide) return setMsg("Choose Heads or Tails first!");
    if (!amt || amt < 10) return setMsg("Min bet ₹10");
    if (amt > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setBetLocked(true);
    setPhase("flipping");
    setFlipping(true);
    setMsg("");
    await updateDoc(doc(db, "users", user.uid), { walletBalance: balance - amt });

    setTimeout(async () => {
      setFlipping(false);
      const outcome = getCoinResult(betSide);
      setResult(outcome);

      const won = outcome === betSide;
      const winAmt = won ? parseFloat((amt * 1.9).toFixed(2)) : 0;

      if (won) {
        setMsg(`🎉 ${outcome.toUpperCase()}! You Won ₹${winAmt}`);
        await updateDoc(doc(db, "users", user.uid), { walletBalance: balanceRef.current + winAmt });
      } else {
        setMsg(`😞 ${outcome.toUpperCase()}! You Lost ₹${amt}`);
      }

      await addDoc(collection(db, "coinFlipHistory"), {
        userId: user.uid, betSide, result: outcome,
        betAmount: amt, winAmount: winAmt, won, createdAt: serverTimestamp(),
      });

      setPhase("result");
      setTimeout(() => {
        setPhase("betting");
        setBetSide(null);
        setResult(null);
        setMsg("");
        setBetLocked(false);
      }, 3000);
    }, 1800);
  };

  return (
    <div className="min-h-screen bg-[#0a1220] text-white">
      <Navbar />
      <div className="max-w-sm mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">🪙 COIN FLIP</h1>

        {/* History */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {history.map((h, i) => (
            <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0
              ${h.result === "heads" ? "bg-yellow-700 text-yellow-200" : "bg-gray-600 text-gray-200"}`}>
              {h.result === "heads" ? "H" : "T"}
            </span>
          ))}
        </div>

        {/* Coin */}
        <div className="flex justify-center mb-6">
          <div className={`w-32 h-32 rounded-full border-4 border-yellow-500 flex items-center justify-center
            text-6xl shadow-2xl font-black transition-all duration-300
            ${flipping ? "animate-spin" : ""}
            ${result === "heads" ? "bg-yellow-600" : result === "tails" ? "bg-gray-700" : "bg-gray-800"}`}>
            {flipping ? "🪙" : result === "heads" ? "👑" : result === "tails" ? "🦅" : betSide === "heads" ? "👑" : betSide === "tails" ? "🦅" : "🪙"}
          </div>
        </div>

        {/* Phase label */}
        <div className="text-center text-lg font-bold mb-4 text-gray-300">
          {phase === "flipping" ? <span className="animate-pulse text-yellow-300">Flipping...</span>
            : phase === "result" ? <span>{result?.toUpperCase()}!</span>
            : "Choose your side & flip!"}
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        {/* Side buttons */}
        <div className="grid grid-cols-2 gap-4 mb-4">
          <button onClick={() => !betLocked && setBetSide("heads")}
            className={`rounded-2xl py-5 flex flex-col items-center gap-1 font-bold transition-all
              ${betSide === "heads" ? "bg-yellow-600 ring-4 ring-yellow-400 scale-105" : "bg-yellow-800 hover:bg-yellow-700"}
              disabled:opacity-40`}
            disabled={betLocked}>
            <span className="text-4xl">👑</span>
            <span>HEADS</span>
            <span className="text-xs opacity-80">1.9x</span>
          </button>
          <button onClick={() => !betLocked && setBetSide("tails")}
            className={`rounded-2xl py-5 flex flex-col items-center gap-1 font-bold transition-all
              ${betSide === "tails" ? "bg-gray-500 ring-4 ring-gray-300 scale-105" : "bg-gray-700 hover:bg-gray-600"}
              disabled:opacity-40`}
            disabled={betLocked}>
            <span className="text-4xl">🦅</span>
            <span>TAILS</span>
            <span className="text-xs opacity-80">1.9x</span>
          </button>
        </div>

        {/* Bet */}
        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Bet amount (Min ₹10)" disabled={betLocked}
              className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">₹{balance}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((a) => (
              <button key={a} onClick={() => setBetAmount(a.toString())} disabled={betLocked}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">
                ₹{a}
              </button>
            ))}
          </div>
          <button onClick={flip} disabled={betLocked || phase !== "betting"}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-black text-black text-lg">
            🪙 FLIP!
          </button>
        </div>
      </div>
    </div>
  );
}
