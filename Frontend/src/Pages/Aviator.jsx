import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { AviatorPlane } from "../components/GameVisuals";
import { getAviatorCrashPoint } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";
// NOTE: Aviator still uses client-side RNG for the flight animation so
// the visible crash matches the multiplier the user sees in real time.
// Full server-authoritative Aviator needs a streaming backend (websocket
// or Cloud Function) to hide the crash point until reveal — flagged as
// follow-up work. Coin/Dice/Color are already server-side via gameApi.

const ROUND_WAIT = 6000;

export default function Aviator() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [multiplier, setMultiplier] = useState(1.0);
  const [phase, setPhase] = useState("waiting");
  const [hasBet, setHasBet] = useState(false);
  const [cashedOut, setCashedOut] = useState(false);
  const [cashMult, setCashMult] = useState(null);
  const [crashAt, setCrashAt] = useState(null);
  const [countdown, setCountdown] = useState(6);
  const [msg, setMsg] = useState("");
  const [planePos, setPlanePos] = useState({ x: 5, y: 5 });
  const betRef = useRef(null);
  const hasBetRef = useRef(false);
  const cashedOutRef = useRef(false);
  const balanceRef = useRef(0);
  const animRef = useRef(null);
  const countRef = useRef(null);

  useEffect(() => {
    hasBetRef.current = hasBet;
  }, [hasBet]);

  useEffect(() => {
    cashedOutRef.current = cashedOut;
  }, [cashedOut]);

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
    startWaiting();
    return () => {
      clearInterval(animRef.current);
      clearInterval(countRef.current);
    };
  }, []);

  const startWaiting = () => {
    setPhase("waiting");
    setMultiplier(1.0);
    setHasBet(false);
    hasBetRef.current = false;
    setCashedOut(false);
    cashedOutRef.current = false;
    setCashMult(null);
    setCrashAt(null);
    setMsg("");
    betRef.current = null;
    setBetAmount("");
    setPlanePos({ x: 5, y: 5 });

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

    const startTime = Date.now();
    animRef.current = setInterval(() => {
      const elapsed = (Date.now() - startTime) / 1000;
      const nextMultiplier = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));
      setMultiplier(nextMultiplier);
      // Ease-out arc: plane climbs fast early, then flattens as multiplier grows.
      const progress = Math.min(elapsed / 15, 1);
      const xPos = 5 + 78 * (1 - Math.pow(1 - progress, 2));
      const yPos = 5 + 70 * Math.sin((Math.PI / 2) * progress);
      setPlanePos({ x: xPos, y: yPos });

      if (nextMultiplier >= crashPoint) {
        clearInterval(animRef.current);
        handleCrash(crashPoint);
      }
    }, 50);
  };

  const handleCrash = async (crashPoint) => {
    setPhase("crashed");
    setCrashAt(crashPoint);

    try {
      if (hasBetRef.current && !cashedOutRef.current && betRef.current) {
        const amount = betRef.current;
        setMsg(`Crashed at ${crashPoint.toFixed(2)}x! Lost ${formatCurrency(amount)}`);
        await addDoc(collection(db, "aviatorHistory"), {
          crashPoint,
          userId: user?.uid,
          betAmount: amount,
          won: false,
          createdAt: serverTimestamp(),
        });
        await addDoc(collection(db, "aviatorBets"), {
          crashPoint,
          userId: user?.uid,
          betAmount: amount,
          winAmount: 0,
          won: false,
          createdAt: serverTimestamp(),
        });
      } else if (!hasBetRef.current) {
        await addDoc(collection(db, "aviatorHistory"), {
          crashPoint,
          createdAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error("Failed to finish Aviator crash round:", error);
      setMsg(`Round ended at ${crashPoint.toFixed(2)}x.`);
    } finally {
      setTimeout(() => startWaiting(), ROUND_WAIT);
    }
  };

  const placeBet = async () => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "waiting") return setMsg("Wait for next round");
    if (hasBetRef.current) return;

    betRef.current = amount;
    setHasBet(true);
    await debitUserFunds(db, user.uid, amount);
    setMsg(`Bet ${formatCurrency(amount)} placed!`);
  };

  const cashOut = async () => {
    if (!hasBetRef.current || cashedOutRef.current || phase !== "flying") return;
    const amount = betRef.current;
    const currentMultiplier = multiplier;
    const winAmount = parseFloat((amount * currentMultiplier).toFixed(2));

    setCashedOut(true);
    cashedOutRef.current = true;
    setCashMult(currentMultiplier);
    setMsg(`Cashed out at ${currentMultiplier}x! Won ${formatCurrency(winAmount)}`);

    try {
      await creditUserWinnings(db, user.uid, winAmount);
      await addDoc(collection(db, "aviatorBets"), {
        userId: user.uid,
        betAmount: amount,
        cashoutMultiplier: currentMultiplier,
        winAmount,
        won: true,
        createdAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Failed to record Aviator cash out:", error);
      setMsg(`Cashed out at ${currentMultiplier}x! Credit retry required.`);
    }
  };

  const multColor = phase === "crashed" ? "#ef4444" : phase === "flying" ? "#00ff88" : "#facc15";

  return (
    <div className="min-h-screen bg-[#0b0d1a] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">AVIATOR</h1>

        <div className="relative overflow-hidden rounded-2xl border border-slate-700 mb-3 bg-[radial-gradient(ellipse_at_top,#1a2f52_0%,#0f1a30_55%,#05070d_100%)]" style={{ height: 260 }}>
          {/* sky clouds */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_30%,rgba(255,255,255,0.08),transparent_35%),radial-gradient(circle_at_70%_15%,rgba(255,255,255,0.05),transparent_30%)]" />
          {/* stars at top */}
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_15%_10%,#ffffff55_0.5px,transparent_1px),radial-gradient(circle_at_40%_22%,#ffffff33_0.5px,transparent_1px),radial-gradient(circle_at_80%_8%,#ffffff55_0.5px,transparent_1px),radial-gradient(circle_at_90%_28%,#ffffff33_0.5px,transparent_1px)]" />
          {/* horizon glow */}
          <div className="absolute bottom-0 left-0 right-0 h-20 bg-gradient-to-t from-amber-500/15 via-orange-400/5 to-transparent" />
          {/* subtle grid */}
          {[25, 50, 75].map((point) => (
            <div key={`h${point}`} className="absolute w-full border-t border-blue-900/30" style={{ top: `${point}%` }} />
          ))}
          {[25, 50, 75].map((point) => (
            <div key={`v${point}`} className="absolute h-full border-l border-blue-900/30" style={{ left: `${point}%` }} />
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
              {/* curved flight path + smoke trail */}
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
              {/* plane body — smooth transition so movement feels buttery */}
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
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder={`Bet amount (Min ${formatCurrency(10)})`} disabled={phase !== "waiting" || hasBet} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>

          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount((prev) => String((parseFloat(prev) || 0) + amount))}
                disabled={phase !== "waiting" || hasBet}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold"
              >
                +{formatCurrency(amount)}
              </button>
            ))}
          </div>

          <div className="flex gap-3">
            <button onClick={placeBet} disabled={phase !== "waiting" || hasBet} className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-bold">
              {hasBet ? "Bet Placed" : "Place Bet"}
            </button>
            <button onClick={cashOut} disabled={!hasBet || cashedOut || phase !== "flying"} className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-bold text-black">
              {cashedOut ? `${cashMult?.toFixed(2)}x Locked` : `Cash Out ${multiplier.toFixed(2)}x`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


