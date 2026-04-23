import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { CoinToken } from "../components/GameVisuals";
import { getCoinResult } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";
import { gameApi, isServerRngEnabled } from "../utils/gameApi";

function CoinFace({ side, fallback, className = "" }) {
  return <CoinToken side={side} className={className} />;
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

  const flip = async () => {
    const amount = parseFloat(betAmount);
    if (!betSide) return setMsg("Choose Heads or Tails first!");
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setBetLocked(true);
    setPhase("flipping");
    setFlipping(true);
    setMsg("");

    // Pre-resolve the outcome so the animation shows the authoritative result.
    let outcomePromise;
    if (isServerRngEnabled()) {
      outcomePromise = gameApi.coinFlip(betSide, amount).then((res) => ({
        outcome: res.winner,
        won: res.won,
        winAmount: res.winAmount,
        serverSettled: true,
      }));
    } else {
      // Client fallback — debit + compute locally, credit on win.
      outcomePromise = (async () => {
        await debitUserFunds(db, user.uid, amount);
        const outcome = getCoinResult(betSide);
        const won = outcome === betSide;
        const winAmount = won ? parseFloat((amount * 1.9).toFixed(2)) : 0;
        if (won) await creditUserWinnings(db, user.uid, winAmount);
        await addDoc(collection(db, "coinFlipHistory"), {
          userId: user.uid, betSide, result: outcome,
          betAmount: amount, winAmount, won,
          createdAt: serverTimestamp(),
        });
        return { outcome, won, winAmount, serverSettled: false };
      })();
    }

    setTimeout(async () => {
      setFlipping(false);
      try {
        const { outcome, won, winAmount } = await outcomePromise;
        setResult(outcome);
        setMsg(
          won
            ? `${outcome.toUpperCase()}! You won ${formatCurrency(winAmount)}`
            : `${outcome.toUpperCase()}! You lost ${formatCurrency(amount)}`
        );
      } catch (error) {
        console.error("Coin Flip failed:", error);
        setMsg(error.message || "Something went wrong. Try again.");
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
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder={`Bet amount (Min ${formatCurrency(10)})`} disabled={betLocked} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount((prev) => String((parseFloat(prev) || 0) + amount))}
                disabled={betLocked}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold"
              >
                +{formatCurrency(amount)}
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


