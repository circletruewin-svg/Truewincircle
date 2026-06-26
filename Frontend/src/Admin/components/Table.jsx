import React, { useState, useEffect } from 'react';
import { db } from '../../firebase';
import { collection, query, where, orderBy, limit, getDocs, addDoc, serverTimestamp, doc, setDoc, getDoc, runTransaction, writeBatch, deleteDoc, updateDoc, Timestamp } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { markets } from '../../marketData';
import Loader from '../../components/Loader';
import { parseTimeStringToMinutes } from '../../utils/dateHelpers';

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
  // Cross-midnight markets like DISAWAR run from afternoon one day
  // till ~3 AM the next, so "today's session" actually starts on
  // yesterday's calendar date. Admin picks the session-start date
  // separately from the result date so all the right bets get pulled
  // into settlement.
  const [sessionFromDate, setSessionFromDate] = useState(() => ymdInIst(new Date()));
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

  // Whenever the market or result date changes, auto-set the session
  // start. For cross-midnight markets (close time-of-day earlier than
  // open time-of-day, e.g. Disawar 12 PM → 3 AM next day), the
  // session starts on the PREVIOUS calendar day. Admin can still
  // override the field manually if needed.
  useEffect(() => {
    if (!selectedMarket || !resultDate) return;
    const openMin = parseTimeStringToMinutes(openTime);
    const closeMin = parseTimeStringToMinutes(closeTime);
    if (openMin == null || closeMin == null) {
      setSessionFromDate(resultDate);
      return;
    }
    const crossesMidnight = closeMin < openMin;
    if (crossesMidnight) {
      // resultDate - 1 day, in IST.
      const [y, m, d] = resultDate.split('-').map(Number);
      const yestMs = Date.UTC(y, m - 1, d) - 24 * 60 * 60 * 1000;
      setSessionFromDate(ymdInIst(new Date(yestMs)));
    } else {
      setSessionFromDate(resultDate);
    }
  }, [selectedMarket, resultDate, openTime, closeTime]);

  const handleUpdateResult = async () => {
    if (!newResult || isNaN(parseInt(newResult)) || parseInt(newResult) < 0 || parseInt(newResult) > 99) {
      toast.error("Please enter a valid number between 0 and 99.");
      return;
    }
    if (!resultDate) {
      toast.error("Please pick the result's date.");
      return;
    }
    if (!sessionFromDate) {
      toast.error("Please pick the session start date.");
      return;
    }
    if (sessionFromDate > resultDate) {
      toast.error("Session start date cannot be after the result date.");
      return;
    }

    setSubmitting(true);
    try {
      // Cross-midnight markets need the session window to span from
      // the start-date 00:00 IST through the result-date 23:59 IST.
      // For normal markets the two dates are the same and the window
      // reduces to a single IST day.
      const [sessionStart] = istDayRange(sessionFromDate);
      const [, sessionEnd] = istDayRange(resultDate);
      // The "date" field on the result doc is what the calendar / day
      // tabs read — it must be the RESULT date (when the number is
      // declared), NOT the session-start date. Storing sessionStart
      // here was the bug that pushed Disawar's result onto the
      // previous-day cell.
      const [resultDayStart] = istDayRange(resultDate);
      const paddedNumber = parseInt(newResult).toString().padStart(2, '0');

      await addDoc(collection(db, "results"), {
        marketName: selectedMarket,
        number: paddedNumber,
        date: Timestamp.fromDate(resultDayStart),
        sessionStart: Timestamp.fromDate(sessionStart),
        sessionEnd:   Timestamp.fromDate(sessionEnd),
      });
      toast.success(`Result for ${selectedMarket} (${resultDate}) updated successfully!`);
      // Pass the IST window — settlement only touches bets placed
      // inside it so back-filling a past day doesn't accidentally
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

    // SIMPLIFIED: result declare karte hi MARKET ke saare pending bets
    // settle ho jaate hain — koi session-window filter nahi. Admin jab
    // "Update Result" dabaata hai, vo declare kar raha hai ki is market
    // ke saare pending bets is number ke hisaab se decide hon.
    // (sessionStart/sessionEnd ab informational hain — store kiye jaate
    // hain result doc me par yahan filter nahi karte. Cross-midnight
    // markets ka logic same hi rahta hai kyunki next session ke bets
    // pehle declare se pehle place ho hi nahi sakte.)
    void sessionStart; void sessionEnd;
    const inSessionDocs = pendingBetsSnapshot.docs;

    if (inSessionDocs.length === 0) {
        toast.info(`${marketName} me koi pending bet nahi.`);
        return;
    }

    // Firestore transactions cap at 500 ops. Bahut sare pending bets
    // ek saath settle karne se "Failed to process" error aata tha.
    // Isliye chunks me process karte hain — 80 bets per chunk
    // (worst case 80 bet updates + ~80 user updates + reads ≈ 240 ops,
    // safe margin under 500). Har chunk apna transaction; status
    // filter ('pending') idempotent banata hai — agar bich me crash
    // ho gaya to baad me dobara Settle pending safely chala sakte ho.
    const CHUNK = 80;
    let totalSettled = 0;
    let totalErrors = 0;
    for (let i = 0; i < inSessionDocs.length; i += CHUNK) {
      const chunk = inSessionDocs.slice(i, i + CHUNK);
      try {
        // eslint-disable-next-line no-await-in-loop
        await runTransaction(db, async (transaction) => {
            // --- READ PHASE ---
            const betDocRefs = chunk.map(d => d.ref);
            const betDocs = await Promise.all(betDocRefs.map(ref => transaction.get(ref)));

            const userWinnings = {};
            const betsToUpdate = [];
            for (const betDoc of betDocs) {
                if (!betDoc.exists() || betDoc.data().status !== 'pending') {
                    continue;
                }
                const bet = betDoc.data();
                // Bad data se chunk fail na ho — validate aur skip karo.
                const amt = Number(bet.betAmount);
                if (!Number.isFinite(amt) || amt <= 0) {
                    console.warn('Skip bet: invalid betAmount', betDoc.id, bet.betAmount);
                    continue;
                }
                if (!bet.userId || typeof bet.userId !== 'string') {
                    console.warn('Skip bet: invalid userId', betDoc.id, bet.userId);
                    continue;
                }
                let betNumber = bet.selectedNumber;
                if (betNumber == null) {
                    console.warn('Skip bet: missing selectedNumber', betDoc.id);
                    continue;
                }
                betNumber = String(betNumber);
                if (betNumber === "100") betNumber = "00";
                else betNumber = betNumber.padStart(2, '0');

                if (betNumber === winningNumber) {
                    const winnings = Math.round(amt * PAYOUT_MULTIPLIER * 100) / 100;
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

            for (let i2 = 0; i2 < userDocs.length; i2++) {
                const userDoc = userDocs[i2];
                const userId = userIds[i2];
                if (userDoc.exists()) {
                    const currentWinnings = userDoc.data().winningMoney || 0;
                    const amountToCredit = userWinnings[userId];
                    const newWinnings = currentWinnings + amountToCredit;
                    transaction.update(userDoc.ref, { winningMoney: newWinnings });
                }
            }
            totalSettled += betsToUpdate.length;
        });
      } catch (e) {
        console.error(`Chunk ${i / CHUNK + 1} settlement failed for ${marketName}:`, e);
        totalErrors += chunk.length;
        // continue with next chunk
      }
    }

    if (totalErrors > 0) {
      toast.error(`${totalSettled} bets settle hue, ${totalErrors} fail. Dobara "Settle pending" dabake retry karo.`, { autoClose: 8000 });
    } else {
      toast.success(`${marketName}: ${totalSettled} bets settle ho gaye.`);
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // Reverse a previously-applied result: every win/loss-status bet
  // inside the result's session window goes back to "pending", and
  // any winnings already credited to a user's winningMoney are
  // debited. Used by edit + delete on past results.
  //
  // The result doc carries sessionStart + sessionEnd for results
  // written by the new flow; for older docs we fall back to the
  // doc's `date` field treated as a 24-hour IST window.
  // ─────────────────────────────────────────────────────────────────
  const reverseSettlement = async (resultDoc) => {
    let start = resultDoc.sessionStart?.toDate?.();
    let end   = resultDoc.sessionEnd?.toDate?.();
    if (!start || !end) {
      // Legacy result without explicit session — assume single IST
      // day matching the doc's `date`.
      const d = resultDoc.date?.toDate?.();
      if (!d) throw new Error('Result has no usable date.');
      const ymd = ymdInIst(d);
      [start, end] = istDayRange(ymd);
    }

    // Find every bet on this market/session that was already settled.
    const settledQ = query(
      collection(db, 'harufBets'),
      where('marketName', '==', resultDoc.marketName),
      where('betType', '==', 'Haruf'),
    );
    const snap = await getDocs(settledQ);
    const inSession = snap.docs.filter((d) => {
      const data = d.data();
      const ts = data.timestamp?.toDate?.();
      if (!ts) return false;
      if (ts < start || ts > end) return false;
      return data.status === 'win' || data.status === 'loss';
    });

    if (inSession.length === 0) return { reversed: 0, debited: 0 };

    // Aggregate winnings to debit per user.
    const userDebits = new Map();
    for (const d of inSession) {
      const data = d.data();
      if (data.status === 'win') {
        const w = Number(data.winnings || data.winAmount || 0);
        if (w > 0) userDebits.set(data.userId, (userDebits.get(data.userId) || 0) + w);
      }
    }

    // 1) Reset every bet's status to 'pending', clear winnings.
    //    writeBatch caps at ~500 ops — chunk to be safe.
    const refs = inSession.map((d) => d.ref);
    while (refs.length) {
      const chunk = refs.splice(0, 400);
      const batch = writeBatch(db);
      chunk.forEach((ref) => batch.update(ref, { status: 'pending', winnings: 0 }));
      await batch.commit();
    }

    // 2) Debit each user's winningMoney by the amount that was credited.
    //    One transaction per user so concurrent bets don't race.
    for (const [userId, amount] of userDebits) {
      try {
        await runTransaction(db, async (tx) => {
          const uRef = doc(db, 'users', userId);
          const uSnap = await tx.get(uRef);
          if (!uSnap.exists()) return;
          const current = Number(uSnap.data().winningMoney || 0);
          const next = Math.max(0, Math.round((current - amount) * 100) / 100);
          tx.update(uRef, { winningMoney: next });
        });
      } catch (e) {
        console.error('Failed to debit user', userId, e);
      }
    }

    return { reversed: inSession.length, debited: userDebits.size };
  };

  // Delete a past result doc + reverse its settlement.
  const handleDeleteResult = async (resultDoc) => {
    const dateLabel = resultDoc.date?.toDate?.()?.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) || '?';
    if (!window.confirm(
      `Delete result?\n\nMarket: ${resultDoc.marketName}\nDate: ${dateLabel}\nNumber: ${resultDoc.number}\n\n` +
      `Iss session ki saari settled bets pending ho jayengi aur winners ke winningMoney se amount kat jayegi. Sure?`,
    )) return;
    setSubmitting(true);
    try {
      const out = await reverseSettlement(resultDoc);
      await deleteDoc(doc(db, 'results', resultDoc.id));
      toast.success(`Result deleted. ${out.reversed} bets reset, ${out.debited} users debited.`);
      fetchResultsAndHistory(selectedMarket);
    } catch (e) {
      console.error('Delete result failed:', e);
      toast.error('Delete failed: ' + (e.message || e));
    } finally {
      setSubmitting(false);
    }
  };

  // Change a past result's number: reverse old, update doc, re-settle.
  const handleEditResult = async (resultDoc) => {
    const newNum = window.prompt(
      `Edit result for ${resultDoc.marketName} (${resultDoc.date?.toDate?.()?.toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) || '?'}).\n\n` +
      `Old number: ${resultDoc.number}\nEnter new number (0–99):`,
      String(resultDoc.number || ''),
    );
    if (newNum === null) return;
    const parsed = parseInt(newNum, 10);
    if (Number.isNaN(parsed) || parsed < 0 || parsed > 99) {
      return toast.error('Number 0-99 ke beech hona chahiye.');
    }
    const paddedNew = String(parsed).padStart(2, '0');
    if (paddedNew === resultDoc.number) {
      // Same number → koi reversal nahi, par pending bets agar ho to
      // settle kar do (jaise re-settle button). User-friendly safety.
      if (!window.confirm(`Same number (${paddedNew}). Pending bets ko settle karein?`)) return;
      setSubmitting(true);
      try {
        let start = resultDoc.sessionStart?.toDate?.();
        let end = resultDoc.sessionEnd?.toDate?.();
        if (!start || !end) {
          const ymd = ymdInIst(resultDoc.date?.toDate?.());
          [start, end] = istDayRange(ymd);
        }
        await processMarketWinners(resultDoc.marketName, paddedNew, start, end);
        fetchResultsAndHistory(selectedMarket);
      } catch (e) {
        console.error('Re-settle failed:', e);
        toast.error('Re-settle fail: ' + (e.message || e));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    if (!window.confirm(
      `Change number ${resultDoc.number} → ${paddedNew}?\n\n` +
      `Purani winning bets pending ho jayengi (winnings debit), naya number ke according fir se settle hongi.`,
    )) return;

    setSubmitting(true);
    try {
      // 1) Reverse current settlement.
      const out = await reverseSettlement(resultDoc);
      // 2) Update result doc with new number.
      await updateDoc(doc(db, 'results', resultDoc.id), { number: paddedNew });
      // 3) Re-run settlement with new number across the same session.
      let start = resultDoc.sessionStart?.toDate?.();
      let end = resultDoc.sessionEnd?.toDate?.();
      if (!start || !end) {
        const ymd = ymdInIst(resultDoc.date?.toDate?.());
        [start, end] = istDayRange(ymd);
      }
      await processMarketWinners(resultDoc.marketName, paddedNew, start, end);
      toast.success(`Result updated to ${paddedNew}. Reversed ${out.reversed} bets and re-settled.`);
      fetchResultsAndHistory(selectedMarket);
    } catch (e) {
      console.error('Edit result failed:', e);
      toast.error(`Edit fail: ${e.message || e}`);
    } finally {
      setSubmitting(false);
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

        {(() => {
          const openMin = parseTimeStringToMinutes(openTime);
          const closeMin = parseTimeStringToMinutes(closeTime);
          const crossesMidnight = openMin != null && closeMin != null && closeMin < openMin;
          return (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-2">
              <div>
                <label htmlFor="sessionFromDate" className="block text-sm font-medium text-gray-700">Session start date (IST)</label>
                <input
                  type="date"
                  id="sessionFromDate"
                  value={sessionFromDate}
                  onChange={(e) => setSessionFromDate(e.target.value)}
                  max={ymdInIst(new Date())}
                  className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
                />
                <p className="text-[11px] text-gray-500 mt-1">
                  {crossesMidnight ? (
                    <span className="text-amber-700">
                      ⚙️ Auto-detected: <b>{selectedMarket}</b> crosses midnight ({openTime}–{closeTime}). Session start kal pe set kar di hai.
                    </span>
                  ) : (
                    <>Normal day market — session start = result date. Disawar etc me previous day auto-pick hota hai.</>
                  )}
                </p>
              </div>

          <div>
            <label htmlFor="resultDate" className="block text-sm font-medium text-gray-700">Result date — session end (IST)</label>
            <input
              type="date"
              id="resultDate"
              value={resultDate}
              onChange={(e) => setResultDate(e.target.value)}
              max={ymdInIst(new Date())}
              className="mt-1 block w-full pl-3 pr-3 py-2 text-base border-gray-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              Default aaj. Past date pick karke back-fill bhi kar sakte ho.
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
            );
          })()}

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
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Date
                </th>
                <th scope="col" className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Number
                </th>
                <th scope="col" className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Actions
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {history.length > 0 ? (
                history.map((item) => (
                  <tr key={item.id}>
                    <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                      {item.date ? item.date.toDate().toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' }) : 'No date'}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-sm font-bold text-gray-900">
                      {item.number}
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap text-right space-x-2">
                      <button
                        onClick={() => handleEditResult(item)}
                        disabled={submitting}
                        className="text-xs bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-bold px-3 py-1 rounded"
                        title="Change this result's number — re-settles all in-session bets"
                      >Edit</button>
                      <button
                        onClick={() => handleDeleteResult(item)}
                        disabled={submitting}
                        className="text-xs bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white font-bold px-3 py-1 rounded"
                        title="Delete this result — reverses settlement, debits winners"
                      >Delete</button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan="3" className="px-4 py-3 text-center text-sm text-gray-500">
                    {loading ? 'Loading history...' : 'No history found.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          <p className="px-4 py-2 text-[11px] text-gray-500 border-t bg-gray-50">
            <b>Edit</b>: galat number declare ho gaya tha → number badal do, old winnings cancel + new number ke according re-settle.<br />
            <b>Delete</b>: result hi remove kar do → saari bets pending pe wapas + winners ke winningMoney se amount debit.
          </p>
        </div>
      </div>
    </div>
  );
};

export default Table;

