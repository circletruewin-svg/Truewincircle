import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { ColorOrb } from "../components/GameVisuals";
import { getColorWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";
import { gameApi, isServerRngEnabled } from "../utils/gameApi";

const COLORS = [
  { id: "red", label: "RED", mult: 2, bg: "bg-red-600", ring: "ring-red-400" },
  { id: "green", label: "GREEN", mult: 3, bg: "bg-green-600", ring: "ring-green-400" },
  { id: "violet", label: "VIOLET", mult: 4.5, bg: "bg-purple-600", ring: "ring-purple-400" },
];

function ColorAsset({ color, className = "" }) {
  return <ColorOrb color={color} className={className} />;
}

const ROUND_SEC = 30;
export default function ColorPrediction() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betColor, setBetColor] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC);
  const [winnerColor, setWinnerColor] = useState(null);
  const [msg, setMsg] = useState("");
  const [history, setHistory] = useState([]);
  const [spinning, setSpinning] = useState(false);

  const betColorRef = useRef(null);
  const betAmtRef = useRef(null);
  const hasBetRef = useRef(false);
  const balanceRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    betColorRef.current = betColor;
  }, [betColor]);

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
    return onSnapshot(query(collection(db, "colorHistory"), orderBy("createdAt", "desc"), limit(15)), (snapshot) => {
      setHistory(snapshot.docs.map((item) => item.data()));
    });
  }, []);

  useEffect(() => {
    startRound();
    return () => clearInterval(timerRef.current);
  }, []);

  const startRound = () => {
    setPhase("betting");
    setBetColor(null);
    betColorRef.current = null;
    betAmtRef.current = null;
    hasBetRef.current = false;
    setWinnerColor(null);
    setMsg("");
    setSpinning(false);
    setTimeLeft(ROUND_SEC);

    let time = ROUND_SEC;
    timerRef.current = setInterval(() => {
      time -= 1;
      setTimeLeft(time);
      if (time <= 0) {
        clearInterval(timerRef.current);
        runResult();
      }
    }, 1000);
  };

  const runResult = async () => {
    setPhase("result");
    setSpinning(true);

    const userBet = betColorRef.current;
    const amount = betAmtRef.current;

    // If user placed a bet, resolve it authoritatively (server if enabled).
    let resolved;
    try {
      if (hasBetRef.current && userBet) {
        if (isServerRngEnabled()) {
          const res = await gameApi.color(userBet, amount);
          resolved = { winner: res.result, won: res.won, winAmount: res.winAmount };
        } else {
          const winner = getColorWinner(userBet);
          const won = winner === userBet;
          const colorData = COLORS.find((item) => item.id === winner);
          const winAmount = won ? parseFloat((amount * colorData.mult).toFixed(2)) : 0;
          if (won) await creditUserWinnings(db, user.uid, winAmount);
          await addDoc(collection(db, "colorBets"), {
            userId: user.uid, betColor: userBet, winnerColor: winner,
            betAmount: amount, winAmount, won,
            createdAt: serverTimestamp(),
          });
          resolved = { winner, won, winAmount };
        }
      } else {
        // No bet placed — just reveal a decorative winner for history.
        const colors = ["red", "green", "violet"];
        resolved = { winner: colors[Math.floor(Math.random() * colors.length)], won: false, winAmount: 0 };
      }
    } catch (error) {
      console.error("Color Prediction round failed:", error);
      setMsg(error.message || "Round sync failed.");
      resolved = { winner: "red", won: false, winAmount: 0 };
    }

    setTimeout(async () => {
      setSpinning(false);
      setWinnerColor(resolved.winner);

      if (hasBetRef.current) {
        setMsg(
          resolved.won
            ? `${resolved.winner.toUpperCase()} wins! +${formatCurrency(resolved.winAmount)}`
            : `${resolved.winner.toUpperCase()} wins. Lost ${formatCurrency(amount)}`
        );
      }

      try {
        await addDoc(collection(db, "colorHistory"), {
          winner: resolved.winner,
          createdAt: serverTimestamp(),
        });
      } catch (_) { /* history is decorative */ }

      setTimeout(() => startRound(), 3500);
    }, 2000);
  };

  const placeBet = async (color) => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting" || hasBetRef.current) return;

    setBetColor(color);
    betColorRef.current = color;
    betAmtRef.current = amount;
    hasBetRef.current = true;
    // When server RNG is enabled, the backend will debit at settle time
    // using the authoritative round. Otherwise debit locally now.
    if (!isServerRngEnabled()) {
      await debitUserFunds(db, user.uid, amount);
    }
    setMsg(`Bet ${formatCurrency(amount)} on ${color.toUpperCase()}!`);
  };

  const timerPct = (timeLeft / ROUND_SEC) * 100;
  const timerColor = timeLeft > 10 ? "bg-green-500" : timeLeft > 5 ? "bg-yellow-500" : "bg-red-500 animate-pulse";

  return (
    <div className="min-h-screen bg-[#0d0d1a] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">Color Prediction</h1>

        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {history.map((item, index) => (
            <div key={index} className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${item.winner === "red" ? "bg-red-600" : item.winner === "green" ? "bg-green-600" : "bg-purple-600"}`}>
              {item.winner?.[0].toUpperCase()}
            </div>
          ))}
        </div>

        <div className="bg-gray-800 rounded-full h-2 mb-4 overflow-hidden">
          <div className={`h-2 rounded-full transition-all duration-1000 ${timerColor}`} style={{ width: `${timerPct}%` }} />
        </div>

        <div className="text-center mb-4">
          {phase === "betting" ? (
            <span className="text-lg font-bold text-white">
              Bet closes in <span className="text-yellow-400 text-2xl">{timeLeft}s</span>
            </span>
          ) : spinning ? (
            <span className="text-xl font-bold text-yellow-300 animate-pulse">Picking winner...</span>
          ) : (
            <span className={`text-2xl font-black ${winnerColor === "red" ? "text-red-400" : winnerColor === "green" ? "text-green-400" : "text-purple-400"}`}>
              {winnerColor?.toUpperCase()} WINS!
            </span>
          )}
        </div>

        <div className="flex justify-center mb-6">
          <div className={`w-28 h-28 rounded-full border-4 border-yellow-500 flex items-center justify-center text-lg font-black shadow-2xl ${spinning ? "animate-spin" : ""} ${winnerColor === "red" ? "bg-red-700" : winnerColor === "green" ? "bg-green-700" : winnerColor === "violet" ? "bg-purple-700" : "bg-gray-800"}`}>
            {spinning ? "..." : winnerColor ? <ColorAsset color={winnerColor} className="h-16 w-16 object-contain" /> : "READY"}
          </div>
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-4">{msg}</div>}

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800 mb-3">
          <div className="flex gap-2 mb-3">
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(e.target.value)}
              placeholder={`Bet amount (Min ${formatCurrency(10)})`}
              disabled={phase !== "betting" || hasBetRef.current}
              className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"
            />
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">{formatCurrency(balance)}</div>
          </div>
          <div className="grid grid-cols-4 gap-2">
            {[50, 100, 200, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount(amount.toString())}
                disabled={phase !== "betting" || hasBetRef.current}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold"
              >
                {formatCurrency(amount)}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          {COLORS.map((item) => (
            <button
              key={item.id}
              onClick={() => placeBet(item.id)}
              disabled={phase !== "betting" || hasBetRef.current}
              className={`${item.bg} ${betColor === item.id ? `ring-4 ${item.ring}` : ""} rounded-2xl py-5 flex flex-col items-center gap-1 font-bold disabled:opacity-40 disabled:cursor-not-allowed hover:opacity-90 active:scale-95 transition-all`}
            >
              <ColorAsset color={item.id} className="h-10 w-10 object-contain" />
              <span className="text-xl">{item.label}</span>
              <span className="text-xs font-black opacity-80">{item.mult}x</span>
            </button>
          ))}
        </div>

        <div className="mt-4 bg-[#12152b] rounded-xl p-3 border border-gray-800 text-xs text-gray-500 text-center">
          RED = 2x | GREEN = 3x | VIOLET = 4.5x
        </div>
      </div>
    </div>
  );
}


