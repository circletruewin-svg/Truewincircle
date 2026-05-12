import { useEffect, useMemo, useState } from 'react';
import {
  collection, onSnapshot, query, where, doc, getDoc, getDocs, setDoc,
  serverTimestamp, runTransaction, addDoc, limit, updateDoc, deleteDoc,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { toast } from 'react-toastify';
import { formatCurrency } from '../../utils/formatMoney';
import { buildMasterReferralLink, generateMasterCode } from '../../utils/master';

// ─────────────────────────────────────────────────────────────────
// Admin's "Master Management" tab — sits alongside All Users and is
// the only place where new master accounts get created or topped up.
//
// Important invariants enforced here:
//  - masterCode is globally unique (we re-roll on collision)
//  - top-up writes a `masterLedger/{tx}` audit doc + atomic balance bump
//  - master is just a user doc with role='master' + masterCode + balance
// ─────────────────────────────────────────────────────────────────

// Re-roll until we find an unused 8-char master code. With ~10^11
// possibilities a collision is vanishingly unlikely but we still
// check just to be safe (Firestore query is cheap on this scale).
async function pickUnusedMasterCode(maxAttempts = 8) {
  for (let i = 0; i < maxAttempts; i++) {
    const code = generateMasterCode();
    const q = query(collection(db, 'users'), where('masterCode', '==', code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) return code;
  }
  throw new Error('Could not generate a unique master code — try again.');
}

function CreateMasterModal({ onClose, onCreated }) {
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [initial, setInitial] = useState('10000');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const cleanPhone = phone.replace(/\s/g, '');
    if (!name.trim()) return toast.error('Master name required.');
    if (!/^\+?\d{10,15}$/.test(cleanPhone)) return toast.error('Valid phone with country code required (e.g. +91XXXXXXXXXX).');
    const e164 = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
    const points = Number(initial);
    if (!Number.isFinite(points) || points < 0) return toast.error('Initial points must be a non-negative number.');

    setBusy(true);
    try {
      const code = await pickUnusedMasterCode();

      // First: does this phone already belong to an existing user
      // (someone who signed up before being promoted)?  If yes,
      // promote them in place — we update their existing user doc to
      // role=master and add the initial points to their balance.
      const existingQ = query(
        collection(db, 'users'),
        where('phoneNumber', '==', e164),
        limit(1),
      );
      const existingSnap = await getDocs(existingQ);

      if (!existingSnap.empty) {
        const existing = existingSnap.docs[0];
        const existingBalance = Number(existing.data().balance ?? existing.data().walletBalance ?? 0);
        const newBalance = Math.round((existingBalance + points) * 100) / 100;

        // Confirm with the admin so they don't silently nuke an
        // existing user's role / balance accounting.
        const goAhead = window.confirm(
          `${existing.data().name || 'Existing user'} already exists with balance ${formatCurrency(existingBalance)}.\n\n` +
          `After promotion:\n` +
          `• Role: user → master\n` +
          `• Balance: ${formatCurrency(existingBalance)} + ${formatCurrency(points)} = ${formatCurrency(newBalance)}\n` +
          `• Master code: ${code}\n\n` +
          `Proceed?`
        );
        if (!goAhead) { setBusy(false); return; }

        await updateDoc(doc(db, 'users', existing.id), {
          role: 'master',
          masterCode: code,
          name: name.trim() || existing.data().name || '',
          balance: newBalance,
          walletBalance: newBalance,
          // If they were previously someone else's player, they aren't
          // anymore — masters can't sit under another master.
          assignedMasterId: null,
        });

        // Log it to the audit ledger like a normal top-up.
        if (points > 0) {
          await addDoc(collection(db, 'masterLedger'), {
            type: 'admin_to_master',
            masterId: existing.id,
            masterName: name.trim(),
            pending: false,
            amount: points,
            note: 'Initial points on user→master promotion',
            createdAt: serverTimestamp(),
          });
        }

        toast.success(`Existing user promoted to master with code ${code}. They'll see the master panel on next login.`);
        onCreated?.();
        onClose();
        return;
      }

      // New phone: pre-stage in pendingUsers as before. First OTP
      // login will merge the staged role + code + points into a real
      // user doc.
      await setDoc(doc(db, 'pendingUsers', e164), {
        phoneNumber: e164,
        name: name.trim(),
        role: 'master',
        masterCode: code,
        balance: points,
        winningMoney: 0,
        appName: 'truewin',
        createdAt: serverTimestamp(),
      });
      toast.success(`Master ${name.trim()} created with code ${code}. Share their link — they'll OTP in and become ACTIVE.`);
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not create master.');
    } finally {
      setBusy(false);
    }
  };

  const I = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  const L = 'block text-xs font-semibold text-gray-600 mb-1';

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Create master account</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3">
          <div>
            <label className={L}>Master name</label>
            <input className={I} value={name} onChange={(e) => setName(e.target.value)} placeholder="Ramesh Bhai" />
          </div>
          <div>
            <label className={L}>Phone (with country code)</label>
            <input className={I} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+919876543210" />
          </div>
          <div>
            <label className={L}>Initial points (master can credit this much to their players)</label>
            <input type="number" min="0" className={I} value={initial} onChange={(e) => setInitial(e.target.value)} />
          </div>
          <p className="text-[11px] text-gray-500">
            Master ka account pre-stage hoga is phone par. Jab vo first time OTP login karega, account auto-create ho jayega with the assigned code + points.
          </p>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40">
            {busy ? 'Creating…' : 'Create master'}
          </button>
        </div>
      </div>
    </div>
  );
}

function TopUpModal({ master, onClose, onDone }) {
  const [amount, setAmount] = useState('10000');
  const [busy, setBusy] = useState(false);
  const [direction, setDirection] = useState('credit'); // credit | debit

  const submit = async () => {
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) return toast.error('Enter a positive amount.');

    setBusy(true);
    try {
      if (master.pending) {
        // Pending master — adjust the staged initial balance on the
        // pendingUsers doc. When they first OTP in, this amount is
        // merged onto the real user doc.
        const stageRef = doc(db, 'pendingUsers', master.id);
        const snap = await getDoc(stageRef);
        if (!snap.exists()) throw new Error('Pending master no longer exists.');
        const current = Number(snap.data().balance || 0);
        const next = direction === 'credit' ? current + value : current - value;
        if (next < 0) throw new Error(`Cannot debit more than staged amount (${formatCurrency(current)}).`);
        await updateDoc(stageRef, { balance: Math.round(next * 100) / 100 });
      } else {
        // Active master — atomic update on their real user doc.
        await runTransaction(db, async (tx) => {
          const masterRef = doc(db, 'users', master.id);
          const snap = await tx.get(masterRef);
          if (!snap.exists()) throw new Error('Master account no longer exists.');
          const current = Number(snap.data().balance ?? snap.data().walletBalance ?? 0);
          const next = direction === 'credit' ? current + value : current - value;
          if (next < 0) throw new Error(`Cannot debit more than master has (${formatCurrency(current)}).`);
          tx.update(masterRef, {
            balance: Math.round(next * 100) / 100,
            // Keep legacy field in sync so existing reporting tools that
            // read walletBalance still see the master's true points.
            walletBalance: Math.round(next * 100) / 100,
          });
        });
      }

      // Audit ledger — admin → master adjustment. We log for both
      // active and pending masters so the trail is continuous.
      await addDoc(collection(db, 'masterLedger'), {
        type: direction === 'credit' ? 'admin_to_master' : 'master_to_admin',
        masterId: master.id,
        masterName: master.name || null,
        pending: !!master.pending,
        amount: value,
        createdAt: serverTimestamp(),
      });

      toast.success(`${direction === 'credit' ? 'Credited' : 'Debited'} ${formatCurrency(value)} ${direction === 'credit' ? 'to' : 'from'} ${master.name || 'master'}.`);
      onDone?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const currentPoints = Number(master.balance ?? master.walletBalance ?? 0);

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Adjust master points</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm">
            <b>{master.name || master.phoneNumber || master.id}</b> · current points:{' '}
            <span className="font-bold text-emerald-700">{formatCurrency(currentPoints)}</span>
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection('credit')}
              className={`py-2 rounded-lg text-sm font-bold ${direction === 'credit' ? 'bg-emerald-600 text-white' : 'bg-gray-200'}`}
            >+ Credit</button>
            <button
              onClick={() => setDirection('debit')}
              className={`py-2 rounded-lg text-sm font-bold ${direction === 'debit' ? 'bg-rose-600 text-white' : 'bg-gray-200'}`}
            >− Debit</button>
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount</label>
            <input
              type="number"
              min="1"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <p className="text-[11px] text-gray-500">
            <b>Credit:</b> Admin → Master. Master ke points badhenge.<br />
            <b>Debit:</b> Master → Admin (refund). Master ke points kam honge.
          </p>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className={`px-4 py-2 text-white rounded disabled:opacity-40 ${direction === 'credit' ? 'bg-emerald-600' : 'bg-rose-600'}`}>
            {busy ? 'Updating…' : (direction === 'credit' ? 'Credit' : 'Debit')}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MasterManagement() {
  const [activeMasters, setActiveMasters] = useState([]);
  const [pendingMasters, setPendingMasters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [topUpFor, setTopUpFor] = useState(null);
  const [search, setSearch] = useState('');

  // Active masters: live `users` docs where role == 'master'. These
  // are the masters who have completed their first OTP login.
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'master'));
    return onSnapshot(q, (snap) => {
      setActiveMasters(snap.docs.map((d) => ({ id: d.id, ...d.data(), pending: false })));
      setLoading(false);
    }, () => setLoading(false));
  }, []);

  // Pending masters: those that admin pre-staged but who haven't
  // logged in yet. They show with a PENDING badge so admin knows to
  // share the link / share the code with the master.
  useEffect(() => {
    const q = query(collection(db, 'pendingUsers'), where('role', '==', 'master'));
    return onSnapshot(q, (snap) => {
      setPendingMasters(snap.docs.map((d) => ({ id: d.id, ...d.data(), pending: true })));
    }, () => setPendingMasters([]));
  }, []);

  // Player counts grouped by master uid — one snapshot, derive locally.
  // Only active masters can have players (signup needs a real user doc).
  const [playerCounts, setPlayerCounts] = useState({});
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'user'));
    return onSnapshot(q, (snap) => {
      const counts = {};
      snap.docs.forEach((d) => {
        const m = d.data().assignedMasterId;
        if (m) counts[m] = (counts[m] || 0) + 1;
      });
      setPlayerCounts(counts);
    }, () => {});
  }, []);

  // Combined list — pending masters surface at the top so admin sees
  // the ones that need attention first.
  const masters = useMemo(
    () => [...pendingMasters, ...activeMasters],
    [pendingMasters, activeMasters],
  );

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return masters;
    return masters.filter((m) =>
      (m.name || '').toLowerCase().includes(q) ||
      (m.phoneNumber || '').toLowerCase().includes(q) ||
      (m.masterCode || '').toLowerCase().includes(q)
    );
  }, [masters, search]);

  // Cancel a pending master that the admin no longer wants — clears
  // the staged entry. Once a master has logged in we don't expose a
  // delete to keep audit trail honest; admin can debit them to 0 and
  // mark them suspended instead.
  const cancelPending = async (m) => {
    if (!window.confirm(`Cancel pending master "${m.name || m.id}"? They won't be created when they OTP in.`)) return;
    try {
      await deleteDoc(doc(db, 'pendingUsers', m.id));
      toast.success('Pending master cancelled.');
    } catch (err) {
      toast.error('Could not cancel: ' + (err.message || err));
    }
  };

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch { toast.error('Copy failed'); }
  };

  return (
    <div className="p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">👥 Master Management</h2>
          <p className="text-sm text-gray-600">Resellers / agents who handle their own players.</p>
        </div>
        <button
          onClick={() => setCreateOpen(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded"
        >
          + Create master
        </button>
      </div>

      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, phone or code…"
          className="w-full md:w-80 border border-gray-300 rounded-lg px-3 py-2 text-sm"
        />
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : filtered.length === 0 ? (
        <div className="bg-white border rounded-xl p-6 text-center text-gray-500">
          {masters.length === 0
            ? 'No masters yet. Click "Create master" to add one.'
            : 'No masters match this search.'}
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b">
              <tr className="text-xs font-semibold text-gray-600">
                <th className="p-3 text-left">Master</th>
                <th className="p-3 text-left">Phone</th>
                <th className="p-3 text-left">Code</th>
                <th className="p-3 text-right">Points</th>
                <th className="p-3 text-center">Players</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr key={`${m.pending ? 'p_' : 'a_'}${m.id}`} className={`border-b last:border-0 hover:bg-gray-50 ${m.pending ? 'bg-yellow-50/50' : ''}`}>
                  <td className="p-3 text-sm font-semibold">{m.name || '—'}</td>
                  <td className="p-3 text-xs text-gray-600">{m.phoneNumber || m.id || '—'}</td>
                  <td className="p-3 text-xs">
                    {m.masterCode ? (
                      <button
                        onClick={() => copy(m.masterCode, 'Code')}
                        className="bg-yellow-100 text-yellow-800 font-mono font-bold px-2 py-0.5 rounded"
                      >
                        {m.masterCode}
                      </button>
                    ) : <span className="text-gray-400">—</span>}
                  </td>
                  <td className="p-3 text-right text-sm font-bold text-emerald-700">
                    {formatCurrency(m.balance ?? m.walletBalance ?? 0)}
                  </td>
                  <td className="p-3 text-center text-sm">
                    {m.pending ? <span className="text-gray-400">—</span> : (playerCounts[m.id] || 0)}
                  </td>
                  <td className="p-3 text-center">
                    {m.pending
                      ? <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">PENDING OTP</span>
                      : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                    {m.masterCode && (
                      <button
                        onClick={() => copy(buildMasterReferralLink(m.masterCode), 'Link')}
                        className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                        title="Copy share link"
                      >Link</button>
                    )}
                    <button
                      onClick={() => setTopUpFor(m)}
                      className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-2 py-1 rounded"
                    >+ / − Points</button>
                    {m.pending && (
                      <button
                        onClick={() => cancelPending(m)}
                        className="text-xs bg-rose-500 hover:bg-rose-700 text-white px-2 py-1 rounded"
                        title="Cancel pending master"
                      >Cancel</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-gray-500 px-4 py-2 border-t bg-gray-50">
            <b>PENDING OTP</b> = master ne abhi tak pehli baar login nahi kiya. Unhe phone share karke OTP karwao — automatically <b>ACTIVE</b> ho jayenge.
          </p>
        </div>
      )}

      {createOpen && (
        <CreateMasterModal onClose={() => setCreateOpen(false)} onCreated={() => {}} />
      )}
      {topUpFor && (
        <TopUpModal master={topUpFor} onClose={() => setTopUpFor(null)} onDone={() => {}} />
      )}
    </div>
  );
}
