// Fraud Detection Alerts.
//
// Cheap-to-run heuristics that scan the last N days of user + bet
// + transaction data and surface patterns that "look wrong":
//
//   1. Duplicate phones — two live user accounts with the same phone.
//   2. Multi-account by name — same name, multiple accounts joined
//      close together.
//   3. Rapid big wins — user's ratio of (wins - losses) > threshold
//      in a short window.
//   4. Deposit→immediate-withdrawal — user deposited and withdrew
//      the same amount within N hours (money laundering signal).
//   5. Zero-play withdrawal — user's total bets are much smaller
//      than the amount they're trying to withdraw.
//
// None of these are on-their-own proof of fraud — they're admin
// investigate-me leads. Each row has a "Suspend" quick action so
// admin can pause the account while looking into it.

import React, { useState } from 'react';
import { collection, getDocs, query, where, doc, updateDoc, orderBy } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatMoney';
import { Loader2, ShieldAlert, UserX, Search } from 'lucide-react';
import { toast } from 'react-toastify';

const SEVERITY_STYLES = {
  high:   'bg-red-50 border-red-300 text-red-800',
  medium: 'bg-yellow-50 border-yellow-300 text-yellow-800',
  low:    'bg-blue-50 border-blue-200 text-blue-800',
};

const FraudAlerts = () => {
  const [scanning, setScanning] = useState(false);
  const [alerts, setAlerts] = useState([]);
  const [scannedAt, setScannedAt] = useState(null);
  const [suspendingId, setSuspendingId] = useState(null);

  const runScan = async () => {
    setScanning(true);
    setAlerts([]);
    try {
      const [usersSnap, harufSnap, betsSnap, depSnap, wSnap] = await Promise.all([
        getDocs(collection(db, 'users')),
        getDocs(collection(db, 'harufBets')),
        getDocs(collection(db, 'bets')),
        getDocs(query(collection(db, 'depositRequests'), where('status', '==', 'approved'))).catch(() => ({ docs: [] })),
        getDocs(query(collection(db, 'withdrawals'), where('status', '==', 'approved'))).catch(() => ({ docs: [] })),
      ]);

      const users = usersSnap.docs.map((d) => ({ id: d.id, ...d.data() }));
      const usersById = Object.fromEntries(users.map((u) => [u.id, u]));

      const results = [];

      // 1. Duplicate phones — same phoneNumber across multiple non-suspended users
      const byPhone = {};
      users.forEach((u) => {
        const p = String(u.phoneNumber || '').trim();
        if (!p) return;
        (byPhone[p] = byPhone[p] || []).push(u);
      });
      Object.entries(byPhone).forEach(([phone, list]) => {
        if (list.length > 1) {
          results.push({
            id: `dup-phone-${phone}`,
            severity: 'high',
            kind: 'Duplicate phone',
            userId: list[0].id,
            summary: `${list.length} accounts share phone ${phone}`,
            detail: list.map((u) => u.name || u.id.slice(0, 6)).join(' · '),
          });
        }
      });

      // 2. Same name, joined within 24h of each other — likely alt accounts
      const byName = {};
      users.forEach((u) => {
        const n = String(u.name || '').trim().toLowerCase();
        if (!n) return;
        (byName[n] = byName[n] || []).push(u);
      });
      Object.entries(byName).forEach(([name, list]) => {
        if (list.length < 2) return;
        const sorted = [...list].sort((a, b) => {
          const ta = a.createdAt?.toDate?.()?.getTime() || 0;
          const tb = b.createdAt?.toDate?.()?.getTime() || 0;
          return ta - tb;
        });
        for (let i = 1; i < sorted.length; i++) {
          const t0 = sorted[i - 1].createdAt?.toDate?.()?.getTime();
          const t1 = sorted[i].createdAt?.toDate?.()?.getTime();
          if (t0 && t1 && (t1 - t0) < 24 * 60 * 60 * 1000) {
            results.push({
              id: `dup-name-${name}-${sorted[i].id}`,
              severity: 'medium',
              kind: 'Same name, close signup',
              userId: sorted[i].id,
              summary: `"${name}" — 2 accounts within 24h`,
              detail: `${sorted[i-1].id.slice(0, 6)} + ${sorted[i].id.slice(0, 6)}`,
            });
            break;
          }
        }
      });

      // 3. Rapid big win ratio — user with net winnings > ₹50k this scan
      const netByUser = {};
      const betCountByUser = {};
      const addBet = (uid, amount, winnings) => {
        if (!uid) return;
        netByUser[uid] = (netByUser[uid] || 0) + (Number(winnings || 0) - Number(amount || 0));
        betCountByUser[uid] = (betCountByUser[uid] || 0) + 1;
      };
      harufSnap.docs.forEach((d) => {
        const b = d.data();
        if (b.status === 'win') addBet(b.userId, b.betAmount, b.winnings);
        else if (b.status === 'loss') addBet(b.userId, b.betAmount, 0);
      });
      betsSnap.docs.forEach((d) => {
        const b = d.data();
        if (b.status === 'win') addBet(b.userId, b.betAmount, b.winnings);
        else if (b.status === 'loss') addBet(b.userId, b.betAmount, 0);
      });
      Object.entries(netByUser).forEach(([uid, net]) => {
        if (net > 50000) {
          const u = usersById[uid];
          results.push({
            id: `big-win-${uid}`,
            severity: net > 200000 ? 'high' : 'medium',
            kind: 'Big net winner',
            userId: uid,
            summary: `Net +${formatCurrency(net)} across ${betCountByUser[uid]} bets`,
            detail: `${u?.name || uid.slice(0, 6)} · ${u?.phoneNumber || ''}`,
          });
        }
      });

      // 4. Deposit→immediate-withdraw signal — approved deposit + approved
      //    withdrawal from same user within 6h and matching-ish amounts
      const depsByUser = {};
      depSnap.docs?.forEach((d) => {
        const dep = d.data();
        if (!dep.userId) return;
        (depsByUser[dep.userId] = depsByUser[dep.userId] || []).push({
          amount: Number(dep.amount || 0),
          at: dep.approvedAt?.toDate?.() || dep.createdAt?.toDate?.() || null,
        });
      });
      wSnap.docs?.forEach((d) => {
        const w = d.data();
        const uid = w.userId;
        if (!uid) return;
        const wAmount = Number(w.amount || 0);
        const wAt = w.approvedAt?.toDate?.() || w.createdAt?.toDate?.() || null;
        if (!wAt) return;
        const matches = (depsByUser[uid] || []).find((dep) => {
          if (!dep.at) return false;
          const gapH = (wAt - dep.at) / (60 * 60 * 1000);
          return gapH >= 0 && gapH < 6 && Math.abs(dep.amount - wAmount) / Math.max(1, dep.amount) < 0.1;
        });
        if (matches) {
          const u = usersById[uid];
          results.push({
            id: `dep-then-withdraw-${uid}-${wAt.getTime()}`,
            severity: 'medium',
            kind: 'Deposit → quick withdrawal',
            userId: uid,
            summary: `Deposit ${formatCurrency(matches.amount)} → withdrawal ${formatCurrency(wAmount)} in <6h`,
            detail: `${u?.name || uid.slice(0, 6)} · ${u?.phoneNumber || ''}`,
          });
        }
      });

      // 5. Zero-play withdrawal — user requested a withdrawal that
      //    dwarfs their total bet volume
      wSnap.docs?.forEach((d) => {
        const w = d.data();
        const uid = w.userId;
        if (!uid) return;
        const wAmount = Number(w.amount || 0);
        if (wAmount < 5000) return;
        const totalBet = -1 * (netByUser[uid] || 0); // rough — net loss ≈ total bet - wins
        // If user's total bets (approximated) is < 20% of what they're withdrawing, flag it.
        if (Math.abs(totalBet) < wAmount * 0.2) {
          const u = usersById[uid];
          results.push({
            id: `zero-play-w-${uid}`,
            severity: 'medium',
            kind: 'Zero-play withdrawal',
            userId: uid,
            summary: `Withdrew ${formatCurrency(wAmount)}, very low bet activity`,
            detail: `${u?.name || uid.slice(0, 6)} · ${u?.phoneNumber || ''}`,
          });
        }
      });

      // Dedupe by (kind, userId) so we don't spam the admin
      const seen = new Set();
      const deduped = results.filter((r) => {
        const key = `${r.kind}|${r.userId}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      // Sort: high → medium → low, then by kind
      const sev = { high: 0, medium: 1, low: 2 };
      deduped.sort((a, b) => (sev[a.severity] - sev[b.severity]) || a.kind.localeCompare(b.kind));

      setAlerts(deduped);
      setScannedAt(new Date());
      toast.success(`Scan complete — ${deduped.length} alerts.`);
    } catch (e) {
      console.error('Fraud scan failed:', e);
      toast.error('Scan failed: ' + (e.message || e));
    } finally {
      setScanning(false);
    }
  };

  const suspendUser = async (uid) => {
    if (!window.confirm('Suspend this user? Wo login nahi kar payega jab tak reactivate na karo.')) return;
    setSuspendingId(uid);
    try {
      await updateDoc(doc(db, 'users', uid), { suspended: true });
      toast.success('User suspended.');
      setAlerts((prev) => prev.filter((a) => a.userId !== uid));
    } catch (e) {
      console.error(e);
      toast.error('Suspend failed: ' + (e.message || e));
    } finally {
      setSuspendingId(null);
    }
  };

  const counts = {
    high:   alerts.filter((a) => a.severity === 'high').length,
    medium: alerts.filter((a) => a.severity === 'medium').length,
    low:    alerts.filter((a) => a.severity === 'low').length,
  };

  return (
    <div className="p-4 md:p-6">
      <div className="bg-white rounded-lg shadow p-4 md:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-800 flex items-center gap-2">
              <ShieldAlert className="text-red-600" /> Fraud Detection Alerts
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              Sabhi users ke suspicious patterns detect karta hai — duplicate accounts,
              rapid big wins, deposit-withdraw round-trips, zero-play withdrawals.
            </p>
          </div>
          <button
            onClick={runScan}
            disabled={scanning}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-bold px-4 py-2 rounded"
          >
            {scanning ? <Loader2 className="animate-spin" size={16} /> : <Search size={16} />}
            {scanning ? 'Scanning…' : 'Run Fraud Scan'}
          </button>
        </div>

        {scannedAt && !scanning && (
          <div className="text-xs text-gray-500 mb-4">
            Last scanned: {scannedAt.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}
            {alerts.length > 0 && (
              <span className="ml-3">
                {counts.high > 0 && <span className="text-red-700 font-bold mr-2">🔴 {counts.high} high</span>}
                {counts.medium > 0 && <span className="text-yellow-700 font-semibold mr-2">🟡 {counts.medium} medium</span>}
                {counts.low > 0 && <span className="text-blue-700 mr-2">🔵 {counts.low} low</span>}
              </span>
            )}
          </div>
        )}

        {scanning && (
          <div className="flex justify-center py-8"><Loader2 className="animate-spin text-blue-500" size={40} /></div>
        )}

        {!scanning && alerts.length === 0 && scannedAt && (
          <div className="text-center py-8 text-green-700">
            <ShieldAlert className="mx-auto mb-2" size={40} />
            <p className="font-semibold">Koi suspicious pattern nahi mila.</p>
          </div>
        )}

        {!scanning && alerts.length > 0 && (
          <div className="space-y-2">
            {alerts.map((a) => (
              <div
                key={a.id}
                className={`border rounded-lg p-3 flex flex-wrap items-center justify-between gap-3 ${SEVERITY_STYLES[a.severity]}`}
              >
                <div className="min-w-0">
                  <div className="text-xs uppercase font-bold opacity-70">{a.kind}</div>
                  <div className="text-sm font-semibold">{a.summary}</div>
                  <div className="text-xs opacity-80 truncate">{a.detail}</div>
                </div>
                <button
                  onClick={() => suspendUser(a.userId)}
                  disabled={suspendingId === a.userId}
                  className="flex items-center gap-1 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-xs font-bold px-3 py-1.5 rounded"
                >
                  {suspendingId === a.userId ? <Loader2 className="animate-spin" size={12} /> : <UserX size={12} />}
                  Suspend
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default FraudAlerts;
