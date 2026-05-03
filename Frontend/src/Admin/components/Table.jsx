import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, setDoc, getDoc, runTransaction, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { markets } from '../../marketData';
import Loader from '../../components/Loader';

const marketNames = markets.map(m => m.name);

// IST today as YYYY-MM-DD — the result form defaults to this and the
// settlement code uses it to scope which day's pending bets to settle.
const ymdInIst = (date) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
};

// [start, end] timestamps representing 00:00:00 → 23:59:59.999 IST of
// the given YYYY-MM-DD string.
const istDayRange = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  const startMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 60 * 60 * 1000;
  const endMs = startMs + 24 * 60 * 60 * 1000 - 1;
  return [new Date(startMs), new Date(endMs)];
};

const Table = () => {
  const [selectedMarket, setSelectedMarket] = useState(marketNames[0]);
  const [newResult, setNewResult] = useState('');
  const [resultDate, setResultDate] = useState(() => ymdInIst(new Date()));
  const [currentYesterdayResult, setCurrentYesterdayResult] = useState('..');
  const [currentTodayResult, setCurrentTodayResult] = useState('..');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [history, setHistory] = useState([]);

  // Timing related states
  const [openTime, setOpenTime] = useState('');
  const [closeTime, setCloseTime] = useState('');
  const [timingLoading, setTimingLoading] = useState(false);

  const fetchResultsAndHistory = async (market) => {
    setLoading(true);
    setCurrentTodayResult('..');
    setCurrentYesterdayResult('..');
    setHistory([]);
    try {
      // Server-side query: only this market, only from the 1st of the current month, sorted desc.
      // Requires a composite index on (marketName ASC, date DESC) in Firestore.
      const now = new Date();
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

      const resultsQuery = query(
        collection(db, 'results'),
        where('marketName', '==', market),
        where('date', '>=', Timestamp.fromDate(monthStart)),
        orderBy('date', 'desc'),
        limit(200)
      );

      const snapshot = await getDocs(resultsQuery);
      const marketResults = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const yesterday = new Date(today);
      yesterday.setDate(yesterday.getDate() - 1);

      let foundToday = false;
      let foundYesterday = false;

      for (const result of marketResults) {
        if (!result.date?.toDate) continue;
        const resultDate = result.date.toDate();
        if (!foundToday && resultDate >= today && resultDate < tomorrow) {
          setCurrentTodayResult(result.number);
          foundToday = true;
        }
        if (!foundYesterday && resultDate >= yesterday && resultDate < today) {
          setCurrentYesterdayResult(result.number);
          foundYesterday = true;
        }
        if (foundToday && foundYesterday) break;
      }

      setHistory(marketResults);
    } catch (error) {
      console.error("Error fetching results:", error);
      if (error.code === 'failed-precondition') {
        toast.error('Composite index missing. Check console for Firestore index creation link.');
      } else {
        toast.error('Failed to fetch results.');
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (selectedMarket) {
        fetchResultsAndHistory(selectedMarket);

        const fetchTimings = async () => {
            setTimingLoading(true);
            const timingDocRef = doc(db, 'market_timings', selectedMarket);
            try {
                const docSnap = await getDoc(timingDocRef);
                if (docSnap.exists()) {
                    const data = docSnap.data();
                    setOpenTime(data.openTime || '');
                    setCloseTime(data.closeTime || '');
                } else {
                    const marketInfo = markets.find(m => m.name === selectedMarket);
                    setOpenTime(marketInfo?.openTime || '');
                    setCloseTime(marketInfo?.closeTime || '');
                }
            } catch (error) {
                console.error("Error fetching timings:", error);
                toast.error(`Failed to fetch timings for ${selectedMarket}.`);
                const marketInfo = markets.find(m => m.name === selectedMarket);
                setOpenTime(marketInfo?.openTime || '');
                setCloseTime(marketInfo?.closeTime || '');
            } finally {
                setTimingLoading(false);
            }
        };
        fetchTimings();
    }
  }, [selectedMarket]);

  const handleUpdateResult = async () => {
    if (!newResult || isNaN(parseInt(newResult)) || parseInt(newResult) < 0 || parseInt(newResult) > 99) {
      toast.error("Please enter a valid number between 0 and 99.");
      return;
    }
    if (!resultDate) {
      toast.error("Please pick the result's date.");
      return;
    }

    setSubmitting(true);
    try {
      // Save the result with the chosen IST date so it shows up on the
      // right calendar row, even when admin is back-filling a previous
      // day's number.
      const [sessionStart, sessionEnd] = istDayRange(resultDate);
      const paddedNumber = parseInt(newResult).toString().padStart(2, '0');

      await addDoc(collection(db, "results"), {
        marketName: selectedMarket,
        number: paddedNumber,
        date: Timestamp.fromDate(sessionStart),
      });
      toast.success(`Result for ${selectedMarket} (${resultDate}) updated successfully!`);
      // Pass the IST day window — settlement only touches bets placed
      // on that calendar day so back-filling May 3 doesn't accidentally
      // settle today's bets that haven't been resulted yet.
      await processMarketWinners(selectedMarket, paddedNumber, sessionStart, sessionEnd);
      setNewResult('');
      fetchResultsAndHistory(selectedMarket); // Refresh results and history
    } catch (error) {
      console.error("Error updating result:", error);
      toast.error("Failed to update result.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleTimingUpdate = async () => {
    setTimingLoading(true);
    try {
        const timingDocRef = doc(db, 'market_timings', selectedMarket);
        await setDoc(timingDocRef, { openTime, closeTime }, { merge: true });
        toast.success(`Timings for ${selectedMarket} updated successfully!`);
    } catch (error) {
        console.error("Error updating timings:", error);
        toast.error("Failed to update timings.");
    } finally {
        setTimingLoading(false);
    }
  };

  const processMarketWinners = async (marketName, winningNumber, sessionStart, sessionEnd) => {
    const PAYOUT_MULTIPLIER = 90;
    const betsRef = collection(db, "harufBets");
    const betsQuery = query(betsRef, where("marketName", "==", marketName), where("status", "==", "pending"), where("betType", "==", "Haruf"));

    const pendingBetsSnapshot = await getDocs(betsQuery);

    // Pre-filter to bets placed within the chosen IST day. We do this
    // client-side because Firestore doesn't allow range filters on
    // timestamp combined with the existing equality filters without a
    // dedicated composite index.
    const inSessionDocs = sessionStart && sessionEnd
      ? pendingBetsSnapshot.docs.filter(d => {
          const ts = d.data().timestamp;
          const placed = ts?.toDate?.();
          if (!placed) return false;
          return placed >= sessionStart && placed <= sessionEnd;
        })
      : pendingBetsSnapshot.docs;

    if (inSessionDocs.length === 0) {
        console.log(`No pending Haruf bets found for market ${marketName} in the chosen session.`);
        return;
    }

    try {
        await runTransaction(db, async (transaction) => {
            // --- READ PHASE ---
            const betDocRefs = inSessionDocs.map(d => d.ref);
            const betDocs = await Promise.all(betDocRefs.map(ref => transaction.get(ref)));

            const userWinnings = {};
            const betsToUpdate = [];
            for (const betDoc of betDocs) {
                if (!betDoc.exists() || betDoc.data().status !== 'pending') {
                    continue;
                }
                const bet = betDoc.data();
                let betNumber = bet.selectedNumber;
                if (betNumber === "100") betNumber = "00";
                else betNumber = String(betNumber).padStart(2, '0');

                if (betNumber === winningNumber) {
                    const winnings = bet.betAmount * PAYOUT_MULTIPLIER;
                    userWinnings[bet.userId] = (userWinnings[bet.userId] || 0) + winnings;
                    betsToUpdate.push({ ref: betDoc.ref, data: { status: "win", winnings } });
                } else {
                    betsToUpdate.push({ ref: betDoc.ref, data: { status: "loss", winnings: 0 } });
                }
            }

            const userIds = Object.keys(userWinnings);
            const userRefs = userIds.map(id => doc(db, "users", id));
            const userDocs = userIds.length > 0 ? await Promise.all(userRefs.map(ref => transaction.get(ref))) : [];

            // --- WRITE PHASE ---
            betsToUpdate.forEach(betUpdate => {
                transaction.update(betUpdate.ref, betUpdate.data);
            });

            for (let i = 0; i < userDocs.length; i++) {
                const userDoc = userDocs[i];
                const userId = userIds[i];
                if (userDoc.exists()) {
                    const currentWinnings = userDoc.data().winningMoney || 0;
                    const amountToCredit = userWinnings[userId];
                    const newWinnings = currentWinnings + amountToCredit;
                    transaction.update(userDoc.ref, { winningMoney: newWinnings });
                }
            }
        });
        toast.success(`Pending bets for ${marketName} processed successfully.`);
    } catch (e) {
        console.error(`Transaction failed for processing ${marketName} winners: `, e);
        toast.error(`Failed to process bets for ${marketName}. Please check logs.`);
    }
  };



  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <h3 className="text-lg font-semibold mb-4">Update Market Results</h3>

        <div className="mb-4">
          <label htmlFor="marketSelect" className="block text-sm font-medium text-gray-700">Select Market</label>
          <select
            id="marketSelect"
            value={selectedMarket}
            onChange={(e) => setSelectedMarket(e.target.value)}
            className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
          >
            {marketNames.map((name) => (
              <option key={name} value={name}>{name}</option>))}
          </select>
        </div>

        {loading ? (
          <Loader />
        ) : (
          <div className="mb-4">
            <p className="text-sm text-gray-700">Current Results for {selectedMarket}:</p>
            <div className="flex items-center gap-2 text-red-600 text-lg font-bold">
              <span>{`{ ${currentYesterdayResult} }`}</span>
              <span className="text-black">{`→`}</span>
              <span>{`[ ${currentTodayResult} ]`}</span>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
          <div>
            <label htmlFor="resultDate" className="block text-sm font-medium text-gray-700">Result for date (IST)</label>
            <input
              type="date"
              id="resultDate"
              value={resultDate}
              onChange={(e) => setResultDate(e.target.value)}
              max={ymdInIst(new Date())}
              className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Default aaj. Past date pick karke bhi result bhar sakte ho — sirf
              us din ki pending bets settle hongi.
            </p>
          </div>
          <div>
            <label htmlFor="newResult" className="block text-sm font-medium text-gray-700">Result number (0–99)</label>
            <input
              type="number"
              id="newResult"
              value={newResult}
              onChange={(e) => setNewResult(e.target.value)}
              min="0"
              max="99"
              className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              placeholder="e.g. 74"
            />
          </div>
        </div>

        <button
          onClick={handleUpdateResult}
          disabled={submitting || loading}
          className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed mt-3"
        >
          {submitting
            ? 'Updating Result...'
            : `Update Result for ${selectedMarket} on ${resultDate || '…'}`}
        </button>
      </div>
      
      <div className="bg-white rounded-lg shadow-sm p-6 mt-6">
        <h3 className="text-lg font-semibold">Update Market Timings for {selectedMarket}</h3>
        <p className="text-xs text-gray-500 mb-4">
          Enter times in <span className="font-semibold">India Standard Time (IST)</span>. The
          market will open and close at exactly that IST moment for every user worldwide;
          users in other timezones see the equivalent in their own local clock.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
                <label htmlFor="open-time" className="block text-sm font-medium text-gray-700">Open Time (IST)</label>
                <input
                    type="time"
                    id="open-time"
                    value={openTime}
                    onChange={(e) => setOpenTime(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                />
            </div>
            <div>
                <label htmlFor="close-time" className="block text-sm font-medium text-gray-700">Close Time (IST)</label>
                <input
                    type="time"
                    id="close-time"
                    value={closeTime}
                    onChange={(e) => setCloseTime(e.target.value)}
                    className="mt-1 block w-full pl-3 pr-2 py-2 text-base border-gray-300 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm rounded-md"
                />
            </div>
        </div>
        <div className="mt-4">
            <button
              onClick={handleTimingUpdate}
              disabled={timingLoading || loading}
              className="w-full bg-green-600 text-white py-2 px-4 rounded-md hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {timingLoading ? 'Updating Timings...' : 'Update Timings'}
            </button>
        </div>
      </div>

      <div className="mt-6">
        <h4 className="text-md font-semibold mb-2">Update History for {selectedMarket}</h4>
        <div className="max-h-96 overflow-y-auto border rounded-lg">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Numbers
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.length > 0 ? (
                history.map((item) => (
                  <tr key={item.id}>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {item.date ? item.date.toDate().toLocaleDateString() : 'No date'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {item.number}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="2" className="px-6 py-4 text-center text-sm text-gray-500">
                    {loading ? 'Loading history...' : 'No history found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default Table;

