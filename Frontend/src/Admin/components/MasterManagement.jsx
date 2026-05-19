import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  collection, onSnapshot, query, where, doc, getDoc, getDocs, setDoc,
  serverTimestamp, runTransaction, addDoc, limit, updateDoc, deleteDoc,
  Timestamp,
} from 'firebase/firestore';
import { db } from '../../firebase';
import { toast } from 'react-toastify';
import { formatCurrency } from '../../utils/formatMoney';
import {
  buildMasterReferralLink, generateMasterCode,
  reconcileMasterPlayEarnings,
  sumPlayerTurnoverBreakdown, GAME_LABELS, DEFAULT_MASTER_EARN_PCT,
} from '../../utils/master';
import { decideMasterRequest } from '../../utils/masterRequests';

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
      // A user who already belongs to a master can NOT be promoted —
      // doing so would silently sever their master link. Admin must
      // first detach them (AllUsers → Assign to Master → Remove).
      if (existing && existing.data().assignedMasterId) {
        toast.error(
          'Ye user pehle se ek master ke under hai. Pehle AllUsers me ja kar ' +
          '"Assign to Master → Remove from master" karo, tabhi master bana paoge.',
          { autoClose: 7000 },
        );
        return;
      }
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
    if (resolved.data.assignedMasterId) {
      toast.error('Ye user ek master ke under hai — pehle use us master se hatao.');
      return;
    }
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
function MasterDetail({ master, onBack, onTopUp, onSetCommission, onSetEarn }) {
  const [players, setPlayers] = useState([]);
  const [ledger, setLedger] = useState([]);
  const [harufBets, setHarufBets] = useState([]);
  const [aviatorBets, setAviatorBets] = useState([]);
  const [sportsBets, setSportsBets] = useState([]);
  // playerId → display name for the ledger. Seeded from the master's
  // current players; any other ids (old/offline players no longer in
  // the list) are fetched from /users on demand and cached.
  const [playerNames, setPlayerNames] = useState({});
  const [splitFor, setSplitFor] = useState(null); // per-player % split modal

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

  // Resolve player names referenced by the ledger. Current players
  // give us most names for free; fetch the rest (and cache).
  useEffect(() => {
    const base = {};
    for (const p of players) {
      base[p.id] = p.name || p.phoneNumber || p.id;
    }
    const needed = ledger
      .map((l) => l.playerId)
      .filter((id) => id && !base[id]);
    const missing = [...new Set(needed)].filter((id) => !(id in playerNames));
    if (missing.length === 0) {
      if (Object.keys(base).length) {
        setPlayerNames((prev) => ({ ...base, ...prev }));
      }
      return;
    }
    (async () => {
      const entries = await Promise.all(
        missing.map(async (id) => {
          try {
            const s = await getDoc(doc(db, 'users', id));
            const d = s.exists() ? s.data() : null;
            return [id, d ? (d.name || d.phoneNumber || id) : id];
          } catch {
            return [id, id];
          }
        }),
      );
      setPlayerNames((prev) => ({ ...base, ...prev, ...Object.fromEntries(entries) }));
    })();
  }, [ledger, players]); // eslint-disable-line react-hooks/exhaustive-deps

  const totalDeposited = useMemo(
    () => players.reduce((s, p) => s + Number(p.balance ?? p.walletBalance ?? 0), 0),
    [players],
  );
  const totalWinning = useMemo(
    () => players.reduce((s, p) => s + Number(p.winningMoney ?? 0), 0),
    [players],
  );

  // Drop duplicate play-earning rows (old bug wrote the same earning
  // twice into the audit log; the wallet was only ever credited once).
  // Key = amount + same-second timestamp. Other types are never
  // de-duped — only the known play_earning ghost.
  const cleanLedger = useMemo(() => {
    const seen = new Set();
    return ledger.filter((l) => {
      if (l.type !== 'play_earning') return true;
      const sec = Math.floor((l.createdAt?.toDate?.()?.getTime() || 0) / 1000);
      const k = `${l.amount}_${sec}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [ledger]);

  // Auto "Hisaab". NOTE: masterLedger ek best-effort AUDIT log hai —
  // purane code me play-earning / withdrawal ki kuch lines likhne se
  // reh jaati thi (wallet hamesha sahi credit hota hai, idempotent
  // transaction se — log adhura ho sakta hai, paisa nahi). Isliye
  // "kamai" ke liye master doc ka authoritative `lifetimeEarned`
  // use karte hain (wallet ke saath hi atomic update hota hai),
  // ledger sum sirf fallback.
  const hisaab = useMemo(() => {
    const h = { adminDiya: 0, kamaiLedger: 0, playersSeLiya: 0, playersKoDiya: 0, adminKoWapas: 0 };
    for (const l of cleanLedger) {
      const a = Number(l.amount || 0);
      if (l.type === 'admin_to_master') h.adminDiya += a;
      else if (l.type === 'play_earning') h.kamaiLedger += a;
      else if (l.type === 'player_to_master' || l.type === 'withdrawal_approve') h.playersSeLiya += a;
      else if (l.type === 'master_to_player' || l.type === 'withdrawal_reject') h.playersKoDiya += a;
      else if (l.type === 'master_to_admin') h.adminKoWapas += a;
      // master_withdraw_request = sirf placeholder/record (asli debit
      // approve wale master_to_admin se ginte hain). master_withdraw_refund
      // ek rejected request ko cancel karta hai (jo hum count nahi karte).
      // Dono ko jaan-bujh kar skip — warna double/phantom ho jata hai.
    }
    const r = (n) => Math.round(n * 100) / 100;
    // Authoritative lifetime earnings (never misses) — fallback to
    // ledger sum only for very old masters without the field.
    const lifeEarned = master.lifetimeEarned != null ? Number(master.lifetimeEarned) : null;
    const kamai = lifeEarned != null && lifeEarned >= h.kamaiLedger ? lifeEarned : h.kamaiLedger;
    const bacha = r(h.adminDiya + kamai + h.playersSeLiya - h.playersKoDiya - h.adminKoWapas);
    const actual = r(Number(master.balance ?? master.walletBalance ?? 0));
    return {
      adminDiya: r(h.adminDiya), kamai: r(kamai), playersSeLiya: r(h.playersSeLiya),
      playersKoDiya: r(h.playersKoDiya), adminKoWapas: r(h.adminKoWapas),
      bacha, actual,
      match: Math.abs(bacha - actual) < 1,
      negative: actual < -0.5, // sirf yahi asli red-flag hai
      gap: r(Math.abs(bacha - actual)),
    };
  }, [cleanLedger, master.balance, master.walletBalance, master.lifetimeEarned]);
  const fmtDate = (ts) => {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString('en-IN') : '—';
  };

  // ── Earnings (all games) for a selectable date range, default today
  const istYmd = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const [eFrom, setEFrom] = useState(() => istYmd(new Date()));
  const [eTo, setETo] = useState(() => istYmd(new Date()));
  const [ePlay, setEPlay] = useState(null);
  const [eByUser, setEByUser] = useState({}); // uid → { total, games }
  const [eOpenUser, setEOpenUser] = useState(null); // which player row is expanded
  const [eBusy, setEBusy] = useState(false);
  const earnPct = Number(master.playEarnPercent ?? DEFAULT_MASTER_EARN_PCT);
  const adminPct = Number(master.commissionPercent) || 0;
  const ePlayerIds = useMemo(() => players.map((p) => p.id), [players]);

  const loadEarnings = async () => {
    if (ePlayerIds.length === 0) { setEPlay(0); setEByUser({}); return; }
    setEBusy(true);
    try {
      const [fy, fm, fd] = eFrom.split('-').map(Number);
      const [ty, tm, td] = eTo.split('-').map(Number);
      const start = new Date(Date.UTC(fy, fm - 1, fd, 0, 0, 0) - 5.5 * 3600e3);
      const end = new Date(Date.UTC(ty, tm - 1, td, 0, 0, 0) - 5.5 * 3600e3 + 864e5 - 1);
      const { total, byUser } = await sumPlayerTurnoverBreakdown(db, ePlayerIds, start, end);
      setEPlay(total);
      setEByUser(byUser);
    } catch { setEPlay(0); setEByUser({}); } finally { setEBusy(false); }
  };
  useEffect(() => {
    loadEarnings();
    const id = setInterval(loadEarnings, 30000); // live-ish
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eFrom, eTo, ePlayerIds.length]);

  const eEarned = ePlay == null ? null : Math.round(ePlay * (earnPct / 100) * 100) / 100;
  const eAdminCut = ePlay == null ? null : Math.round(ePlay * (adminPct / 100) * 100) / 100;
  const Stat = ({ label, value, tone }) => (
    <div className={`rounded-2xl p-5 text-white bg-gradient-to-br ${tone}`}>
      <p className="text-[11px] uppercase tracking-widest text-white/70">{label}</p>
      <p className="text-2xl md:text-3xl font-black mt-1">{value}</p>
    </div>
  );

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex items-center gap-3">
        <button onClick={onBack} className="text-sm bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg font-bold">← Back</button>
        <div>
          <h2 className="text-2xl font-black text-gray-800">{master.name || '—'}</h2>
          <p className="text-xs text-gray-500">{master.phoneNumber || master.id} · code {master.masterCode || '—'}</p>
        </div>
      </div>

      {/* ── Master ke paas abhi kitne points — bas yahi sach ── */}
      <div className="bg-white rounded-2xl shadow border overflow-hidden">
        <div className={`px-5 py-4 ${hisaab.negative ? 'bg-rose-600' : 'bg-emerald-600'}`}>
          <p className="text-white/80 text-xs font-bold uppercase tracking-wider">Master ke paas abhi</p>
          <p className="text-white text-4xl font-black mt-1">{formatCurrency(hisaab.actual)}</p>
        </div>
        <div className="p-5">
          {hisaab.negative ? (
            <p className="text-sm text-rose-700 bg-rose-50 rounded-lg px-3 py-2.5">
              ⚠ Ye <b>minus</b> me hai — ye galat hai. Mujhe screenshot bhejo, main check karunga.
            </p>
          ) : (
            <p className="text-sm text-gray-700">
              <b>{master.name || 'Master'}</b> ke paas abhi <b>{formatCurrency(hisaab.actual)}</b> hain — yahi final aur sahi hai. Niche saaf-saaf har cheez ka total:
            </p>
          )}
        </div>
      </div>

      {/* ── Bade-bade saaf totals — ek nazar me sab samajh aaye ── */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        <div className="rounded-2xl p-4 bg-gradient-to-br from-emerald-500 to-emerald-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">💰 Abhi bache hain</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.actual)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-indigo-500 to-indigo-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">🎮 Khelne se kamaye</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.kamai)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-rose-500 to-rose-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">🏧 Admin se withdrawal liya</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.adminKoWapas)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-amber-500 to-amber-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">🎁 Players ko diye</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.playersKoDiya)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-sky-500 to-sky-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">⬇️ Admin ne diye</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.adminDiya)}</p>
        </div>
        <div className="rounded-2xl p-4 bg-gradient-to-br from-teal-500 to-teal-700 text-white">
          <p className="text-[11px] uppercase tracking-wider text-white/80">↩️ Players se wapas liye</p>
          <p className="text-3xl font-black mt-1 break-words">{formatCurrency(hisaab.playersSeLiya)}</p>
        </div>
      </div>

      {/* Chhoti jaankari */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-[10px] uppercase text-gray-500">Players</p>
          <p className="text-xl font-black text-gray-800">{players.length}</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-[10px] uppercase text-gray-500">Master kamai %</p>
          <p className="text-xl font-black text-indigo-700">{earnPct}%</p>
        </div>
        <div className="bg-white rounded-xl border p-3 text-center">
          <p className="text-[10px] uppercase text-gray-500">Admin commission %</p>
          <p className="text-xl font-black text-slate-700">{adminPct}%</p>
        </div>
      </div>

      {/* Buttons — saaf Hinglish */}
      <div className="flex flex-wrap gap-2">
        <button onClick={() => onTopUp(master)} className="bg-amber-500 hover:bg-amber-600 text-white px-4 py-2 rounded-lg text-sm font-bold">Points do / lo (+ / −)</button>
        <button onClick={() => onSetEarn?.(master)} className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Master kamai % set</button>
        <button onClick={() => onSetCommission(master)} className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm font-bold">Admin commission % set</button>
        {master.masterCode && (
          <button
            onClick={() => navigator.clipboard.writeText(buildMasterReferralLink(master.masterCode)).then(() => toast.success('Link copy ho gaya'))}
            className="bg-gray-200 hover:bg-gray-300 px-4 py-2 rounded-lg text-sm font-bold"
          >Share link copy</button>
        )}
      </div>

      {/* Earnings — date range, big, live */}
      <div className="bg-white rounded-2xl shadow border p-4 md:p-5">
        <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
          <div>
            <h3 className="text-lg font-black text-gray-800">💵 Kamai (date chuno)</h3>
            <p className="text-xs text-gray-500">Players jitna khelte hain uska {earnPct}% master ko milta hai. (Admin commission {adminPct}%.)</p>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-1">From</label>
              <input type="date" value={eFrom} max={eTo} onChange={(e) => setEFrom(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-gray-500 mb-1">To</label>
              <input type="date" value={eTo} min={eFrom} max={istYmd(new Date())} onChange={(e) => setETo(e.target.value)}
                className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
            </div>
            <button onClick={() => { const t = istYmd(new Date()); setEFrom(t); setETo(t); }}
              className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 text-xs font-bold">Today</button>
            <button onClick={loadEarnings}
              className="bg-yellow-400 hover:bg-yellow-500 rounded-lg px-3 py-2 text-xs font-bold">{eBusy ? '…' : '🔄'}</button>
          </div>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Stat label="Total khela (is range me)" value={ePlay == null ? '…' : formatCurrency(ePlay)} tone="from-indigo-600 to-indigo-800" />
          <Stat label={`Master ki kamai (${earnPct}%)`} value={eEarned == null ? '…' : formatCurrency(eEarned)} tone="from-emerald-600 to-emerald-800" />
          <Stat label={`Admin commission (${adminPct}%)`} value={eAdminCut == null ? '…' : formatCurrency(eAdminCut)} tone="from-blue-600 to-blue-800" />
        </div>
        <p className="text-[11px] text-gray-500 mt-3">
          Saare games gine jaate hain. Har 30 sec auto update. Master ki kamai uske wallet me apne aap jud jaati hai.
        </p>

        {/* Kis player se / kis game se kitni earning — plain table.
            Player pe click karo to game-wise khul jaata hai. */}
        <div className="mt-4 border-t pt-4">
          <p className="text-sm font-bold text-gray-800 mb-2">
            Kis player se kitni kamai (range me)
          </p>
          {ePlay == null ? (
            <p className="text-xs text-gray-500">Loading…</p>
          ) : (() => {
            const rows = players
              .map((p) => {
                const u = eByUser[p.id] || { total: 0, games: {} };
                return {
                  id: p.id,
                  name: p.name || p.phoneNumber || p.id,
                  play: u.total || 0,
                  earn: Math.round((u.total || 0) * (earnPct / 100) * 100) / 100,
                  games: u.games || {},
                };
              })
              .sort((a, b) => b.play - a.play);
            return (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[460px] text-sm">
                  <thead className="bg-gray-50 border-y text-[10px] uppercase text-gray-500">
                    <tr>
                      <th className="text-left px-3 py-2">Player</th>
                      <th className="text-right px-3 py-2">Khela (play)</th>
                      <th className="text-right px-3 py-2">Master ki kamai ({earnPct}%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((r) => {
                      const open = eOpenUser === r.id;
                      const gameRows = Object.entries(r.games)
                        .sort((a, b) => b[1] - a[1]);
                      return (
                        <Fragment key={r.id}>
                          <tr
                            onClick={() => setEOpenUser(open ? null : r.id)}
                            className={`border-b cursor-pointer hover:bg-gray-50 ${open ? 'bg-indigo-50' : ''}`}
                          >
                            <td className="px-3 py-2 font-semibold text-gray-800">
                              {r.play > 0 ? (open ? '▲ ' : '▼ ') : ''}{r.name}
                            </td>
                            <td className="px-3 py-2 text-right">{formatCurrency(r.play)}</td>
                            <td className="px-3 py-2 text-right font-bold text-emerald-700">
                              +{formatCurrency(r.earn)}
                            </td>
                          </tr>
                          {open && gameRows.length > 0 && gameRows.map(([col, amt]) => (
                            <tr key={r.id + col} className="bg-indigo-50/40 text-xs">
                              <td className="px-3 py-1.5 pl-8 text-gray-600">
                                {GAME_LABELS[col] || col}
                              </td>
                              <td className="px-3 py-1.5 text-right text-gray-600">
                                {formatCurrency(amt)}
                              </td>
                              <td className="px-3 py-1.5 text-right text-emerald-600">
                                +{formatCurrency(Math.round(amt * (earnPct / 100) * 100) / 100)}
                              </td>
                            </tr>
                          ))}
                          {open && gameRows.length === 0 && (
                            <tr className="bg-indigo-50/40 text-xs">
                              <td colSpan={3} className="px-3 py-1.5 pl-8 text-gray-500">
                                Is range me koi game nahi khela.
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                    {rows.length === 0 && (
                      <tr><td colSpan={3} className="px-3 py-3 text-center text-gray-500">Koi player nahi.</td></tr>
                    )}
                  </tbody>
                  <tfoot>
                    <tr className="font-bold border-t bg-gray-50">
                      <td className="px-3 py-2">Total</td>
                      <td className="px-3 py-2 text-right">{formatCurrency(ePlay || 0)}</td>
                      <td className="px-3 py-2 text-right text-emerald-700">+{formatCurrency(eEarned || 0)}</td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            );
          })()}
        </div>
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
                  <th className="text-center px-3 py-2">Split %</th>
                  <th className="text-left px-3 py-2">Joined</th>
                </tr>
              </thead>
              <tbody>
                {players.map((p) => {
                  const hasSplit = p.splitMasterPct != null || p.splitPlayerPct != null;
                  return (
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
                    <td className="px-3 py-2 text-center whitespace-nowrap">
                      {hasSplit ? (
                        <span className="text-[11px] font-bold text-fuchsia-700">
                          P {Number(p.splitPlayerPct || 0)}% · M {Number(p.splitMasterPct || 0)}%
                        </span>
                      ) : (
                        <span className="text-[11px] text-gray-400">Default ({earnPct}% master)</span>
                      )}
                      <button
                        onClick={() => setSplitFor(p)}
                        className="ml-2 text-[11px] font-bold text-blue-600 hover:underline"
                      >Set</button>
                    </td>
                    <td className="px-3 py-2 text-xs text-gray-600">{fmtDate(p.createdAt)}</td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Ledger */}
      <div className="bg-white rounded-xl shadow border">
        <div className="border-b px-4 py-3">
          <h3 className="font-bold">History — paise ka aana-jaana</h3>
          <p className="text-xs text-gray-500 mt-0.5">Har line: kab, kya hua, kitne points (+ aaye / − gaye).</p>
        </div>
        {cleanLedger.length === 0 ? (
          <p className="p-4 text-sm text-gray-500 text-center">Abhi tak kuch nahi hua.</p>
        ) : (
          <div className="divide-y">
            {cleanLedger.map((l) => {
              const who = l.playerId ? (playerNames[l.playerId] || l.playerId) : null;
              const M = {
                admin_to_master:        { text: 'Admin ne points diye', cr: true },
                master_to_admin:        { text: 'Master ne admin se withdrawal liya', cr: false },
                master_withdraw_request:{ text: 'Master ne withdrawal maanga', cr: false },
                master_withdraw_refund: { text: 'Master ka withdrawal reject — wapas', cr: true },
                play_earning:           { text: 'Players ke khelne se auto kamai', cr: true },
                master_to_player:       { text: `${who || 'Player'} ko points diye`, cr: false },
                player_to_master:       { text: `${who || 'Player'} se points liye`, cr: true },
                withdrawal_approve:     { text: `${who || 'Player'} ki withdrawal approve ki`, cr: true },
                withdrawal_reject:      { text: `${who || 'Player'} ki withdrawal reject ki`, cr: false },
                player_cashback:        { text: `${who || 'Player'} ko khelne ka cashback`, info: true },
              };
              let v = M[l.type] || { text: l.note || l.type || '—', cr: false };
              // master_withdraw_request = sirf record (asli minus to
              // approve wali "master_to_admin" line se ginte/dikhate
              // hain). Ise info-only dikhao taaki 744 do baar na lage.
              if (l.type === 'master_withdraw_request') {
                v = { text: 'Master ne withdrawal maanga (record — approve par minus hua)', info: true };
              }
              return (
                <div key={l.id} className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-800">{v.text}</p>
                    <p className="text-[11px] text-gray-400">{fmtDate(l.createdAt)}</p>
                  </div>
                  <div className={`text-sm font-bold whitespace-nowrap ${l.type === 'player_cashback' ? 'text-fuchsia-600' : v.info ? 'text-gray-400' : v.cr ? 'text-emerald-600' : 'text-rose-600'}`}>
                    {l.type === 'player_cashback'
                      ? <>{formatCurrency(l.amount)} → player</>
                      : v.info ? 'sirf record' : <>{v.cr ? '+' : '−'}{formatCurrency(l.amount)}</>}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {splitFor && (
        <PlayerSplitModal
          player={splitFor}
          masterEarnPct={earnPct}
          onClose={() => setSplitFor(null)}
        />
      )}
    </div>
  );
}

// Per-player earn split. Admin sets, for ONE player under a master,
// kitna % player ke apne (playable) wallet me wapas aaye aur kitna %
// master ko. Dono non-withdrawable (sirf khel sakte hain). Clear =
// default (master ko global earn% milta hai, player ko kuch nahi).
function PlayerSplitModal({ player, masterEarnPct, onClose }) {
  const has = player.splitMasterPct != null || player.splitPlayerPct != null;
  const [playerPct, setPlayerPct] = useState(has ? String(player.splitPlayerPct ?? 0) : '');
  const [masterPct, setMasterPct] = useState(has ? String(player.splitMasterPct ?? 0) : '');
  const [busy, setBusy] = useState(false);

  const save = async () => {
    const pp = Number(playerPct), mp = Number(masterPct);
    if (!Number.isFinite(pp) || !Number.isFinite(mp) || pp < 0 || mp < 0 || pp > 100 || mp > 100) {
      return toast.error('0–100 ke beech valid % daalo.');
    }
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', player.id), {
        splitPlayerPct: Math.round(pp * 100) / 100,
        splitMasterPct: Math.round(mp * 100) / 100,
      });
      toast.success(`${player.name || 'Player'}: player ${pp}% · master ${mp}% set.`);
      onClose();
    } catch (err) {
      toast.error('Save fail: ' + (err.message || err));
    } finally { setBusy(false); }
  };

  const clearOverride = async () => {
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', player.id), {
        splitPlayerPct: null,
        splitMasterPct: null,
      });
      toast.success('Default pe wapas — master ko global earn% milega.');
      onClose();
    } catch (err) {
      toast.error('Clear fail: ' + (err.message || err));
    } finally { setBusy(false); }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-xl shadow-xl">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Player ka % split — {player.name || 'Player'}</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p className="bg-fuchsia-50 border border-fuchsia-200 rounded-lg p-3 text-xs text-fuchsia-900">
            Ye player jitna <b>khelega</b> uska:
            <br/>• <b>Player %</b> → is player ke <b>khelne-wale wallet</b> me wapas (withdraw nahi, sirf khel sakta hai)
            <br/>• <b>Master %</b> → master ke earnings me (withdraw nahi)
            <br/>Khaali/clear karoge to <b>default</b>: master ko {masterEarnPct}% milega, player ko kuch nahi.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Player % (player ko)</label>
              <input type="number" min="0" max="100" step="0.5" value={playerPct}
                onChange={(e) => setPlayerPct(e.target.value)} placeholder="e.g. 8"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Master % (master ko)</label>
              <input type="number" min="0" max="100" step="0.5" value={masterPct}
                onChange={(e) => setMasterPct(e.target.value)} placeholder="e.g. 2"
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
            </div>
          </div>
        </div>
        <div className="border-t p-4 flex justify-between gap-2">
          <button onClick={clearOverride} disabled={busy}
            className="px-4 py-2 bg-gray-200 hover:bg-gray-300 rounded font-bold text-sm disabled:opacity-40">
            Clear (default)
          </button>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 bg-gray-100 rounded text-sm">Cancel</button>
            <button onClick={save} disabled={busy}
              className="px-5 py-2 bg-fuchsia-600 hover:bg-fuchsia-700 text-white font-bold rounded disabled:opacity-40 text-sm">
              {busy ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Set the master's auto-earn % — what share of their players' total
// play gets auto-credited into the master's points pool. Separate
// from the admin commission %. Default 10%.
function EarnPctModal({ master, onClose }) {
  const [pct, setPct] = useState(String(master.playEarnPercent ?? DEFAULT_MASTER_EARN_PCT));
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const n = Number(pct);
    if (!Number.isFinite(n) || n < 0 || n > 100) return toast.error('0–100 ke beech daalo.');
    setBusy(true);
    try {
      await updateDoc(doc(db, 'users', master.id), {
        playEarnPercent: Math.round(n * 100) / 100,
      });
      toast.success(`Master earn % set to ${n}%`);
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
          <h3 className="font-bold text-lg">Master auto-earn %</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p>
            <b>{master.name || '—'}</b> ke players jitna <b>play</b> karenge uska
            kitna % automatically <b>master ke points me</b> add ho jaye?
          </p>
          <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-3 text-xs text-emerald-900">
            Example: players ne ₹1000 ka play kiya, earn % = <b>{pct || 0}%</b> →
            master ke points me <b>₹{((Number(pct) || 0) * 10).toFixed(2)}</b> auto add.
            Ye points master withdraw nahi kar sakta — sirf aage players ko de sakta hai.
            (Admin ka apna commission % isse alag hai.)
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Earn % (0–100)</label>
            <input type="number" min="0" max="100" step="0.5" value={pct}
              onChange={(e) => setPct(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
          </div>
          <div className="grid grid-cols-5 gap-2 text-xs">
            {[0, 5, 10, 15, 20].map((v) => (
              <button key={v} onClick={() => setPct(String(v))}
                className="bg-gray-100 hover:bg-gray-200 rounded-lg py-1.5">{v}%</button>
            ))}
          </div>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded disabled:opacity-40">
            {busy ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
}

// Mark commission collected from a master. Partial payments are
// fully supported — pending just recomputes as (earned − total paid)
// so leftover carries forward and future commission stacks on top.
function MarkPaidModal({ master, pending, onClose }) {
  const [amount, setAmount] = useState(String(pending > 0 ? pending : 0));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const v = Number(amount);
    if (!Number.isFinite(v) || v <= 0) return toast.error('Valid amount daalo.');
    setBusy(true);
    try {
      await addDoc(collection(db, 'masterLedger'), {
        type: 'commission_paid',
        masterId: master.id,
        masterName: master.name || null,
        amount: v,
        note: note.trim() || `Commission received ${new Date().toLocaleDateString('en-IN')}`,
        createdAt: serverTimestamp(),
      });
      toast.success(`${formatCurrency(v)} received from ${master.name || 'master'} recorded.`);
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
          <h3 className="font-bold text-lg">Mark commission received</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3 text-sm">
          <p><b>{master.name || master.id}</b> ka pending commission: <span className="font-bold text-blue-700">{formatCurrency(pending)}</span></p>
          <p className="text-xs text-gray-600">
            Partial bhi de sakte ho. Maan lo ₹100 banta hai, abhi ₹50 le liya → ₹50 enter karo. Baaki ₹50 pending rahega aur aage ka commission usme jud ke chadhega.
          </p>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Amount received (₹)</label>
            <input type="number" min="0" value={amount} onChange={(e) => setAmount(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-base" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-gray-600 mb-1">Note (optional)</label>
            <input type="text" value={note} onChange={(e) => setNote(e.target.value)}
              placeholder="Cash / UPI / part payment"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded disabled:opacity-40">
            {busy ? 'Saving…' : '✓ Record payment'}
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
  const [commissionFor, setCommissionFor] = useState(null);
  const [earnPctFor, setEarnPctFor] = useState(null);
  const [markPaidFor, setMarkPaidFor] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const reconciledRef = useRef(false);
  const [search, setSearch] = useState('');
  const [detailMasterId, setDetailMasterId] = useState(null);

  // Date range for the commission view. Default = last 30 days so a
  // fresh site shows everything; admin can widen / narrow freely.
  const istYmd = (d) => new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(d);
  const [rangeFrom, setRangeFrom] = useState(() => istYmd(new Date(Date.now() - 30 * 864e5)));
  const [rangeTo, setRangeTo] = useState(() => istYmd(new Date()));
  const rangeStart = useMemo(() => {
    const [y, m, d] = rangeFrom.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 3600e3);
  }, [rangeFrom]);
  const rangeEnd = useMemo(() => {
    const [y, m, d] = rangeTo.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d, 0, 0, 0) - 5.5 * 3600e3 + 864e5 - 1);
  }, [rangeTo]);

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

  // Player counts grouped by master uid + a userId→masterId map so we
  // can attribute each bet to the right master.
  const [playerCounts, setPlayerCounts] = useState({});
  const [userMasterMap, setUserMasterMap] = useState({});
  useEffect(() => {
    const q = query(collection(db, 'users'), where('role', '==', 'user'));
    return onSnapshot(q, (snap) => {
      const counts = {};
      const map = {};
      snap.docs.forEach((d) => {
        const m = d.data().assignedMasterId;
        if (m) { counts[m] = (counts[m] || 0) + 1; map[d.id] = m; }
      });
      setPlayerCounts(counts);
      setUserMasterMap(map);
    }, () => {});
  }, []);

  // Bets in the selected range (turnover basis for commission) +
  // commission_paid ledger in range. Three game families cover the
  // bulk of play; query bounded by the range so reads stay sane.
  const [haruf, setHaruf] = useState([]);
  const [aviator, setAviator] = useState([]);
  const [sports, setSports] = useState([]);
  const [settlements, setSettlements] = useState([]);

  // Master's own deposit/withdrawal requests TO admin (separate from
  // player money). Live list of everything; we surface pending ones.
  const [masterReqs, setMasterReqs] = useState([]);
  const [reqBusy, setReqBusy] = useState(null);
  useEffect(() => {
    const q = query(collection(db, 'masterRequests'));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => (b.createdAt?.toDate?.()?.getTime() || 0) - (a.createdAt?.toDate?.()?.getTime() || 0));
      setMasterReqs(rows);
    }, () => setMasterReqs([]));
  }, []);

  const pendingMasterReqs = useMemo(
    () => masterReqs.filter((r) => r.status === 'pending'),
    [masterReqs],
  );

  // Decide a master request.
  //   deposit  approve → credit master points
  //   withdraw approve → points ALREADY deducted at request time
  //                      (req.debited), so do NOT deduct again —
  //                      just mark approved (admin paid the cash out).
  //   withdraw reject  → REFUND the points back to the master.
  //   deposit  reject  → nothing to refund (no debit happened).
  // Atomic, logged to masterLedger.
  const decideMasterReq = async (req, action) => {
    setReqBusy(req.id);
    try {
      const reason = action === 'rejected'
        ? (window.prompt('Reject reason (optional):', '') ?? '')
        : '';
      const msg = await decideMasterRequest(db, req, action, reason);
      if (action === 'rejected') toast.info(msg);
      else toast.success(msg);
    } catch (err) {
      toast.error('Failed: ' + (err?.message || err));
    } finally {
      setReqBusy(null);
    }
  };

  useEffect(() => {
    const qH = query(collection(db, 'harufBets'),   where('timestamp', '>=', Timestamp.fromDate(rangeStart)));
    return onSnapshot(qH, (s) => setHaruf(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setHaruf([]));
  }, [rangeStart]);
  useEffect(() => {
    const qA = query(collection(db, 'aviatorBets'), where('createdAt', '>=', Timestamp.fromDate(rangeStart)));
    return onSnapshot(qA, (s) => setAviator(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setAviator([]));
  }, [rangeStart]);
  useEffect(() => {
    const qS = query(collection(db, 'sportsBets'),  where('createdAt', '>=', Timestamp.fromDate(rangeStart)));
    return onSnapshot(qS, (s) => setSports(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSports([]));
  }, [rangeStart]);
  useEffect(() => {
    const qL = query(
      collection(db, 'masterLedger'),
      where('type', '==', 'commission_paid'),
      where('createdAt', '>=', Timestamp.fromDate(rangeStart)),
    );
    return onSnapshot(qL, (s) => setSettlements(s.docs.map((d) => ({ id: d.id, ...d.data() }))), () => setSettlements([]));
  }, [rangeStart]);

  // Per-master commission for the visible range:
  //   turnover  = sum of player bets in range
  //   commission= turnover × master.commissionPercent
  //   paid      = sum of commission_paid in range
  //   pending   = commission − paid  (carries forward; partials work)
  const commissionByMaster = useMemo(() => {
    const res = {};
    const within = (ts) => {
      const d = ts?.toDate?.();
      return d && d >= rangeStart && d <= rangeEnd;
    };
    const addBet = (b) => {
      const mid = userMasterMap[b.userId];
      if (!mid) return;
      const ts = b.timestamp || b.createdAt;
      if (!within(ts)) return;
      res[mid] = res[mid] || { turnover: 0, paid: 0 };
      res[mid].turnover += Number(b.betAmount || 0);
    };
    haruf.forEach(addBet);
    aviator.forEach(addBet);
    sports.forEach(addBet);
    for (const s of settlements) {
      if (!within(s.createdAt)) continue;
      res[s.masterId] = res[s.masterId] || { turnover: 0, paid: 0 };
      res[s.masterId].paid += Number(s.amount || 0);
    }
    return res;
  }, [haruf, aviator, sports, settlements, userMasterMap, rangeStart, rangeEnd]);

  const masterCommission = (m) => {
    const c = commissionByMaster[m.id] || { turnover: 0, paid: 0 };
    const pct = Number(m.commissionPercent) || 0;
    const earned = Math.round(c.turnover * (pct / 100) * 100) / 100;
    const paid = Math.round(c.paid * 100) / 100;
    const pending = Math.round((earned - paid) * 100) / 100;
    return { turnover: c.turnover, pct, earned, paid, pending };
  };

  // masterId → [playerIds], inverted from userMasterMap.
  const playersByMaster = useMemo(() => {
    const m = {};
    for (const [uid, mid] of Object.entries(userMasterMap)) {
      (m[mid] = m[mid] || []).push(uid);
    }
    return m;
  }, [userMasterMap]);

  // Auto play-earning reconcile. Runs once per mount when masters +
  // player map are ready (admin opening this tab IS the trigger), and
  // can be re-run on demand with the "Sync earnings" button. The
  // helper is idempotent — only ever credits NEW play, never double.
  const runReconcile = async (silent) => {
    if (syncing) return;
    setSyncing(true);
    let total = 0;
    try {
      for (const m of activeMasters) {
        const ids = playersByMaster[m.id] || [];
        if (ids.length === 0) continue;
        // pehle yahan `if (globalPct<=0) continue` tha — hata diya:
        // per-player split tab bhi chal sakta hai jab master ka
        // global earn% 0 ho. reconcile khud per-player handle karta.
        // eslint-disable-next-line no-await-in-loop
        const res = await reconcileMasterPlayEarnings(db, m, ids);
        total += (res && res.credited) || 0;
      }
      if (!silent) {
        toast.success(total > 0
          ? `Earnings synced — ${formatCurrency(total)} credited across masters.`
          : 'Earnings already up to date.');
      }
    } catch (err) {
      console.error('Reconcile failed:', err);
      if (!silent) toast.error('Sync failed: ' + (err.message || err));
    } finally {
      setSyncing(false);
    }
  };

  // Auto-reconcile on first data + then every 20s while the tab is
  // open, so masters' earnings keep crediting live even when no
  // master has their own panel open. Fully automatic, no button.
  useEffect(() => {
    if (activeMasters.length === 0) return undefined;
    if (Object.keys(userMasterMap).length === 0) return undefined;
    if (!reconciledRef.current) {
      reconciledRef.current = true;
      runReconcile(true);
    }
    const id = setInterval(() => runReconcile(true), 20000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMasters, userMasterMap]);

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
    let totalEarned = 0;
    let totalPaid = 0;
    let totalPending = 0;
    for (const m of activeMasters) {
      totalPoints += Number(m.balance ?? m.walletBalance ?? 0);
      totalPlayers += (playerCounts[m.id] || 0);
      if (Number(m.commissionPercent) > 0) withCommission++;
      const cm = masterCommission(m);
      totalEarned += cm.earned;
      totalPaid += cm.paid;
      totalPending += cm.pending;
    }
    return {
      total: activeMasters.length + pendingMasters.length,
      active: activeMasters.length,
      pending: pendingMasters.length,
      totalPoints,
      totalPlayers,
      withCommission,
      totalEarned: Math.round(totalEarned * 100) / 100,
      totalPaid: Math.round(totalPaid * 100) / 100,
      totalPending: Math.round(totalPending * 100) / 100,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeMasters, pendingMasters, playerCounts, commissionByMaster]);

  // Drill-down view takes precedence when a master row is clicked.
  const detailMaster = useMemo(
    () => masters.find((m) => m.id === detailMasterId) || null,
    [masters, detailMasterId],
  );
  if (detailMaster) {
    const cm = masterCommission(detailMaster);
    return (
      <>
        <MasterDetail
          master={detailMaster}
          onBack={() => setDetailMasterId(null)}
          onTopUp={(m) => setTopUpFor(m)}
          onSetCommission={(m) => setCommissionFor(m)}
          onSetEarn={(m) => setEarnPctFor(m)}
        />
        {topUpFor && (
          <TopUpModal master={topUpFor} onClose={() => setTopUpFor(null)} onDone={() => {}} />
        )}
        {commissionFor && (
          <CommissionModal master={commissionFor} onClose={() => setCommissionFor(null)} />
        )}
        {earnPctFor && (
          <EarnPctModal master={earnPctFor} onClose={() => setEarnPctFor(null)} />
        )}
        {markPaidFor && (
          <MarkPaidModal master={markPaidFor} pending={cm.pending} onClose={() => setMarkPaidFor(null)} />
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
        <div className="flex items-center gap-3">
          <span className="hidden sm:flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            {syncing ? 'syncing…' : 'auto-syncing live'}
          </span>
          <button
            onClick={() => setCreateOpen(true)}
            className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded"
          >
            + Create master
          </button>
        </div>
      </div>

      {/* Date range — drives every commission number below */}
      <div className="bg-white rounded-xl border p-4 mb-4">
        <p className="text-sm font-bold text-gray-700 mb-2">📅 Commission period</p>
        <div className="flex flex-wrap items-end gap-3">
          <div>
            <label className="block text-[11px] uppercase text-gray-500 mb-1">From</label>
            <input type="date" value={rangeFrom} max={rangeTo}
              onChange={(e) => setRangeFrom(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-[11px] uppercase text-gray-500 mb-1">To</label>
            <input type="date" value={rangeTo} min={rangeFrom} max={istYmd(new Date())}
              onChange={(e) => setRangeTo(e.target.value)}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm" />
          </div>
          <div className="flex gap-2 text-xs">
            <button onClick={() => { const t = istYmd(new Date()); setRangeFrom(t); setRangeTo(t); }}
              className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 font-semibold">Today</button>
            <button onClick={() => { setRangeFrom(istYmd(new Date(Date.now() - 6 * 864e5))); setRangeTo(istYmd(new Date())); }}
              className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 font-semibold">7 days</button>
            <button onClick={() => { setRangeFrom(istYmd(new Date(Date.now() - 29 * 864e5))); setRangeTo(istYmd(new Date())); }}
              className="bg-gray-100 hover:bg-gray-200 rounded-lg px-3 py-2 font-semibold">30 days</button>
          </div>
        </div>
      </div>

      {/* Big summary — live */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
        <div className="rounded-2xl bg-gradient-to-br from-slate-700 to-slate-900 text-white p-5">
          <p className="text-xs uppercase tracking-widest text-white/60">Masters</p>
          <p className="text-3xl font-black mt-1">{aggregate.active}</p>
          <p className="text-xs text-white/60 mt-1">{aggregate.pending} pending OTP</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-emerald-600 to-emerald-800 text-white p-5">
          <p className="text-xs uppercase tracking-widest text-white/70">Points held</p>
          <p className="text-3xl font-black mt-1">{formatCurrency(aggregate.totalPoints)}</p>
          <p className="text-xs text-white/70 mt-1">{aggregate.totalPlayers} players total</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-blue-600 to-blue-800 text-white p-5">
          <p className="text-xs uppercase tracking-widest text-white/70">Commission earned</p>
          <p className="text-3xl font-black mt-1">{formatCurrency(aggregate.totalEarned)}</p>
          <p className="text-xs text-white/70 mt-1">received {formatCurrency(aggregate.totalPaid)}</p>
        </div>
        <div className="rounded-2xl bg-gradient-to-br from-rose-600 to-rose-800 text-white p-5">
          <p className="text-xs uppercase tracking-widest text-white/80">Pending to collect</p>
          <p className="text-3xl font-black mt-1">{formatCurrency(aggregate.totalPending)}</p>
          <p className="text-xs text-white/80 mt-1">selected period</p>
        </div>
      </div>

      {/* Master's own deposit/withdrawal requests — SEPARATE from
          player money. Only pending shown here for action. */}
      {pendingMasterReqs.length > 0 && (
        <div className="bg-white rounded-2xl shadow border mb-5 overflow-hidden">
          <div className="bg-amber-50 border-b px-4 py-3">
            <h3 className="font-black text-amber-900">🏦 Master Requests ({pendingMasterReqs.length})</h3>
            <p className="text-[11px] text-amber-700">
              Masters ke apne points ke deposit/withdrawal — players ke paise se alag.
            </p>
          </div>
          <ul className="divide-y">
            {pendingMasterReqs.map((r) => (
              <li key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="font-bold text-gray-800">
                    {r.masterName || r.masterId}
                    <span className={`ml-2 text-[10px] px-2 py-0.5 rounded-full font-bold ${
                      r.type === 'deposit' ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'
                    }`}>{r.type === 'deposit' ? '+ DEPOSIT' : '− WITHDRAWAL'}</span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {formatCurrency(r.amount)} · {r.createdAt?.toDate?.()?.toLocaleString('en-IN') || '—'}
                    {r.note ? ` · ${r.note}` : ''}
                  </p>
                  {r.type === 'withdrawal' && (
                    <div className="mt-1.5 inline-block rounded-lg bg-yellow-50 border border-yellow-200 px-3 py-1.5 text-[11px] text-gray-700">
                      <span className="font-bold text-yellow-800 uppercase mr-1">
                        {r.payMethod === 'bank' ? 'Bank' : 'UPI'} — yahan pay karo:
                      </span>
                      {r.payMethod === 'bank' ? (
                        <>
                          A/C <b className="select-all">{r.accountNumber || '—'}</b>
                          {' · '}IFSC <b className="select-all">{r.ifscCode || '—'}</b>
                          {' · '}{r.bankName || '—'}
                        </>
                      ) : (
                        <>UPI <b className="select-all">{r.upiId || '—'}</b></>
                      )}
                    </div>
                  )}
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => decideMasterReq(r, 'approved')}
                    disabled={reqBusy === r.id}
                    className="bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded text-xs"
                  >{reqBusy === r.id ? '…' : '✓ Approve'}</button>
                  <button
                    onClick={() => decideMasterReq(r, 'rejected')}
                    disabled={reqBusy === r.id}
                    className="bg-rose-600 hover:bg-rose-700 disabled:opacity-40 text-white font-bold px-4 py-1.5 rounded text-xs"
                  >✗ Reject</button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="🔍 Search master by name, phone or code…"
          className="w-full md:w-96 border border-gray-300 rounded-lg px-4 py-2.5 text-sm"
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
        <div className="grid gap-4 md:grid-cols-2">
          {filtered.map((m) => {
            const cm = m.pending ? { turnover: 0, pct: 0, earned: 0, paid: 0, pending: 0 } : masterCommission(m);
            return (
              <div
                key={`${m.pending ? 'p_' : 'a_'}${m.id}`}
                className={`rounded-2xl border-2 p-4 transition ${
                  m.pending ? 'bg-amber-50 border-amber-200'
                            : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'
                }`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-3">
                  <div
                    className={!m.pending ? 'cursor-pointer' : ''}
                    onClick={() => !m.pending && setDetailMasterId(m.id)}
                  >
                    <p className="text-lg font-black text-gray-800">{m.name || '—'}</p>
                    <p className="text-xs text-gray-500">{m.phoneNumber || m.id || '—'}</p>
                  </div>
                  <div className="text-right">
                    {m.pending
                      ? <span className="text-[10px] bg-amber-200 text-amber-800 px-2 py-1 rounded-full font-bold">PENDING OTP</span>
                      : <span className="text-[10px] bg-emerald-100 text-emerald-700 px-2 py-1 rounded-full font-bold">● ACTIVE</span>}
                    {m.masterCode && (
                      <button
                        onClick={(e) => copy(m.masterCode, 'Code', e)}
                        className="block mt-1.5 bg-yellow-100 text-yellow-800 font-mono font-bold px-2 py-0.5 rounded text-xs"
                      >{m.masterCode}</button>
                    )}
                  </div>
                </div>

                {/* Money row */}
                <div className="grid grid-cols-4 gap-2 mt-4 text-center">
                  <div className="bg-emerald-50 rounded-lg py-2">
                    <p className="text-[9px] uppercase text-gray-500">Points</p>
                    <p className="text-sm font-bold text-emerald-700">{formatCurrency(m.balance ?? m.walletBalance ?? 0)}</p>
                  </div>
                  <div className="bg-blue-50 rounded-lg py-2">
                    <p className="text-[9px] uppercase text-gray-500">Players</p>
                    <p className="text-sm font-bold text-blue-700">{m.pending ? '—' : (playerCounts[m.id] || 0)}</p>
                  </div>
                  <div className="bg-gray-50 rounded-lg py-2">
                    <p className="text-[9px] uppercase text-gray-500">Admin %</p>
                    <p className="text-sm font-bold text-gray-700">{cm.pct}%</p>
                  </div>
                  <div className="bg-emerald-50 rounded-lg py-2">
                    <p className="text-[9px] uppercase text-gray-500">Earn %</p>
                    <p className="text-sm font-bold text-emerald-700">{Number(m.playEarnPercent ?? 10)}%</p>
                  </div>
                </div>
                <div className="mt-2 bg-indigo-50 rounded-lg py-2 text-center">
                  <p className="text-[9px] uppercase text-gray-500">Total Play (period)</p>
                  <p className="text-sm font-bold text-indigo-700">{formatCurrency(cm.turnover)}</p>
                </div>

                {/* Commission strip */}
                {!m.pending && cm.pct > 0 && (
                  <div className="mt-3 rounded-xl bg-gradient-to-r from-blue-50 to-rose-50 border border-blue-100 p-3 flex items-center justify-between">
                    <div className="text-xs">
                      <span className="text-gray-600">Earned </span>
                      <span className="font-bold text-blue-700">{formatCurrency(cm.earned)}</span>
                      <span className="text-gray-400"> · paid </span>
                      <span className="font-bold text-emerald-700">{formatCurrency(cm.paid)}</span>
                    </div>
                    <div className="text-right">
                      <p className="text-[9px] uppercase text-gray-500">Pending</p>
                      <p className={`text-lg font-black ${cm.pending > 0 ? 'text-rose-600' : 'text-emerald-600'}`}>
                        {formatCurrency(cm.pending)}
                      </p>
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2 mt-3">
                  {!m.pending && (
                    <button
                      onClick={() => setDetailMasterId(m.id)}
                      className="flex-1 min-w-[80px] text-xs bg-slate-700 hover:bg-slate-800 text-white font-bold py-2 rounded-lg"
                    >View</button>
                  )}
                  {!m.pending && cm.pending > 0 && (
                    <button
                      onClick={() => setMarkPaidFor(m)}
                      className="flex-1 min-w-[90px] text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg"
                    >Mark Paid</button>
                  )}
                  {!m.pending && (
                    <button
                      onClick={() => setCommissionFor(m)}
                      className="flex-1 min-w-[70px] text-xs bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 rounded-lg"
                      title="Admin's commission % collected FROM this master"
                    >Admin %</button>
                  )}
                  {!m.pending && (
                    <button
                      onClick={() => setEarnPctFor(m)}
                      className="flex-1 min-w-[70px] text-xs bg-emerald-600 hover:bg-emerald-700 text-white font-bold py-2 rounded-lg"
                      title="Master's auto-earn % of player play, credited to their points"
                    >Earn %</button>
                  )}
                  <button
                    onClick={() => setTopUpFor(m)}
                    className="flex-1 min-w-[90px] text-xs bg-amber-500 hover:bg-amber-600 text-white font-bold py-2 rounded-lg"
                  >+/− Points</button>
                  {m.masterCode && (
                    <button
                      onClick={(e) => copy(buildMasterReferralLink(m.masterCode), 'Link', e)}
                      className="flex-1 min-w-[60px] text-xs bg-gray-200 hover:bg-gray-300 font-bold py-2 rounded-lg"
                    >Link</button>
                  )}
                  {m.pending && (
                    <button
                      onClick={() => cancelPending(m)}
                      className="flex-1 min-w-[70px] text-xs bg-rose-500 hover:bg-rose-700 text-white font-bold py-2 rounded-lg"
                    >Cancel</button>
                  )}
                </div>
              </div>
            );
          })}
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
      {earnPctFor && (
        <EarnPctModal master={earnPctFor} onClose={() => setEarnPctFor(null)} />
      )}
      {markPaidFor && (
        <MarkPaidModal
          master={markPaidFor}
          pending={masterCommission(markPaidFor).pending}
          onClose={() => setMarkPaidFor(null)}
        />
      )}
    </div>
  );
}
