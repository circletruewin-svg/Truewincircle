import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { getRouletteNumber } from "../utils/houseEdge";

// European wheel red numbers.
const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

// Outside bets a user can place on this simplified table.
const OUTSIDE = [
  { id: "red",    label: "RED",    payout: 2, hint: "1:1" },
  { id: "black",  label: "BLACK",  payout: 2, hint: "1:1" },
  { id: "odd",    label: "ODD",    payout: 2, hint: "1:1" },
  { id: "even",   label: "EVEN",   payout: 2, hint: "1:1" },
  { id: "low",    label: "1-18",   payout: 2, hint: "1:1" },
  { id: "high",   label: "19-36",  payout: 2, hint: "1:1" },
  { id: "dozen1", label: "1-12",   payout: 3, hint: "2:1" },
  { id: "dozen2", label: "13-24",  payout: 3, hint: "2:1" },
  { id: "dozen3", label: "25-36",  payout: 3, hint: "2:1" },
];

const NUMBERS_GRID = Array.from({ length: 36 }, (_, i) => i + 1);

function evaluate(bet, n) {
  if (typeof bet === "number") return bet === n ? 36 : 0;
  if (bet === "red")    return colorOf(n) === "red"   ? 2 : 0;
  if (bet === "black")  return colorOf(n) === "black" ? 2 : 0;
  if (bet === "odd")    return n !== 0 && n % 2 === 1 ? 2 : 0;
  if (bet === "even")   return n !== 0 && n % 2 === 0 ? 2 : 0;
  if (bet === "low")    return n >= 1 && n <= 18      ? 2 : 0;
  if (bet === "high")   return n >= 19 && n <= 36     ? 2 : 0;
  if (bet === "dozen1") return n >= 1 && n <= 12      ? 3 : 0;
  if (bet === "dozen2") return n >= 13 && n <= 24     ? 3 : 0;
  if (bet === "dozen3") return n >= 25 && n <= 36     ? 3 : 0;
  return 0;
}

const labelFor = (b) =>
  typeof b === "number" ? `Number ${b}` : (OUTSIDE.find((o) => o.id === b)?.label || b);

export default function Roulette() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [bet, setBet] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [resultNum, setResultNum] = useState(null);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const spin = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (bet === null) return setMsg("Place a bet first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("spinning");
    setMsg("");
    setResultNum(null);

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    const winning = getRouletteNumber();
    const payout = evaluate(bet, winning);
    const won = payout > 0;
    const winAmount = won ? parseFloat((amount * payout).toFixed(2)) : 0;

    setTimeout(async () => {
      setResultNum(winning);
      if (won) await creditUserWinnings(db, user.uid, winAmount);
      try {
        await addDoc(collection(db, "rouletteHistory"), {
          userId: user.uid, bet: String(bet), label: labelFor(bet),
          number: winning, color: colorOf(winning),
          betAmount: amount, winAmount, won,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setMsg(won ? `${winning} ${colorOf(winning)} — Won ${formatCurrency(winAmount)}!` : `${winning} ${colorOf(winning)} — No luck.`);
      setPhase("result");
      setTimeout(() => { setPhase("betting"); setBet(null); setMsg(""); setResultNum(null); }, 3000);
    }, 2200);
  };

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">ROULETTE</h1>
        <p className="text-center text-xs text-gray-400 mb-5">European 0-36 · Outside 1:1 / 2:1 · Single 35:1</p>

        {/* Wheel display */}
        <div className="flex justify-center mb-5">
          <div className={`relative w-40 h-40 rounded-full border-[6px] ${phase === "spinning" ? "animate-spin border-yellow-400" : "border-yellow-500"} bg-gradient-to-br from-[#1f0d3a] via-[#0c1444] to-[#020415] flex items-center justify-center shadow-[0_0_50px_-10px_rgba(250,204,21,0.5)]`}>
            <span className={`text-5xl font-black ${
              resultNum == null ? "text-gray-500" :
              colorOf(resultNum) === "red" ? "text-rose-400" :
              colorOf(resultNum) === "black" ? "text-white" :
              "text-emerald-300"
            }`}>
              {resultNum ?? "?"}
            </span>
          </div>
        </div>

        {msg && (
          <div className={`mb-4 text-center text-sm font-semibold rounded-xl py-2 px-3 ${
            msg.includes("Won") ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
          }`}>{msg}</div>
        )}

        {/* Outside bets */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {OUTSIDE.map((o) => {
            const colour =
              o.id === "red"   ? "bg-rose-700"  :
              o.id === "black" ? "bg-zinc-800"  :
              "bg-[#101a3a]";
            return (
              <button
                key={o.id}
                onClick={() => phase === "betting" && setBet(o.id)}
                disabled={phase !== "betting"}
                className={`rounded-xl py-3 text-xs font-bold border-2 transition ${
                  bet === o.id ? "border-yellow-400 ring-2 ring-yellow-400/50" : "border-white/10"
                } ${colour} disabled:opacity-50`}
              >
                <div>{o.label}</div>
                <div className="text-[10px] opacity-70">{o.hint}</div>
              </button>
            );
          })}
        </div>

        {/* Number grid */}
        <div className="bg-[#0d1430] rounded-2xl p-2 mb-4 border border-white/5">
          <button
            onClick={() => phase === "betting" && setBet(0)}
            disabled={phase !== "betting"}
            className={`w-full rounded-lg py-2 text-xs font-bold mb-1 bg-emerald-700 ${bet === 0 ? "ring-2 ring-yellow-400" : ""} disabled:opacity-50`}
          >0 (35:1)</button>
          <div className="grid grid-cols-6 gap-1">
            {NUMBERS_GRID.map((n) => {
              const colour = RED.has(n) ? "bg-rose-700" : "bg-zinc-800";
              return (
                <button
                  key={n}
                  onClick={() => phase === "betting" && setBet(n)}
                  disabled={phase !== "betting"}
                  className={`rounded text-[11px] font-bold py-2 ${colour} ${bet === n ? "ring-2 ring-yellow-400" : ""} disabled:opacity-50`}
                >{n}</button>
              );
            })}
          </div>
        </div>

        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
          {bet !== null && <div className="text-xs text-gray-400 mb-2">Bet: <span className="text-yellow-300 font-bold">{labelFor(bet)}</span></div>}
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
          <button onClick={spin} disabled={phase !== "betting"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            {phase === "spinning" ? "Spinning..." : phase === "result" ? "..." : "SPIN"}
          </button>
        </div>
      </div>
    </div>
  );
}
