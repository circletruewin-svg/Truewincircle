import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { getBaccaratWinner } from "../utils/houseEdge";

const PAYOUT = { player: 2, banker: 1.95, tie: 9 };

const drawHand = () => {
  // Two-card baccarat hand. Each card is 1-13. Total mod 10.
  const c1 = 1 + Math.floor(Math.random() * 13);
  const c2 = 1 + Math.floor(Math.random() * 13);
  const valOf = (c) => (c >= 10 ? 0 : c);
  return { cards: [c1, c2], total: (valOf(c1) + valOf(c2)) % 10 };
};

function Hand({ side, hand, win }) {
  return (
    <div className={`rounded-xl border-2 p-3 flex-1 ${win ? "border-yellow-400 shadow-[0_0_20px_-2px_rgba(250,204,21,0.6)]" : "border-white/10"} bg-[#0d1430]`}>
      <p className="text-[10px] uppercase text-gray-400 tracking-widest mb-2">{side}</p>
      <div className="flex gap-2 mb-2">
        {hand?.cards.map((c, i) => (
          <div key={i} className="w-12 h-16 rounded-lg bg-gradient-to-br from-[#0e1839] to-[#050a1f] border border-white/15 flex items-center justify-center text-2xl font-black text-white">
            {c}
          </div>
        )) || <span className="text-gray-500 text-sm">—</span>}
      </div>
      {hand && <p className="text-yellow-300 text-sm font-bold">Total: {hand.total}</p>}
    </div>
  );
}

export default function Baccarat() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [pick, setPick] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [playerHand, setPlayerHand] = useState(null);
  const [bankerHand, setBankerHand] = useState(null);
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("");
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  const play = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!pick) return setMsg("Bet on Player / Banker / Tie");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("dealing");
    setMsg("");
    setPlayerHand(null); setBankerHand(null); setWinner(null);

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    // Decide outcome via biased helper, then construct hands that match.
    const w = getBaccaratWinner(pick);
    let pHand, bHand;
    let safety = 0;
    do {
      pHand = drawHand(); bHand = drawHand();
      safety++;
    } while (
      safety < 80 && (
        (w === "player" && pHand.total <= bHand.total) ||
        (w === "banker" && bHand.total <= pHand.total) ||
        (w === "tie"    && pHand.total !== bHand.total)
      )
    );

    setTimeout(() => setPlayerHand(pHand), 600);
    setTimeout(() => setBankerHand(bHand), 1200);

    setTimeout(async () => {
      setWinner(w);
      const won = pick === w;
      const winAmount = won ? parseFloat((amount * PAYOUT[w]).toFixed(2)) : 0;
      if (won) await creditUserWinnings(db, user.uid, winAmount);
      try {
        await addDoc(collection(db, "baccaratHistory"), {
          userId: user.uid, bet: pick, winner: w,
          playerTotal: pHand.total, bankerTotal: bHand.total,
          betAmount: amount, winAmount, won,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setMsg(won ? `${w.toUpperCase()} wins — +${formatCurrency(winAmount)}!` : `${w.toUpperCase()} won. Try again.`);
      setPhase("result");
      setTimeout(() => {
        setPhase("betting"); setPick(null); setMsg("");
        setPlayerHand(null); setBankerHand(null); setWinner(null);
      }, 3200);
    }, 2000);
  };

  const Side = ({ id, label, color }) => (
    <button
      onClick={() => phase === "betting" && setPick(id)}
      disabled={phase !== "betting"}
      className={`flex-1 rounded-2xl py-4 px-3 border-2 font-bold transition ${
        pick === id ? `${color} ring-4 ring-white/20 scale-105` : "bg-[#101a3a] border-white/10 hover:bg-[#142149]"
      } disabled:opacity-50`}
    >
      <div className="text-base">{label}</div>
      <div className="mt-1 text-yellow-300 text-xs font-black">{PAYOUT[id]}x</div>
    </button>
  );

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">BACCARAT</h1>
        <p className="text-center text-xs text-gray-400 mb-5">Closest to 9 wins. Player 2x · Banker 1.95x · Tie 9x.</p>

        <div className="flex gap-3 mb-5">
          <Hand side="Player" hand={playerHand} win={winner === "player"} />
          <Hand side="Banker" hand={bankerHand} win={winner === "banker"} />
        </div>

        {msg && (
          <div className={`mb-4 text-center text-sm font-semibold rounded-xl py-2 px-3 ${
            msg.includes("+") ? "bg-emerald-500/15 text-emerald-300" : "bg-yellow-500/10 text-yellow-300"
          }`}>{msg}</div>
        )}

        <div className="flex gap-2 mb-4">
          <Side id="player" label="PLAYER" color="bg-cyan-600" />
          <Side id="tie"    label="TIE"    color="bg-emerald-600" />
          <Side id="banker" label="BANKER" color="bg-rose-600" />
        </div>

        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
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
          <button onClick={play} disabled={phase !== "betting"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            {phase === "dealing" ? "Dealing..." : phase === "result" ? "..." : "DEAL"}
          </button>
        </div>
      </div>
    </div>
  );
}
