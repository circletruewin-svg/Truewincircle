import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { PLINKO_PAYOUTS, getPlinkoSlot } from "../utils/houseEdge";

const RISK_OPTIONS = ["low", "medium", "high"];
const ROWS = 8;

function Pegs({ ballRow }) {
  // 9 rows of pegs (top→bottom). Each row i has i+1 pegs.
  return (
    <div className="flex flex-col items-center gap-1.5 py-2">
      {Array.from({ length: ROWS + 1 }, (_, r) => (
        <div key={r} className="flex gap-2">
          {Array.from({ length: r + 1 }, (_, p) => (
            <div key={p} className={`h-1.5 w-1.5 rounded-full ${ballRow === r ? "bg-yellow-300 shadow-[0_0_8px_rgba(250,204,21,0.8)]" : "bg-white/30"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export default function Plinko() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [risk, setRisk] = useState("medium");
  const [phase, setPhase] = useState("betting");
  const [ballRow, setBallRow] = useState(-1);
  const [resultSlot, setResultSlot] = useState(null);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const drop = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("dropping");
    setMsg("");
    setResultSlot(null);
    setBallRow(0);

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    // Animate ball through rows.
    let r = 0;
    const interval = setInterval(() => {
      r += 1;
      setBallRow(r);
      if (r >= ROWS) {
        clearInterval(interval);
      }
    }, 130);

    const slot = getPlinkoSlot();
    const payout = PLINKO_PAYOUTS[risk][slot];
    const winAmount = parseFloat((amount * payout).toFixed(2));
    const won = winAmount > amount;

    setTimeout(async () => {
      setResultSlot(slot);
      if (winAmount > 0) await creditUserWinnings(db, user.uid, winAmount);
      try {
        await addDoc(collection(db, "plinkoHistory"), {
          userId: user.uid, risk, slot, multiplier: payout,
          betAmount: amount, winAmount, won,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setMsg(
        won ? `${payout}x → +${formatCurrency(winAmount)}!`
            : winAmount > 0 ? `${payout}x → got ${formatCurrency(winAmount)} back.`
                            : `${payout}x — better luck next drop.`
      );
      setPhase("result");
      setTimeout(() => { setPhase("betting"); setMsg(""); setBallRow(-1); setResultSlot(null); }, 3000);
    }, 130 * (ROWS + 1) + 200);
  };

  const payouts = PLINKO_PAYOUTS[risk];

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">PLINKO</h1>
        <p className="text-center text-xs text-gray-400 mb-5">Drop the ball · land on a multiplier.</p>

        <div className="bg-gradient-to-br from-[#0d1430] to-[#070b1e] rounded-2xl border border-white/5 mb-3 px-3 py-2">
          <Pegs ballRow={ballRow} />
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${payouts.length}, minmax(0, 1fr))` }}>
            {payouts.map((p, i) => (
              <div key={i} className={`rounded-md py-1 text-center text-[11px] font-bold transition ${
                resultSlot === i
                  ? "bg-yellow-400 text-black shadow-[0_0_18px_-2px_rgba(250,204,21,0.7)]"
                  : p >= 5 ? "bg-rose-700 text-white"
                  : p >= 1.5 ? "bg-amber-600 text-white"
                  : p >= 1   ? "bg-zinc-700 text-white"
                  : "bg-cyan-700 text-white"
              }`}>{p}x</div>
            ))}
          </div>
        </div>

        {msg && (
          <div className={`mb-3 text-center text-sm font-semibold rounded-xl py-2 px-3 ${
            msg.includes("+") ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
          }`}>{msg}</div>
        )}

        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
          <div className="mb-3">
            <div className="text-[10px] text-gray-400 uppercase mb-1">Risk</div>
            <div className="grid grid-cols-3 gap-2">
              {RISK_OPTIONS.map((r) => (
                <button key={r} onClick={() => setRisk(r)} disabled={phase !== "betting"}
                  className={`rounded-lg py-1.5 text-xs font-bold uppercase ${risk === r ? "bg-rose-500 text-white" : "bg-[#070b1e] text-gray-300"} disabled:opacity-30`}>
                  {r}
                </button>
              ))}
            </div>
          </div>

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
          <button onClick={drop} disabled={phase !== "betting"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            {phase === "dropping" ? "Dropping..." : "DROP BALL"}
          </button>
        </div>
      </div>
    </div>
  );
}
