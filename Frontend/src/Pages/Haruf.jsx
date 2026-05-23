import React, { useState, useEffect, useCallback } from "react";
import {
  doc,
  onSnapshot,
  runTransaction,
  collection,
  serverTimestamp,
  query,
  where,
  getDocs,
  writeBatch,
  setDoc,
  getDoc,
} from "firebase/firestore";
import { db } from "../firebase";
import useAuthStore from "../store/authStore";
import { toast } from "react-toastify";

const HARUF_PAYOUT_MULTIPLIER = 90;

const ROUND_DURATION_MINUTES = 1; // Each round lasts for 1 minute.

import { markets } from "../marketData";
import { isWithinIstWindow, parseTimeStringToMinutes } from "../utils/dateHelpers";


const BetBox = ({ num, value, onChange }) => {
  const displayNum = num === 100 ? "00" : num.toString().padStart(2, "0");

  return (
    <div className="flex flex-col items-center">
      <div className="h-8 w-8 flex items-center justify-center bg-red-600 text-white text-xs font-bold rounded-sm">
        {displayNum}
      </div>

      <input
        type="number"
        pattern="[0-9]*"
        inputMode="numeric"
        min="0"
        value={value || ""}
        onChange={(e) => onChange(num, e.target.value)}
        className="mt-1 w-8 h-10 text-xs border border-gray-300 rounded-sm text-center"
      />
    </div>
  );
};

// Default fallbacks — used until the live `settings/harufLimits` doc loads
// (or if it doesn't exist yet on a fresh project).
const HARUF_LIMIT_DEFAULTS = { min: 5, max: 50 };

// ── CROSSING: Andar digits × Bahar digits = saari jodi pairs ek baar
// me bharo. Cut option same-digit jodi (00, 11, … 99) hata deta hai.
// Pairs upar wale 100-box jodi grid me daal jaate hain — wahi se
// Place Bid karne pe normal jodi bet ke roop me lag jaate hain
// (wallet/rules/settlement sab existing flow, 90× payout).
const jodiToKey = (jodi) => {
  const n = parseInt(jodi, 10);
  return n === 0 ? 100 : n; // "00" → grid key 100 (jaise BetBox display karta hai)
};

const Crossing = ({ bets, setBets, marketStatus }) => {
  const [andar, setAndar] = useState(() => new Set());
  const [bahar, setBahar] = useState(() => new Set());
  const [perPair, setPerPair] = useState('');
  const [cut, setCut] = useState(false);

  const toggle = (setter) => (d) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(d)) next.delete(d); else next.add(d);
      return next;
    });
  };

  // Pairs banao: har Andar × har Bahar → jodi string "AB".
  const pairs = [];
  const A = [...andar].sort();
  const B = [...bahar].sort();
  for (const a of A) {
    for (const b of B) {
      if (cut && a === b) continue;
      pairs.push(`${a}${b}`);
    }
  }
  const perAmt = parseInt(perPair, 10) || 0;
  const total = pairs.length * perAmt;

  const apply = () => {
    if (!marketStatus.isOpen) return toast.error('Market band hai.');
    if (andar.size === 0 || bahar.size === 0) return toast.error('Andar aur Bahar dono me se digits chuno.');
    if (!perAmt || perAmt <= 0) return toast.error('Per jodi amount daalo.');
    if (pairs.length === 0) return toast.error('Cut option ne saari jodi hata di — Cut hata do ya digits badlo.');

    setBets((prev) => {
      const next = { ...prev };
      for (const j of pairs) {
        const key = jodiToKey(j);
        next[key] = String((parseInt(next[key], 10) || 0) + perAmt);
      }
      return next;
    });
    toast.success(`${pairs.length} jodi me ₹${perAmt}-₹${perAmt} add ho gaya (kul ₹${total}). Niche Place Bid dabao.`);
    setAndar(new Set()); setBahar(new Set()); setPerPair(''); setCut(false);
  };

  const Chip = ({ d, picked, onClick, tone }) => (
    <button
      type="button"
      onClick={onClick}
      className={`h-9 w-9 rounded-md font-bold text-sm border transition ${
        picked
          ? (tone === 'andar' ? 'bg-red-600 text-white border-red-700' : 'bg-blue-600 text-white border-blue-700')
          : 'bg-white text-gray-700 border-gray-300'
      }`}
    >{d}</button>
  );

  return (
    <div className="w-full mt-4 px-2">
      <div className="bg-amber-50 border-2 border-amber-300 rounded-lg p-3">
        <p className="text-center font-bold text-amber-900 mb-2">
          ✨ Crossing (ek baar me bahut jodi)
        </p>
        <p className="text-[11px] text-amber-800 text-center mb-3">
          Andar digits + Bahar digits chuno → saari pairs me ek-jaisa amount auto lag jayega. Jeetne par <b>90×</b>.
        </p>

        <p className="text-xs font-semibold text-red-700 mb-1">Andar digits</p>
        <div className="grid grid-cols-10 gap-1 mb-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Chip key={`ca-${i}`} d={i} picked={andar.has(i)} tone="andar" onClick={() => toggle(setAndar)(i)} />
          ))}
        </div>

        <p className="text-xs font-semibold text-blue-700 mb-1">Bahar digits</p>
        <div className="grid grid-cols-10 gap-1 mb-3">
          {Array.from({ length: 10 }, (_, i) => (
            <Chip key={`cb-${i}`} d={i} picked={bahar.has(i)} tone="bahar" onClick={() => toggle(setBahar)(i)} />
          ))}
        </div>

        <div className="flex items-center gap-3 mb-3">
          <input
            type="number"
            min="1"
            inputMode="numeric"
            value={perPair}
            onChange={(e) => setPerPair(e.target.value)}
            placeholder="Per jodi ₹"
            className="flex-1 border border-gray-300 rounded px-2 py-2 text-sm"
          />
          <label className="flex items-center gap-1 text-xs text-gray-700 whitespace-nowrap">
            <input type="checkbox" checked={cut} onChange={(e) => setCut(e.target.checked)} />
            Cut (00,11,…)
          </label>
        </div>

        <div className="bg-white rounded p-2 text-xs text-gray-700 mb-2 flex items-center justify-between">
          <span>{pairs.length} jodi banengi</span>
          <span className="font-bold">Kul: ₹{total}</span>
        </div>
        {pairs.length > 0 && (
          <p className="text-[10px] text-gray-500 mb-2 break-all">
            {pairs.join(', ')}
          </p>
        )}

        <button
          type="button"
          onClick={apply}
          disabled={!marketStatus.isOpen}
          className="w-full bg-amber-500 hover:bg-amber-600 disabled:bg-gray-300 text-white font-bold py-2 rounded"
        >
          + Add to bid (upar grid me bhar do)
        </button>
      </div>
    </div>
  );
};

const HarufGrid = ({ marketName }) => {
  const [bets, setBets] = useState({});
  const [bettingLoading, setBettingLoading] = useState(false);
  const { user } = useAuthStore();
  const [marketTimings, setMarketTimings] = useState({ openTime: null, closeTime: null });
  const [marketStatus, setMarketStatus] = useState({ isOpen: true, message: "Loading..." });
  const [limits, setLimits] = useState(HARUF_LIMIT_DEFAULTS);

  // Subscribe to admin-controlled per-number bet caps.
  useEffect(() => {
    const ref = doc(db, "settings", "harufLimits");
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) return;
      const d = snap.data();
      setLimits({
        min: Number.isFinite(d.min) ? Number(d.min) : HARUF_LIMIT_DEFAULTS.min,
        max: Number.isFinite(d.max) ? Number(d.max) : HARUF_LIMIT_DEFAULTS.max,
      });
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!marketName) return;
    const timingDocRef = doc(db, "market_timings", marketName);
    const unsubscribe = onSnapshot(timingDocRef, (docSnap) => {
      if (docSnap.exists() && docSnap.data().openTime && docSnap.data().closeTime) {
        setMarketTimings(docSnap.data());
      } else {
        const marketInfo = markets.find(m => m.name === marketName);
        setMarketTimings({ openTime: marketInfo?.openTime || null, closeTime: marketInfo?.closeTime || null });
      }
    });
    return unsubscribe;
  }, [marketName]);

  // Market open/close window is always evaluated in IST so a player
  // in Dubai/UAE/etc. sees the same cut-off as a player in India and
  // can't sneak bets in past the IST close time.
  useEffect(() => {
    const checkMarketStatus = () => {
      const { openTime, closeTime } = marketTimings;
      if (!openTime || !closeTime) {
        setMarketStatus({ isOpen: true, message: "Market timings not set." });
        return;
      }
      if (parseTimeStringToMinutes(openTime) === null || parseTimeStringToMinutes(closeTime) === null) {
        setMarketStatus({ isOpen: false, message: "Invalid market timings." });
        return;
      }
      const open = isWithinIstWindow(openTime, closeTime);
      setMarketStatus({
        isOpen: open,
        message: open ? "Market is open." : "Market is currently closed.",
      });
    };
    checkMarketStatus();
    const intervalId = setInterval(checkMarketStatus, 15000);
    return () => clearInterval(intervalId);
  }, [marketTimings]);

  const handleInputChange = (num, value) => {
    const sanitizedValue = value.replace(/[^0-9]/g, "");
    setBets((prev) => ({ ...prev, [num]: sanitizedValue }));
  };

  const handlePlaceBet = async () => {
    if (!marketName) return toast.error("Market not selected.");
    if (!marketStatus.isOpen) {
      return toast.error("Market is currently closed.");
    }
    const { user } = useAuthStore.getState();

    if (!user) return toast.error("You must be logged in to place a bet.");

    const finalBets = {};

    for (const key in bets) {
      const amount = parseInt(bets[key]) || 0;

      if (amount > 0) {
        if (key.startsWith("A")) {
          const andarDigit = parseInt(key.substring(1));

          for (let j = 0; j < 10; j++) {
            const num = andarDigit * 10 + j;

            finalBets[num.toString()] =
              (finalBets[num.toString()] || 0) + amount / 10;
          }
        } else if (key.startsWith("B")) {
          const baharDigit = parseInt(key.substring(1));

          for (let j = 0; j < 10; j++) {
            const num = j * 10 + baharDigit;

            finalBets[num.toString()] =
              (finalBets[num.toString()] || 0) + amount / 10;
          }
        } else {
          const num = parseInt(key);

          if (!isNaN(num)) {
            finalBets[num.toString()] =
              (finalBets[num.toString()] || 0) + amount;
          }
        }
      }
    }

    const placedBets = Object.entries(finalBets).filter(
      ([_, amount]) => amount > 0
    );

    if (placedBets.length === 0)
      return toast.error("Please enter at least one bet.");

    // Per-number limits and one-bet-per-number-per-day rule for Haruf
    // markets. Cap range is admin-controlled via settings/harufLimits;
    // the "already bet" check happens inside the transaction below
    // using deterministic doc ids so two simultaneous taps can't sneak past.
    const minPerBet = Number(limits.min) || HARUF_LIMIT_DEFAULTS.min;
    const maxPerBet = Number(limits.max) || HARUF_LIMIT_DEFAULTS.max;
    for (const [num, amount] of placedBets) {
      const rounded = Math.round(amount * 100) / 100;
      if (rounded < minPerBet) {
        return toast.error(`Number ${num} pe minimum ₹${minPerBet} laga sakte ho.`);
      }
      if (rounded > maxPerBet) {
        return toast.error(`Number ${num} pe maximum ₹${maxPerBet} hi laga sakte ho.`);
      }
    }

    const totalBetAmount = Object.values(bets).reduce(
      (acc, b) => acc + (parseInt(b) || 0),
      0
    );

    const totalAvailable = (user?.balance || 0) + (user?.winningMoney || 0);
    if (totalBetAmount > totalAvailable) return toast.error("Insufficient balance.");

    setBettingLoading(true);

    // IST date (YYYY-MM-DD) — used to scope "one bet per number per
    // day" to a specific market session.
    const todayYmd = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(new Date());
    const safeMarket = String(marketName).replace(/\s+/g, '_').toUpperCase();

    try {
      await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, "users", user.uid);

        // ── READ PHASE ────────────────────────────────────────
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw new Error("User does not exist!");

        // For each number we're betting on we use a deterministic
        // doc (userId + market + ymd + number). Same number pe dobara
        // bet lagao to amount ADD ho jaata hai (accumulate) — pehle
        // ye block kar deta tha ("ek baar hi"). Settlement/turnover
        // sab betAmount pe chalte hain, to total automatically sahi.
        const reservations = [];
        for (const [num, amount] of placedBets) {
          const betId = `${user.uid}_${safeMarket}_${todayYmd}_${num}`;
          const betRef = doc(db, "harufBets", betId);
          const betSnap = await transaction.get(betRef);
          const exists = betSnap.exists();
          const prev = exists ? betSnap.data() : null;
          // Agar purana doc settle ho chuka (win/loss) to usme add
          // mat karo — alag id se naya bet banao (safety).
          const settled = exists && prev.status && prev.status !== 'pending';
          reservations.push({
            num, amount, betRef,
            exists: exists && !settled,
            prevAmount: exists && !settled ? Number(prev.betAmount || 0) : 0,
            settledRef: settled
              ? doc(db, "harufBets", `${betId}_${Date.now()}`)
              : null,
          });
        }

        // ── WRITE PHASE ───────────────────────────────────────
        const userData = userDoc.data();
        const currentBalance = Number(userData.balance || 0);
        const currentWinnings = Number(userData.winningMoney || 0);
        const totalAvailable = currentBalance + currentWinnings;

        if (totalAvailable < totalBetAmount)
          throw new Error("Insufficient balance.");

        let amountToDebit = totalBetAmount;
        let newBalance = currentBalance;
        let newWinnings = currentWinnings;

        // Deduct from balance first
        const fromBalance = Math.min(newBalance, amountToDebit);
        newBalance -= fromBalance;
        amountToDebit -= fromBalance;

        // Then deduct from winnings
        const fromWinnings = Math.min(newWinnings, amountToDebit);
        newWinnings -= fromWinnings;
        amountToDebit -= fromWinnings;

        transaction.update(userDocRef, {
          balance: Math.round(newBalance * 100) / 100,
          winningMoney: Math.round(newWinnings * 100) / 100,
        });

        for (const { num, amount, betRef, exists, prevAmount, settledRef } of reservations) {
          const roundedAmount = Math.round(amount * 100) / 100;
          if (roundedAmount <= 0) continue;
          if (exists) {
            // Same number pe dobara → purane pending bet me amount ADD.
            const newTotal = Math.round((prevAmount + roundedAmount) * 100) / 100;
            transaction.update(betRef, {
              betAmount: newTotal,
              timestamp: serverTimestamp(),
              status: "pending",
            });
          } else {
            // Naya bet (ya purana settle ho chuka tha → alag id).
            transaction.set(settledRef || betRef, {
              userId: user.uid,
              marketName: marketName,
              betType: "Haruf",
              selectedNumber: num,
              betAmount: roundedAmount,
              timestamp: serverTimestamp(),
              status: "pending",
            });
          }
        }
      });

      toast.success("Bet placed successfully!");

      setBets({});
    } catch (e) {
      console.error("Bet placement failed: ", e);

      toast.error(`Failed to place bet: ${e.message || e}`);
    } finally {
      setBettingLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center w-full pb-20 pt-10">
      <div className="w-full px-2 mb-4">
        <p className={`text-center font-semibold ${marketStatus.isOpen ? 'text-green-600' : 'text-red-600'}`}>
          {marketName}: {marketStatus.message}
        </p>
      </div>
      <div className="grid grid-cols-10 gap-2 p-2">
        {Array.from({ length: 100 }, (_, i) => (
          <BetBox
            key={i + 1}
            num={i + 1}
            value={bets[i + 1]}
            onChange={handleInputChange}
          />
        ))}
      </div>

      <div className="w-full mt-4 px-2">
        <p className="font-semibold text-red-600 text-center mb-2">
          Andar Haruf
        </p>

        <div className="grid grid-cols-10 gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={`andar-${i}`} className="flex flex-col items-center">
              <div className="h-8 w-8 flex items-center justify-center bg-red-600 text-white text-sm font-bold rounded-sm">
                {i}
              </div>

              <input
                type="number"
                pattern="[0-9]*"
                inputMode="numeric"
                min="0"
                value={bets[`A${i}`] || ""}
                onChange={(e) => handleInputChange(`A${i}`, e.target.value)}
                className="mt-1 w-8 h-10 text-xs border border-gray-300 rounded-sm text-center"
              />
            </div>
          ))}
        </div>
      </div>

      <div className="w-full mt-4 px-2">
        <p className="font-semibold text-red-600 text-center mb-2">
          Bahar Haruf
        </p>

        <div className="grid grid-cols-10 gap-2">
          {Array.from({ length: 10 }, (_, i) => (
            <div key={`bahar-${i}`} className="flex flex-col items-center">
              <div className="h-8 w-8 flex items-center justify-center bg-red-600 text-white text-sm font-bold rounded-sm">
                {i}
              </div>

              <input
                type="number"
                pattern="[0-9]*"
                inputMode="numeric"
                min="0"
                value={bets[`B${i}`] || ""}
                onChange={(e) => handleInputChange(`B${i}`, e.target.value)}
                className="mt-1 w-8 h-10 text-xs border border-gray-300 rounded-sm text-center"
              />
            </div>
          ))}
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CROSSING (Jodi) — ek baar me bahut saari jodi pe bet
          Andar digits × Bahar digits = saari pairs auto-bharti hain
          upar wale 100-box jodi grid me. Place Bid se hi lagti hain
          (wallet/rules/settlement sab existing flow).
         ───────────────────────────────────────────────────────────── */}
      <Crossing
        bets={bets}
        setBets={setBets}
        marketStatus={marketStatus}
      />

      <div className="fixed bottom-0 left-0 right-0 bg-white p-3 shadow-lg">
        <button
          onClick={handlePlaceBet}
          disabled={bettingLoading || !marketStatus.isOpen}
          className="w-full bg-red-600 text-white font-bold py-3 rounded-md hover:bg-red-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
        >
          {bettingLoading
            ? "Placing Bets..."
            : !marketStatus.isOpen
            ? "Market Closed"
            : `Place Bid (₹${Object.values(bets).reduce(
                (a, b) => a + (parseInt(b) || 0),
                0
              )})`}
        </button>
      </div>
    </div>
  );
};

export default HarufGrid;
