import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { CardBack } from "../components/GameVisuals";
import { getBiasedWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
import { formatCurrency } from "../utils/formatMoney";

const SUITS = ["S", "H", "D", "C"];
const RANKS = ["A", "2", "3", "4", "5", "6", "7", "8", "9", "10", "J", "Q", "K"];
const rnd = () => ({ suit: SUITS[Math.floor(Math.random() * 4)], rank: RANKS[Math.floor(Math.random() * 13)] });

function Card({ card, hidden }) {
  const red = card?.suit === "H" || card?.suit === "D";

  return (
    <div className={`w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center font-bold text-base shadow-lg select-none ${hidden ? "bg-blue-900 border-blue-500" : "bg-white border-gray-300"}`}>
      {hidden ? (
        <CardBack className="h-full w-full rounded-lg" />
      ) : (
        <>
          <span className={red ? "text-red-600" : "text-gray-900"}>{card?.rank}</span>
          <span className={`text-xl ${red ? "text-red-600" : "text-gray-900"}`}>{card?.suit}</span>
        </>
      )}
    </div>
  );
}

const ROUND_SEC = 15;
export default function TeenPatti() {
  const auth = getAuth();
  const user = auth.currentUser;

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState("");
  const [betSide, setBetSide] = useState(null);
  const [phase, setPhase] = useState("betting");
  const [playerCards, setPlayerCards] = useState([]);
  const [dealerCards, setDealerCards] = useState([]);
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
    setPlayerCards([]);
    setDealerCards([]);
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
    const nextPlayerCards = [rnd(), rnd(), rnd()];
    const nextDealerCards = [rnd(), rnd(), rnd()];
    setPlayerCards(nextPlayerCards);
    setDealerCards(nextDealerCards);

    const userBet = betSideRef.current;
    const roundWinner = userBet ? getBiasedWinner(userBet, ["player", "dealer"]) : Math.random() > 0.5 ? "player" : "dealer";

    setTimeout(async () => {
      setRevealed(true);
      setWinner(roundWinner);
      setPhase("result");

      try {
        if (hasBetRef.current && userBet) {
          const amount = betAmountRef.current;
          const won = roundWinner === userBet;
          const winAmount = won ? parseFloat((amount * 1.9).toFixed(2)) : 0;
          setMsg(won ? `${roundWinner.toUpperCase()} wins! +${formatCurrency(winAmount)}` : `${roundWinner.toUpperCase()} wins. Lost ${formatCurrency(amount)}`);
          if (won) await creditUserWinnings(db, user.uid, winAmount);
          await addDoc(collection(db, "teenPattiHistory"), {
            userId: user.uid,
            betSide: userBet,
            winner: roundWinner,
            betAmount: amount,
            winAmount,
            won,
            createdAt: serverTimestamp(),
          });
        } else {
          await addDoc(collection(db, "teenPattiHistory"), { winner: roundWinner, createdAt: serverTimestamp() });
        }
      } catch (error) {
        console.error("Failed to finish Teen Patti round:", error);
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
    setMsg(`Bet ${formatCurrency(amount)} on ${side === "player" ? "Player" : "Dealer"}!`);
  };

  const timerPct = (timeLeft / ROUND_SEC) * 100;

  return (
    <div className="min-h-screen bg-[#0a1628] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-yellow-400 py-4">TEEN PATTI</h1>

        {phase === "betting" && (
          <div className="mb-3">
            <div className="flex justify-between text-xs text-gray-500 mb-1">
              <span>Betting closes in {timeLeft}s</span>
              <span>{formatCurrency(balance)}</span>
            </div>
            <div className="bg-gray-800 rounded-full h-2 overflow-hidden">
              <div className={`h-2 rounded-full transition-all duration-1000 ${timeLeft > 8 ? "bg-green-500" : timeLeft > 4 ? "bg-yellow-500" : "bg-red-500 animate-pulse"}`} style={{ width: `${timerPct}%` }} />
            </div>
          </div>
        )}

        <div className="bg-green-900 rounded-3xl p-5 mb-4 border-4 border-yellow-700">
          <div className="text-center text-gray-300 text-sm font-semibold mb-2">DEALER</div>
          <div className="flex justify-center gap-2 mb-4">
            {phase === "betting" ? [1, 2, 3].map((item) => <Card key={item} hidden />) : dealerCards.map((card, index) => <Card key={index} card={card} hidden={!revealed} />)}
          </div>
          {winner && <div className={`text-center font-black text-xl py-2 rounded-xl mb-3 ${winner === "player" ? "bg-blue-600/50" : "bg-red-600/50"}`}>{winner.toUpperCase()} WINS!</div>}
          <div className="text-center text-gray-300 text-sm font-semibold mb-2">PLAYER</div>
          <div className="flex justify-center gap-2">
            {phase === "betting" ? [1, 2, 3].map((item) => <Card key={item} hidden />) : playerCards.map((card, index) => <Card key={index} card={card} hidden={false} />)}
          </div>
        </div>

        {msg && <div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e) => setBetAmount(e.target.value)} placeholder={`Bet amount (Min ${formatCurrency(10)})`} disabled={phase !== "betting" || hasBetRef.current} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white" />
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
            <button onClick={() => placeBet("player")} disabled={phase !== "betting" || hasBetRef.current} className={`rounded-xl py-3 font-bold ${betSide === "player" ? "bg-blue-500 ring-2 ring-blue-300" : "bg-blue-700 hover:bg-blue-600"} disabled:opacity-30 disabled:cursor-not-allowed`}>
              PLAYER
            </button>
            <button onClick={() => placeBet("dealer")} disabled={phase !== "betting" || hasBetRef.current} className={`rounded-xl py-3 font-bold ${betSide === "dealer" ? "bg-red-500 ring-2 ring-red-300" : "bg-red-700 hover:bg-red-600"} disabled:opacity-30 disabled:cursor-not-allowed`}>
              DEALER
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


