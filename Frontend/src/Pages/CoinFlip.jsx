import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getCoinResult } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatAmount } from "../utils/formatMoney";
import { GAME_ASSETS } from "../utils/gameAssets";

function CoinFace({ side, fallback, className = "" }) {
  const [failed, setFailed] = useState(false);
  const src = side === "heads" ? GAME_ASSETS.coinHeads : GAME_ASSETS.coinTails;

  return !failed ? (
    <img src={src} alt={side} className={className} onError={() => setFailed(true)} />
  ) : (
    <span className="text-4xl font-black">{fallback}</span>
  );
}

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

  useEffect(() => {
    balanceRef.current = balance;
  }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snapshot) => {
      if (snapshot.exists()) setBalance(getUserFunds(snapshot.data()).total);
    });
  }, [user]);

  useEffect(() => {
    return onSnapshot(query(collection(db, "coinFlipHistory"), orderBy("createdAt", "desc"), limit(15)), (snapshot) => {
      setHistory(snapshot.docs.map((item) => item.data()));
    });
  }, []);

  const flip = async () => {
    const amount = parseFloat(betAmount);
    if (!betSide) return setMsg("Choose Heads or Tails first!");
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg("Min bet ?10");
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setBetLocked(true);
    setPhase("flipping");
    setFlipping(true);
    setMsg("");
    await debitUserFunds(db, user.uid, amount);

    setTimeout(async () => {
      setFlipping(false);
      const outcome = getCoinResult(betSide);
      setResult(outcome);

      const won = outcome === betSide;
      const winAmount = won ? parseFloat((amount * 1.9).toFixed(2)) : 0;

      try {
        if (won) {
          setMsg(`${outcome.toUpperCase()}! You won ?${formatAmount(winAmount)}`);
          await creditUserWinnings(db, user.uid, winAmount);
        } else {
          setMsg(`${outcome.toUpperCase()}! You lost ?${formatAmount(amount)}`);
        }

        await addDoc(collection(db, "coinFlipHistory"), {
          userId: user.uid,
          betSide,
          result: outcome,
          betAmount: amount,
          winAmount,
          won,
          createdAt: serverTimestamp(),
        });
      } catch (error) {
        console.error("Failed to finish Coin Flip round:", error);
        setMsg(`${outcome.toUpperCase()} round finished. Stats sync failed.`);
      } finally {
        setPhase("result");
        setTimeout(() => {
          setPhase("betting");
          setBetSide(null);
          setResult(null);
          setMsg("");
          setBetLocked(false);
        }, 3000);
      }
    }, 1800);
  };

  const displaySide = result || betSide || "heads";

  return (
    <div className="min-h-screen bg-[#0a1220] text-white">
      <Navbar />
      <div className="max-w-sm mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">COIN FLIP</h1>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {history.map((item, index) => (
            <span key={index} className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${item.result === "heads" ? "bg-yellow-700 text-yellow-200" : "bg-gray-600 text-gray-200"}`}>
              {item.result === "heads" ? "H" : "T"}
            </span>
          ))}
        </div>

        <div className="flex justify-center mb-6">
          <div className={`w-32 h-32 rounded-full border-4 border-yellow-500 flex items-center justify-center text-6xl shadow-2xl font-black transition-all duration-300 ${flipping ? "animate-spin" : ""} ${result === "heads" ? "bg-yellow-600" : result === "tails" ? "bg-gray-700" : "bg-gray-800"}`}>
            <CoinFace side={displaySide} fallback={displaySide === "heads" ? "H" : "T"} className="h-20 w-20 object-contain" />
          </div>
        </div>

        <div className="text-center text-lg font-bold mb-4 text-gray-300">
          {phase === "flipping" ? <span className="animate-pulse text-yellow-300">Flipping...</span> : phase === "result" ? <span>{result?.toUpperCase()}!</span> : "Choose your side & flip!"}
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        <div className="grid grid-cols-2 gap-4 mb-4">
          <button onClick={() => !betLocked && setBetSide("heads")} className={`rounded-2xl py-5 flex flex-col items-center gap-2 font-bold transition-all ${betSide === "heads" ? "bg-yellow-600 ring-4 ring-yellow-400 scale-105" : "bg-yellow-800 hover:bg-yellow-700"} disabled:opacity-40`} disabled={betLocked}>
            <CoinFace side="heads" fallback="H" className="h-14 w-14 object-contain" />
            <span>HEADS</span>
            <span className="text-xs opacity-80">1.9x</span>
          </button>
          <button onClick={() => !betLocked && setBetSide("tails")} className={`rounded-2xl py-5 flex flex-col items-center gap-2 font-bold transition-all ${betSide === "tails" ? "bg-gray-500 ring-4 ring-gray-300 scale-105" : "bg-gray-700 hover:bg-gray-600"} disabled:opacity-40`} disabled={betLocked}>
            <CoinFace side="tails" fallback="T" className="h-14 w-14 object-contain" />
            <span>TAILS</span>
            <span className="text-xs opacity-80">1.9x</span>
          </button>
        </div>

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder="Bet amount (Min ?10)" disabled={betLocked} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">?{formatAmount(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amount) => (
              <button key={amount} onClick={() => setBetAmount(amount.toString())} disabled={betLocked} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">
                ?{formatAmount(amount)}
              </button>
            ))}
          </div>
          <button onClick={flip} disabled={betLocked || phase !== "betting"} className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-black text-black text-lg">
            FLIP!
          </button>
        </div>
      </div>
    </div>
  );
}
