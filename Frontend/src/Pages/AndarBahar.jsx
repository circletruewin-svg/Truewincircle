import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { JokerBadge } from "../components/GameVisuals";
import { getBiasedWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const rnd = () => ({ suit: SUITS[Math.floor(Math.random() * SUITS.length)], rank: RANKS[Math.floor(Math.random() * RANKS.length)] });

function SmallCard({ card }) {
  const red = card?.suit === "H" || card?.suit === "D";
  return (
    <div className="w-9 h-12 rounded-lg border-2 border-gray-300 bg-white flex flex-col items-center justify-center text-xs font-bold shadow">
      <span className={red ? "text-red-600" : "text-gray-900"}>{card?.rank}</span>
      <span className={red ? "text-red-600" : "text-gray-900"}>{card?.suit}</span>
    </div>
  );
}

const ROUND_SEC = 12;
export default function AndarBahar() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betSide, setBetSide] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [joker, setJoker] = useState(null);
  const [aCards, setACards] = useState([]);
  const [bCards, setBCards] = useState([]);
  const [winner, setWinner] = useState(null);
  const [msg, setMsg] = useState("");
  const [timeLeft, setTimeLeft] = useState(ROUND_SEC);

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
    setJoker(null);
    setACards([]);
    setBCards([]);
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

  const finishRound = async (roundWinner, userBet) => {
    try {
      if (hasBetRef.current && userBet) {
        const amount = betAmountRef.current;
        const won = roundWinner === userBet;
        const winAmount = won ? parseFloat((amount * 1.9).toFixed(2)) : 0;

        setMsg(won ? `${roundWinner.toUpperCase()} wins! +${formatCurrency(winAmount)}` : `${roundWinner.toUpperCase()} wins. Lost ${formatCurrency(amount)}`);

        if (won) {
          await creditUserWinnings(db, user.uid, winAmount);
        }

        await addDoc(collection(db, "abHistory"), {
          userId: user.uid,
          betSide: userBet,
          winner: roundWinner,
          betAmount: amount,
          winAmount,
          won,
          createdAt: serverTimestamp(),
        });
      } else {
        await addDoc(collection(db, "abHistory"), { winner: roundWinner, createdAt: serverTimestamp() });
      }
    } catch (error) {
      console.error("Failed to finish Andar Bahar round:", error);
      setMsg(`${roundWinner.toUpperCase()} round finished. Sync failed.`);
    } finally {
      setTimeout(() => startRound(), 4000);
    }
  };

  const dealRound = async () => {
    setPhase("dealing");
    const jokerCard = rnd();
    setJoker(jokerCard);
    const userBet = betSideRef.current;
    const roundWinner = userBet ? getBiasedWinner(userBet, ["andar", "bahar"]) : Math.random() > 0.5 ? "andar" : "bahar";

    const andarCards = [];
    const baharCards = [];
    for (let i = 0; i < 5; i += 1) {
      andarCards.push(rnd());
      baharCards.push(rnd());
    }

    let index = 0;
    const interval = setInterval(() => {
      if (index < 5) {
        setACards((prev) => [...prev, andarCards[index]]);
        setBCards((prev) => [...prev, baharCards[index]]);
        index += 1;
      } else {
        clearInterval(interval);
        setWinner(roundWinner);
        setPhase("result");
        finishRound(roundWinner, userBet);
      }
    }, 400);
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
    setMsg(`Bet ${formatCurrency(amount)} on ${side === "andar" ? "Andar" : "Bahar"}!`);
  };

  return (
    <div className="min-h-screen bg-[#1a0a2e] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-pink-400 py-4">Andar Bahar</h1>

        {phase === "betting" && <div className="text-center mb-3 text-gray-400">Bet in <span className="text-yellow-400 font-bold text-xl">{timeLeft}s</span></div>}

        <div className="bg-green-950 rounded-3xl p-4 mb-4 border-2 border-green-800">
          <div className="flex justify-center mb-4">
            {joker ? (
              <div className="text-center">
                <div className="text-xs text-yellow-400 font-bold mb-1">Joker</div>
                <div className="w-16 h-24 rounded-2xl border-4 border-yellow-500 bg-white flex flex-col items-center justify-center">
                  <span className={`text-2xl font-black ${joker.suit === "H" || joker.suit === "D" ? "text-red-600" : "text-gray-900"}`}>{joker.rank}</span>
                  <span className={`text-3xl ${joker.suit === "H" || joker.suit === "D" ? "text-red-600" : "text-gray-900"}`}>{joker.suit}</span>
                </div>
              </div>
            ) : (
              <JokerBadge className="h-24 w-16" />
            )}
          </div>

          <div className="flex gap-3">
            <div className="flex-1">
              <div className={`text-center font-bold text-sm mb-2 py-1 rounded-lg ${winner === "andar" ? "bg-purple-600" : "text-purple-400"}`}>ANDAR</div>
              <div className="flex flex-wrap gap-1 justify-center min-h-[3rem]">
                {aCards.map((card, index) => <SmallCard key={index} card={card} />)}
              </div>
            </div>
            <div className="flex-1">
              <div className={`text-center font-bold text-sm mb-2 py-1 rounded-lg ${winner === "bahar" ? "bg-pink-600" : "text-pink-400"}`}>BAHAR</div>
              <div className="flex flex-wrap gap-1 justify-center min-h-[3rem]">
                {bCards.map((card, index) => <SmallCard key={index} card={card} />)}
              </div>
            </div>
          </div>
        </div>

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

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => placeBet("andar")}
              disabled={phase !== "betting" || hasBetRef.current}
              className={`${betSide === "andar" ? "bg-purple-500 ring-2 ring-purple-300" : "bg-purple-700 hover:bg-purple-600"} rounded-xl py-3 font-bold disabled:opacity-30`}
            >
              Andar
            </button>
            <button
              onClick={() => placeBet("bahar")}
              disabled={phase !== "betting" || hasBetRef.current}
              className={`${betSide === "bahar" ? "bg-pink-500 ring-2 ring-pink-300" : "bg-pink-700 hover:bg-pink-600"} rounded-xl py-3 font-bold disabled:opacity-30`}
            >
              Bahar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


