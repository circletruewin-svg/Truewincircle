import { useEffect, useMemo, useState } from 'react';
import { addDoc, collection, onSnapshot, query, serverTimestamp, where } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../../firebase';
import { formatCurrency } from '../../utils/formatMoney';

// Mark a master's commission as collected for the day. Writes a
// masterLedger entry which both the commission summary and the
// master detail view subscribe to.
function MarkPaidModal({ row, onClose }) {
  const [amount, setAmount] = useState(String(row.pending || row.cut || 0));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error('Valid amount daalo.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'masterLedger'), {
        type: 'commission_paid',
        masterId: row.id,
        masterName: row.name || null,
        amount: value,
        note: note.trim() || `Commission collected ${new Date().toLocaleDateString('en-IN')}`,
        createdAt: serverTimestamp(),
      });
      toast.success(`${formatCurrency(value)} marked received from ${row.name || 'master'}.`);
      onClose();
    } catch (err) {
      toast.error('Save fail: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Mark commission paid</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p>
            <b>{row.name || row.id}</b> ne aaj ka commission ₹{(row.cut || 0).toFixed(2)} de diya hai.
            Tumne kitna receive kiya? (default = pending amount)
          </p>
          <div className="bg-gray-50 rounded-lg p-3 text-xs space-y-1">
            <div className="flex justify-between"><span>Today earned</span><span className="font-bold">{formatCurrency(row.cut || 0)}</span></div>
            <div className="flex justify-between"><span>Already paid</span><span className="font-bold">{formatCurrency(row.paid || 0)}</span></div>
            <div className="flex justify-between"><span>Pending</span><span className="font-bold text-blue-700">{formatCurrency(row.pending || 0)}</span></div>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount received (₹)</label>
            <input
              type="number" min="0" step="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cash / UPI / Bank transfer"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded disabled:opacity-40">
            {busy ? 'Saving…' : '✓ Mark Paid'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
  const [settlements, setSettlements] = useState([]);
  const [markPaidFor, setMarkPaidFor] = useState(null);

  const [todayStart] = useState(todayIstStart);
  const todayLabel = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric',
  }).format(new Date());

  // Settlement history — every "commission paid" entry the admin
  // marked today. Used to compute Paid + Pending per master.
  useEffect(() => {
    const q = query(
      collection(db, 'masterLedger'),
      where('type', '==', 'commission_paid'),
      where('createdAt', '>=', todayStart),
    );
    return onSnapshot(q, (s) => setSettlements(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSettlements([]));
  }, [todayStart]);

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

  // Per-master settlements paid today.
  const paidByMaster = useMemo(() => {
    const map = new Map();
    for (const s of settlements) {
      const cur = map.get(s.masterId) || 0;
      map.set(s.masterId, cur + Number(s.amount || 0));
    }
    return map;
  }, [settlements]);

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
      // Haruf saves the payout as `winnings`; every other game as
      // `winAmount`. Fall back so both count.
      row.won += Number(bet.winAmount ?? bet.winnings ?? 0);
    };
    haruf.forEach(tally);
    aviator.forEach(tally);
    sports.forEach(tally);

    return rows.map((r) => {
      const net = r.bet - r.won;
      const cut = net > 0 ? Math.round(net * (r.pct / 100) * 100) / 100 : 0;
      const paid = Math.round((paidByMaster.get(r.id) || 0) * 100) / 100;
      const pending = Math.max(0, Math.round((cut - paid) * 100) / 100);
      return { ...r, net, cut, paid, pending };
    }).sort((a, b) => b.pending - a.pending);
  }, [masters, haruf, aviator, sports, userMap, paidByMaster]);

  const totalCut = summary.reduce((s, r) => s + r.cut, 0);
  const totalBet = summary.reduce((s, r) => s + r.bet, 0);
  const totalWon = summary.reduce((s, r) => s + r.won, 0);
  const totalPaid = summary.reduce((s, r) => s + r.paid, 0);
  const totalPending = summary.reduce((s, r) => s + r.pending, 0);

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
            <p className="text-[10px] uppercase tracking-widest text-gray-500">Pending from masters</p>
            <p className="text-3xl font-black text-blue-700">{formatCurrency(totalPending)}</p>
            <p className="text-[10px] text-gray-500 mt-0.5">
              earned {formatCurrency(totalCut)} · received {formatCurrency(totalPaid)}
            </p>
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
          <table className="w-full min-w-[900px] text-sm">
            <thead className="bg-gray-50 border-b border-t text-[10px] uppercase text-gray-500">
              <tr>
                <th className="px-4 py-2 text-left">Master</th>
                <th className="px-4 py-2 text-center">%</th>
                <th className="px-4 py-2 text-right">Net</th>
                <th className="px-4 py-2 text-right">Earned</th>
                <th className="px-4 py-2 text-right">Paid</th>
                <th className="px-4 py-2 text-right">Pending</th>
                <th className="px-4 py-2 text-right">Action</th>
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
                  <td className={`px-4 py-2 text-right font-bold ${r.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
                    {formatCurrency(r.net)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-800">{formatCurrency(r.cut)}</td>
                  <td className="px-4 py-2 text-right text-emerald-700">{formatCurrency(r.paid)}</td>
                  <td className={`px-4 py-2 text-right font-black ${r.pending > 0 ? 'text-blue-700' : 'text-gray-400'}`}>
                    {formatCurrency(r.pending)}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {r.pending > 0 ? (
                      <button
                        onClick={() => setMarkPaidFor(r)}
                        className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1 rounded"
                      >Mark Paid</button>
                    ) : r.cut > 0 ? (
                      <span className="text-[10px] text-emerald-600 font-bold">✓ Settled</span>
                    ) : (
                      <span className="text-[10px] text-gray-400">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="px-5 py-3 text-[11px] text-gray-500 border-t bg-gray-50">
          Sources: Haruf + Aviator + Cricket bets today (IST). Pending bets bet me count hote hain, settle hone pe won update hota hai. Pure-reseller masters (0%) yahan nahi dikhte — unka tumhara koi share nahi.
        </p>
      </div>

      {markPaidFor && (
        <MarkPaidModal row={markPaidFor} onClose={() => setMarkPaidFor(null)} />
      )}
    </div>
  );
}
