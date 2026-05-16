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

// Try a handful of phone-format variants since stored phoneNumber
// fields can drift: with/without "+", with or without country code,
// even old offline-created users with "+91" prepended manually.
async function findExistingUserByPhone(rawPhone) {
  const cleanDigits = rawPhone.replace(/\D/g, '');
  const last10 = cleanDigits.slice(-10);
  const candidates = new Set([
    rawPhone.startsWith('+') ? rawPhone : `+${rawPhone}`,
    rawPhone.replace(/^\+/, ''),
    cleanDigits,
    last10,
    `+91${last10}`,
    `91${last10}`,
  ]);

  for (const candidate of candidates) {
    const snap = await getDocs(query(
      collection(db, 'users'),
      where('phoneNumber', '==', candidate),
      limit(1),
    ));
    if (!snap.empty) return snap.docs[0];
  }
  return null;
}

function CreateMasterModal({ onClose, onCreated }) {
  const [step, setStep] = useState('form'); // form | confirmNew | confirmExisting
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');
  const [initial, setInitial] = useState('10000');
  const [busy, setBusy] = useState(false);
  // Lookup result for the existing-user branch — held so step 2 can
  // show the admin the real balance / name before they confirm.
  const [resolved, setResolved] = useState(null);
  const [pendingCode, setPendingCode] = useState(null);

  const trimmedName = name.trim();
  const cleanPhone = phone.replace(/\s/g, '');
  const e164 = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
  const points = Number(initial) || 0;

  // Step 1 → check, decide whether to show "new" or "existing" confirm.
  const lookup = async () => {
    if (!trimmedName) return toast.error('Master name required.');
    if (!/^\+?\d{10,15}$/.test(cleanPhone)) return toast.error('Valid phone with country code required (e.g. +91XXXXXXXXXX).');
    if (!Number.isFinite(points) || points < 0) return toast.error('Initial points must be a non-negative number.');

    setBusy(true);
    try {
      const existing = await findExistingUserByPhone(e164);
      const code = await pickUnusedMasterCode();
      setPendingCode(code);
      if (existing) {
        setResolved({ id: existing.id, data: existing.data() });
        setStep('confirmExisting');
      } else {
        setResolved(null);
        setStep('confirmNew');
      }
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Lookup failed.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2a (existing user) → flip role to master + sum balances.
  const confirmExisting = async () => {
    if (!resolved) return;
    setBusy(true);
    try {
      const existingBalance = Number(resolved.data.balance ?? resolved.data.walletBalance ?? 0);
      const newBalance = Math.round((existingBalance + points) * 100) / 100;

      await updateDoc(doc(db, 'users', resolved.id), {
        role: 'master',
        masterCode: pendingCode,
        name: trimmedName || resolved.data.name || '',
        balance: newBalance,
        walletBalance: newBalance,
        assignedMasterId: null,
      });

      if (points > 0) {
        await addDoc(collection(db, 'masterLedger'), {
          type: 'admin_to_master',
          masterId: resolved.id,
          masterName: trimmedName,
          pending: false,
          amount: points,
          note: 'Initial points on user→master promotion',
          createdAt: serverTimestamp(),
        });
      }
      // Sweep stale pendingUsers entry for this phone (left over from
      // a prior failed attempt) so Master Management doesn't show
      // both a PENDING and ACTIVE row.
      try { await deleteDoc(doc(db, 'pendingUsers', e164)); } catch {}

      toast.success(`Existing user promoted to master · code ${pendingCode}.`);
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not promote.');
    } finally {
      setBusy(false);
    }
  };

  // Step 2b (new phone) → pre-stage in pendingUsers.
  const confirmNew = async () => {
    setBusy(true);
    try {
      await setDoc(doc(db, 'pendingUsers', e164), {
        phoneNumber: e164,
        name: trimmedName,
        role: 'master',
        masterCode: pendingCode,
        balance: points,
        winningMoney: 0,
        appName: 'truewin',
        createdAt: serverTimestamp(),
      });
      toast.success(`Master ${trimmedName} pre-staged · code ${pendingCode}. Share the link — they'll OTP in.`);
      onCreated?.();
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Could not stage master.');
    } finally {
      setBusy(false);
    }
  };

  const I = 'w-full border border-gray-300 rounded-lg px-3 py-2 text-sm';
  const L = 'block text-xs font-semibold text-gray-600 mb-1';

  // ── STEP 1: form ────────────────────────────────────────────────
  if (step === 'form') {
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
              <b>Step 1 of 2.</b> Next button pe details review karke confirm karna padega — galti se master ban jaane se bachne ke liye.
            </p>
          </div>
          <div className="border-t p-4 flex justify-end gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
            <button onClick={lookup} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40">
              {busy ? 'Checking…' : 'Next → Review'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2a: existing user — needs strong confirmation ────────────
  if (step === 'confirmExisting') {
    const existingBalance = Number(resolved.data.balance ?? resolved.data.walletBalance ?? 0);
    const newBalance = Math.round((existingBalance + points) * 100) / 100;
    return (
      <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-xl shadow-xl border-l-4 border-amber-500">
          <div className="border-b p-4 flex justify-between items-center bg-amber-50">
            <h3 className="font-bold text-lg text-amber-900">⚠ Existing user — promote?</h3>
            <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
          </div>
          <div className="p-4 space-y-3 text-sm">
            <p>Ye phone pehle se ek user ka hai. Confirm karoge to vo <b>user se master ban jayega</b>.</p>
            <div className="bg-gray-50 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span className="text-gray-600">Current name:</span><span className="font-semibold">{resolved.data.name || '—'}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Phone:</span><span className="font-mono">{resolved.data.phoneNumber || e164}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Current role:</span><span className="font-semibold">{resolved.data.role || 'user'}</span></div>
              <div className="flex justify-between"><span className="text-gray-600">Current balance:</span><span className="font-semibold text-emerald-700">{formatCurrency(existingBalance)}</span></div>
            </div>

            <p className="font-bold text-amber-900">After promotion:</p>
            <div className="bg-emerald-50 rounded-lg p-3 space-y-1 text-xs">
              <div className="flex justify-between"><span>Role</span><span className="font-bold">user → master</span></div>
              <div className="flex justify-between"><span>Master code</span><span className="font-mono font-bold">{pendingCode}</span></div>
              <div className="flex justify-between"><span>Balance</span><span className="font-bold">{formatCurrency(existingBalance)} + {formatCurrency(points)} = {formatCurrency(newBalance)}</span></div>
              <div className="flex justify-between"><span>Name</span><span className="font-bold">{trimmedName || resolved.data.name}</span></div>
            </div>

            <p className="text-[11px] text-rose-700 font-semibold">
              Cancel karke pichli screen pe wapas ja sakte ho. Confirm sirf tab dabao jab pura sure ho.
            </p>
          </div>
          <div className="border-t p-4 flex justify-end gap-2">
            <button onClick={() => setStep('form')} className="px-4 py-2 bg-gray-200 rounded">← Back</button>
            <button onClick={confirmExisting} disabled={busy} className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded disabled:opacity-40">
              {busy ? 'Promoting…' : '✓ Confirm: Make Master'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── STEP 2b: new phone — straightforward confirm ─────────────────
  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Confirm new master</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p>Ye phone pehle kabhi register nahi hua. Confirm karne pe ek <b>new pre-staged master</b> ban jayega — jab vo phone se OTP karega, account ACTIVE ho jayega.</p>
          <div className="bg-emerald-50 rounded-lg p-3 space-y-1 text-xs">
            <div className="flex justify-between"><span>Name</span><span className="font-bold">{trimmedName}</span></div>
            <div className="flex justify-between"><span>Phone</span><span className="font-mono">{e164}</span></div>
            <div className="flex justify-between"><span>Master code</span><span className="font-mono font-bold">{pendingCode}</span></div>
            <div className="flex justify-between"><span>Initial points</span><span className="font-bold">{formatCurrency(points)}</span></div>
          </div>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={() => setStep('form')} className="px-4 py-2 bg-gray-200 rounded">← Back</button>
          <button onClick={confirmNew} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40">
            {busy ? 'Creating…' : '✓ Confirm: Create master'}
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

// Set the admin's profit-sharing percentage on a master. 0 = pure
// reseller (admin gets nothing extra); >0 = admin takes that
// percentage of the master's players' net winnings/losses. The
// admin's dashboard then surfaces this as commission earned.
function CommissionModal({ master, onClose }) {
  const [pct, setPct] = useState(String(master.commissionPercent ?? 0));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) {
      return toast.error('0 se 100 ke beech ka number daalo.');
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', master.id), {
        commissionPercent: Math.round(n * 100) / 100,
      });
      await addDoc(collection(db, 'masterLedger'), {
        type: 'admin_to_master',
        masterId: master.id,
        masterName: master.name || null,
        pending: false,
        amount: 0,
        note: `Commission % set to ${n}`,
        createdAt: serverTimestamp(),
      });
      toast.success(`Commission set to ${n}%`);
      onClose();
    } catch (err) {
      toast.error('Save failed: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Set commission %</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p>
            Master <b>{master.name || '—'}</b> ke players jitna <b>play</b> (total bet) karenge uska kitna % admin ko jayega? (Point khareedne pe nahi — sirf play pe.)
          </p>
          <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
            <p className="font-bold mb-1">Example</p>
            Master ne 100 point liye. Uske players ne total <b>₹50 ka play</b> kiya.
            <b> {pct || 0}%</b> admin ko = ₹{(50 * (Number(pct) || 0) / 100).toFixed(2)}.<br />
            Win/loss se farak nahi — commission sirf total bet (turnover) pe hai.
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Percentage (0-100)</label>
            <input
              type="number"
              min="0" max="100" step="0.5"
              value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <p className="text-[11px] text-gray-500 mt-1">
              0 = pure reseller (admin ka koi hissa nahi)
            </p>
          </div>

          <div className="grid grid-cols-4 gap-2 text-xs">
            {[0, 20, 30, 40, 50].map((v) => (
              <button key={v} onClick={() => setPct(String(v))} className="bg-gray-100 hover:bg-gray-200 rounded-lg py-1.5">
                {v}%
              </button>
            ))}
          </div>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Drill-down detail view for one master: their info card + all their
// players + their masterLedger history. Opened from the Master
// Management list when admin clicks a row.
// ─────────────────────────────────────────────────────────────────
function MasterDetail({ master, onBack, onTopUp, onSetCommission }) {
  const [players, setPlayers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [harufBets, setHarufBets] = useState([]);
  const [aviatorBets, setAviatorBets] = useState([]);
  const [sportsBets, setSportsBets] = useState([]);

  useEffect(() => {
    const pq = query(collection(db, 'users'), where('assignedMasterId', '==', master.id));
    return onSnapshot(pq, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setPlayers([]));
  }, [master.id]);

  const playerIds = useMemo(() => players.map((p) => p.id).slice(0, 30), [players]);

  // Subscribe to game bets for master's players (today, IST).
  // Filtered client-side by date to keep query simple.
  useEffect(() => {
    if (!playerIds.length) { setHarufBets([]); setAviatorBets([]); setSportsBets([]); return undefined; }
    const qH = query(collection(db, 'harufBets'),   where('userId', 'in', playerIds));
    const qA = query(collection(db, 'aviatorBets'), where('userId', 'in', playerIds));
    const qS = query(collection(db, 'sportsBets'),  where('userId', 'in', playerIds));
    const u1 = onSnapshot(qH, (s) => setHarufBets(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u2 = onSnapshot(qA, (s) => setAviatorBets(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    const u3 = onSnapshot(qS, (s) => setSportsBets(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
    return () => { u1(); u2(); u3(); };
  }, [playerIds.join(',')]);

  const todayIST = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());

  const isToday = (ts) => {
    const d = ts?.toDate?.();
    if (!d) return false;
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
    }).format(d) === todayIST;
  };

  // Aggregate today's bets across game families.
  const todayStats = useMemo(() => {
    let bet = 0, won = 0, count = 0;
    const considerBet = (b) => {
      // Some collections use `timestamp`, others `createdAt`; haruf
      // stores the payout as `winnings`, every other game as `winAmount`.
      const ts = b.timestamp || b.createdAt;
      if (!isToday(ts)) return;
      bet += Number(b.betAmount || 0);
      won += Number(b.winAmount ?? b.winnings ?? 0);
      count += 1;
    };
    harufBets.forEach(considerBet);
    aviatorBets.forEach(considerBet);
    sportsBets.forEach(considerBet);
    const net = bet - won;            // shown for info only
    const pct = Number(master.commissionPercent) || 0;
    // Commission is on PLAY (turnover) — total bet × %, not net P&L.
    const adminCut = Math.round(bet * (pct / 100) * 100) / 100;
    return { bet, won, count, net, pct, adminCut };
  }, [harufBets, aviatorBets, sportsBets, todayIST, master.commissionPercent]);

  useEffect(() => {
    const lq = query(
      collection(db, 'masterLedger'),
      where('masterId', '==', master.id),
    );
    return onSnapshot(lq, (snap) => {
      const docs = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      docs.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta;
      });
      setLedger(docs);
    }, () => setLedger([]));
  }, [master.id]);

  const totalDeposited = useMemo(
    () => players.reduce((s, p) => s + Number(p.balance ?? p.walletBalance ?? 0), 0),
    [players],
  );
  const totalWinning = useMemo(
    () => players.reduce((s, p) => s + Number(p.winningMoney ?? 0), 0),
    [players],
  );
  const fmtDate = (ts) => {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString('en-IN') : '—';
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <button onClick={onBack} className="text-sm bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded">← Back to list</button>
        <h2 className="text-xl font-bold text-gray-800">Master · {master.name || '—'}</h2>
      </div>

      {/* Master card */}
      <div className="bg-white rounded-xl shadow border p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
        <div>
          <p className="text-[10px] uppercase text-gray-500">Phone</p>
          <p className="font-mono font-semibold">{master.phoneNumber || master.id}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-500">Code</p>
          <p className="font-mono font-bold text-amber-700">{master.masterCode || '—'}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-500">Master Points</p>
          <p className="font-bold text-emerald-700">{formatCurrency(master.balance ?? master.walletBalance ?? 0)}</p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-500">Admin %</p>
          <p className={`font-bold ${Number(master.commissionPercent) > 0 ? 'text-blue-700' : 'text-gray-500'}`}>
            {Number(master.commissionPercent) > 0 ? `${master.commissionPercent}%` : 'Pure reseller (0%)'}
          </p>
        </div>
        <div>
          <p className="text-[10px] uppercase text-gray-500">Status</p>
          <p className="font-bold">
            {master.pending ? <span className="text-amber-700">PENDING OTP</span>
                            : <span className="text-emerald-700">ACTIVE</span>}
          </p>
        </div>

        <div className="col-span-2 md:col-span-5 flex justify-end gap-2 pt-2 flex-wrap">
          {master.masterCode && (
            <button
              onClick={() => navigator.clipboard.writeText(buildMasterReferralLink(master.masterCode)).then(() => toast.success('Link copied'))}
              className="text-xs bg-gray-200 hover:bg-gray-300 px-3 py-1.5 rounded"
            >Copy share link</button>
          )}
          <button
            onClick={() => onSetCommission(master)}
            className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-3 py-1.5 rounded font-bold"
          >Set Admin %</button>
          <button
            onClick={() => onTopUp(master)}
            className="text-xs bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1.5 rounded font-bold"
          >+ / − Master Points</button>
        </div>
      </div>

      {/* Today's activity — only fully meaningful when commission % is set */}
      <div className="bg-white rounded-xl shadow border">
        <div className="border-b px-4 py-3 flex justify-between items-center">
          <h3 className="font-bold">Today's player activity (IST)</h3>
          <span className="text-xs text-gray-500">{todayIST}</span>
        </div>
        <div className="p-4 grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <div>
            <p className="text-[10px] uppercase text-gray-500">Total Bets</p>
            <p className="font-bold text-gray-800">{todayStats.count}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Bet Amount</p>
            <p className="font-bold text-blue-700">{formatCurrency(todayStats.bet)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Paid Out (Wins)</p>
            <p className="font-bold text-rose-700">{formatCurrency(todayStats.won)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Net (bet − won)</p>
            <p className={`font-bold ${todayStats.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCurrency(todayStats.net)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-gray-500">Admin's cut @ {todayStats.pct}% of play</p>
            {todayStats.pct > 0 ? (
              <p className="font-bold text-blue-700">{formatCurrency(todayStats.adminCut)}</p>
            ) : (
              <p className="font-bold text-gray-400 text-xs">Pure reseller — kuchh nahi</p>
            )}
          </div>
        </div>
        <p className="text-[11px] text-gray-500 px-4 pb-3">
          Commission <b>play (total bet) pe</b> hai — win/loss se farak nahi.
          Source: Haruf + Aviator + Cricket bets (today IST).
        </p>
      </div>

      {/* Players list */}
      <div className="bg-white rounded-xl shadow border">
        <div className="border-b px-4 py-3 flex justify-between items-center">
          <h3 className="font-bold">Players ({players.length})</h3>
          <div className="text-xs text-gray-600">
            Total balance: <span className="font-bold text-emerald-700">{formatCurrency(totalDeposited)}</span>{' '}
            · winnings: <span className="font-bold text-yellow-700">{formatCurrency(totalWinning)}</span>
          </div>
        </div>
        {players.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">Abhi tak koi player nahi.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] text-sm">
              <thead className="bg-gray-50 border-b text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">Name</th>
                  <th className="text-left px-3 py-2">Phone</th>
                  <th className="text-right px-3 py-2">Balance</th>
                  <th className="text-right px-3 py-2">Winning</th>
                  <th className="text-center px-3 py-2">Status</th>
                  <th className="text-left px-3 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => (
                  <tr key={p.id} className="border-b last:border-0 hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold">{p.name || '—'}</td>
                    <td className="px-3 py-2 text-xs text-gray-600">{p.phoneNumber || '—'}</td>
                    <td className="px-3 py-2 text-right text-emerald-700 font-semibold">{formatCurrency(p.balance ?? p.walletBalance ?? 0)}</td>
                    <td className="px-3 py-2 text-right text-yellow-700">{formatCurrency(p.winningMoney ?? 0)}</td>
                    <td className="px-3 py-2 text-center">
                      {p.suspended
                        ? <span className="text-[10px] bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full">SUSPENDED</span>
                        : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">ACTIVE</span>}
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(p.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-xl shadow border">
        <div className="border-b px-4 py-3">
          <h3 className="font-bold">Activity (admin ↔ master ledger)</h3>
        </div>
        {ledger.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">Koi adjustment nahi hua abhi tak.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[500px] text-sm">
              <thead className="bg-gray-50 border-b text-[10px] uppercase text-gray-500">
                <tr>
                  <th className="text-left px-3 py-2">When</th>
                  <th className="text-left px-3 py-2">Type</th>
                  <th className="text-right px-3 py-2">Amount</th>
                  <th className="text-left px-3 py-2">Note</th>
                </tr>
              </thead>
              <tbody>
                {ledger.map((l) => (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-3 py-2 text-xs">{fmtDate(l.createdAt)}</td>
                    <td className="px-3 py-2 text-xs">
                      {l.type === 'admin_to_master'
                        ? <span className="bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-semibold">Credit (admin → master)</span>
                        : <span className="bg-rose-100 text-rose-700 px-2 py-0.5 rounded-full font-semibold">Debit (master → admin)</span>}
                    </td>
                    <td className="px-3 py-2 text-right font-bold">{formatCurrency(l.amount)}</td>
                    <td className="px-3 py-2 text-xs text-gray-500">{l.note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
  const [commissionFor, setCommissionFor] = useState(null);
  const [search, setSearch] = useState('');
  const [detailMasterId, setDetailMasterId] = useState(null);

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

  const copy = async (text, label, e) => {
    if (e) e.stopPropagation();
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied`);
    } catch { toast.error('Copy failed'); }
  };

  // Aggregate stats across all masters — shown at top of the list.
  const aggregate = useMemo(() => {
    let totalPoints = 0;
    let totalPlayers = 0;
    let withCommission = 0;
    for (const m of activeMasters) {
      totalPoints += Number(m.balance ?? m.walletBalance ?? 0);
      totalPlayers += (playerCounts[m.id] || 0);
      if (Number(m.commissionPercent) > 0) withCommission++;
    }
    return {
      total: activeMasters.length + pendingMasters.length,
      active: activeMasters.length,
      pending: pendingMasters.length,
      totalPoints,
      totalPlayers,
      withCommission,
    };
  }, [activeMasters, pendingMasters, playerCounts]);

  // Drill-down view takes precedence when a master row is clicked.
  const detailMaster = useMemo(
    () => masters.find((m) => m.id === detailMasterId) || null,
    [masters, detailMasterId],
  );
  if (detailMaster) {
    return (
      <>
        <MasterDetail
          master={detailMaster}
          onBack={() => setDetailMasterId(null)}
          onTopUp={(m) => setTopUpFor(m)}
          onSetCommission={(m) => setCommissionFor(m)}
        />
        {topUpFor && (
          <TopUpModal master={topUpFor} onClose={() => setTopUpFor(null)} onDone={() => {}} />
        )}
        {commissionFor && (
          <CommissionModal master={commissionFor} onClose={() => setCommissionFor(null)} />
        )}
      </>
    );
  }

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

      {/* Aggregate stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] uppercase text-gray-500">Total Masters</p>
          <p className="text-2xl font-bold">{aggregate.total}</p>
          <p className="text-[11px] text-gray-500">{aggregate.active} active · {aggregate.pending} pending</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] uppercase text-gray-500">Total Points Held</p>
          <p className="text-2xl font-bold text-emerald-700">{formatCurrency(aggregate.totalPoints)}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] uppercase text-gray-500">Total Players</p>
          <p className="text-2xl font-bold text-blue-700">{aggregate.totalPlayers}</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] uppercase text-gray-500">With Commission</p>
          <p className="text-2xl font-bold text-amber-700">{aggregate.withCommission}</p>
          <p className="text-[11px] text-gray-500">{aggregate.active - aggregate.withCommission} pure resellers</p>
        </div>
        <div className="bg-white rounded-xl border p-3">
          <p className="text-[10px] uppercase text-gray-500">Pending OTP</p>
          <p className="text-2xl font-bold text-rose-700">{aggregate.pending}</p>
        </div>
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
                <th className="p-3 text-center">Admin %</th>
                <th className="p-3 text-center">Status</th>
                <th className="p-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((m) => (
                <tr
                  key={`${m.pending ? 'p_' : 'a_'}${m.id}`}
                  onClick={() => !m.pending && setDetailMasterId(m.id)}
                  className={`border-b last:border-0 hover:bg-blue-50 ${m.pending ? 'bg-yellow-50/50' : 'cursor-pointer'}`}
                  title={m.pending ? '' : 'Click to view full master details'}
                >
                  <td className="p-3 text-sm font-semibold">
                    {m.name || '—'}
                    {!m.pending && <span className="ml-2 text-[10px] text-blue-600">(click row to view details)</span>}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{m.phoneNumber || m.id || '—'}</td>
                  <td className="p-3 text-xs">
                    {m.masterCode ? (
                      <button
                        onClick={(e) => copy(m.masterCode, 'Code', e)}
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
                  <td className="p-3 text-center text-sm">
                    {Number(m.commissionPercent) > 0
                      ? <span className="bg-blue-100 text-blue-700 font-bold px-2 py-0.5 rounded-full text-[11px]">{m.commissionPercent}%</span>
                      : <span className="text-gray-400 text-[11px]">0%</span>}
                  </td>
                  <td className="p-3 text-center">
                    {m.pending
                      ? <span className="text-[10px] bg-amber-100 text-amber-700 px-2 py-0.5 rounded-full font-bold">PENDING OTP</span>
                      : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full font-bold">ACTIVE</span>}
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                    {m.masterCode && (
                      <button
                        onClick={(e) => copy(buildMasterReferralLink(m.masterCode), 'Link', e)}
                        className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded"
                        title="Copy share link"
                      >Link</button>
                    )}
                    {!m.pending && (
                      <button
                        onClick={() => setCommissionFor(m)}
                        className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2 py-1 rounded"
                        title="Set admin's commission percent on this master's player P&L"
                      >Set %</button>
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
      {commissionFor && (
        <CommissionModal master={commissionFor} onClose={() => setCommissionFor(null)} />
      )}
    </div>
  );
}
