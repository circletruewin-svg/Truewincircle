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

const HarufGrid = ({ marketName }) => {
  const [bets, setBets] = useState({});
  const [bettingLoading, setBettingLoading] = useState(false);
  const { user } = useAuthStore();
  const [marketTimings, setMarketTimings] = useState({ openTime: null, closeTime: null });
  const [marketStatus, setMarketStatus] = useState({ isOpen: true, message: "Loading..." });

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
    // markets. Min ₹5, max ₹50 on each individual number; the
    // "already bet" check happens inside the transaction below using
    // deterministic doc ids so two simultaneous taps can't sneak past.
    const HARUF_MIN_PER_BET = 5;
    const HARUF_MAX_PER_BET = 50;
    for (const [num, amount] of placedBets) {
      const rounded = Math.round(amount * 100) / 100;
      if (rounded < HARUF_MIN_PER_BET) {
        return toast.error(`Number ${num} pe minimum ₹${HARUF_MIN_PER_BET} laga sakte ho.`);
      }
      if (rounded > HARUF_MAX_PER_BET) {
        return toast.error(`Number ${num} pe maximum ₹${HARUF_MAX_PER_BET} hi laga sakte ho.`);
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

        // For each number we're betting on, look up a deterministic
        // doc to make sure the user hasn't already placed a bet on
        // that number for this market today. The id is built from
        // userId + market + ymd + number so the same user can still
        // bet on the same number tomorrow, or on a different number
        // today.
        const reservations = [];
        for (const [num, amount] of placedBets) {
          const betId = `${user.uid}_${safeMarket}_${todayYmd}_${num}`;
          const betRef = doc(db, "harufBets", betId);
          const betSnap = await transaction.get(betRef);
          if (betSnap.exists()) {
            throw new Error(`${marketName} me number ${num} pe aap pehle hi bet laga chuke ho aaj. Doosre number pe lagao.`);
          }
          reservations.push({ num, amount, betRef });
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

        for (const { num, amount, betRef } of reservations) {
          const roundedAmount = Math.round(amount * 100) / 100;
          if (roundedAmount > 0) {
            transaction.set(betRef, {
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
