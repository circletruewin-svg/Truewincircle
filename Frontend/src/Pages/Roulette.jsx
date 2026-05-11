import { useEffect, useMemo, useRef, useState } from "react";
import {
  addDoc, collection, doc, onSnapshot, orderBy, query, serverTimestamp, limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../firebase";
import Navbar from "../components/Navbar";
import { formatCurrency } from "../utils/formatMoney";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { getRouletteNumber } from "../utils/houseEdge";
import RouletteWheel from "../components/RouletteWheel";
import {
  isSfxMuted, setSfxMuted, playChime, playWhoosh, playClick,
} from "../utils/gameSfx";

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

const NUMBER_GRID = [
  // Standard European felt layout: 3 rows × 12 cols, top row holds high numbers.
  [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36],
  [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35],
  [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34],
];

const OUTSIDE = [
  { id: "low",    label: "1 to 18", payout: 2 },
  { id: "even",   label: "EVEN",    payout: 2 },
  { id: "red",    label: "RED",     payout: 2 },
  { id: "black",  label: "BLACK",   payout: 2 },
  { id: "odd",    label: "ODD",     payout: 2 },
  { id: "high",   label: "19 to 36",payout: 2 },
];

const DOZENS = [
  { id: "dozen1", label: "1st 12",  payout: 3 },
  { id: "dozen2", label: "2nd 12",  payout: 3 },
  { id: "dozen3", label: "3rd 12",  payout: 3 },
];

const CHIPS = [10, 50, 100, 500, 1000];

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
  typeof b === "number"
    ? `Number ${b}`
    : [...OUTSIDE, ...DOZENS].find((o) => o.id === b)?.label || b;

// Felt-table number cell — red/black background based on roulette color.
function NumberCell({ n, selected, onClick, disabled, big }) {
  const c = colorOf(n);
  const base = c === "red" ? "bg-rose-700" : c === "black" ? "bg-zinc-900" : "bg-emerald-700";
  const ring = selected ? "ring-2 ring-yellow-300 z-10" : "ring-1 ring-black/40";
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${ring} ${big ? "py-6" : "py-2"} text-white font-black flex items-center justify-center transition disabled:opacity-60 disabled:cursor-not-allowed`}
    >
      {n}
    </button>
  );
}

export default function Roulette() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [chipIdx, setChipIdx] = useState(1); // default ₹50
  const [bet, setBet] = useState(null);
  const [phase, setPhase] = useState("betting"); // betting → spinning → result
  const [resultNum, setResultNum] = useState(null);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [muted, setMuted] = useState(isSfxMuted());
  const balanceRef = useRef(0);

  useEffect(() => { balanceRef.current = balance; }, [balance]);
  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (s) => {
      if (s.exists()) setBalance(getUserFunds(s.data()).total);
    });
  }, [user]);

  // Live ticker of the last 14 results (real, from Firestore).
  useEffect(() => {
    const q = query(collection(db, "rouletteHistory"), orderBy("createdAt", "desc"), limit(14));
    return onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => d.data()?.number).filter((n) => Number.isFinite(n)));
    }, () => {});
  }, []);

  const stake = CHIPS[chipIdx];
  const potentialReturn = useMemo(() => {
    if (bet == null) return 0;
    const payout = typeof bet === "number" ? 36
      : [...OUTSIDE, ...DOZENS].find((o) => o.id === bet)?.payout || 0;
    return parseFloat((stake * payout).toFixed(2));
  }, [bet, stake]);

  const spin = async () => {
    if (!user) return setMsg("Please log in first");
    if (bet === null) return setMsg("Place a bet on the table first");
    if (stake > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting") return;

    setPhase("spinning");
    setResultNum(null);
    setMsg("");

    try {
      await debitUserFunds(db, user.uid, stake);
    } catch (err) {
      setPhase("betting");
      return setMsg(err.message || "Could not place bet.");
    }

    playWhoosh();
    // Periodic ticks while the ball rolls — gives the felt arena some life.
    const tickHandle = setInterval(() => playClick(), 280);
    setTimeout(() => clearInterval(tickHandle), 4100);

    const winning = getRouletteNumber();
    setResultNum(winning);

    // The wheel component fires onLanded after its animation finishes.
    // We finalise everything from there.
    setPhase("spinning");
    setSpinResolver({ winning });
  };

  // We park the resolver in a ref so the wheel's onLanded callback can
  // fire the wallet write at the precise moment the ball stops.
  const [spinResolver, setSpinResolver] = useState(null);
  const finaliseRound = async (winning) => {
    const payout = evaluate(bet, winning);
    const won = payout > 0;
    const winAmount = won ? parseFloat((stake * payout).toFixed(2)) : 0;
    if (won) {
      try { await creditUserWinnings(db, user.uid, winAmount); } catch {}
      playChime();
    }
    try {
      await addDoc(collection(db, "rouletteHistory"), {
        userId: user.uid,
        bet: String(bet),
        label: labelFor(bet),
        number: winning,
        color: colorOf(winning),
        betAmount: stake,
        winAmount,
        won,
        createdAt: serverTimestamp(),
      });
    } catch {}
    setMsg(
      won
        ? `${winning} ${colorOf(winning).toUpperCase()} — Won ${formatCurrency(winAmount)}!`
        : `${winning} ${colorOf(winning).toUpperCase()} — Try again.`
    );
    setPhase("result");
    setTimeout(() => {
      setPhase("betting");
      setBet(null);
      setResultNum(null);
      setMsg("");
      setSpinResolver(null);
    }, 3400);
  };

  const isBetting = phase === "betting";
  const dis = phase !== "betting";

  return (
    <div className="min-h-screen bg-gradient-to-b from-[#03070f] via-[#070d22] to-[#03070f] text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pt-20 pb-10">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-2xl font-black tracking-widest text-yellow-400">ROULETTE</h1>
          <button
            onClick={() => { const next = !muted; setMuted(next); setSfxMuted(next); }}
            className="text-xs bg-white/10 hover:bg-white/15 rounded-full px-3 py-1.5"
            title="Toggle sound"
          >
            {muted ? "🔇 Sound off" : "🔊 Sound on"}
          </button>
        </div>

        {/* History ticker */}
        <div className="flex gap-1.5 mb-4 overflow-x-auto pb-1">
          {history.length === 0 ? (
            <div className="text-xs text-gray-500">No spins yet.</div>
          ) : history.map((n, i) => (
            <span
              key={i}
              className={`shrink-0 w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
                colorOf(n) === "red" ? "bg-rose-700" : colorOf(n) === "black" ? "bg-zinc-900 border border-white/10" : "bg-emerald-700"
              }`}
            >
              {n}
            </span>
          ))}
        </div>

        {/* Wheel */}
        <div className="bg-gradient-to-b from-[#0d1a3a] to-[#040a1a] rounded-3xl border border-yellow-400/15 p-5 mb-4 shadow-[0_0_60px_-30px_rgba(250,204,21,0.4)]">
          <RouletteWheel
            winningNumber={resultNum}
            spinning={phase === "spinning" && resultNum != null}
            onLanded={() => spinResolver && finaliseRound(spinResolver.winning)}
          />
          <div className="mt-3 text-center min-h-[28px]">
            {phase === "betting"  && <span className="text-xs text-gray-400 uppercase tracking-widest">Place your bet</span>}
            {phase === "spinning" && <span className="text-sm font-semibold text-amber-300 animate-pulse">No more bets…</span>}
            {phase === "result"   && resultNum != null && (
              <span className={`text-base font-bold ${msg.includes("Won") ? "text-emerald-300" : "text-yellow-300"}`}>{msg}</span>
            )}
          </div>
        </div>

        {/* Felt table */}
        <div className="bg-gradient-to-b from-[#0a4d24] to-[#063418] rounded-2xl border border-emerald-900/60 p-3 mb-4 shadow-inner">
          <div className="flex gap-1.5">
            {/* Zero column — full height */}
            <button
              onClick={() => isBetting && setBet(0)}
              disabled={dis}
              className={`bg-emerald-700 ring-1 ring-black/40 ${bet === 0 ? "ring-2 ring-yellow-300" : ""} text-white font-black flex items-center justify-center w-10 disabled:opacity-60 disabled:cursor-not-allowed`}
            >0</button>
            {/* 3 × 12 number grid */}
            <div className="flex-1 grid grid-rows-3 grid-cols-12 gap-1">
              {NUMBER_GRID.flat().map((n) => (
                <NumberCell key={n} n={n} selected={bet === n} onClick={() => isBetting && setBet(n)} disabled={dis} />
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1 mt-1.5">
            {DOZENS.map((d) => (
              <button
                key={d.id}
                onClick={() => isBetting && setBet(d.id)}
                disabled={dis}
                className={`bg-emerald-800 ring-1 ring-black/40 text-white text-xs font-bold py-2 ${bet === d.id ? "ring-2 ring-yellow-300" : ""} disabled:opacity-60`}
              >{d.label}</button>
            ))}
          </div>

          <div className="grid grid-cols-6 gap-1 mt-1.5">
            {OUTSIDE.map((o) => {
              const c =
                o.id === "red"   ? "bg-rose-700"  :
                o.id === "black" ? "bg-zinc-900"  :
                "bg-emerald-800";
              return (
                <button
                  key={o.id}
                  onClick={() => isBetting && setBet(o.id)}
                  disabled={dis}
                  className={`${c} ring-1 ring-black/40 text-white text-[11px] font-bold py-2 ${bet === o.id ? "ring-2 ring-yellow-300" : ""} disabled:opacity-60`}
                >{o.label}</button>
              );
            })}
          </div>
        </div>

        {/* Bet panel */}
        <div className="bg-[#0d1430] rounded-2xl p-4 border border-white/5">
          <div className="flex items-center justify-between mb-3 text-xs">
            <span className="text-gray-400">Bet on: <span className="text-yellow-300 font-bold">{bet == null ? "—" : labelFor(bet)}</span></span>
            <span className="text-gray-400">Returns: <span className="text-emerald-300 font-bold">{formatCurrency(potentialReturn)}</span></span>
          </div>

          <div className="grid grid-cols-5 gap-2 mb-3">
            {CHIPS.map((c, i) => (
              <button
                key={c}
                onClick={() => setChipIdx(i)}
                disabled={dis}
                className={`rounded-full py-2 text-xs font-black border-2 ${
                  chipIdx === i
                    ? "bg-yellow-400 border-yellow-200 text-black shadow-[0_0_18px_-2px_rgba(250,204,21,0.6)]"
                    : "bg-[#070b1e] border-white/10 text-gray-200"
                } disabled:opacity-40`}
              >₹{c}</button>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-gray-400 mb-3">
            <span>Balance</span>
            <span className="text-white font-semibold">{formatCurrency(balance)}</span>
          </div>

          <button
            onClick={spin}
            disabled={dis || bet === null}
            className="w-full bg-yellow-400 hover:bg-yellow-300 disabled:opacity-40 rounded-xl py-3 font-black text-black text-lg"
          >
            {phase === "spinning" ? "Spinning…" : phase === "result" ? "Next round…" : `SPIN ₹${stake}`}
          </button>
        </div>
      </div>
    </div>
  );
}
