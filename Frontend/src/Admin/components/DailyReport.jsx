import React, { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where, orderBy } from 'firebase/firestore';
import { Download, Calendar } from 'lucide-react';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatMoney';
import { toDateValue } from '../../utils/dateHelpers';

// "Today" / arbitrary-day report. Pulls every approved deposit, every
// admin manual credit, every approved withdrawal for the chosen date,
// joins them against the users collection, and shows a per-user roll-up
// with the 10% commission each user's referrer earned that day.

function ymdInIst(date) {
  // Format a JS Date as YYYY-MM-DD in Asia/Kolkata so the date filter
  // matches what an Indian admin expects.
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  return fmt.format(date);
}

function startEndOfIstDay(ymdString) {
  // Parse "YYYY-MM-DD" and return [start, end] as Date objects in UTC
  // representing 00:00 IST → 23:59:59.999 IST of that day.
  const [y, m, d] = ymdString.split('-').map(Number);
  // IST is UTC+05:30, so 00:00 IST == 18:30 UTC of the previous day.
  const startUtcMs = Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 60 * 60 * 1000;
  const endUtcMs = startUtcMs + 24 * 60 * 60 * 1000 - 1;
  return [new Date(startUtcMs), new Date(endUtcMs)];
}

const REFERRAL_RATE = 0.10;

export default function DailyReport({ allPayments = [], allWithdrawals = [] } = {}) {
  const [selectedDate, setSelectedDate] = useState(() => ymdInIst(new Date()));
  const [users, setUsers] = useState({});
  const [adminCredits, setAdminCredits] = useState([]);

  // Live user lookup (id → { name, phoneNumber, referredBy })
  useEffect(() => {
    const q = query(collection(db, 'users'), where('appName', '==', 'truewin'));
    const unsub = onSnapshot(q, (snap) => {
      const map = {};
      snap.docs.forEach((d) => {
        const data = d.data();
        map[d.id] = {
          name: data.name || null,
          phoneNumber: data.phoneNumber || null,
          referredBy: data.referredBy || null,
        };
      });
      setUsers(map);
    });
    return () => unsub();
  }, []);

  // Manual offline deposits via Adjust Wallet.
  useEffect(() => {
    const q = query(
      collection(db, 'transactions'),
      where('type', '==', 'admin_credit')
    );
    const unsub = onSnapshot(
      q,
      (snap) => setAdminCredits(snap.docs.map((d) => ({ id: d.id, ...d.data() }))),
      () => setAdminCredits([])
    );
    return () => unsub();
  }, []);

  const [start, end] = useMemo(() => startEndOfIstDay(selectedDate), [selectedDate]);
  const inRange = (value) => {
    const t = toDateValue(value)?.getTime?.();
    if (!Number.isFinite(t)) return false;
    return t >= start.getTime() && t <= end.getTime();
  };

  const todaysApprovedPayments = useMemo(
    () => allPayments.filter((p) => p.status === 'approved' && inRange(p.createdAt)),
    [allPayments, start, end]
  );
  const todaysApprovedWithdrawals = useMemo(
    () => allWithdrawals.filter((w) => w.status === 'approved' && inRange(w.createdAt)),
    [allWithdrawals, start, end]
  );
  const todaysAdminCredits = useMemo(
    // Only count balance-field admin credits as "deposits" — debits
    // and winningMoney touch-ups don't count toward referral commission.
    () => adminCredits.filter(
      (a) => a.field === 'balance' && Number(a.amount) > 0 && inRange(a.createdAt),
    ),
    [adminCredits, start, end]
  );

  const perUser = useMemo(() => {
    const ensure = (uid) => {
      if (!perUserData[uid]) {
        perUserData[uid] = {
          uid,
          depositTotal: 0,
          depositCount: 0,
          onlineDeposit: 0,
          offlineDeposit: 0,
          withdrawalTotal: 0,
          withdrawalCount: 0,
          commissionEarned: 0,
        };
      }
      return perUserData[uid];
    };
    const perUserData = {};

    for (const p of todaysApprovedPayments) {
      const uid = p.userId;
      if (!uid) continue;
      const row = ensure(uid);
      const amount = Number(p.amount) || 0;
      row.depositTotal += amount;
      row.depositCount += 1;
      row.onlineDeposit += amount;
      // Commission to referrer.
      const referrerId = users[uid]?.referredBy;
      if (referrerId) {
        ensure(referrerId).commissionEarned += amount * REFERRAL_RATE;
      }
    }

    for (const c of todaysAdminCredits) {
      const uid = c.userId;
      if (!uid) continue;
      const row = ensure(uid);
      const amount = Number(c.amount) || 0;
      row.depositTotal += amount;
      row.depositCount += 1;
      row.offlineDeposit += amount;
      const referrerId = users[uid]?.referredBy;
      if (referrerId) {
        ensure(referrerId).commissionEarned += amount * REFERRAL_RATE;
      }
    }

    for (const w of todaysApprovedWithdrawals) {
      const uid = w.userId;
      if (!uid) continue;
      const row = ensure(uid);
      row.withdrawalTotal += Number(w.amount) || 0;
      row.withdrawalCount += 1;
    }

    return Object.values(perUserData).map((row) => ({
      ...row,
      net: row.depositTotal - row.withdrawalTotal,
      commissionEarned: Math.round(row.commissionEarned * 100) / 100,
      depositTotal: Math.round(row.depositTotal * 100) / 100,
      withdrawalTotal: Math.round(row.withdrawalTotal * 100) / 100,
      onlineDeposit: Math.round(row.onlineDeposit * 100) / 100,
      offlineDeposit: Math.round(row.offlineDeposit * 100) / 100,
    }));
  }, [todaysApprovedPayments, todaysApprovedWithdrawals, todaysAdminCredits, users]);

  const sortedRows = useMemo(
    () =>
      [...perUser].sort(
        (a, b) =>
          (b.depositTotal + b.commissionEarned + b.withdrawalTotal) -
          (a.depositTotal + a.commissionEarned + a.withdrawalTotal),
      ),
    [perUser]
  );

  const stats = useMemo(() => {
    let depositTotal = 0;
    let onlineDeposit = 0;
    let offlineDeposit = 0;
    let withdrawalTotal = 0;
    let commissionTotal = 0;
    for (const r of perUser) {
      depositTotal += r.depositTotal;
      onlineDeposit += r.onlineDeposit;
      offlineDeposit += r.offlineDeposit;
      withdrawalTotal += r.withdrawalTotal;
      commissionTotal += r.commissionEarned;
    }
    return {
      depositTotal: Math.round(depositTotal * 100) / 100,
      onlineDeposit: Math.round(onlineDeposit * 100) / 100,
      offlineDeposit: Math.round(offlineDeposit * 100) / 100,
      withdrawalTotal: Math.round(withdrawalTotal * 100) / 100,
      net: Math.round((depositTotal - withdrawalTotal) * 100) / 100,
      commissionTotal: Math.round(commissionTotal * 100) / 100,
      activeUsers: perUser.length,
    };
  }, [perUser]);

  const exportCsv = () => {
    const header = [
      'Name',
      'Phone',
      'Referrer Name',
      'Referrer Phone',
      'Deposits Count',
      'Online Deposit',
      'Offline Deposit',
      'Total Deposits',
      'Withdrawals Count',
      'Total Withdrawals',
      'Net Flow',
      'Commission Earned',
    ];
    const escape = (v) => {
      const s = String(v ?? '');
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"`
        : s;
    };
    const lines = [header.join(',')];
    for (const r of sortedRows) {
      const u = users[r.uid] || {};
      const ref = u.referredBy ? users[u.referredBy] : null;
      lines.push([
        u.name || '',
        u.phoneNumber || '',
        ref?.name || '',
        ref?.phoneNumber || '',
        r.depositCount,
        r.onlineDeposit,
        r.offlineDeposit,
        r.depositTotal,
        r.withdrawalCount,
        r.withdrawalTotal,
        r.net,
        r.commissionEarned,
      ].map(escape).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `truewin-report-${selectedDate}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 space-y-6">
      <div className="bg-white rounded-lg shadow-sm p-6">
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 justify-between">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">Daily Report</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Per-user activity for the selected date (in IST). Shows online deposits,
              offline (admin) deposits, withdrawals, and the 10% referral commission
              each user earned from their referrals' deposits.
            </p>
          </div>
          <div className="flex items-end gap-2">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Date</label>
              <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                <input
                  type="date"
                  value={selectedDate}
                  onChange={(e) => setSelectedDate(e.target.value)}
                  max={ymdInIst(new Date())}
                  className="pl-9 pr-3 py-2 border rounded-lg text-sm"
                />
              </div>
            </div>
            <button
              onClick={() => setSelectedDate(ymdInIst(new Date()))}
              className="px-3 py-2 text-xs font-semibold border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
            >Today</button>
            <button
              onClick={exportCsv}
              disabled={sortedRows.length === 0}
              className="inline-flex items-center gap-1 px-3 py-2 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              <Download className="h-4 w-4" /> Export CSV
            </button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3 mt-4">
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-green-700">Total Deposits</p>
            <p className="text-xl font-bold text-green-900">{formatCurrency(stats.depositTotal)}</p>
            <p className="text-[10px] text-green-700">
              Online {formatCurrency(stats.onlineDeposit)} · Offline {formatCurrency(stats.offlineDeposit)}
            </p>
          </div>
          <div className="bg-red-50 border border-red-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-red-700">Total Withdrawals</p>
            <p className="text-xl font-bold text-red-900">{formatCurrency(stats.withdrawalTotal)}</p>
          </div>
          <div className={`rounded-lg p-3 border ${stats.net >= 0 ? 'bg-blue-50 border-blue-200' : 'bg-orange-50 border-orange-200'}`}>
            <p className="text-[10px] uppercase tracking-wider text-gray-700">Net Flow</p>
            <p className={`text-xl font-bold ${stats.net >= 0 ? 'text-blue-900' : 'text-orange-900'}`}>
              {stats.net >= 0 ? '+' : ''}{formatCurrency(stats.net)}
            </p>
          </div>
          <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
            <p className="text-[10px] uppercase tracking-wider text-purple-700">Commission Owed</p>
            <p className="text-xl font-bold text-purple-900">{formatCurrency(stats.commissionTotal)}</p>
            <p className="text-[10px] text-purple-700">10% of deposits</p>
          </div>
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 col-span-2 sm:col-span-1">
            <p className="text-[10px] uppercase tracking-wider text-yellow-700">Active Users</p>
            <p className="text-xl font-bold text-yellow-900">{stats.activeUsers}</p>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3 font-semibold text-gray-700">User</th>
                <th className="text-left p-3 font-semibold text-gray-700">Phone</th>
                <th className="text-left p-3 font-semibold text-gray-700">Referrer</th>
                <th className="text-right p-3 font-semibold text-gray-700">Deposits</th>
                <th className="text-right p-3 font-semibold text-gray-700">Withdrawals</th>
                <th className="text-right p-3 font-semibold text-gray-700">Net</th>
                <th className="text-right p-3 font-semibold text-gray-700">Commission Earned</th>
              </tr>
            </thead>
            <tbody>
              {sortedRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-6 text-center text-gray-500">
                    No activity on {selectedDate}.
                  </td>
                </tr>
              ) : sortedRows.map((row) => {
                const u = users[row.uid] || {};
                const ref = u.referredBy ? users[u.referredBy] : null;
                return (
                  <tr key={row.uid} className="border-b last:border-b-0 hover:bg-gray-50">
                    <td className="p-3 font-medium text-gray-900">
                      {u.name || row.uid.slice(0, 8)}
                    </td>
                    <td className="p-3 text-gray-600">{u.phoneNumber || '-'}</td>
                    <td className="p-3 text-gray-600">
                      {ref ? (
                        <span>
                          {ref.name || '(unnamed)'}
                          {ref.phoneNumber ? <span className="text-gray-400 text-xs"> · {ref.phoneNumber.replace('+91','')}</span> : null}
                        </span>
                      ) : (
                        <span className="text-gray-400 italic">-</span>
                      )}
                    </td>
                    <td className="p-3 text-right">
                      {row.depositTotal > 0 ? (
                        <div>
                          <span className="font-semibold text-green-700">+{formatCurrency(row.depositTotal)}</span>
                          <span className="block text-[10px] text-gray-500">
                            {row.depositCount} txn{row.depositCount > 1 ? 's' : ''}
                            {row.offlineDeposit > 0 ? ` · ${formatCurrency(row.offlineDeposit)} offline` : ''}
                          </span>
                        </div>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className="p-3 text-right">
                      {row.withdrawalTotal > 0 ? (
                        <div>
                          <span className="font-semibold text-red-700">-{formatCurrency(row.withdrawalTotal)}</span>
                          <span className="block text-[10px] text-gray-500">
                            {row.withdrawalCount} txn{row.withdrawalCount > 1 ? 's' : ''}
                          </span>
                        </div>
                      ) : <span className="text-gray-400">-</span>}
                    </td>
                    <td className={`p-3 text-right font-semibold ${row.net >= 0 ? 'text-blue-700' : 'text-orange-700'}`}>
                      {row.net >= 0 ? '+' : ''}{formatCurrency(row.net)}
                    </td>
                    <td className="p-3 text-right">
                      {row.commissionEarned > 0 ? (
                        <span className="font-semibold text-purple-700">+{formatCurrency(row.commissionEarned)}</span>
                      ) : <span className="text-gray-400">-</span>}
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
