import { useState, useEffect, useRef } from “react”;
import { db } from “../firebase”;
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, orderBy, limit } from “firebase/firestore”;
import { getAuth } from “firebase/auth”;
import Navbar from “../components/Navbar”;
import { getAviatorCrashPoint } from “../utils/houseEdge”;

// ─── Helper: deduct from balance first, then winningMoney ───────────────────
function calcDeduction(amount, balance, winningMoney) {
if (balance >= amount) {
return { newBalance: balance - amount, newWinning: winningMoney };
}
const fromBalance = balance;
const fromWinning = amount - fromBalance;
return { newBalance: 0, newWinning: winningMoney - fromWinning };
}

export default function Aviator() {
const auth = getAuth();
const user = auth.currentUser;

const [balance, setBalance] = useState(0);
const [winningMoney, setWinningMoney] = useState(0);
const [totalBalance, setTotalBalance] = useState(0);

const [betAmount, setBetAmount] = useState(””);
const [multiplier, setMultiplier] = useState(1.00);
const [phase, setPhase] = useState(“waiting”);
const [hasBet, setHasBet] = useState(false);
const [cashedOut, setCashedOut] = useState(false);
const [cashMult, setCashMult] = useState(null);
const [crashAt, setCrashAt] = useState(null);
const [countdown, setCountdown] = useState(6);
const [history, setHistory] = useState([]);
const [msg, setMsg] = useState(””);
const [planePos, setPlanePos] = useState({ x: 5, y: 5 });

const betRef = useRef(null);
const hasBetRef = useRef(false);
const cashedOutRef = useRef(false);
const balanceRef = useRef(0);
const winningRef = useRef(0);
const totalRef = useRef(0);
const animRef = useRef(null);
const countRef = useRef(null);
const phaseRef = useRef(“waiting”);

useEffect(() => { hasBetRef.current = hasBet; }, [hasBet]);
useEffect(() => { cashedOutRef.current = cashedOut; }, [cashedOut]);

// ── Listen to user doc ────────────────────────────────────────────────────
useEffect(() => {
if (!user) return;
return onSnapshot(doc(db, “users”, user.uid), (s) => {
if (s.exists()) {
const data = s.data();
const bal = data.balance ?? data.walletBalance ?? 0;
const win = data.winningMoney ?? 0;
setBalance(bal);
setWinningMoney(win);
setTotalBalance(bal + win);
balanceRef.current = bal;
winningRef.current = win;
totalRef.current = bal + win;
}
});
}, [user]);

// ── History ───────────────────────────────────────────────────────────────
useEffect(() => {
return onSnapshot(
query(collection(db, “aviatorHistory”), orderBy(“createdAt”, “desc”), limit(12)),
(s) => setHistory(s.docs.map((d) => d.data()))
);
}, []);

// ── Game loop ─────────────────────────────────────────────────────────────
useEffect(() => {
startWaiting();
return () => { clearInterval(animRef.current); clearInterval(countRef.current); };
}, []);

const startWaiting = () => {
clearInterval(animRef.current);
clearInterval(countRef.current);
setPhase(“waiting”); phaseRef.current = “waiting”;
setMultiplier(1.00);
setHasBet(false); hasBetRef.current = false;
setCashedOut(false); cashedOutRef.current = false;
setCashMult(null); setCrashAt(null);
setMsg(””); betRef.current = null;
setPlanePos({ x: 5, y: 5 });

```
let c = 6;
setCountdown(c);
countRef.current = setInterval(() => {
  c--; setCountdown(c);
  if (c <= 0) { clearInterval(countRef.current); startFlight(); }
}, 1000);
```

};

const startFlight = () => {
const cp = getAviatorCrashPoint();
setPhase(“flying”); phaseRef.current = “flying”;
const startTime = Date.now();

```
animRef.current = setInterval(() => {
  const elapsed = (Date.now() - startTime) / 1000;
  const mult = parseFloat(Math.pow(Math.E, 0.06 * elapsed).toFixed(2));
  setMultiplier(mult);
  setPlanePos({ x: Math.min(5 + elapsed * 14, 82), y: Math.min(5 + elapsed * 9, 75) });
  if (mult >= cp) { clearInterval(animRef.current); handleCrash(cp); }
}, 80);
```

};

const handleCrash = async (cp) => {
setPhase(“crashed”); phaseRef.current = “crashed”;
setCrashAt(cp);
if (hasBetRef.current && !cashedOutRef.current && betRef.current) {
setMsg(`💥 Crashed at ${cp.toFixed(2)}x! Lost ₹${betRef.current}`);
try {
await addDoc(collection(db, “aviatorBets”), {
userId: user?.uid, betAmount: betRef.current, crashPoint: cp, won: false, createdAt: serverTimestamp(),
});
} catch (e) { console.error(e); }
}
try {
await addDoc(collection(db, “aviatorHistory”), { crashPoint: cp, createdAt: serverTimestamp() });
} catch (e) { console.error(e); }
setTimeout(() => startWaiting(), 4000);
};

const placeBet = async () => {
const amt = parseFloat(betAmount);
if (!amt || amt < 10) return setMsg(“Min bet ₹10”);
if (amt > totalRef.current) return setMsg(`Insufficient balance ❌ (Total: ₹${totalRef.current.toFixed(2)})`);
if (phaseRef.current !== “waiting”) return setMsg(“Wait for next round”);
if (hasBetRef.current) return;

```
betRef.current = amt;
setHasBet(true); hasBetRef.current = true;
setMsg(`✅ Bet ₹${amt} placed!`);

// Deduct from balance first, then winningMoney
const { newBalance, newWinning } = calcDeduction(amt, balanceRef.current, winningRef.current);
try {
  await updateDoc(doc(db, "users", user.uid), {
    balance: newBalance,
    winningMoney: newWinning,
  });
} catch (e) {
  console.error(e);
  setMsg("Error placing bet");
  setHasBet(false); hasBetRef.current = false; betRef.current = null;
}
```

};

const cashOut = async () => {
if (!hasBetRef.current || cashedOutRef.current || phaseRef.current !== “flying”) return;
const amt = betRef.current;
const mult = multiplier;
const win = parseFloat((amt * mult).toFixed(2));

```
setCashedOut(true); cashedOutRef.current = true;
setCashMult(mult);
setMsg(`🎉 Cashed out at ${mult}x! Won ₹${win}`);

try {
  // Winnings always go to winningMoney
  await updateDoc(doc(db, "users", user.uid), {
    winningMoney: winningRef.current + win,
  });
  await addDoc(collection(db, "aviatorBets"), {
    userId: user.uid, betAmount: amt, cashoutMultiplier: mult,
    winAmount: win, won: true, createdAt: serverTimestamp(),
  });
} catch (e) { console.error(e); }
```

};

const multColor = phase === “crashed” ? “#ef4444” : phase === “flying” ? “#00ff88” : “#facc15”;

return (
<div className="min-h-screen bg-[#0b0d1a] text-white">
<Navbar />
<div className="max-w-lg mx-auto px-4 pb-8">
<h1 className="text-2xl font-black text-center text-yellow-400 py-4 tracking-widest">✈️ AVIATOR</h1>

```
    {/* History */}
    <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
      {history.map((h, i) => (
        <span key={i} className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0
          ${(h.crashPoint ?? 0) >= 2 ? "bg-green-800 text-green-300" : "bg-red-900 text-red-300"}`}>
          {h.crashPoint?.toFixed(2)}x
        </span>
      ))}
    </div>

    {/* Canvas */}
    <div className="relative bg-[#12152b] rounded-2xl overflow-hidden border border-gray-800 mb-3" style={{ height: 220 }}>
      {[25,50,75].map(p => <div key={p} className="absolute w-full border-t border-blue-900/40" style={{ top: `${p}%` }} />)}
      {[25,50,75].map(p => <div key={p} className="absolute h-full border-l border-blue-900/40" style={{ left: `${p}%` }} />)}

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        {phase === "waiting" && (
          <div className="text-center">
            <div className="text-gray-500 text-sm mb-1">Next round in</div>
            <div className="text-5xl font-black text-yellow-400">{countdown}s</div>
          </div>
        )}
        {phase === "flying" && (
          <div className="text-6xl font-black" style={{ color: multColor }}>{multiplier.toFixed(2)}x</div>
        )}
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
            <path d={`M 0 100 Q ${planePos.x/2} ${100-planePos.y/2} ${planePos.x} ${100-planePos.y}`}
              stroke="#00ff88" strokeWidth="0.4" fill="none" opacity="0.5" />
          </svg>
          <div className="absolute text-3xl" style={{
            left: `${planePos.x}%`, bottom: `${planePos.y}%`,
            transform: "rotate(-25deg)", transition: "all 0.08s linear",
          }}>✈️</div>
        </>
      )}
    </div>

    {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}

    {/* Balance display */}
    <div className="grid grid-cols-3 gap-2 mb-3">
      <div className="bg-[#12152b] rounded-xl p-2 text-center border border-gray-800">
        <div className="text-xs text-gray-500">Wallet</div>
        <div className="text-sm font-bold text-white">₹{balance.toFixed(0)}</div>
      </div>
      <div className="bg-[#12152b] rounded-xl p-2 text-center border border-yellow-800">
        <div className="text-xs text-gray-500">Winnings</div>
        <div className="text-sm font-bold text-yellow-400">₹{winningMoney.toFixed(0)}</div>
      </div>
      <div className="bg-green-900/40 rounded-xl p-2 text-center border border-green-700">
        <div className="text-xs text-gray-400">Total</div>
        <div className="text-sm font-bold text-green-400">₹{totalBalance.toFixed(0)}</div>
      </div>
    </div>

    {/* Controls */}
    <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
      <div className="flex gap-2 mb-3">
        <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)}
          placeholder="Bet amount (Min ₹10)"
          disabled={phase !== "waiting" || hasBet}
          className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
      </div>
      <div className="grid grid-cols-4 gap-2 mb-3">
        {[50, 100, 200, 500].map((a) => (
          <button key={a} onClick={() => setBetAmount(a.toString())}
            disabled={phase !== "waiting" || hasBet}
            className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">
            ₹{a}
          </button>
        ))}
      </div>
      <div className="flex gap-3">
        <button onClick={placeBet}
          disabled={phase !== "waiting" || hasBet}
          className="flex-1 bg-green-600 hover:bg-green-500 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-bold">
          {hasBet ? "✅ Bet Placed" : "Place Bet"}
        </button>
        <button onClick={cashOut}
          disabled={!hasBet || cashedOut || phase !== "flying"}
          className="flex-1 bg-yellow-500 hover:bg-yellow-400 disabled:opacity-30 disabled:cursor-not-allowed rounded-xl py-3 font-bold text-black">
          {cashedOut ? `✅ ${cashMult?.toFixed(2)}x` : `Cash Out ${multiplier.toFixed(2)}x`}
        </button>
      </div>
    </div>
  </div>
</div>
```

);
}
