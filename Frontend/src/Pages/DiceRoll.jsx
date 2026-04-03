import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getDiceResult } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";

const DICE_EMOJIS = ["","?","?","?","?","?","?"];

export default function DiceRoll() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betNum, setBetNum] = useState(null);
  const [rolling, setRolling] = useState(false);
  const [displayDice, setDisplayDice] = useState(1);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const roll = async () => {
    const amt = parseFloat(betAmount);
    if (!betNum) return setMsg("Pick a number 1–6!");
    if (!amt || amt < 10) return setMsg("Min bet ?10");
    if (amt > balanceRef.current) return setMsg("Insufficient balance");
    if (rolling) return;

    setRolling(true);
    setMsg("");
    await debitUserFunds(db, user.uid, amt);

    // Animate dice
    let flips = 0;
    const anim = setInterval(async () => {
      setDisplayDice(~~(Math.random() * 6) + 1);
      flips++;
      if (flips >= 12) {
        clearInterval(anim);
        const outcome = getDiceResult(betNum);
        setDisplayDice(outcome);
        const won = outcome === betNum;
        const winAmt = won ? parseFloat((amt * 5.5).toFixed(2)) : 0;
        won ? setMsg(`?? Rolled ${outcome}! You won ?${winAmt}!`) : setMsg(`?? Rolled ${outcome}. You lost ?${amt}`);

        if (won) await creditUserWinnings(db, user.uid, winAmt);
        await addDoc(collection(db, "diceBets"), {
          userId: user.uid, betNum, result: outcome, betAmount: amt, winAmount: winAmt, won, createdAt: serverTimestamp(),
        });
        setHistory(prev => [{ result: outcome }, ...prev].slice(0, 12));
        setRolling(false);
      }
    }, 80);
  };

  return (
    <div className="min-h-screen bg-[#0f1722] text-white">
      <Navbar />
      <div className="max-w-sm mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">?? DICE ROLL</h1>

        {/* History */}
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-4 scrollbar-hide">
          {history.map((h, i) => (
            <span key={i} className="w-8 h-8 bg-gray-800 rounded-lg flex items-center justify-center text-lg flex-shrink-0">
              {DICE_EMOJIS[h.result]}
            </span>
          ))}
        </div>

        {/* Dice display */}
        <div className="flex justify-center mb-6">
          <div className={`w-32 h-32 bg-white rounded-3xl flex items-center justify-center text-8xl shadow-2xl
            ${rolling ? "animate-bounce" : ""} transition-all`}>
            {DICE_EMOJIS[displayDice]}
          </div>
        </div>

        {/* Win multiplier info */}
        <div className="text-center text-gray-400 text-sm mb-4">
          Pick the exact number ? Win <span className="text-yellow-400 font-bold">5.5x</span>
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        {/* Number picker */}
        <div className="grid grid-cols-6 gap-2 mb-4">
          {[1, 2, 3, 4, 5, 6].map((n) => (
            <button key={n} onClick={() => !rolling && setBetNum(n)}
              disabled={rolling}
              className={`h-12 rounded-xl text-2xl font-bold transition-all
                ${betNum === n ? "bg-yellow-500 text-black ring-2 ring-yellow-300 scale-110" : "bg-gray-800 hover:bg-gray-700"}
                disabled:opacity-30`}>
              {DICE_EMOJIS[n]}
            </button>
          ))}
        </div>

        {/* Bet */}
        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
              placeholder="Bet amount (Min ?10)" disabled={rolling}
              className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">?{balance}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((a) => (
              <button key={a} onClick={() => setBetAmount(a.toString())} disabled={rolling}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">?{a}</button>
            ))}
          </div>
          <button onClick={roll} disabled={rolling}
            className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 rounded-xl py-3 font-black text-black text-lg">
            {rolling ? "?? Rolling..." : "?? ROLL DICE!"}
          </button>
        </div>
      </div>
    </div>
  );
}
