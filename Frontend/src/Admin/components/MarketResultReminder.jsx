// Dashboard widget: at-a-glance "which markets need a result declared".
//
// For every market in marketData, loads its market_timings/{market}
// (openTime + closeTime in HH:MM IST) and today's declared result
// from /results (if any). Then per market computes:
//
//   • Result already declared today  → ✅ Done
//   • Close time > 30 min away       → 🕐 Upcoming
//   • Close time < 30 min away       → 🟡 Closing soon
//   • Close time passed, no result   → 🔴 Overdue — declare NOW
//
// Widget refreshes every 30 sec on its own so admin doesn't have
// to reload the dashboard to see the state shift.

import React, { useEffect, useState } from 'react';
import { collection, getDocs, doc, getDoc, query, where, Timestamp } from 'firebase/firestore';
import { db } from '../../firebase';
import { markets as allMarkets } from '../../marketData';
import { Clock, AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';

// IST today's YYYY-MM-DD
const istToday = () => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date());

// Parse "HH:MM" → minutes since IST midnight
const hhmmToMin = (s) => {
  if (!s || typeof s !== 'string') return null;
  const [h, m] = s.split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  return h * 60 + m;
};

// Current IST time in minutes since midnight
const istNowMin = () => {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date());
  const h = Number(parts.find((p) => p.type === 'hour')?.value || 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value || 0);
  return h * 60 + m;
};

const MarketResultReminder = () => {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshTick, setRefreshTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const marketNames = allMarkets.map((m) => m.name);
        const ymd = istToday();
        const todayStart = new Date(`${ymd}T00:00:00+05:30`);
        const todayEnd   = new Date(`${ymd}T23:59:59+05:30`);

        const [timingsResults, resultsSnap] = await Promise.all([
          Promise.all(marketNames.map(async (name) => {
            try {
              const s = await getDoc(doc(db, 'market_timings', name));
              return [name, s.exists() ? s.data() : {}];
            } catch { return [name, {}]; }
          })),
          getDocs(query(
            collection(db, 'results'),
            where('date', '>=', Timestamp.fromDate(todayStart)),
            where('date', '<=', Timestamp.fromDate(todayEnd)),
          )),
        ]);
        if (cancelled) return;

        const timingsByMarket = Object.fromEntries(timingsResults);
        const declaredToday = new Set();
        resultsSnap.docs.forEach((d) => {
          const m = d.data()?.marketName;
          if (m) declaredToday.add(m);
        });

        const nowMin = istNowMin();
        const built = marketNames.map((name) => {
          const t = timingsByMarket[name] || {};
          const closeMin = hhmmToMin(t.closeTime);
          const openMin = hhmmToMin(t.openTime);
          const declared = declaredToday.has(name);
          let status = 'unknown';
          let minsUntilClose = null;
          if (declared) status = 'done';
          else if (closeMin != null) {
            minsUntilClose = closeMin - nowMin;
            if (minsUntilClose < 0) status = 'overdue';
            else if (minsUntilClose <= 30) status = 'closing';
            else status = 'upcoming';
          }
          return {
            name,
            openTime: t.openTime || '—',
            closeTime: t.closeTime || '—',
            openMin,
            closeMin,
            minsUntilClose,
            status,
          };
        });

        // Sort: overdue first, then closing, then upcoming, then done, then unknown
        const rank = { overdue: 0, closing: 1, upcoming: 2, unknown: 3, done: 4 };
        built.sort((a, b) => {
          const ra = rank[a.status] ?? 9;
          const rb = rank[b.status] ?? 9;
          if (ra !== rb) return ra - rb;
          return (a.closeMin ?? 9999) - (b.closeMin ?? 9999);
        });

        setRows(built);
      } catch (e) {
        console.error('MarketResultReminder load failed:', e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [refreshTick]);

  // Auto-refresh every 30 sec so status shifts (upcoming → closing →
  // overdue) show up without a manual reload.
  useEffect(() => {
    const iv = setInterval(() => setRefreshTick((n) => n + 1), 30 * 1000);
    return () => clearInterval(iv);
  }, []);

  const overdueCount = rows.filter((r) => r.status === 'overdue').length;
  const closingCount = rows.filter((r) => r.status === 'closing').length;

  return (
    <div className="bg-white rounded-lg shadow p-4 md:p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold text-gray-800 flex items-center gap-2">
          <Clock size={18} className="text-blue-600" />
          Aaj ke Result Reminders
        </h3>
        <div className="text-xs text-gray-500">
          {overdueCount > 0 && <span className="text-red-700 font-bold mr-2">🔴 {overdueCount} overdue</span>}
          {closingCount > 0 && <span className="text-yellow-700 font-semibold mr-2">🟡 {closingCount} closing soon</span>}
          Auto-refresh: 30 sec
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-6"><Loader2 className="animate-spin text-blue-500" size={24} /></div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
          {rows.map((r) => {
            const badge =
              r.status === 'done' ? { color: 'bg-green-100 border-green-300 text-green-800', label: '✅ Done' } :
              r.status === 'overdue' ? { color: 'bg-red-100 border-red-400 text-red-800', label: `🔴 Overdue by ${Math.abs(r.minsUntilClose)} min` } :
              r.status === 'closing' ? { color: 'bg-yellow-100 border-yellow-400 text-yellow-800', label: `🟡 Close in ${r.minsUntilClose} min` } :
              r.status === 'upcoming' ? { color: 'bg-blue-50 border-blue-200 text-blue-800', label: `🕐 Close in ${r.minsUntilClose} min` } :
              { color: 'bg-gray-50 border-gray-200 text-gray-500', label: 'No timings' };
            return (
              <div key={r.name} className={`border rounded-lg p-2.5 ${badge.color}`}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-bold text-sm">{r.name}</span>
                  {r.status === 'done' && <CheckCircle2 size={16} className="text-green-700" />}
                  {r.status === 'overdue' && <AlertCircle size={16} className="text-red-700" />}
                </div>
                <div className="text-[11px]">Open {r.openTime} · Close {r.closeTime}</div>
                <div className="text-[11px] font-semibold mt-0.5">{badge.label}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default MarketResultReminder;
