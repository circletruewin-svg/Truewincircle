import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getAviatorCrashPoint } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatAmount, formatCurrency } from "../utils/formatMoney";
import { GAME_ASSETS } from "../utils/gameAssets";

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
  const [history, setHistory] = useState([]);
  const [msg, setMsg] = useState("");
  const [planePos, setPlanePos] = useState({ x: 5, y: 5 });
  const [planeAssetFailed, setPlaneAssetFailed] = useState(false);

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
    return onSnapshot(query(collection(db, "aviatorHistory"), orderBy("createdAt", "desc"), limit(12)), (snapshot) => {
      setHistory(snapshot.docs.map((item) => item.data()));
    });
  }, []);

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
      setPlanePos({ x: Math.min(5 + elapsed * 14, 82), y: Math.min(5 + elapsed * 9, 75) });

      if (nextMultiplier >= crashPoint) {
        clearInterval(animRef.current);
        handleCrash(crashPoint);
      }
    }, 80);
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

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {history.map((item, index) => (
            <span key={index} className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${item.crashPoint >= 2 ? "bg-green-800 text-green-300" : "bg-red-900 text-red-300"}`}>
              {item.crashPoint?.toFixed(2)}x
            </span>
          ))}
        </div>

        <div className="relative bg-[#12152b] rounded-2xl overflow-hidden border border-gray-800 mb-3" style={{ height: 220 }}>
          {[25, 50, 75].map((point) => (
            <div key={point} className="absolute w-full border-t border-blue-900/40" style={{ top: `${point}%` }} />
          ))}
          {[25, 50, 75].map((point) => (
            <div key={point} className="absolute h-full border-l border-blue-900/40" style={{ left: `${point}%` }} />
          ))}

          <div className="absolute inset-0 flex flex-col items-center justify-center">
            {phase === "waiting" && (
              <div className="text-center">
                <div className="text-gray-500 text-sm mb-1">Next round in</div>
                <div className="text-5xl font-black text-yellow-400">{countdown}s</div>
              </div>
            )}
            {phase === "flying" && <div className="text-6xl font-black" style={{ color: multColor }}>{multiplier.toFixed(2)}x</div>}
            {phase === "crashed" && (
              <div className="text-center">
                <div className="text-4xl font-black text-red-500 animate-pulse">CRASHED!</div>
                <div className="text-2xl font-bold text-red-400">{crashAt?.toFixed(2)}x</div>
              </div>
            )}
          </div>

          {phase === "flying" && (
            <>
              <svg className="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                <path d={`M 0 100 Q ${planePos.x / 2} ${100 - planePos.y / 2} ${planePos.x} ${100 - planePos.y}`} stroke="#00ff88" strokeWidth="0.4" fill="none" opacity="0.5" />
              </svg>
              <div className="absolute" style={{ left: `${planePos.x}%`, bottom: `${planePos.y}%`, transform: "translate(-50%, 50%) rotate(-18deg)", transition: "all 0.08s linear" }}>
                {!planeAssetFailed ? (
                  <img src={GAME_ASSETS.aviatorPlane} alt="Aviator plane" className="h-10 w-10 object-contain drop-shadow-[0_0_12px_rgba(255,77,109,0.55)]" onError={() => setPlaneAssetFailed(true)} />
                ) : (
                  <div className="flex h-10 w-10 items-center justify-center rounded-full bg-rose-500/20 text-xs font-black text-rose-300 border border-rose-400/40">PLN</div>
                )}
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
              <button key={amount} onClick={() => setBetAmount(amount.toString())} disabled={phase !== "waiting" || hasBet} className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">
                {formatCurrency(amount)}
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


