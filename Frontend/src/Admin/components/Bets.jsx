import React, { useState, useEffect } from 'react';
import { collection, query, onSnapshot, where, doc, getDoc, updateDoc, Timestamp, getDocs, writeBatch } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader2, Trophy } from 'lucide-react';
import { markets as allMarkets } from '../../marketData';
import { toast } from 'react-toastify';

const GAME_CONFIG = {
  winGame: {
    name: '1 to 12 Win',
    gameStateDoc: 'win_game_1_to_12',
    betsCollection: 'wingame_bets',
    numberField: 'number',
    amountField: 'amount',
    type: 'round-based',
  },
  haruf: {
    name: 'Haruf Game',
    betsCollection: 'harufBets',
    numberField: 'selectedNumber',
    amountField: 'betAmount',
    type: 'market-based',
  },
  roulette: {
    name: 'Roulette',
    gameStateDoc: 'roulette_game_state',
    betsCollection: 'rouletteBets',
    numberField: 'betType',
    amountField: 'betAmount',
    type: 'round-based',
  },
};

const Bets = () => {
  const [selectedGame, setSelectedGame] = useState('winGame');
  const [betsSummary, setBetsSummary] = useState([]);
  const [totalBets, setTotalBets] = useState(0);
  const [loading, setLoading] = useState(true);

  // State for round-based games
  const [currentRoundId, setCurrentRoundId] = useState(null);
  const [phase, setPhase] = useState(null);
  const [timer, setTimer] = useState(0);

  // State for market-based games
  const [markets, setMarkets] = useState([]);
  const [selectedMarket, setSelectedMarket] = useState('');

  // Click-a-number → see which user bet how much on it.
  const [expandedNumber, setExpandedNumber] = useState(null);
  // userId → display name cache, lazily filled (bet docs only store
  // userId, not the name).
  const [nameCache, setNameCache] = useState({});
  const [namesLoading, setNamesLoading] = useState(false);

  useEffect(() => {
    const marketNames = allMarkets.map(m => m.name);
    setMarkets(marketNames);
    if (marketNames.length > 0) {
      setSelectedMarket(marketNames[0]);
    }
  }, []);

  // Effect to get game state for round-based games
  useEffect(() => {
    const config = GAME_CONFIG[selectedGame];
    if (config?.type !== 'round-based') {
      setCurrentRoundId(null);
      setPhase(null);
      setTimer(0);
      return;
    }

    setLoading(true);
    const gameStateRef = doc(db, 'game_state', config.gameStateDoc);
    
    const unsubscribeGameState = onSnapshot(gameStateRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setCurrentRoundId(data.roundId);
        setPhase(data.phase || null);

        if (selectedGame === 'winGame' && data.phaseEndTime) {
            const now = Timestamp.now();
            let phaseEndTime = data.phaseEndTime;
            if (!(phaseEndTime instanceof Timestamp)) {
                phaseEndTime = new Timestamp(phaseEndTime.seconds, phaseEndTime.nanoseconds);
            }
            const remainingSeconds = Math.max(0, phaseEndTime.seconds - now.seconds);
            setTimer(remainingSeconds);
        } else {
            setTimer(0);
        }

      } else {
        setCurrentRoundId(null);
        setPhase(null);
        setTimer(0);
      }
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching game state for ${config.name}:`, error);
      setLoading(false);
      setCurrentRoundId(null);
      setPhase(null);
      setTimer(0);
    });

    return () => unsubscribeGameState();
  }, [selectedGame]);

  // Effect to fetch bets
  useEffect(() => {
    const config = GAME_CONFIG[selectedGame];
    if (!config) return;

    let betsQuery;

    if (config.type === 'round-based') {
      if (!currentRoundId) {
        setBetsSummary([]);
        setTotalBets(0);
        setLoading(false);
        return;
      }
      betsQuery = query(
        collection(db, config.betsCollection),
        where('roundId', '==', currentRoundId)
      );
    } else if (config.type === 'market-based') {
      if (!selectedMarket) {
        setBetsSummary([]);
        setTotalBets(0);
        return;
      }
      betsQuery = query(
        collection(db, config.betsCollection),
        where('marketName', '==', selectedMarket),
        where('status', '==', 'pending')
      );
    } else {
      return;
    }

    setLoading(true);
    const unsubscribeBets = onSnapshot(betsQuery, (snapshot) => {
      // Initialize bets object with all numbers from 1 to 12 for 'winGame'
      const bets = {};
      if (selectedGame === 'winGame') {
        for (let i = 1; i <= 12; i++) {
          bets[i] = { number: i, amount: 0, count: 0, users: new Set(), userMap: {} };
        }
      }

      let total = 0;
      snapshot.docs.forEach(doc => {
        const betData = doc.data();
        const number = betData[config.numberField];
        const amount = betData[config.amountField];
        
        if (number === undefined || amount === undefined) return;
        if (selectedGame === 'winGame' && (typeof number !== 'number' || number < 1 || number > 12)) return; // Validate number for winGame

        total += amount;

        if (!bets[number]) {
          // If not initialized (e.g., for non-winGame, or an unexpected number), initialize it
          bets[number] = { number: number, amount: 0, count: 0, users: new Set(), userMap: {} };
        }
        bets[number].amount += amount;
        bets[number].count += 1;
        bets[number].users.add(betData.userId);

        const uid = betData.userId || 'unknown';
        if (!bets[number].userMap[uid]) {
          bets[number].userMap[uid] = { userId: uid, amount: 0, count: 0 };
        }
        bets[number].userMap[uid].amount += amount;
        bets[number].userMap[uid].count += 1;
      });

      const summary = Object.values(bets)
        .map(b => ({
          ...b,
          userCount: b.users.size,
          // Per-user breakdown for this number, biggest staker first.
          userBets: Object.values(b.userMap).sort((x, y) => y.amount - x.amount),
        }))
        .sort((a, b) => b.amount - a.amount);
      
      setBetsSummary(summary);
      setTotalBets(total);
      setLoading(false);
    }, (error) => {
      console.error(`Error fetching bets for ${config.name}:`, error);
      setLoading(false);
    });

    return () => unsubscribeBets();
  }, [selectedGame, currentRoundId, selectedMarket]);

  // Collapse the per-user panel whenever the data set changes
  // underneath it (different game / market / round).
  useEffect(() => {
    setExpandedNumber(null);
  }, [selectedGame, selectedMarket, currentRoundId]);

  useEffect(() => {
    let interval;
    if (timer > 0) {
        interval = setInterval(() => {
            setTimer(prev => prev > 0 ? prev - 1 : 0);
        }, 1000);
    }
    return () => clearInterval(interval);
  }, [timer]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  // Click a number card → toggle its per-user breakdown. Bet docs
  // only carry userId, so resolve any missing names from /users on
  // demand and cache them.
  const toggleExpand = async (number) => {
    if (expandedNumber === number) {
      setExpandedNumber(null);
      return;
    }
    setExpandedNumber(number);

    const row = betsSummary.find((b) => b.number === number);
    const ids = (row?.userBets || [])
      .map((u) => u.userId)
      .filter((id) => id && id !== 'unknown' && !(id in nameCache));
    if (ids.length === 0) return;

    setNamesLoading(true);
    try {
      const entries = await Promise.all(
        ids.map(async (id) => {
          try {
            const s = await getDoc(doc(db, 'users', id));
            const d = s.exists() ? s.data() : null;
            return [id, d ? (d.name || d.phoneNumber || id) : id];
          } catch {
            return [id, id];
          }
        }),
      );
      setNameCache((prev) => ({ ...prev, ...Object.fromEntries(entries) }));
    } finally {
      setNamesLoading(false);
    }
  };

  // Danger action: delete every pending bet on the currently-selected
  // Haruf/market. Used to clean up phantom pending bets left over by
  // an earlier Force revert (bets that shouldn't be settled but also
  // aren't tied to any real user activity). Wallets are already right,
  // so this doesn't refund or debit anyone — just wipes the docs.
  const [deletingPending, setDeletingPending] = useState(false);
  const handleDeleteAllPending = async () => {
    const config = GAME_CONFIG[selectedGame];
    if (!config || config.type !== 'market-based' || !selectedMarket) return;

    const count = betsSummary.reduce((s, b) => s + (b.count || 0), 0);
    const total = totalBets;
    if (count === 0) {
      toast.info(`${selectedMarket}: koi pending bet nahi hai.`);
      return;
    }

    const typed = window.prompt(
      `⚠️ Delete ALL pending bets for ${selectedMarket}?\n\n` +
      `${count} bets · ₹${total.toFixed(2)}\n\n` +
      `Ye REFUND/DEBIT nahi karega — sirf pending docs delete karega. ` +
      `Sirf tab use karo jab wallets already sahi hai aur ye phantom bets ` +
      `hatane hai.\n\n` +
      `Confirm karne ke liye market ka naam type karo: ${selectedMarket}`,
    );
    if (typed !== selectedMarket) {
      toast.info('Cancelled — naam match nahi hua.');
      return;
    }

    setDeletingPending(true);
    try {
      const snap = await getDocs(query(
        collection(db, config.betsCollection),
        where('marketName', '==', selectedMarket),
        where('status', '==', 'pending'),
      ));
      const refs = snap.docs.map((d) => d.ref);
      let deleted = 0;
      while (refs.length) {
        const chunk = refs.splice(0, 400);
        const batch = writeBatch(db);
        chunk.forEach((ref) => batch.delete(ref));
        // eslint-disable-next-line no-await-in-loop
        await batch.commit();
        deleted += chunk.length;
      }
      toast.success(`${selectedMarket}: ${deleted} pending bets deleted.`);
    } catch (e) {
      console.error('Delete pending failed:', e);
      toast.error('Delete failed: ' + (e.message || e));
    } finally {
      setDeletingPending(false);
    }
  };

  // Nuclear option: sweep pending bets across EVERY market in one go.
  // For when the phantom-pending cleanup needs to be repeated across
  // 6-8 markets and clicking through them one by one is painful.
  // Hits harufBets only — the /bets (Fix Number) collection uses
  // gameName instead of marketName so it isn't matched here.
  const handleDeleteAllPendingAllMarkets = async () => {
    if (deletingPending) return;
    if (markets.length === 0) return;

    const typed = window.prompt(
      `⚠️ Delete ALL pending bets across EVERY market?\n\n` +
      `Ye ${markets.length} markets ki pending bets delete karega ` +
      `(GALI, DISAWAR, FARIDABAD, DELHI BAZAAR, etc.). ` +
      `REFUND/DEBIT nahi hoga — sirf phantom docs wipe.\n\n` +
      `Confirm karne ke liye type karo: DELETE ALL`,
    );
    if (typed !== 'DELETE ALL') {
      toast.info('Cancelled — text match nahi hua.');
      return;
    }

    setDeletingPending(true);
    let grandTotal = 0;
    const errors = [];
    for (const market of markets) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const snap = await getDocs(query(
          collection(db, 'harufBets'),
          where('marketName', '==', market),
          where('status', '==', 'pending'),
        ));
        if (snap.empty) continue;
        const refs = snap.docs.map((d) => d.ref);
        let deletedThisMarket = 0;
        while (refs.length) {
          const chunk = refs.splice(0, 400);
          const batch = writeBatch(db);
          chunk.forEach((ref) => batch.delete(ref));
          // eslint-disable-next-line no-await-in-loop
          await batch.commit();
          deletedThisMarket += chunk.length;
        }
        grandTotal += deletedThisMarket;
        toast.info(`${market}: ${deletedThisMarket} deleted`);
      } catch (e) {
        console.error(`Delete failed on ${market}:`, e);
        errors.push(market);
      }
    }
    setDeletingPending(false);
    if (errors.length) {
      toast.error(`Done — ${grandTotal} deleted. Fail: ${errors.join(', ')}`);
    } else {
      toast.success(`✅ ${grandTotal} phantom bets deleted across ${markets.length} markets.`);
    }
  };

  const handleSelectWinner = async (number) => {
    const config = GAME_CONFIG[selectedGame];
    if (config.type !== 'round-based' || phase !== 'results') {
      alert('You can only select a winner during the "Results" phase for this game type.');
      return;
    }
    if (!currentRoundId) {
      alert('No active round to declare a winner for.');
      return;
    }
    if (!window.confirm(`Are you sure you want to make ${number} the winner for this round? This action is irreversible.`)) {
      return;
    }

    const gameStateRef = doc(db, 'game_state', config.gameStateDoc);
    try {
      await updateDoc(gameStateRef, {
        forcedWinner: number,
        winnerProcessed: false,
      });
      alert(`Successfully declared ${number} as the winner! The results will be processed shortly.`);
    } catch (error) {
      console.error("Failed to set winner:", error);
      alert("An error occurred while trying to set the winner. Please check the console.");
    }
  };
  
  const renderContent = () => {
    if (loading) {
        return (
            <div className="flex justify-center items-center mt-8">
                <Loader2 className="animate-spin text-blue-500" size={40} />
            </div>
        );
    }
    if (betsSummary.length === 0) {
        return <p className="text-gray-600 mt-4 text-center">No bets have been placed for this selection yet.</p>;
    }

    const mostBetted = betsSummary[0];
    const leastBetted = betsSummary[betsSummary.length - 1];

    return (
      <>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          <div className="bg-gray-50 p-4 rounded-lg text-center">
            <h4 className="text-sm font-semibold text-gray-500">Total Bet Amount</h4>
            <p className="text-2xl font-bold text-gray-800">₹{totalBets.toFixed(2)}</p>
          </div>
          {mostBetted && (
            <div className="bg-green-50 p-4 rounded-lg text-center">
                <h4 className="text-sm font-semibold text-green-700">Most Betted Number</h4>
                <p className="text-2xl font-bold text-green-800">{mostBetted.number}</p>
                <p className="text-sm text-green-600">₹{mostBetted.amount.toFixed(2)}</p>
            </div>
          )}
          {leastBetted && (
             <div className="bg-red-50 p-4 rounded-lg text-center">
                <h4 className="text-sm font-semibold text-red-700">Least Betted Number</h4>
                <p className="text-2xl font-bold text-red-800">{leastBetted.number}</p>
                <p className="text-sm text-red-600">₹{leastBetted.amount.toFixed(2)}</p>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h3 className="text-xl font-semibold">
            All Bets {GAME_CONFIG[selectedGame]?.type === 'round-based' ? "in this Round" : "for this Market"}
            {selectedGame === 'winGame' && phase === 'results' && <span className="text-sm font-normal text-yellow-600 ml-1">(Select a winner)</span>}
          </h3>
          {GAME_CONFIG[selectedGame]?.type === 'market-based' && (
            <div className="flex flex-wrap gap-2">
              {totalBets > 0 && (
                <button
                  onClick={handleDeleteAllPending}
                  disabled={deletingPending}
                  className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold px-3 py-2 rounded"
                  title="Ye market ke SAARE pending bets delete karega. Refund/debit nahi hoga."
                >
                  {deletingPending ? 'Deleting…' : `🗑️ Delete pending on ${selectedMarket}`}
                </button>
              )}
              <button
                onClick={handleDeleteAllPendingAllMarkets}
                disabled={deletingPending}
                className="text-xs bg-red-800 hover:bg-red-900 disabled:opacity-40 text-white font-bold px-3 py-2 rounded"
                title="Nuclear option: SAARI markets ki pending bets ek saath delete karega."
              >
                {deletingPending ? 'Deleting…' : '☢️ Delete pending on ALL markets'}
              </button>
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          {betsSummary.map((bet) => {
            const isMostBetted = bet.number === mostBetted.number;
            const isLeastBetted = bet.number === leastBetted.number;

            let cardClasses = 'bg-gray-100';
            if (isMostBetted) cardClasses = 'bg-green-100 ring-2 ring-green-400';
            else if (isLeastBetted) cardClasses = 'bg-red-100 ring-2 ring-red-400';

            const isExpanded = expandedNumber === bet.number;
            if (isExpanded) cardClasses += ' ring-2 ring-blue-400';

            return (
              <div
                key={bet.number}
                onClick={() => toggleExpand(bet.number)}
                title="Click to see which user bet how much on this number"
                className={`p-3 rounded-md text-center transition-all cursor-pointer hover:brightness-95 ${cardClasses}`}
              >
                <div className="flex items-center justify-center gap-2">
                  <p className="text-xl font-bold text-gray-800">{bet.number}</p>
                  {selectedGame === 'winGame' && phase === 'results' && (
                    <Trophy
                      className="cursor-pointer text-yellow-500 hover:text-yellow-700 transition-transform hover:scale-125"
                      size={20}
                      onClick={(e) => { e.stopPropagation(); handleSelectWinner(bet.number); }}
                      title={`Declare ${bet.number} as winner`}
                    />
                  )}
                </div>
                <p className="text-sm text-gray-600">Users: {bet.userCount}</p>
                <p className="text-sm text-gray-600">Bets: {bet.count}</p>
                <p className="text-sm font-semibold text-gray-800">₹{bet.amount.toFixed(2)}</p>
                <p className="text-[11px] text-blue-600 mt-1">{isExpanded ? '▲ Hide users' : '▼ Show users'}</p>
              </div>
            );
          })}
        </div>

        {expandedNumber !== null && (() => {
          const row = betsSummary.find((b) => b.number === expandedNumber);
          const userBets = row?.userBets || [];
          return (
            <div className="mt-4 border border-blue-200 rounded-lg bg-blue-50/60 p-4">
              <div className="flex items-center justify-between mb-2">
                <h4 className="font-semibold text-gray-800">
                  Number {expandedNumber} — kis user ne kitna lagaya
                </h4>
                <button
                  onClick={() => setExpandedNumber(null)}
                  className="text-sm text-gray-500 hover:text-gray-800"
                >
                  ✕ Close
                </button>
              </div>
              {namesLoading && (
                <p className="text-xs text-gray-500 mb-2">Loading user names…</p>
              )}
              {userBets.length === 0 ? (
                <p className="text-sm text-gray-500">Is number par koi bet nahi.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-gray-500 border-b border-blue-200">
                        <th className="py-1.5 pr-3">#</th>
                        <th className="py-1.5 pr-3">User</th>
                        <th className="py-1.5 pr-3 text-right">Total amount</th>
                        <th className="py-1.5 pr-3 text-right">Bets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {userBets.map((u, i) => (
                        <tr key={u.userId} className="border-b border-blue-100 last:border-0">
                          <td className="py-1.5 pr-3 text-gray-500">{i + 1}</td>
                          <td className="py-1.5 pr-3 font-medium text-gray-800">
                            {nameCache[u.userId] || u.userId}
                          </td>
                          <td className="py-1.5 pr-3 text-right font-semibold text-gray-900">
                            ₹{u.amount.toFixed(2)}
                          </td>
                          <td className="py-1.5 pr-3 text-right text-gray-600">{u.count}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="font-bold text-gray-900">
                        <td className="py-1.5 pr-3" colSpan={2}>Total</td>
                        <td className="py-1.5 pr-3 text-right">₹{(row?.amount || 0).toFixed(2)}</td>
                        <td className="py-1.5 pr-3 text-right">{row?.count || 0}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>
          );
        })()}
      </>
    );
  };

  return (
    <div className="p-4 bg-white shadow rounded-lg">
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-4 gap-4">
        <div>
            <h2 className="text-2xl font-semibold">
              Live Bet Summary
            </h2>
            {GAME_CONFIG[selectedGame]?.type === 'round-based' ? (
                <>
                    <p className="text-sm text-gray-500">Round ID: {currentRoundId || 'N/A'}</p>
                    {phase && (
                      <p className={`text-sm font-bold ${phase === 'betting' ? 'text-green-600' : 'text-blue-600'}`}>
                        Phase: {phase.charAt(0).toUpperCase() + phase.slice(1)}
                      </p>
                    )}
                    {selectedGame === 'winGame' && timer > 0 && (
                        <p className="text-sm font-semibold text-gray-500">
                          {phase === 'betting' ? 'Time Remaining' : 'Next Round In'}: <span className="font-bold text-yellow-600">{formatTime(timer)}</span>
                        </p>
                    )}
                </>
            ) : (
                 <p className="text-sm text-gray-500">Market: {selectedMarket || 'N/A'}</p>
            )}
        </div>
        
        <div className="flex flex-col md:flex-row gap-4">
            {selectedGame === 'haruf' && (
                 <div className="w-full md:w-64">
                    <label htmlFor="market-select" className="block text-sm font-medium text-gray-700 mb-1">Select Market</label>
                    <select
                        id="market-select"
                        value={selectedMarket}
                        onChange={(e) => setSelectedMarket(e.target.value)}
                        className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    >
                        {markets.map(market => <option key={market} value={market}>{market}</option>)}
                    </select>
                </div>
            )}
            <div className="w-full md:w-64">
                <label htmlFor="game-select" className="block text-sm font-medium text-gray-700 mb-1">Select Game</label>
                <select
                    id="game-select"
                    value={selectedGame}
                    onChange={(e) => setSelectedGame(e.target.value)}
                    className="w-full p-2 border border-gray-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500"
                >
                    <option value="winGame">1 to 12 Win</option>
                    <option value="haruf">Market Game</option>
                </select>
            </div>
        </div>
      </div>

      {renderContent()}
    </div>
  );
};

export default Bets;
