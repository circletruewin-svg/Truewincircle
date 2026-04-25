import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { DragonTigerBadge } from "../components/GameVisuals";
import { getBiasedWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const RANK_VALS = { A: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10, J: 11, Q: 12, K: 13 };
const rnd = () => {
  const rank = RANKS[Math.floor(Math.random() * RANKS.length)];
  return { suit: SUITS[Math.floor(Math.random() * SUITS.length)], rank, val: RANK_VALS[rank] };
};

function BigCard({ card, hidden, side }) {
  const red = card?.suit === "H" || card?.suit === "D";
  const glow = side === "dragon" ? "border-red-500 shadow-red-900" : "border-blue-500 shadow-blue-900";

  return (
    <div className={`w-24 h-36 rounded-2xl border-4 flex flex-col items-center justify-center shadow-xl ${hidden ? `bg-indigo-900 ${glow}` : `bg-white ${glow}`}`}>
      {hidden ? (
        <DragonTigerBadge side={side} className="h-full w-full rounded-2xl" />
      ) : (
        <>
          <div className={`text-3xl font-black ${red ? "text-red-600" : "text-gray-900"}`}>{card?.rank}</div>
          <div className={`text-3xl ${red ? "text-red-600" : "text-gray-900"}`}>{card?.suit}</div>
        </>
      )}
    </div>
  );
}

const ROUND_SEC = 12;
export function DragonTiger() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betSide, setBetSide] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [dc, setDc] = useState(null);
  const [tc, setTc] = useState(null);
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC);
  const [revealed, setRevealed] = useState(false);

  const betSideRef = useRef(null);
  const betAmountRef = useRef(null);
  const hasBetRef = useRef(false);
  const balanceRef = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    betSideRef.current = betSide;
  }, [betSide]);

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
    startRound();
    return () => clearInterval(timerRef.current);
  }, []);

  const startRound = () => {
    setPhase("betting");
    setBetSide(null);
    betSideRef.current = null;
    betAmountRef.current = null;
    hasBetRef.current = false;
    setWinner(null);
    setMsg("");
    setRevealed(false);
    setDc(null);
    setTc(null);
    setTimeLeft(ROUND_SEC);

    let time = ROUND_SEC;
    timerRef.current = setInterval(() => {
      time -= 1;
      setTimeLeft(time);
      if (time <= 0) {
        clearInterval(timerRef.current);
        dealRound();
      }
    }, 1000);
  };

  const dealRound = async () => {
    setPhase("dealing");
    const dragonCard = rnd();
    const tigerCard = rnd();
    setDc(dragonCard);
    setTc(tigerCard);

    const userBet = betSideRef.current;
    const roundWinner = userBet ? getBiasedWinner(userBet, ["dragon", "tiger", "tie"]) : ["dragon", "tiger"][Math.floor(Math.random() * 2)];

    setTimeout(async () => {
      setRevealed(true);
      setWinner(roundWinner);
      setPhase("result");

      try {
        if (hasBetRef.current && userBet) {
          const amount = betAmountRef.current;
          const won = roundWinner === userBet;
          const multiplier = userBet === "tie" ? 8 : 1.9;
          const winAmount = won ? parseFloat((amount * multiplier).toFixed(2)) : 0;

          setMsg(won ? `${roundWinner.toUpperCase()} wins! +${formatCurrency(winAmount)}` : `${roundWinner.toUpperCase()} wins. Lost ${formatCurrency(amount)}`);

          if (won) {
            await creditUserWinnings(db, user.uid, winAmount);
          }

          await addDoc(collection(db, "dtHistory"), {
            userId: user.uid,
            betSide: userBet,
            winner: roundWinner,
            betAmount: amount,
            winAmount,
            won,
            createdAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, "dtHistory"), {
            winner: roundWinner,
            createdAt: serverTimestamp(),
          });
        }
      } catch (error) {
        console.error("Failed to finish Dragon Tiger round:", error);
        setMsg(`${roundWinner.toUpperCase()} round finished. Sync failed.`);
      } finally {
        setTimeout(() => startRound(), 4000);
      }
    }, 2000);
  };

  const placeBet = async (side) => {
    const amount = parseFloat(betAmount);
    if (!user) return setMsg("Please log in first");
    if (!amount || amount < 10) return setMsg(`Min bet ${formatCurrency(10)}`);
    if (amount > balanceRef.current) return setMsg("Insufficient balance");
    if (phase !== "betting" || hasBetRef.current) return;

    setBetSide(side);
    betSideRef.current = side;
    betAmountRef.current = amount;
    hasBetRef.current = true;

    await debitUserFunds(db, user.uid, amount);
    setMsg(`Bet ${formatCurrency(amount)} on ${side.toUpperCase()}!`);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center py-4">Dragon vs Tiger</h1>

        {phase === "betting" && <div className="text-center mb-3 text-gray-400">Bet in <span className="text-yellow-400 font-bold text-xl">{timeLeft}s</span></div>}

        <div className="flex justify-around items-center bg-green-950 rounded-3xl p-6 mb-4 border-2 border-green-800">
          <div className="text-center">
            <div className="text-red-400 font-bold mb-2">Dragon</div>
            <BigCard card={dc} hidden={!revealed} side="dragon" />
          </div>
          <div className="text-3xl font-black text-yellow-400">VS</div>
          <div className="text-center">
            <div className="text-blue-400 font-bold mb-2">Tiger</div>
            <BigCard card={tc} hidden={!revealed} side="tiger" />
          </div>
        </div>

        {winner && (
          <div className={`text-center text-xl font-black py-2 rounded-xl mb-3 ${winner === "dragon" ? "bg-red-800" : winner === "tiger" ? "bg-blue-800" : "bg-green-800"}`}>
            {winner === "dragon" ? "Dragon Wins!" : winner === "tiger" ? "Tiger Wins!" : "Tie!"}
          </div>
        )}

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
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

          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50, 100, 200, 500].map((amount) => (
              <button
                key={amount}
                onClick={() => setBetAmount((prev) => String((parseFloat(prev) || 0) + amount))}
                disabled={phase !== "betting" || hasBetRef.current}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold"
              >
                +{formatCurrency(amount)}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { side: "dragon", label: "Dragon", styles: "bg-red-700 hover:bg-red-600" },
              { side: "tiger", label: "Tiger", styles: "bg-blue-700 hover:bg-blue-600" },
              { side: "tie", label: "Tie 8x", styles: "bg-green-700 hover:bg-green-600" },
            ].map((item) => (
              <button
                key={item.side}
                onClick={() => placeBet(item.side)}
                disabled={phase !== "betting" || hasBetRef.current}
                className={`${item.styles} ${betSide === item.side ? "ring-2 ring-yellow-400" : ""} rounded-xl py-2.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default DragonTiger;


