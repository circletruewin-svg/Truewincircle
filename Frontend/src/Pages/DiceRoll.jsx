import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { DiceFace as DiceVisual } from "../components/GameVisuals";
import { getDiceResult } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";
import { gameApi, isServerRngEnabled } from "../utils/gameApi";

function DiceFace({ value, className = "" }) {
  return <DiceVisual value={value} className={className} />;
}

export default function DiceRoll() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betNum, setBetNum] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState(1);
  const [msg, setMsg] = useState("");
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

  const roll = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!betNum) return setMsg("Pick a number 1-6 first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (rolling) return;

    setRolling(true);
    setMsg("");

    // Resolve the outcome authoritatively (server if enabled, else client).
    const settle = isServerRngEnabled()
      ? gameApi.dice(betNum, amount).then((res) => ({
          outcome: res.result, won: res.won, winAmount: res.winAmount,
        }))
      : (async () => {
          await debitUserFunds(db, user.uid, amount);
          const outcome = getDiceResult(betNum);
          const won = outcome === betNum;
          const winAmount = won ? parseFloat((amount * 5.5).toFixed(2)) : 0;
          if (won) await creditUserWinnings(db, user.uid, winAmount);
          await addDoc(collection(db, "diceBets"), {
            userId: user.uid, betNum, result: outcome,
            betAmount: amount, winAmount, won,
            createdAt: serverTimestamp(),
          });
          return { outcome, won, winAmount };
        })();

    let flips = 0;
    const anim = setInterval(async () => {
      setDisplayDice(Math.floor(Math.random() * 6) + 1);
      flips += 1;
      if (flips >= 12) {
        clearInterval(anim);
        try {
          const { outcome, won, winAmount } = await settle;
          setDisplayDice(outcome);
          setMsg(
            won
              ? `Rolled ${outcome}! You won ${formatCurrency(winAmount)}!`
              : `Rolled ${outcome}. You lost ${formatCurrency(amount)}`
          );
        } catch (error) {
          console.error("Dice roll failed:", error);
          setMsg(error.message || "Roll failed. Try again.");
        } finally {
          setRolling(false);
        }
      }
    }, 80);
  };

  return (
    <div className="min-h-screen bg-[#0f1722] text-white">
      <Navbar />
      <div className="max-w-sm mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">Dice Roll</h1>

        <div className="flex justify-center mb-6">
          <div className={`w-32 h-32 bg-white text-slate-900 rounded-3xl flex items-center justify-center text-6xl shadow-2xl ${rolling ? "animate-bounce" : ""} transition-all`}>
            <DiceFace value={displayDice} className="h-20 w-20 object-contain" />
          </div>
        </div>

        <div className="text-center text-gray-400 text-sm mb-4">
          Pick the exact number and win <span className="text-yellow-400 font-bold">5.5x</span>
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        <div className="grid grid-cols-6 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((number) => (
            <button
              key={number}
              onClick={() => !rolling && setBetNum(number)}
              disabled={rolling}
              className={`h-12 rounded-xl text-xl font-bold transition-all ${betNum === number ? "bg-yellow-500 text-black ring-2 ring-yellow-300 scale-110" : "bg-gray-800 hover:bg-gray-700"} disabled:opacity-30`}
            >
              {number}
            </button>
          ))}
        </div>

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder={`Bet amount (Min ${formatCurrency(10)})`}
              disabled={rolling}
              className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
            />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount((prev) => String((parseFloat(prev) || 0) + amount))}
                disabled={rolling}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold"
              >
                +{formatCurrency(amount)}
              </button>
            ))}
          </div>
          <button
            onClick={roll}
            disabled={rolling}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 rounded-xl py-3 font-black text-black text-lg"
          >
            {rolling ? "Rolling..." : "Roll Dice"}
          </button>
        </div>
      </div>
    </div>
  );
}


