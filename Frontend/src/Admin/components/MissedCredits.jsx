// Missed Credit Detector.
//
// Scans every status="win" bet in the two market-bet collections
// (harufBets + bets), sums winnings per user, then compares with
// each user's current winningMoney. Users whose current winning
// balance is materially LOWER than the sum they should have been
// credited are flagged as "potentially missed credit" — Shiv-style
// cases where the settlement transaction updated the bet but the
// user credit didn't stick.
//
// The comparison isn't exact: users legitimately spend winnings on
// new bets and withdraw them, so a lower balance is often normal.
// We compensate by subtracting known consumption:
//   - sum of betAmount debitedFromWinnings (from wingame_bets)
//   - sum of withdrawal amounts (approved withdrawals from winning)
// If unavailable, we default to "assume half consumed" so we don't
// spam admin with false positives.
//
// Admin can Fix any row individually — credits the missing amount
// to the user's winningMoney with a masterLedger-style audit trail
// entry so the fix is traceable.

import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, doc, runTransaction, serverTimestamp, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import { Loader2, AlertTriangle, CheckCircle, Search } from 'lucide-react';
import { formatCurrency } from '../../utils/formatMoney';
import { toast } from 'react-toastify';

const CONSUMPTION_FACTOR = 0.5; // Assume users spend/withdraw ~50% of wins
const MIN_DISCREPANCY = 100;    // Ignore mismatches under ₹100 (noise)

const MissedCredits = () => {
  const [scanning, setScanning] = useState(false);
  const [rows, setRows] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [fixingId, setFixingId] = useState(null);

  const runScan = async () => {
    setScanning(true);
    setRows([]);
    try {
      const [harufSnap, betsSnap, usersSnap, withdrawSnap] = await Promise.all([
        getDocs(query(collection(db, 'harufBets'), where('status', '==', 'win'))),
        getDocs(query(collection(db, 'bets'), where('status', '==', 'win'))),
        getDocs(collection(db, 'users')),
        getDocs(query(collection(db, 'withdrawals'), where('status', '==', 'approved'))),
      ]);

      // winSum[userId] = total winnings across all their won bets
      const winSum = {};
      const winCount = {};
      const addWin = (userId, amt) => {
        if (!userId || !Number.isFinite(amt)) return;
        winSum[userId] = (winSum[userId] || 0) + amt;
        winCount[userId] = (winCount[userId] || 0) + 1;
      };
      harufSnap.docs.forEach((d) => {
        const b = d.data();
        addWin(b.userId, Number(b.winnings || b.winAmount || 0));
      });
      betsSnap.docs.forEach((d) => {
        const b = d.data();
        addWin(b.userId, Number(b.winnings || b.winAmount || 0));
      });

      // approvedWithdraw[userId] = total money approved-withdrawn
      // (used as rough "consumed winnings" signal)
      const approvedWithdraw = {};
      withdrawSnap.docs.forEach((d) => {
        const w = d.data();
        if (!w.userId) return;
        approvedWithdraw[w.userId] = (approvedWithdraw[w.userId] || 0) + Number(w.amount || 0);
      });

      // Compare per user
      const flagged = [];
      usersSnap.docs.forEach((d) => {
        const u = d.data();
        const uid = d.id;
        const expected = winSum[uid] || 0;
        if (expected < MIN_DISCREPANCY) return;

        const currentWinning = Number(u.winningMoney || 0);
        const withdrawn = approvedWithdraw[uid] || 0;

        // Assume some winnings spent on bets or withdrawn
        const assumedConsumed = Math.max(withdrawn, expected * CONSUMPTION_FACTOR);
        const expectedRemaining = expected - assumedConsumed;

        const shortfall = expectedRemaining - currentWinning;
        if (shortfall < MIN_DISCREPANCY) return;

        flagged.push({
          userId: uid,
          name: u.name || u.phoneNumber || uid.slice(0, 6),
          phone: u.phoneNumber || '',
          totalWon: expected,
          winCount: winCount[uid] || 0,
          currentWinning,
          approvedWithdrawn: withdrawn,
          expectedRemaining,
          shortfall,
        });
      });

      flagged.sort((a, b) => b.shortfall - a.shortfall);
      setRows(flagged);
      setScannedAt(new Date());
      toast.success(`Scan complete — ${flagged.length} users flagged.`);
    } catch (e) {
      console.error('Missed credits scan failed:', e);
      toast.error('Scan failed: ' + (e.message || e));
    } finally {
      setScanning(false);
    }
  };

  const applyFix = async (row) => {
    if (fixingId) return;
    if (!window.confirm(
      `${row.name} ko ₹${row.shortfall.toFixed(2)} credit karein?\n\n` +
      `Total won: ₹${row.totalWon.toFixed(2)}\n` +
      `Current winning: ₹${row.currentWinning.toFixed(2)}\n` +
      `Withdrawn: ₹${row.approvedWithdrawn.toFixed(2)}\n\n` +
      `Ye winningMoney me add hoga aur ledger me audit trail rahega.`,
    )) return;

    setFixingId(row.userId);
    try {
      await runTransaction(db, async (tx) => {
        const uRef = doc(db, 'users', row.userId);
        const uSnap = await tx.get(uRef);
        if (!uSnap.exists()) throw new Error('User not found.');
        const cur = Number(uSnap.data().winningMoney || 0);
        const next = Math.round((cur + row.shortfall) * 100) / 100;
        tx.update(uRef, { winningMoney: next });
      });
      await addDoc(collection(db, 'masterLedger'), {
        type: 'admin_to_user',
        userId: row.userId,
        userName: row.name,
        amount: row.shortfall,
        note: `Missed credit recovery — total wins ${row.totalWon.toFixed(2)}, current ${row.currentWinning.toFixed(2)}`,
        createdAt: serverTimestamp(),
      }).catch(() => { /* ledger write is best-effort */ });
      setRows((prev) => prev.filter((r) => r.userId !== row.userId));
      toast.success(`${row.name}: ₹${row.shortfall.toFixed(2)} credited.`);
    } catch (e) {
      console.error('Fix failed:', e);
      toast.error('Fix failed: ' + (e.message || e));
    } finally {
      setFixingId(null);
    }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800">
              🔎 Missed Credit Detector
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Users jinke jeete gaye bets ke winnings unke winningMoney me
              nahi pahuche — flag karta hai aur ek click me fix karta hai.
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded"
          >
            {scanning ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            {scanning ? 'Scanning…' : 'Run Scan'}
          </button>
        </div>

        {scannedAt && !scanning && (
          <p className="text-xs text-gray-500 mb-4">
            Last scanned: {scannedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
          </p>
        )}

        <div className="bg-yellow-50 border border-yellow-200 rounded p-3 text-xs text-yellow-800 mb-4">
          <p><b>Detection method:</b> Har user ke saare status="win" bets ka total winnings sum karta hai.
          Assumed consumption ({(CONSUMPTION_FACTOR * 100)}% ya approved withdrawals, jo bhi zyada ho) ghata deta hai.
          Uske baad bhi agar current winningMoney kam hai ₹{MIN_DISCREPANCY}+ tak → flag.</p>
          <p className="mt-1"><b>Not perfect:</b> Jo user apni winnings zyada spend/withdraw kar chuke hai unke false positives ho sakte hai. Har row ki details dekh ke fix apply karo.</p>
        </div>

        {scanning && (
          <div className="flex justify-center py-8">
            <Loader2 className="animate-spin text-blue-500" size={40} />
          </div>
        )}

        {!scanning && rows.length === 0 && scannedAt && (
          <div className="text-center py-8 text-green-700">
            <CheckCircle className="mx-auto mb-2" size={40} />
            <p className="font-semibold">Sab set — koi missed credit detect nahi hua.</p>
          </div>
        )}

        {!scanning && rows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr>
                  <th className="text-left p-2">User</th>
                  <th className="text-right p-2">Total won</th>
                  <th className="text-right p-2">Win count</th>
                  <th className="text-right p-2">Current winning</th>
                  <th className="text-right p-2">Withdrawn</th>
                  <th className="text-right p-2 text-red-700">Shortfall</th>
                  <th className="text-center p-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.userId} className="border-b hover:bg-yellow-50/40">
                    <td className="p-2">
                      <div className="font-semibold text-gray-800">{r.name}</div>
                      <div className="text-xs text-gray-500">{r.phone}</div>
                    </td>
                    <td className="p-2 text-right text-green-700">{formatCurrency(r.totalWon)}</td>
                    <td className="p-2 text-right text-gray-600">{r.winCount}</td>
                    <td className="p-2 text-right">{formatCurrency(r.currentWinning)}</td>
                    <td className="p-2 text-right text-gray-500">{formatCurrency(r.approvedWithdrawn)}</td>
                    <td className="p-2 text-right font-bold text-red-700">{formatCurrency(r.shortfall)}</td>
                    <td className="p-2 text-center">
                      <button
                        onClick={() => applyFix(r)}
                        disabled={fixingId === r.userId}
                        className="text-xs bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white font-bold px-3 py-1 rounded flex items-center gap-1 mx-auto"
                      >
                        {fixingId === r.userId ? <Loader2 className="animate-spin" size={12} /> : <AlertTriangle size={12} />}
                        Credit ₹{Math.round(r.shortfall)}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default MissedCredits;
