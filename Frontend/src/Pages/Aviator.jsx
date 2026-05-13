import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  doc, onSnapshot, addDoc, collection, serverTimestamp,
  query, orderBy, limit,
} from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { AviatorPlane } from "../components/GameVisuals";
import { getAviatorCrashPoint } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";
import {
  isSfxMuted, setSfxMuted, playChime, playCrash, startEngineHum,
} from "../utils/gameSfx";
import AviatorLiveBets from "../components/aviator/AviatorLiveBets";
import AviatorClouds from "../components/aviator/AviatorClouds";

const ROUND_WAIT = 6000;
const HISTORY_LIMIT = 15;

// Multiplier-to-pill-colour for the history strip — keeps the
// strip glanceable so users can spot streaks like "all under 2x".
const histColor = (mult) => {
  if (!Number.isFinite(mult)) return "bg-zinc-700 text-zinc-300";
  if (mult >= 10) return "bg-fuchsia-500 text-white";
  if (mult >= 2)  return "bg-emerald-500 text-black";
  if (mult >= 1.5) return "bg-amber-500 text-black";
  return "bg-rose-600 text-white";
};

const initialBet = () => ({
  amount: "100",
  placed: false,
  cashedOut: false,
  cashMult: null,
  stake: 0,
  autoOn: false,
  autoAt: "2.00",
});

export default function Aviator() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [multiplier, setMultiplier] = useState(1.0);
  const [phase, setPhase] = useState("waiting"); // waiting | flying | crashed
  const [crashAt, setCrashAt] = useState(null);
  const [countdown, setCountdown] = useState(6);
  const [msg, setMsg] = useState("");
  const [planePos, setPlanePos] = useState({ x: 5, y: 5 });
  const [history, setHistory] = useState([]);
  const [muted, setMuted] = useState(isSfxMuted());
  const [crashFlash, setCrashFlash] = useState(false);

  // Two independent bet slots — signature Spribe layout.
  const [bets, setBets] = useState([initialBet(), initialBet()]);
  const betsRef  = useRef(bets);
  const balanceRef = useRef(0);
  const animRef = useRef(null);
  const countRef = useRef(null);
  const hum = useRef(null);

  useEffect(() => { betsRef.current = bets; }, [bets]);
  useEffect(() => { balanceRef.current = balance; }, [balance]);

  useEffect(() => {
    if (!user) return;
    return onSnapshot(doc(db, "users", user.uid), (snap) => {
      if (snap.exists()) setBalance(getUserFunds(snap.data()).total);
    });
  }, [user]);

  // History from aviatorHistory (real round results, written on crash).
  useEffect(() => {
    const q = query(collection(db, "aviatorHistory"), orderBy("createdAt", "desc"), limit(HISTORY_LIMIT));
    return onSnapshot(q, (snap) => {
      setHistory(snap.docs.map((d) => d.data()?.crashPoint).filter((v) => Number.isFinite(v)));
    }, () => {});
  }, []);

  useEffect(() => {
    startWaiting();
    return () => {
      clearInterval(animRef.current);
      clearInterval(countRef.current);
      try { hum.current?.stop(); } catch {}
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startWaiting = () => {
    setPhase("waiting");
    setMultiplier(1.0);
    setCrashAt(null);
    setMsg("");
    setCrashFlash(false);
    setPlanePos({ x: 5, y: 5 });
    setBets((prev) => prev.map((b) => ({ ...b, placed: false, cashedOut: false, cashMult: null, stake: 0 })));

    let time = 6;
    setCountdown(time);
    countRef.current = setInterval(() => {
      time -= 1;
      setCountdown(time);
      if (time <= 0) {
        clearInterval(countRef.current);
        startFlight();
      }
    }, 1000);
  };

  const startFlight = () => {
    const crashPoint = getAviatorCrashPoint();
    setCrashAt(crashPoint);
    setPhase("flying");

    try { hum.current = startEngineHum(); } catch {}

    const startTime = Date.now();
    animRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const nextMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));
      setMultiplier(nextMultiplier);
      try { hum.current?.setPitch?.(nextMultiplier); } catch {}

      const progress = Math.min(elapsed / 15, 1);
      const xPos = 5 + 78 * (1 - Math.pow(1 - progress, 2));
      const yPos = 5 + 70 * Math.sin((Math.PI / 2) * progress);
      setPlanePos({ x: xPos, y: yPos });

      // Auto-cashout: each slot independently fires when the live
      // multiplier crosses its target. We snapshot betsRef so the
      // interval doesn't need to be torn down on every state change.
      betsRef.current.forEach((b, slot) => {
        if (!b.placed || b.cashedOut || !b.autoOn) return;
        const target = parseFloat(b.autoAt);
        if (Number.isFinite(target) && nextMultiplier >= target) {
          cashOut(slot, target);
        }
      });

      if (nextMultiplier >= crashPoint) {
        clearInterval(animRef.current);
        handleCrash(crashPoint);
      }
    }, 50);
  };

  const handleCrash = async (crashPoint) => {
    setPhase("crashed");
    setCrashAt(crashPoint);
    setCrashFlash(true);
    setTimeout(() => setCrashFlash(false), 800);

    try { hum.current?.stop?.(); } catch {}
    try { playCrash(); } catch {}

    // For each placed-but-uncashed bet, record loss + history.
    try {
      const current = betsRef.current;
      for (let slot = 0; slot < current.length; slot++) {
        const b = current[slot];
        if (b.placed && !b.cashedOut && b.stake > 0) {
          await addDoc(collection(db, "aviatorBets"), {
            crashPoint,
            userId: user?.uid,
            betAmount: b.stake,
            winAmount: 0,
            won: false,
            createdAt: serverTimestamp(),
          });
        }
      }
      // One history doc per round — the strip subscribes to this.
      // Always write so a round with no bets still gets stamped.
      await addDoc(collection(db, "aviatorHistory"), {
        crashPoint,
        userId: user?.uid || null,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Aviator crash finalise:", err);
    } finally {
      const anyLost = betsRef.current.some((b) => b.placed && !b.cashedOut && b.stake > 0);
      setMsg(anyLost ? `Crashed at ${crashPoint.toFixed(2)}x — better luck next round.` : `Round ended at ${crashPoint.toFixed(2)}x.`);
      setTimeout(() => startWaiting(), ROUND_WAIT);
    }
  };

  const placeBet = async (slot) => {
    if (phase !== "waiting") return setMsg("Wait for next round.");
    const b = betsRef.current[slot];
    if (b.placed) return;
    const amount = parseFloat(b.amount);
    if (!user) return setMsg("Please log in first.");
    if (!Number.isFinite(amount) || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance.");

    try {
      await debitUserFunds(db, user.uid, amount);
    } catch (err) {
      return setMsg(err.message || "Could not place bet.");
    }
    setBets((prev) => prev.map((bx, i) => (i === slot ? { ...bx, placed: true, stake: amount } : bx)));
    setMsg(`Bet ${slot + 1}: ${formatCurrency(amount)} placed.`);
  };

  // forcedMult lets auto-cashout lock in the exact trigger value
  // even if the next tick has nudged the displayed multiplier past it.
  const cashOut = async (slot, forcedMult) => {
    if (phase !== "flying") return;
    const b = betsRef.current[slot];
    if (!b.placed || b.cashedOut) return;

    const cur = Number.isFinite(forcedMult) ? forcedMult : multiplier;
    const winAmount = parseFloat((b.stake * cur).toFixed(2));

    setBets((prev) => prev.map((bx, i) => (i === slot ? { ...bx, cashedOut: true, cashMult: cur } : bx)));
    setMsg(`Bet ${slot + 1}: cashed out at ${cur.toFixed(2)}x → +${formatCurrency(winAmount)}!`);
    try { playChime(); } catch {}

    try {
      await creditUserWinnings(db, user.uid, winAmount);
      await addDoc(collection(db, "aviatorBets"), {
        userId: user.uid,
        betAmount: b.stake,
        cashoutMultiplier: cur,
        winAmount,
        won: true,
        createdAt: serverTimestamp(),
      });
    } catch (err) {
      console.error("Cashout record failed:", err);
    }
  };

  const updateBet = (slot, patch) => {
    setBets((prev) => prev.map((b, i) => (i === slot ? { ...b, ...patch } : b)));
  };

  const multColor = phase === "crashed" ? "#ef4444" : phase === "flying" ? "#00ff88" : "#facc15";

  // Slot card — Bet 1 / Bet 2. Defined as a plain function (NOT a
  // React component) so that the multiplier ticking 20 times/sec
  // during flight doesn't unmount + remount the whole subtree on
  // every render. Component-identity defined inside the parent meant
  // the CASH OUT button DOM was being destroyed before mobile
  // taps could register — clicks were getting lost.
  const renderSlot = (slot) => {
    const b = bets[slot];
    const live = phase === "flying";
    const liveWin = b.placed && !b.cashedOut && live
      ? formatCurrency(parseFloat((b.stake * multiplier).toFixed(2))) : null;

    return (
      <div key={`slot-${slot}`} className="bg-[#12152b] rounded-2xl p-3 border border-white/5">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-2">Bet {slot + 1}</p>

        <div className="flex gap-1.5 mb-2">
          <input
            type="number"
            value={b.amount}
            onChange={(e) => updateBet(slot, { amount: e.target.value })}
            disabled={b.placed || phase !== "waiting"}
            placeholder={`Min ${formatCurrency(10)}`}
            className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-lg px-2 py-1.5 text-sm text-white"
          />
        </div>

        <div className="grid grid-cols-4 gap-1 mb-2">
          {[50, 100, 200, 500].map((v) => (
            <button
              key={v}
              onClick={() => updateBet(slot, { amount: String((parseFloat(b.amount) || 0) + v) })}
              disabled={b.placed || phase !== "waiting"}
              className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded text-[10px] font-bold py-1"
            >+₹{v}</button>
          ))}
        </div>

        {/* Auto-cashout */}
        <div className="flex items-center gap-2 mb-2 text-[11px]">
          <label className="flex items-center gap-1 text-gray-300">
            <input
              type="checkbox"
              checked={b.autoOn}
              onChange={(e) => updateBet(slot, { autoOn: e.target.checked })}
              disabled={b.placed && live}
              className="accent-emerald-500"
            />
            Auto cashout
          </label>
          <input
            type="number"
            step="0.1"
            min="1.1"
            value={b.autoAt}
            onChange={(e) => updateBet(slot, { autoAt: e.target.value })}
            disabled={!b.autoOn || (b.placed && live)}
            className="w-16 bg-[#0b0d1a] border border-gray-700 rounded px-1.5 py-1 text-right text-xs"
          />
          <span className="text-gray-500">x</span>
        </div>

        {!b.placed ? (
          <button
            onClick={() => placeBet(slot)}
            disabled={phase !== "waiting"}
            className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-lg py-2 font-bold text-sm"
          >
            {phase === "waiting" ? "PLACE BET" : `Next round in ${countdown}s`}
          </button>
        ) : b.cashedOut ? (
          <div className="w-full bg-emerald-900/30 text-emerald-300 rounded-lg py-2 font-bold text-sm text-center">
            ✓ Cashed out @ {b.cashMult?.toFixed(2)}x
          </div>
        ) : phase === "flying" ? (
          <button
            onClick={() => cashOut(slot)}
            className="w-full bg-yellow-500 hover:bg-yellow-400 text-black rounded-lg py-2 font-black text-sm"
          >
            CASH OUT · {liveWin}
          </button>
        ) : phase === "crashed" ? (
          <div className="w-full bg-rose-900/30 text-rose-300 rounded-lg py-2 font-bold text-sm text-center">
            ✗ Lost ₹{b.stake}
          </div>
        ) : (
          <div className="w-full bg-blue-900/30 text-blue-200 rounded-lg py-2 font-bold text-sm text-center">
            Bet placed · waiting…
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-[#0b0d1a] text-white">
      <Navbar />
      <div className="max-w-2xl mx-auto px-4 pb-8 pt-16">
        <div className="flex items-center justify-between py-4">
          <h1 className="text-2xl font-black text-yellow-400 tracking-widest">AVIATOR</h1>
          <button
            onClick={() => { const next = !muted; setMuted(next); setSfxMuted(next); }}
            className="text-xs bg-white/10 hover:bg-white/15 rounded-full px-3 py-1.5"
          >
            {muted ? "🔇 Sound off" : "🔊 Sound on"}
          </button>
        </div>

        {/* HISTORY STRIP */}
        <div className="flex gap-1.5 mb-3 overflow-x-auto pb-1">
          {history.length === 0 ? (
            <div className="text-[11px] text-gray-500">No rounds yet.</div>
          ) : history.map((m, i) => (
            <span
              key={i}
              className={`shrink-0 px-2 py-1 rounded-full text-[11px] font-black ${histColor(m)}`}
            >
              {m.toFixed(2)}x
            </span>
          ))}
        </div>

        {/* FLIGHT ARENA */}
        <div
          className={`relative overflow-hidden rounded-2xl border ${crashFlash ? "border-rose-500 animate-pulse" : "border-slate-700"} mb-3 bg-[radial-gradient(ellipse_at_top,#1a2f52_0%,#0f1a30_55%,#05070d_100%)] transition-all duration-200`}
          style={{ height: 280 }}
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_70%_15%,rgba(255,255,255,0.05),transparent_30%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,#ffffff55_0.5px,transparent_1px),radial-gradient(circle_at_40%_22%,#ffffff33_0.5px,transparent_1px),radial-gradient(circle_at_80%_8%,#ffffff55_0.5px,transparent_1px),radial-gradient(circle_at_90%_28%,#ffffff33_0.5px,transparent_1px)]" />
          {/* Parallax clouds drift only while the plane is flying so the
              waiting phase reads as a calm sky. */}
          <AviatorClouds moving={phase === "flying"} />
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-amber-500/15 via-orange-400/5 to-transparent" />
          {[25, 50, 75].map((p) => (
            <div key={`h${p}`} className="absolute w-full border-t border-blue-900/30" style={{ top: `${p}%` }} />
          ))}
          {[25, 50, 75].map((p) => (
            <div key={`v${p}`} className="absolute h-full border-l border-blue-900/30" style={{ left: `${p}%` }} />
          ))}

          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {phase === "waiting" && (
              <div className="text-center">
                <div className="text-gray-400 text-sm mb-1 tracking-widest">NEXT ROUND IN</div>
                <div className="text-6xl font-black text-yellow-400 drop-shadow-[0_0_20px_rgba(250,204,21,0.5)]">{countdown}s</div>
              </div>
            )}
            {phase === "flying" && (
              <div className="text-7xl font-black tracking-tight drop-shadow-[0_0_25px_rgba(0,0,0,0.7)]" style={{ color: multColor }}>
                {multiplier.toFixed(2)}x
              </div>
            )}
            {phase === "crashed" && (
              <div className="text-center">
                <div className="text-5xl font-black text-red-500 animate-pulse drop-shadow-[0_0_25px_rgba(239,68,68,0.6)]">FLEW AWAY!</div>
                <div className="text-3xl font-bold text-red-300 mt-1">{crashAt?.toFixed(2)}x</div>
              </div>
            )}
          </div>

          {phase === "flying" && (
            <>
              <svg className="absolute inset-0 h-full w-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <defs>
                  <linearGradient id="trailGrad" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(239,68,68,0)" />
                    <stop offset="40%" stopColor="rgba(248,113,113,0.4)" />
                    <stop offset="100%" stopColor="rgba(254,202,202,0.9)" />
                  </linearGradient>
                  <linearGradient id="trailFill" x1="0%" y1="100%" x2="100%" y2="0%">
                    <stop offset="0%" stopColor="rgba(239,68,68,0)" />
                    <stop offset="70%" stopColor="rgba(239,68,68,0.18)" />
                    <stop offset="100%" stopColor="rgba(239,68,68,0.35)" />
                  </linearGradient>
                </defs>
                <path
                  d={`M 0 100 Q ${planePos.x * 0.45} ${100 - planePos.y * 0.25} ${planePos.x} ${100 - planePos.y} L ${planePos.x} 100 Z`}
                  fill="url(#trailFill)"
                />
                <path
                  d={`M 0 100 Q ${planePos.x * 0.45} ${100 - planePos.y * 0.25} ${planePos.x} ${100 - planePos.y}`}
                  stroke="url(#trailGrad)"
                  strokeWidth="0.9"
                  fill="none"
                  strokeLinecap="round"
                />
              </svg>
              <div
                className="absolute"
                style={{
                  left: `${planePos.x}%`,
                  bottom: `${planePos.y}%`,
                  transform: `translate(-75%, 50%) rotate(${Math.max(-22, -12 - (planePos.y / 10))}deg)`,
                  transition: "left 0.12s linear, bottom 0.12s linear, transform 0.25s ease-out",
                  willChange: "left, bottom, transform",
                }}
              >
                <AviatorPlane className="h-14 w-28 md:h-16 md:w-32" />
              </div>
            </>
          )}

          {/* Crashed plane drift — keeps the arena from looking empty mid-loss */}
          {phase === "crashed" && (
            <div
              className="absolute"
              style={{
                left: "112%",
                bottom: `${Math.min(85, planePos.y + 20)}%`,
                transform: "rotate(-35deg)",
                transition: "left 1.2s ease-in, bottom 1.2s ease-in",
              }}
            >
              <AviatorPlane className="h-14 w-28 opacity-60" />
            </div>
          )}
        </div>

        {msg && (
          <div className="text-center text-sm font-semibold text-yellow-200 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>
        )}

        {/* DUAL BET PANEL */}
        <div className="grid grid-cols-2 gap-2.5">
          {renderSlot(0)}
          {renderSlot(1)}
        </div>

        <div className="mt-3 text-center text-[10px] uppercase tracking-[0.25em] text-gray-600">
          Balance · {formatCurrency(balance)}
        </div>

        {/* LIVE ACTIVITY PANEL — winners ticker + All / My / Top tabs */}
        <div className="mt-4">
          <AviatorLiveBets currentUid={user?.uid} />
        </div>
      </div>
    </div>
  );
}
