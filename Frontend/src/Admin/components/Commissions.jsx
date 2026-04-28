import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, doc, getDoc,
  updateDoc, serverTimestamp, orderBy,
} from 'firebase/firestore';
import { Check, RotateCcw, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import { db } from '../../firebase';
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

export default function Commissions() {
  const [commissions, setCommissions] = useState([]);
  const [userMap, setUserMap] = useState({});       // uid → { name, phoneNumber }
  const [statusFilter, setStatusFilter] = useState('pending');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [busyIds, setBusyIds] = useState(() => new Set());

  // Live subscribe to commissions ledger.
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

  // Lazy-fetch user names/phones for referrer + depositor.
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

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return commissions.filter((c) => {
      if (statusFilter !== 'all' && (c.status || 'pending') !== statusFilter) return false;
      if (!term) return true;
      const ref = userMap[c.referrerId] || {};
      const dep = userMap[c.depositorId] || {};
      const haystack = [
        ref.name, ref.phoneNumber,
        dep.name, dep.phoneNumber, c.depositorName,
      ].filter(Boolean).map((s) => String(s).toLowerCase()).join(' ');
      return haystack.includes(term);
    });
  }, [commissions, userMap, statusFilter, search]);

  const stats = useMemo(() => {
    let pendingTotal = 0;
    let paidTotal = 0;
    commissions.forEach((c) => {
      const amount = Number(c.commissionAmount) || 0;
      if (c.status === 'paid') paidTotal += amount;
      else if (!c.status || c.status === 'pending') pendingTotal += amount;
    });
    return { pendingTotal, paidTotal, total: pendingTotal + paidTotal };
  }, [commissions]);

  const setBusy = (id, busy) => {
    setBusyIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(id); else next.delete(id);
      return next;
    });
  };

  const markPaid = async (commission) => {
    if (busyIds.has(commission.id)) return;
    if (!window.confirm(
      `Mark ₹${Number(commission.commissionAmount).toFixed(2)} commission as PAID? ` +
      `(this only updates the ledger — you should pay the user manually first)`
    )) return;
    setBusy(commission.id, true);
    try {
      await updateDoc(doc(db, 'commissions', commission.id), {
        status: 'paid',
        paidAt: serverTimestamp(),
      });
      toast.success('Marked as paid');
    } catch (err) {
      console.error(err);
      toast.error('Failed: ' + (err.message || 'unknown'));
    } finally {
      setBusy(commission.id, false);
    }
  };

  const markPending = async (commission) => {
    if (busyIds.has(commission.id)) return;
    if (!window.confirm('Move this commission back to PENDING?')) return;
    setBusy(commission.id, true);
    try {
      await updateDoc(doc(db, 'commissions', commission.id), {
        status: 'pending',
        paidAt: null,
      });
      toast.success('Moved back to pending');
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
            Each approved deposit pays the depositor's direct referrer 10% as a commission.
            Mark each entry as paid once you've actually paid the user.
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
                  {search ? 'No commissions match your search.' : 'No commissions in this view.'}
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
                      {status === 'pending' && (
                        <button
                          onClick={() => markPaid(c)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-green-600 text-white text-xs font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
                        >
                          <Check className="h-3.5 w-3.5" /> Mark Paid
                        </button>
                      )}
                      {status === 'paid' && (
                        <button
                          onClick={() => markPending(c)}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-200 text-gray-700 text-xs font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50"
                          title="Undo — move back to pending"
                        >
                          <RotateCcw className="h-3.5 w-3.5" /> Undo
                        </button>
                      )}
                      {status === 'voided' && (
                        <span className="text-xs text-gray-500 italic">No action</span>
                      )}
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
