import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, doc, getDoc,
  updateDoc, serverTimestamp, orderBy,
  runTransaction, addDoc,
} from 'firebase/firestore';
import { Check, RotateCcw, Search, X, Calendar } from 'lucide-react';
import { toast } from 'react-toastify';
import { db } from '../../firebase';
import useAuthStore from '../../store/authStore';
import { formatCurrency } from '../../utils/formatMoney';
import { toDateValue } from '../../utils/dateHelpers';

// 10% of the deposit amount goes to the direct referrer. One-tier
// only — A only gets commission on direct referrals (B), not on B's
// referrals (C).
const STATUS_FILTERS = [
  { id: 'pending', label: 'Pending' },
  { id: 'paid',    label: 'Paid' },
  { id: 'voided',  label: 'Voided' },
  { id: 'all',     label: 'All' },
];

// Commission credits land here on Mark Paid. winningMoney is
// withdrawable, balance is deposit-only — earned referral commission
// is closer in spirit to winnings.
const COMMISSION_CREDIT_FIELD = 'winningMoney';

const ymd = (d) => {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric', month: '2-digit', day: '2-digit',
  });
  return fmt.format(d);
};

export default function Commissions() {
  const [commissions, setCommissions] = useState([]);
  const [userMap, setUserMap] = useState({});
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [dateFilter, setDateFilter] = useState(''); // '' = all dates, else 'YYYY-MM-DD'
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(() => new Set());
  const adminUser = useAuthStore((s) => s.user);

  useEffect(() => {
    const q = query(collection(db, 'commissions'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setCommissions(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error('Failed to load commissions:', err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  useEffect(() => {
    const idsToFetch = new Set();
    commissions.forEach((c) => {
      if (c.referrerId && !userMap[c.referrerId]) idsToFetch.add(c.referrerId);
      if (c.depositorId && !userMap[c.depositorId]) idsToFetch.add(c.depositorId);
    });
    if (idsToFetch.size === 0) return;

    let cancelled = false;
    Promise.all(
      Array.from(idsToFetch).map(async (uid) => {
        try {
          const snap = await getDoc(doc(db, 'users', uid));
          return [uid, snap.exists() ? snap.data() : null];
        } catch { return [uid, null]; }
      })
    ).then((results) => {
      if (cancelled) return;
      setUserMap((prev) => {
        const next = { ...prev };
        for (const [uid, data] of results) {
          if (data) next[uid] = { name: data.name, phoneNumber: data.phoneNumber };
        }
        return next;
      });
    });
    return () => { cancelled = true; };
  }, [commissions, userMap]);

  const matchesDate = (createdAt) => {
    if (!dateFilter) return true;
    const d = toDateValue(createdAt);
    if (!d) return false;
    return ymd(d) === dateFilter;
  };

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return commissions.filter((c) => {
      if (statusFilter !== 'all' && (c.status || 'pending') !== statusFilter) return false;
      if (!matchesDate(c.createdAt)) return false;
      if (!term) return true;
      const ref = userMap[c.referrerId] || {};
      const dep = userMap[c.depositorId] || {};
      const haystack = [
        ref.name, ref.phoneNumber,
        dep.name, dep.phoneNumber, c.depositorName,
      ].filter(Boolean).map((s) => String(s).toLowerCase()).join(' ');
      return haystack.includes(term);
    });
  }, [commissions, userMap, statusFilter, search, dateFilter]);

  const stats = useMemo(() => {
    let pendingTotal = 0;
    let paidTotal = 0;
    let voidedTotal = 0;
    // Stats reflect the current filter (date) so admin sees totals for
    // whatever date they picked.
    commissions.forEach((c) => {
      if (!matchesDate(c.createdAt)) return;
      const amount = Number(c.commissionAmount) || 0;
      if (c.status === 'paid') paidTotal += amount;
      else if (c.status === 'voided') voidedTotal += amount;
      else pendingTotal += amount;
    });
    return { pendingTotal, paidTotal, voidedTotal, total: pendingTotal + paidTotal };
  }, [commissions, dateFilter]);

  const setBusy = (id, busy) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  // Mark Paid → credit referrer's winningMoney AND set status='paid'
  // atomically inside a transaction. Idempotent: if a previous click
  // already paid this commission, the transaction is a no-op.
  const markPaid = async (commission) => {
    if (busyIds.has(commission.id)) return;
    const refUser = userMap[commission.referrerId];
    const refLabel = refUser?.name || commission.referrerId.slice(0, 8);
    const amount = Number(commission.commissionAmount) || 0;
    if (!window.confirm(
      `Mark ${formatCurrency(amount)} as PAID and credit it to ${refLabel}'s winning money?\n\n` +
      `Yeh withdrawable hoga — referrer apne wallet se withdraw kar sakta hai.`
    )) return;

    setBusy(commission.id, true);
    try {
      let alreadyPaid = false;
      await runTransaction(db, async (tx) => {
        const commissionRef = doc(db, 'commissions', commission.id);
        const userRef = doc(db, 'users', commission.referrerId);
        const cSnap = await tx.get(commissionRef);
        if (!cSnap.exists()) throw new Error('Commission not found');
        const cur = cSnap.data();
        if (cur.status === 'paid') {
          alreadyPaid = true;
          return;
        }
        const uSnap = await tx.get(userRef);
        if (!uSnap.exists()) throw new Error('Referrer user not found');
        const userData = uSnap.data();
        const currentAmount = Number(userData[COMMISSION_CREDIT_FIELD] || 0);
        const next = Math.round((currentAmount + amount) * 100) / 100;
        tx.update(commissionRef, {
          status: 'paid',
          paidAt: serverTimestamp(),
          paidByAdminId: adminUser?.uid || null,
          paidByAdminName: adminUser?.name || null,
        });
        tx.update(userRef, {
          [COMMISSION_CREDIT_FIELD]: next,
          lastActiveAt: serverTimestamp(),
        });
      });

      if (alreadyPaid) {
        toast.info('Already marked as paid.');
      } else {
        // Audit log so the credit shows up in the referrer's transaction history.
        try {
          await addDoc(collection(db, 'transactions'), {
            userId: commission.referrerId,
            userName: refUser?.name || null,
            type: 'referral_commission_paid',
            field: COMMISSION_CREDIT_FIELD,
            amount,
            commissionId: commission.id,
            depositorId: commission.depositorId,
            depositorName: commission.depositorName || null,
            createdAt: new Date(),
          });
        } catch { /* non-fatal */ }
        toast.success(`Credited ${formatCurrency(amount)} to ${refLabel}.`);
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed: ' + (err.message || 'unknown'));
    } finally {
      setBusy(commission.id, false);
    }
  };

  // Reject / Void — sets status='voided', no wallet impact.
  const rejectCommission = async (commission) => {
    if (busyIds.has(commission.id)) return;
    const status = commission.status || 'pending';
    if (status === 'paid') {
      toast.error('Already paid commission can\'t be rejected. Use Undo to debit and reset.');
      return;
    }
    if (!window.confirm(
      `Reject this commission of ${formatCurrency(commission.commissionAmount)}? ` +
      `Status will be marked VOIDED. No wallet credit will happen.`
    )) return;
    setBusy(commission.id, true);
    try {
      await updateDoc(doc(db, 'commissions', commission.id), {
        status: 'voided',
        rejectedAt: serverTimestamp(),
        rejectedByAdminId: adminUser?.uid || null,
        rejectedByAdminName: adminUser?.name || null,
      });
      toast.success('Marked as voided.');
    } catch (err) {
      console.error(err);
      toast.error('Failed: ' + (err.message || 'unknown'));
    } finally {
      setBusy(commission.id, false);
    }
  };

  // Undo — moves a Paid or Voided entry back to Pending. If it was
  // Paid, debit the wallet credit back so the books stay balanced.
  const undoCommission = async (commission) => {
    if (busyIds.has(commission.id)) return;
    const status = commission.status || 'pending';
    if (status === 'pending') return;
    const wasPaid = status === 'paid';
    const amount = Number(commission.commissionAmount) || 0;
    if (!window.confirm(
      wasPaid
        ? `Undo this PAID commission?\n\n${formatCurrency(amount)} will be DEBITED back from the referrer's winning money, and status will return to Pending.`
        : 'Move this commission back to Pending?'
    )) return;

    setBusy(commission.id, true);
    try {
      await runTransaction(db, async (tx) => {
        const commissionRef = doc(db, 'commissions', commission.id);
        const userRef = doc(db, 'users', commission.referrerId);
        const cSnap = await tx.get(commissionRef);
        if (!cSnap.exists()) throw new Error('Commission not found');
        const cur = cSnap.data();
        if (cur.status !== 'paid' && cur.status !== 'voided') return;

        if (cur.status === 'paid') {
          const uSnap = await tx.get(userRef);
          if (!uSnap.exists()) throw new Error('Referrer user not found');
          const currentAmount = Number(uSnap.data()[COMMISSION_CREDIT_FIELD] || 0);
          const next = Math.max(0, Math.round((currentAmount - amount) * 100) / 100);
          tx.update(userRef, {
            [COMMISSION_CREDIT_FIELD]: next,
            lastActiveAt: serverTimestamp(),
          });
        }

        tx.update(commissionRef, {
          status: 'pending',
          paidAt: null,
        });
      });

      if (wasPaid) {
        try {
          await addDoc(collection(db, 'transactions'), {
            userId: commission.referrerId,
            type: 'referral_commission_reversed',
            field: COMMISSION_CREDIT_FIELD,
            amount: -amount,
            commissionId: commission.id,
            createdAt: new Date(),
          });
        } catch { /* non-fatal */ }
      }
      toast.success('Moved back to pending.');
    } catch (err) {
      console.error(err);
      toast.error('Failed: ' + (err.message || 'unknown'));
    } finally {
      setBusy(commission.id, false);
    }
  };

  const userLabel = (uid, fallbackName) => {
    const u = userMap[uid];
    if (!u) return fallbackName || uid?.slice(0, 8) || 'Unknown';
    const phone = u.phoneNumber ? ` (${u.phoneNumber.replace('+91', '')})` : '';
    return `${u.name || fallbackName || 'Unknown'}${phone}`;
  };

  const statusBadge = (status) => {
    const normalised = status || 'pending';
    const map = {
      pending: 'bg-yellow-100 text-yellow-800',
      paid:    'bg-green-100 text-green-800',
      voided:  'bg-gray-200 text-gray-700',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-[11px] font-bold uppercase ${map[normalised] || map.pending}`}>
        {normalised}
      </span>
    );
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Referral Commissions</h3>
          <p className="text-sm text-gray-500 mt-1">
            Each approved deposit gives the depositor's direct referrer 10% as a commission.
            Mark Paid → credit's referrer's winning money (withdrawable). Reject → void without
            crediting. Undo → reverse the credit (or restore voided to pending).
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
            <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-yellow-700">Pending</p>
              <p className="text-2xl font-bold text-yellow-900">{formatCurrency(stats.pendingTotal)}</p>
            </div>
            <div className="bg-green-50 border border-green-200 rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-green-700">Paid</p>
              <p className="text-2xl font-bold text-green-900">{formatCurrency(stats.paidTotal)}</p>
            </div>
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
              <p className="text-xs uppercase tracking-wider text-blue-700">Total accrued</p>
              <p className="text-2xl font-bold text-blue-900">{formatCurrency(stats.total)}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-3 mt-4">
            <div className="flex flex-wrap gap-2">
              {STATUS_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => setStatusFilter(f.id)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold transition-colors ${
                    statusFilter === f.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >{f.label}</button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <div className="relative">
                <Calendar className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={dateFilter}
                  onChange={(e) => setDateFilter(e.target.value)}
                  max={ymd(new Date())}
                  className="pl-8 pr-2 py-1.5 border rounded-lg text-xs"
                  title="Filter by date"
                />
              </div>
              {dateFilter && (
                <button
                  onClick={() => setDateFilter('')}
                  className="text-xs text-gray-600 hover:text-gray-900 underline"
                >Clear date</button>
              )}
            </div>
            <div className="relative sm:ml-auto sm:w-72">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search referrer or depositor…"
                className="w-full pl-9 pr-3 py-2 border rounded-lg text-sm"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 text-sm font-semibold">Referrer (gets paid)</th>
                <th className="text-left p-4 text-sm font-semibold">Depositor</th>
                <th className="text-right p-4 text-sm font-semibold">Deposit</th>
                <th className="text-right p-4 text-sm font-semibold">Commission</th>
                <th className="text-left p-4 text-sm font-semibold">Date</th>
                <th className="text-left p-4 text-sm font-semibold">Status</th>
                <th className="text-left p-4 text-sm font-semibold">Action</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">Loading…</td></tr>
              ) : filtered.length === 0 ? (
                <tr><td colSpan={7} className="p-6 text-center text-gray-500">
                  {search || dateFilter ? 'No commissions match your filters.' : 'No commissions in this view.'}
                </td></tr>
              ) : filtered.map((c) => {
                const date = toDateValue(c.createdAt);
                const status = c.status || 'pending';
                const busy = busyIds.has(c.id);
                return (
                  <tr key={c.id} className="border-b hover:bg-gray-50">
                    <td className="p-4 text-sm font-medium text-gray-900">
                      {userLabel(c.referrerId)}
                    </td>
                    <td className="p-4 text-sm text-gray-700">
                      {userLabel(c.depositorId, c.depositorName)}
                    </td>
                    <td className="p-4 text-sm text-right">{formatCurrency(c.depositAmount)}</td>
                    <td className="p-4 text-sm text-right font-bold text-green-700">
                      {formatCurrency(c.commissionAmount)}
                      <span className="block text-[10px] text-gray-400 font-normal">
                        @ {((c.rate || 0.1) * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="p-4 text-xs text-gray-500">
                      {date ? date.toLocaleDateString('en-IN') : 'N/A'}
                    </td>
                    <td className="p-4">{statusBadge(status)}</td>
                    <td className="p-4">
                      <div className="flex flex-wrap gap-1">
                        {status === 'pending' && (
                          <>
                            <button
                              onClick={() => markPaid(c)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                            >
                              <Check className="h-3.5 w-3.5" /> Mark Paid
                            </button>
                            <button
                              onClick={() => rejectCommission(c)}
                              disabled={busy}
                              className="inline-flex items-center gap-1 px-3 py-1.5 bg-red-600 text-white text-xs font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50"
                            >
                              <X className="h-3.5 w-3.5" /> Reject
                            </button>
                          </>
                        )}
                        {(status === 'paid' || status === 'voided') && (
                          <button
                            onClick={() => undoCommission(c)}
                            disabled={busy}
                            className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50"
                            title={status === 'paid' ? 'Reverse the wallet credit and move back to pending' : 'Restore to pending'}
                          >
                            <RotateCcw className="h-3.5 w-3.5" /> Undo
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
