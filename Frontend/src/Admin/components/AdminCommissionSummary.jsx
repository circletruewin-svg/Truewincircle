import { useEffect, useMemo, useState } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatMoney';

// Today's IST date as a Date at midnight IST — used as the lower
// bound for our bet queries so we don't pull weeks of data.
const todayIstStart = () => {
  const todayKey = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${todayKey}T00:00:00+05:30`);
};

// Pulls every master with commissionPercent > 0, every bet placed
// today across the main game collections, walks the user→master
// mapping (from the truewinUserMap admin already subscribes to), and
// computes per-master P&L + the admin's commission cut.
//
// Designed to live BELOW the DashboardView so admin can see at a
// glance how much they're owed today without diving into individual
// master detail views.
export default function AdminCommissionSummary({ userMap }) {
  const [masters, setMasters] = useState([]);
  const [haruf, setHaruf] = useState([]);
  const [aviator, setAviator] = useState([]);
  const [sports, setSports] = useState([]);

  const [todayStart] = useState(todayIstStart);
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date());

  // Only the masters who actually have a commission rate set.
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'master'));
    return onSnapshot(q, (snap) => {
      const all = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      setMasters(all.filter((m) => Number(m.commissionPercent) > 0));
    }, () => setMasters([]));
  }, []);

  // Three parallel bet feeds — each is gated to today so we don't
  // pull historical data on every dashboard render.
  useEffect(() => {
    const q = query(collection(db, 'harufBets'),   where('timestamp', '>=', todayStart));
    return onSnapshot(q, (s) => setHaruf(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setHaruf([]));
  }, [todayStart]);
  useEffect(() => {
    const q = query(collection(db, 'aviatorBets'), where('createdAt', '>=', todayStart));
    return onSnapshot(q, (s) => setAviator(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAviator([]));
  }, [todayStart]);
  useEffect(() => {
    const q = query(collection(db, 'sportsBets'),  where('createdAt', '>=', todayStart));
    return onSnapshot(q, (s) => setSports(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSports([]));
  }, [todayStart]);

  // Per-master aggregation. We initialise a row for every commission-
  // bearing master so admin still sees them even on a zero-bet day.
  const summary = useMemo(() => {
    const rows = masters.map((m) => ({
      id: m.id,
      name: m.name || '—',
      phone: m.phoneNumber || '',
      pct: Number(m.commissionPercent) || 0,
      bet: 0,
      won: 0,
    }));
    const byId = new Map(rows.map((r) => [r.id, r]));

    const tally = (bet) => {
      const u = userMap?.[bet.userId];
      const mid = u?.assignedMasterId;
      const row = mid && byId.get(mid);
      if (!row) return;
      row.bet += Number(bet.betAmount || 0);
      row.won += Number(bet.winAmount || 0);
    };
    haruf.forEach(tally);
    aviator.forEach(tally);
    sports.forEach(tally);

    return rows.map((r) => {
      const net = r.bet - r.won;
      const cut = net > 0 ? Math.round(net * (r.pct / 100) * 100) / 100 : 0;
      return { ...r, net, cut };
    }).sort((a, b) => b.cut - a.cut);
  }, [masters, haruf, aviator, sports, userMap]);

  const totalCut = summary.reduce((s, r) => s + r.cut, 0);
  const totalBet = summary.reduce((s, r) => s + r.bet, 0);
  const totalWon = summary.reduce((s, r) => s + r.won, 0);

  if (masters.length === 0) return null; // no commission masters → hide section entirely

  return (
    <div className="p-6 pt-0">
      <div className="bg-white rounded-2xl shadow border overflow-hidden">
        <div className="border-b px-5 py-4 flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h3 className="text-lg font-bold text-gray-800">💼 Today's commission earnings</h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Aaj ({todayLabel}) tumhare masters ke players ne kya khela — uska tumhara share.
            </p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Total cut today</p>
            <p className="text-3xl font-black text-blue-700">{formatCurrency(totalCut)}</p>
          </div>
        </div>

        <div className="grid grid-cols-3 divide-x">
          <div className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Total bet</p>
            <p className="text-xl font-bold text-blue-700">{formatCurrency(totalBet)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Paid out</p>
            <p className="text-xl font-bold text-rose-700">{formatCurrency(totalWon)}</p>
          </div>
          <div className="p-4 text-center">
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Net</p>
            <p className={`text-xl font-bold ${totalBet - totalWon >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCurrency(totalBet - totalWon)}
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[700px] text-sm">
            <thead className="bg-gray-50 border-b border-t text-[10px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Master</th>
                <th className="px-4 py-2 text-center">%</th>
                <th className="px-4 py-2 text-right">Bet</th>
                <th className="px-4 py-2 text-right">Won</th>
                <th className="px-4 py-2 text-right">Net</th>
                <th className="px-4 py-2 text-right">Your cut</th>
              </tr>
            </thead>
            <tbody>
              {summary.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-4 py-2 font-semibold">
                    {r.name}
                    {r.phone && <span className="block text-[11px] text-gray-500">{r.phone}</span>}
                  </td>
                  <td className="px-4 py-2 text-center">
                    <span className="bg-blue-100 text-blue-700 font-bold rounded-full px-2 py-0.5 text-[11px]">{r.pct}%</span>
                  </td>
                  <td className="px-4 py-2 text-right text-blue-700">{formatCurrency(r.bet)}</td>
                  <td className="px-4 py-2 text-right text-rose-700">{formatCurrency(r.won)}</td>
                  <td className={`px-4 py-2 text-right font-bold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(r.net)}
                  </td>
                  <td className="px-4 py-2 text-right font-black text-blue-700">{formatCurrency(r.cut)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="px-5 py-3 text-[11px] text-gray-500 border-t bg-gray-50">
          Sources: Haruf + Aviator + Cricket bets today (IST). Pending bets bet me count hote hain, settle hone pe won update hota hai. Pure-reseller masters (0%) yahan nahi dikhte — unka tumhara koi share nahi.
        </p>
      </div>
    </div>
  );
}
