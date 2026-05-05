import React, { useState, useEffect, useCallback } from 'react';
import {
    doc, collection, runTransaction, onSnapshot, serverTimestamp, setDoc, Timestamp,
    query, where, getDocs, writeBatch,
    getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import useAuthStore from '../store/authStore';
import { Zap, Loader2 } from 'lucide-react';
import { getFundsDeductionResult, getUserFunds } from '../utils/userFunds';
import { formatCurrency } from '../utils/formatMoney';

const BETTING_DURATION_SECONDS = 5 * 60; // 5 minutes
const RESULTS_DURATION_SECONDS = 1 * 60; // 1 minute

// Probability that the auto-picker will favour the LEAST-bet number
// (so the house wins everything that round). 1 - this value is the
// probability of a fair 1/12 random pick. Tuned so the long-run house
// edge sits around ~40% on the 10x payout.
const HOUSE_BIAS_PROBABILITY = 0.30;
const WinGame = () => {
    const { user } = useAuthStore();
    
    // Game state
    const [phase, setPhase] = useState('loading'); // loading, betting, results, error
    const [timer, setTimer] = useState(0);
    const [roundId, setRoundId] = useState(null);
    const [lastWinningNumber, setLastWinningNumber] = useState(null);
    const [walletBalance, setWalletBalance] = useState(0);
    
    // Bet state
    const [selectedNumber, setSelectedNumber] = useState(null);
    const [betAmount, setBetAmount] = useState();
    const [isSubmitting, setIsSubmitting] = useState(false);
    const gameStateRef = useCallback(() => doc(db, 'game_state', 'win_game_1_to_12'), []);

    // Decentralized settlement: each user's browser settles their OWN
    // bets only. The Firestore rules don't let a non-admin update
    // another user's winningMoney, so a regular player's browser can't
    // process other players' wins — this used to leave the game stuck
    // on "Waiting for Result" forever once the original processWinnings
    // batch silently failed. Now the winning number is broadcast via
    // the game_state doc plus a wingame_rounds/{roundId} entry, and
    // every user settles only their own bets the next time their
    // browser sees the result.
    const settleMyBetsForRound = useCallback(async (winningNumber, roundIdToProcess) => {
        if (!user || winningNumber === undefined || winningNumber === null || !roundIdToProcess) return;
        try {
            const myOpenBetsQuery = query(
                collection(db, 'wingame_bets'),
                where('userId', '==', user.uid),
                where('roundId', '==', roundIdToProcess),
                where('status', '==', 'open'),
            );
            const mySnap = await getDocs(myOpenBetsQuery);
            if (mySnap.empty) return;

            let totalWinnings = 0;
            const batch = writeBatch(db);
            mySnap.docs.forEach((d) => {
                const bet = d.data();
                if (typeof bet.number !== 'number' || typeof bet.amount !== 'number' || isNaN(bet.amount)) {
                    return;
                }
                if (bet.number === winningNumber) {
                    const winnings = bet.amount * 10;
                    totalWinnings += winnings;
                    batch.update(d.ref, { status: 'win', winnings });
                } else {
                    batch.update(d.ref, { status: 'loss' });
                }
            });
            await batch.commit();

            // Credit own winningMoney for any wins. Always allowed
            // because the user is updating their own doc.
            if (totalWinnings > 0) {
                await runTransaction(db, async (tx) => {
                    const userRef = doc(db, 'users', user.uid);
                    const userSnap = await tx.get(userRef);
                    if (!userSnap.exists()) return;
                    const cur = Number(userSnap.data().winningMoney || 0);
                    tx.update(userRef, {
                        winningMoney: Math.round((cur + totalWinnings) * 100) / 100,
                        lastActiveAt: serverTimestamp(),
                    });
                });
            }
        } catch (err) {
            console.error('Failed to settle my bets for round', roundIdToProcess, err);
        }
    }, [user]);

    // Decide the winning number when the betting window closes.
    //
    // Reads every bet for the round, totals the bet volume by number,
    // and with HOUSE_BIAS_PROBABILITY chance picks the least-popular
    // number (typically a number nobody bet on, so the house keeps
    // everything that round). Otherwise a fair 1/12 random pick.
    const pickAutoWinner = useCallback(async (roundIdToProcess) => {
        if (!roundIdToProcess) return Math.floor(Math.random() * 12) + 1;
        try {
            const betsQuery = query(collection(db, 'wingame_bets'), where('roundId', '==', roundIdToProcess));
            const betsSnapshot = await getDocs(betsQuery);

            const volume = {};
            for (let i = 1; i <= 12; i++) volume[i] = 0;
            betsSnapshot.forEach((d) => {
                const bet = d.data();
                if (typeof bet.number === 'number' && typeof bet.amount === 'number' && bet.number >= 1 && bet.number <= 12) {
                    volume[bet.number] = (volume[bet.number] || 0) + bet.amount;
                }
            });

            if (Math.random() < HOUSE_BIAS_PROBABILITY) {
                const minVol = Math.min(...Object.values(volume));
                const candidates = Object.entries(volume)
                    .filter(([, v]) => v === minVol)
                    .map(([n]) => Number(n));
                return candidates[Math.floor(Math.random() * candidates.length)];
            }

            return Math.floor(Math.random() * 12) + 1;
        } catch (error) {
            console.error('Error picking auto winner:', error);
            return Math.floor(Math.random() * 12) + 1;
        }
    }, []);


    // Effect to get user's wallet balance
    useEffect(() => {
        if (!user) return;
        const userDocRef = doc(db, 'users', user.uid);
        const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
            if (docSnap.exists()) setWalletBalance(getUserFunds(docSnap.data()).total);
        });
        return unsubscribe;
    }, [user]);

    // This effect syncs game state from Firestore and handles forced winner logic
    useEffect(() => {
        const unsubscribe = onSnapshot(gameStateRef(), (docSnap) => {
            if (docSnap.exists() && docSnap.data().phase && docSnap.data().phaseEndTime) {
                const data = docSnap.data();
                const now = Timestamp.now();
                
                let phaseEndTime = data.phaseEndTime;
                if (!(phaseEndTime instanceof Timestamp)) {
                    phaseEndTime = new Timestamp(phaseEndTime.seconds, phaseEndTime.nanoseconds);
                }

                const remainingSeconds = Math.max(0, phaseEndTime.seconds - now.seconds);
                
                if (phase !== data.phase) setPhase(data.phase);
                if (roundId !== data.roundId) setRoundId(data.roundId);

                setLastWinningNumber(data.lastWinningNumber || null);
                setTimer(remainingSeconds);

                // Admin force-winner path. Whichever client claims the
                // lock first persists the round result to
                // wingame_rounds/{roundId} so every browser can read it
                // and settle their own bets independently.
                if (data.phase === 'results' && data.forcedWinner != null && !data.winnerProcessed) {
                    runTransaction(db, async (transaction) => {
                        const freshDoc = await transaction.get(gameStateRef());
                        if (freshDoc.exists() && freshDoc.data().winnerProcessed) {
                            return;
                        }
                        transaction.update(gameStateRef(), {
                            winnerProcessed: true,
                            winningNumber: data.forcedWinner,
                        });
                    }).then(async () => {
                        // Persist round result for late-joining browsers.
                        try {
                            await setDoc(doc(db, 'wingame_rounds', String(data.roundId)), {
                                roundId: data.roundId,
                                result: data.forcedWinner,
                                settledAt: new Date(),
                            }, { merge: true });
                        } catch (err) { console.warn('Failed to persist round result:', err); }

                        // Settle MY OWN bets only.
                        await settleMyBetsForRound(data.forcedWinner, data.roundId);

                        // Transition to next round (any client can race-win
                        // this; setDoc replaces, so winnerProcessed /
                        // forcedWinner / winningNumber are cleared).
                        const newEndTime = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
                        await setDoc(gameStateRef(), {
                            roundId: Date.now(),
                            phase: 'betting',
                            phaseEndTime: newEndTime,
                            lastWinningNumber: data.forcedWinner,
                        });
                    }).catch(error => {
                        if (error.code !== 'aborted') {
                            console.error("Failed to claim winner processing task:", error);
                        }
                    });
                }

            } else {
                // Initialize game state if it's missing or corrupt
                const newRoundId = Date.now();
                const initialEndTime = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
                
                setDoc(gameStateRef(), {
                    roundId: newRoundId,
                    phase: 'betting',
                    phaseEndTime: initialEndTime,
                    lastWinningNumber: null,
                }).catch(err => {
                    console.error("Failed to initialize game state:", err);
                    setPhase('error');
                });
            }
        }, (error) => {
            console.error("Error listening to game state:", error);
            setPhase('error');
        });
        return () => unsubscribe();
    }, [gameStateRef, phase, roundId, settleMyBetsForRound]);

    // Effect for the visual timer countdown
    useEffect(() => {
        let interval;
        if (timer > 0) {
            interval = setInterval(() => {
                setTimer(prev => prev > 0 ? prev - 1 : 0);
            }, 1000);
        }
        return () => clearInterval(interval);
    }, [timer]);

    // Effect to handle automatic, time-based phase transitions
    useEffect(() => {
        if (timer > 0 || phase === 'loading' || !user) return;

        const roundIdToEnd = roundId;

        // --- End of Betting Phase -> Start Results ---
        if (phase === 'betting') {
            runTransaction(db, async (transaction) => {
                const gameStateDoc = await transaction.get(gameStateRef());
                if (!gameStateDoc.exists() || gameStateDoc.data().phase !== 'betting' || gameStateDoc.data().roundId !== roundIdToEnd) {
                    throw new Error("Phase already changed or round mismatch.");
                }
                const newEndTime = new Date(Date.now() + RESULTS_DURATION_SECONDS * 1000);
                transaction.update(gameStateRef(), { phase: 'results', phaseEndTime: newEndTime });
            }).catch(error => {
                if (error.code !== 'aborted' && !error.message.includes("Phase already changed")) {
                    console.error("Failed to start result phase:", error);
                }
            });
        }
        // --- End of Results Phase -> Auto-pick winner & start next round ---
        // No more refunds: every round resolves to a number, even if the
        // admin didn't manually pick one. Bias logic is in pickAutoWinner.
        else if (phase === 'results') {
            (async () => {
                let claimedNumber = null;
                let alreadySetNumber = null;
                try {
                    // First client to get here computes the winning
                    // number and stamps it on game_state. Others read it.
                    await runTransaction(db, async (transaction) => {
                        const gameStateDoc = await transaction.get(gameStateRef());
                        if (!gameStateDoc.exists() || gameStateDoc.data().phase !== 'results' || gameStateDoc.data().roundId !== roundIdToEnd) {
                            throw new Error('State mismatch');
                        }
                        const cur = gameStateDoc.data();
                        if (cur.winningNumber != null) {
                            alreadySetNumber = cur.winningNumber;
                            return;
                        }
                        if (cur.forcedWinner != null) {
                            // Admin already picked — let the other effect handle.
                            return;
                        }
                        // Pick winner (random or biased).
                        const num = await pickAutoWinner(roundIdToEnd);
                        transaction.update(gameStateRef(), {
                            winnerProcessed: true,
                            winningNumber: num,
                        });
                        claimedNumber = num;
                    });

                    const winningNumber = claimedNumber ?? alreadySetNumber;
                    if (winningNumber == null) return;

                    // Persist round result so users who join late can
                    // settle their old open bets.
                    if (claimedNumber != null) {
                        try {
                            await setDoc(doc(db, 'wingame_rounds', String(roundIdToEnd)), {
                                roundId: roundIdToEnd,
                                result: claimedNumber,
                                settledAt: new Date(),
                            }, { merge: true });
                        } catch (err) { console.warn('Failed to persist round result:', err); }
                    }

                    // Each browser settles its OWN bets only. No
                    // cross-user updates → never gets blocked by rules.
                    await settleMyBetsForRound(winningNumber, roundIdToEnd);

                    // Try to transition to next round. Any client wins
                    // the race; setDoc replaces the whole doc so all
                    // settlement flags clear out.
                    const newEndTime = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
                    await setDoc(gameStateRef(), {
                        roundId: Date.now(),
                        phase: 'betting',
                        phaseEndTime: newEndTime,
                        lastWinningNumber: winningNumber,
                    });
                } catch (error) {
                    if (error.code !== 'aborted' && !String(error.message || '').includes('State mismatch')) {
                        console.error('Failed to auto-pick winner:', error);
                    }
                }
            })();
        }
    }, [timer, phase, user, roundId, pickAutoWinner, settleMyBetsForRound, gameStateRef]);

    // On mount / login, sweep up any of the current user's old bets
    // that are still 'open' but whose round has already been resolved
    // (e.g. they were offline when the round ended). Reads each round's
    // stored result from /wingame_rounds and settles their own bets.
    useEffect(() => {
        if (!user) return undefined;
        let cancelled = false;
        (async () => {
            try {
                const myOpenQ = query(
                    collection(db, 'wingame_bets'),
                    where('userId', '==', user.uid),
                    where('status', '==', 'open'),
                );
                const snap = await getDocs(myOpenQ);
                if (cancelled || snap.empty) return;
                const byRound = {};
                snap.docs.forEach((d) => {
                    const bet = d.data();
                    if (!byRound[bet.roundId]) byRound[bet.roundId] = [];
                    byRound[bet.roundId].push({ ref: d.ref, ...bet });
                });
                for (const [rId, bets] of Object.entries(byRound)) {
                    const roundSnap = await getDoc(doc(db, 'wingame_rounds', String(rId)));
                    if (!roundSnap.exists() || roundSnap.data().result == null) continue;
                    if (cancelled) return;
                    await settleMyBetsForRound(roundSnap.data().result, Number(rId));
                }
            } catch (err) {
                console.warn('Backfill open-bet settlement failed:', err);
            }
        })();
        return () => { cancelled = true; };
    }, [user, settleMyBetsForRound]);


    const handleBetSubmit = async () => {
        if (!user || selectedNumber === null || betAmount < 10 || walletBalance < betAmount || phase !== 'betting') return;

        setIsSubmitting(true);
        try {
            await runTransaction(db, async (transaction) => {
                const userDocRef = doc(db, 'users', user.uid);
                const userDoc = await transaction.get(userDocRef);

                if (!userDoc.exists()) {
                    throw new Error('Insufficient balance.');
                }
                const deduction = getFundsDeductionResult(userDoc.data(), betAmount);
                transaction.update(userDocRef, deduction.update);

                const betDocRef = doc(collection(db, 'wingame_bets'));
                transaction.set(betDocRef, {
                    userId: user.uid,
                    roundId: roundId,
                    number: selectedNumber,
                    amount: betAmount,
                    debitedFromBalance: deduction.debitedFromBalance,
                    debitedFromWinnings: deduction.debitedFromWinnings,
                    createdAt: serverTimestamp(),
                    status: 'open',
                });
            });

            setSelectedNumber(null);
            setBetAmount(10);
        } catch (error) {
            console.error(error.message || 'Failed to place bet.');
        } finally {
            setIsSubmitting(false);
        }
    };
    
    const formatTime = (seconds) => {
        const minutes = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    return (
        <div className="font-roboto bg-gray-900 text-white min-h-screen p-4 pt-20">
            <div className="max-w-4xl mx-auto">
                <div className="text-center mb-6">
                    <h1 className="text-4xl font-bold text-yellow-400">1 to 12 Win</h1>
                    <p className="text-gray-300 text-lg">Bet on a number and win 10 times the amount!</p>
                </div>

                <div className="bg-gray-800 rounded-xl shadow-lg p-4 mb-6 flex justify-around items-center">
                    <div className="text-center">
                        <p className="text-sm text-gray-400">Status</p>
                        {phase === 'betting' && <p className="text-lg font-bold text-green-400 animate-pulse">Betting Open</p>}
                        {phase === 'results' && <p className="text-lg font-bold text-blue-400">Waiting for Result...</p>}
                        {phase === 'loading' && <p className="text-lg font-bold text-gray-400">Loading...</p>}
                        {phase === 'error' && <p className="text-lg font-bold text-red-600">Connection Error</p>}
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-gray-400">{phase === 'betting' ? 'Time Remaining' : 'Next Round In'}</p>
                        <p className="text-3xl font-bold text-yellow-400">{formatTime(timer)}</p>
                    </div>
                    <div className="text-center">
                        <p className="text-sm text-gray-400">Last Winning Number</p>
                        <p className="text-3xl font-bold text-yellow-400">{lastWinningNumber ?? '--'}</p>
                    </div>
                </div>

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-3 mb-6">
                    {[...Array(12).keys()].map(i => (
                        <button
                            key={i + 1}
                            onClick={() => setSelectedNumber(i + 1)}
                            disabled={phase !== 'betting'}
                            className={`py-5 rounded-lg text-2xl font-bold transition-all duration-200 shadow-md ${
                                selectedNumber === i + 1
                                    ? 'bg-yellow-500 text-black scale-110'
                                    : 'bg-gray-100 text-black'
                            } ${phase === 'betting' ? 'hover:bg-yellow-400' : 'cursor-not-allowed opacity-50'}`}
                        >
                            {i + 1}
                        </button>
                    ))}
                </div>

                <div className="bg-gray-800 rounded-xl shadow-lg p-6">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
                        <div>
                            <label className="block text-sm font-medium text-gray-400 mb-2">Selected Number</label>
                            <div className="w-full bg-gray-700 rounded-lg p-3 text-center text-xl font-bold">
                                {selectedNumber || 'None'}
                            </div>
                        </div>
                        <div>
                            <label htmlFor="betAmount" className="block text-sm font-medium text-gray-400 mb-2">Bet Amount (Min: {formatCurrency(10)})</label>
                            <input
                                id="betAmount"
                                type="number"
                                value={betAmount}
                                onChange={(e) => {
                                    const value = e.target.value;
                                    if (value === "") {
                                        setBetAmount(""); // Allow empty string
                                    } else {
                                        const parsedValue = parseInt(value, 10);
                                        setBetAmount(isNaN(parsedValue) ? "" : parsedValue); // Set parsed value or empty if invalid
                                    }
                                }}
                                min="10"
                                disabled={phase !== 'betting'}
                                className="w-full bg-gray-700 rounded-lg p-3 text-center text-xl font-bold focus:ring-2 focus:ring-yellow-500 outline-none disabled:opacity-50"
                            />
                        </div>
                        <button 
                            onClick={handleBetSubmit}
                            disabled={isSubmitting || phase !== 'betting'}
                            className="w-full bg-green-600 text-white font-bold py-3 rounded-lg text-xl flex items-center justify-center hover:bg-green-700 transition-colors disabled:bg-gray-500 disabled:cursor-not-allowed">
                            {isSubmitting ? <Loader2 className="animate-spin" /> : <Zap />}
                            <span className="ml-2">Place Bet</span>
                        </button>
                    </div>
                </div>
                
                <div className="text-center mt-8 text-xs text-gray-500">
                    <p className='mt-2'>
                    
                        Winnings are 10x the bet amount and are credited to your wallet automatically.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default WinGame;
