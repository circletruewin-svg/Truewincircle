import { useEffect, useRef, useState } from "react";
import { addDoc, collection, doc, onSnapshot, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { minesMultiplier, nextMinePickIsBomb } from "../utils/houseEdge";

const MINE_OPTIONS = [3, 5, 8, 10];

function Tile({ state, onClick }) {
  // state: "hidden" | "safe" | "bomb"
  const cls =
    state === "safe" ? "bg-emerald-500 text-white shadow-[0_0_18px_-2px_rgba(16,185,129,0.6)]" :
    state === "bomb" ? "bg-rose-600 text-white shadow-[0_0_18px_-2px_rgba(244,63,94,0.6)]" :
    "bg-[#101a3a] hover:bg-[#16224d] text-yellow-400";
  const icon = state === "safe" ? "💎" : state === "bomb" ? "💣" : "?";
  return (
    <button onClick={onClick} disabled={state !== "hidden"} className={`aspect-square rounded-xl border border-white/5 flex items-center justify-center text-xl font-bold transition ${cls} disabled:cursor-not-allowed`}>
      {state === "hidden" ? "" : icon}
    </button>
  );
}

export default function Mines() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [mineCount, setMineCount] = useState(3);
  const [tiles, setTiles] = useState(() => Array(25).fill("hidden"));
  const [phase, setPhase] = useState("betting"); // betting → playing → result
  const [safePicks, setSafePicks] = useState(0);
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

  const reset = () => {
    setTiles(Array(25).fill("hidden"));
    setSafePicks(0);
    setMsg("");
    setPhase("betting");
  };

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
    setSafePicks(0);
    setTiles(Array(25).fill("hidden"));
    setPhase("playing");
    setMsg(`${mineCount} bombs hidden — pick safely.`);
  };

  const pick = async (idx) => {
    if (phase !== "playing" || tiles[idx] !== "hidden") return;
    const isBomb = nextMinePickIsBomb(safePicks, mineCount);
    const next = [...tiles];
    if (isBomb) {
      next[idx] = "bomb";
      setTiles(next);
      setMsg(`💥 BOOM! You hit a bomb.`);
      setPhase("result");
      try {
        await addDoc(collection(db, "minesHistory"), {
          userId: user.uid,
          mineCount, safePicks, betAmount: stake.current, winAmount: 0, won: false,
          createdAt: serverTimestamp(),
        });
      } catch {}
      setTimeout(reset, 2500);
      return;
    }
    next[idx] = "safe";
    setTiles(next);
    const newSafe = safePicks + 1;
    setSafePicks(newSafe);
    const m = minesMultiplier(newSafe, mineCount);
    setMsg(`Safe! Multiplier ${m}x — keep going or cash out.`);
  };

  const cashOut = async () => {
    if (phase !== "playing" || safePicks === 0) {
      return setMsg("Reveal at least 1 tile to cash out.");
    }
    const mult = minesMultiplier(safePicks, mineCount);
    const winAmount = parseFloat((stake.current * mult).toFixed(2));
    try {
      await creditUserWinnings(db, user.uid, winAmount);
    } catch (err) {
      return setMsg(err.message || "Cashout failed");
    }
    setMsg(`Cashed out ${mult}x → +${formatCurrency(winAmount)}`);
    try {
      await addDoc(collection(db, "minesHistory"), {
        userId: user.uid,
        mineCount, safePicks, betAmount: stake.current, winAmount, won: true,
        createdAt: serverTimestamp(),
      });
    } catch {}
    setPhase("result");
    setTimeout(reset, 2500);
  };

  const playing = phase === "playing";
  const mult = minesMultiplier(safePicks, mineCount);

  return (
    <div className="min-h-screen bg-[#05081a] text-white">
      <Navbar />
      <div className="max-w-md mx-auto px-4 pt-20 pb-10">
        <h1 className="text-2xl font-black tracking-widest text-center text-yellow-400 mb-2">MINES</h1>
        <p className="text-center text-xs text-gray-400 mb-5">Reveal diamonds, dodge bombs. Cash out anytime.</p>

        <div className="flex justify-between items-center mb-3 text-sm">
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Safe</div>
            <div className="font-bold text-emerald-300">{safePicks}</div>
          </div>
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Multiplier</div>
            <div className="font-bold text-yellow-300">{mult}x</div>
          </div>
          <div className="bg-[#0d1430] rounded-xl px-3 py-2 border border-white/10">
            <div className="text-[10px] text-gray-400 uppercase">Stake</div>
            <div className="font-bold text-white">{formatCurrency(stake.current || 0)}</div>
          </div>
        </div>

        <div className="grid grid-cols-5 gap-2 mb-4">
          {tiles.map((t, i) => <Tile key={i} state={t} onClick={() => pick(i)} />)}
        </div>

        {msg && (
          <div className="mb-3 text-center text-sm font-semibold rounded-xl py-2 px-3 bg-yellow-500/10 text-yellow-300">{msg}</div>
        )}

        {playing ? (
          <button onClick={cashOut} disabled={safePicks === 0} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">
            CASH OUT {safePicks > 0 && `· ${formatCurrency(parseFloat((stake.current * mult).toFixed(2)))}`}
          </button>
        ) : (
          <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
            <div className="mb-3">
              <div className="text-[10px] text-gray-400 uppercase mb-1">Bombs</div>
              <div className="grid grid-cols-4 gap-2">
                {MINE_OPTIONS.map((n) => (
                  <button key={n} onClick={() => setMineCount(n)} className={`rounded-lg py-1.5 text-xs font-bold ${mineCount === n ? "bg-rose-500 text-white" : "bg-[#070b1e] text-gray-300"}`}>{n}</button>
                ))}
              </div>
            </div>

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
            <button onClick={start} disabled={phase === "result"} className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg">PLAY</button>
          </div>
        )}
      </div>
    </div>
  );
}
