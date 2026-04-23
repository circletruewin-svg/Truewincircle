import React, { useState, useEffect, useCallback } from 'react';
import { 
    doc, collection, runTransaction, onSnapshot, serverTimestamp, setDoc, Timestamp,
    query, where, getDocs, writeBatch, increment,
    getDoc
} from 'firebase/firestore';
import { db } from '../firebase';
import useAuthStore from '../store/authStore';
import { Zap, Loader2 } from 'lucide-react';
import { getFundsDeductionResult, getUserFunds } from '../utils/userFunds';
import { formatCurrency } from '../utils/formatMoney';

const BETTING_DURATION_SECONDS = 5 * 60; // 5 minutes
const RESULTS_DURATION_SECONDS = 1 * 60; // 1 minute
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

    const processWinnings = useCallback(async (winningNumber, roundIdToProcess) => {
        if (winningNumber === undefined || winningNumber === null || !roundIdToProcess) return;
    
        try {
            const betsQuery = query(collection(db, 'wingame_bets'), where('roundId', '==', roundIdToProcess));
            const betsSnapshot = await getDocs(betsQuery);
    
            if (betsSnapshot.empty) {
                console.log(`No bets in round ${roundIdToProcess}.`);
                return;
            }
    
            const batch = writeBatch(db);
            const winners = {}; // { userId: totalWinnings, ... }

            // First pass: find winners and update bet statuses
            betsSnapshot.forEach(doc => {
                const bet = doc.data();
                const betRef = doc.ref;

                // Defensive check for malformed bet data
                if (typeof bet.number !== 'number' || typeof bet.amount !== 'number' || isNaN(bet.amount) || !bet.userId) {
                    console.warn('Skipping malformed bet object:', doc.id, bet);
                    return;
                }
    
                if (bet.number === winningNumber) {
                    const winnings = bet.amount * 10;
                    batch.update(betRef, { status: 'win', winnings: winnings });
                    
                    // Aggregate winnings per user
                    if (!winners[bet.userId]) {
                        winners[bet.userId] = 0;
                    }
                    winners[bet.userId] += winnings;
                } else {
                    batch.update(betRef, { status: 'loss' });
                }
            });

            // If there are winners, fetch their documents and update their winningMoney
            const userIds = Object.keys(winners);
            if (userIds.length > 0) {
                const userRefs = userIds.map(id => doc(db, 'users', id));
                const userDocs = await Promise.all(userRefs.map(ref => getDoc(ref)));

                userDocs.forEach(userDoc => {
                    if (userDoc.exists()) {
                        const userId = userDoc.id;
                        const userRef = userDoc.ref;
                        const currentWinningMoney = userDoc.data().winningMoney || 0;
                        const totalWinnings = winners[userId];
                        const newWinningMoney = currentWinningMoney + totalWinnings;
                        batch.update(userRef, { winningMoney: newWinningMoney });
                    }
                });
            }
            
            await batch.commit();
            console.log("Winnings distributed and bets updated.");
    
        } catch (error) {
            console.error("Error calculating winnings:", error);
        }
    }, []);

    const processRefunds = useCallback(async (roundIdToProcess) => {
        if (!roundIdToProcess) return;
        try {
            const betsQuery = query(collection(db, 'wingame_bets'), where('roundId', '==', roundIdToProcess), where('status', '==', 'open'));
            const betsSnapshot = await getDocs(betsQuery);
    
            if (betsSnapshot.empty) {
                console.log(`No open bets to refund in round ${roundIdToProcess}.`);
                return;
            }
    
            const batch = writeBatch(db);
            betsSnapshot.forEach(betSnap => {
                const bet = betSnap.data();
                const betRef = betSnap.ref;

                const userRef = doc(db, 'users', bet.userId);
                const refundToBalance = Number(bet.debitedFromBalance || bet.amount || 0);
                const refundToWinnings = Number(bet.debitedFromWinnings || 0);

                batch.update(userRef, {
                    balance: increment(refundToBalance),
                    winningMoney: increment(refundToWinnings),
                });

                batch.update(betRef, { status: 'refunded' });
            });
            
            await batch.commit();
            console.log(`Refunds for round ${roundIdToProcess} processed.`);
    
        } catch (error) {
            console.error("Error processing refunds:", error);
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

                // A winner has been manually selected by admin
                if (data.phase === 'results' && data.forcedWinner && !data.winnerProcessed) {
                    runTransaction(db, async (transaction) => {
                        const freshDoc = await transaction.get(gameStateRef());
                        if (freshDoc.exists() && freshDoc.data().winnerProcessed) {
                            return; // Another client already processing
                        }
                        transaction.update(gameStateRef(), { winnerProcessed: true });
                    }).then(async () => {
                        console.log(`Processing admin-forced winner: ${data.forcedWinner}`);
                        await processWinnings(data.forcedWinner, data.roundId);

                        // Transition to next betting round
                        const newEndTime = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
                        await setDoc(gameStateRef(), {
                            roundId: Date.now(),
                            phase: 'betting',
                            phaseEndTime: newEndTime,
                            lastWinningNumber: data.forcedWinner,
                        }); // This resets forcedWinner and winnerProcessed implicitly
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
    }, [gameStateRef, phase, roundId, processWinnings]);

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
        // --- End of Results Phase (Timeout) -> Refund and Start Betting ---
        else if (phase === 'results') {
             runTransaction(db, async (transaction) => {
                const gameStateDoc = await transaction.get(gameStateRef());
                if (!gameStateDoc.exists() || gameStateDoc.data().phase !== 'results' || gameStateDoc.data().roundId !== roundIdToEnd) {
                    throw new Error("State mismatch, aborting refund.");
                }
                // If a winner was forced, another process is handling it. Abort.
                if (gameStateDoc.data().forcedWinner) {
                    console.log("Result timeout, but winner was forced. Aborting refund.");
                    return; // Let the other effect handle the transition
                }
                
                // Transition to the next round with a REFUND status
                const newEndTime = new Date(Date.now() + BETTING_DURATION_SECONDS * 1000);
                transaction.update(gameStateRef(), {
                    phase: 'betting',
                    roundId: Date.now(),
                    phaseEndTime: newEndTime,
                    lastWinningNumber: 'REFUNDED',
                });
            }).then(() => {
                // After successfully starting the next round, process refunds for the old one.
                console.log(`Refunding bets for round ${roundIdToEnd}`);
                processRefunds(roundIdToEnd);
            }).catch(error => {
                if (error.code !== 'aborted' && !error.message.includes("State mismatch")) {
                    console.error("Failed to start new round after timeout:", error);
                }
            });
        }
    }, [timer, phase, user, roundId, processRefunds, gameStateRef]);


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
