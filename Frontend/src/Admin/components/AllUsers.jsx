import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, doc, updateDoc, writeBatch, where, setDoc, serverTimestamp, getDoc, deleteDoc, runTransaction, addDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import UserBettingHistory from './UserBettingHistory';
import UserWinLoss from './UserWinLoss';
import { formatCurrency } from '../../utils/formatMoney';
import useAuthStore from '../../store/authStore';

const AllUsers = ({ allPayments = [], allWithdrawals = [] } = {}) => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // "Set referrer" modal — lets admin assign or change a user's
  // referredBy without the user having to enter the code at signup.
  // Useful when a referrer says "is naam wala user mera hai" after
  // the user is already registered.
  const [referrerModal, setReferrerModal] = useState({ open: false, target: null });
  const [referrerSearch, setReferrerSearch] = useState('');
  const [referrerBusy, setReferrerBusy] = useState(false);

  // "Adjust wallet" modal — two-step so balance changes can't happen
  // by an accidental click. Step 1 = enter amount + reason, step 2 =
  // review + type the user's name to confirm before any write happens.
  const [adjustModal, setAdjustModal] = useState({ open: false, target: null });
  const [adjustField, setAdjustField] = useState('balance'); // 'balance' | 'winningMoney'
  const [adjustDirection, setAdjustDirection] = useState('credit'); // 'credit' | 'debit'
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjustStep, setAdjustStep] = useState(1);
  const [adjustConfirmName, setAdjustConfirmName] = useState('');
  const [adjustBusy, setAdjustBusy] = useState(false);
  const [adjustError, setAdjustError] = useState('');
  const adminUser = useAuthStore((s) => s.user);

  // "Place bet on behalf" — for offline players whose admin records
  // their bets manually. Supports Haruf (Gali / Disawar / etc.) and
  // Cricket sports bets.
  const [placeBetModal, setPlaceBetModal] = useState({ open: false, target: null });
  const [pbType, setPbType] = useState('haruf'); // 'haruf' | 'sports'
  const [pbMarket, setPbMarket] = useState('GALI');
  const [pbNumber, setPbNumber] = useState('');
  const [pbAmount, setPbAmount] = useState('');
  // Haruf supports placing bets on multiple numbers in one go (one
  // {number, amount} per row, all settled in a single transaction).
  // For sports we still take a single match + selection + amount via
  // pbAmount above.
  const [pbHarufRows, setPbHarufRows] = useState([{ id: 1, number: '', amount: '' }]);
  const addHarufRow = () =>
    setPbHarufRows((rows) => [...rows, { id: Date.now() + Math.random(), number: '', amount: '' }]);
  const removeHarufRow = (id) =>
    setPbHarufRows((rows) => (rows.length > 1 ? rows.filter((r) => r.id !== id) : rows));
  const updateHarufRow = (id, field, value) =>
    setPbHarufRows((rows) => rows.map((r) => (r.id === id ? { ...r, [field]: value } : r)));
  const harufRowsTotal = useMemo(
    () => pbHarufRows.reduce((sum, r) => sum + (Number(r.amount) || 0), 0),
    [pbHarufRows]
  );
  const [pbMatchId, setPbMatchId] = useState('');
  const [pbBetType, setPbBetType] = useState('winner'); // winner|toss|total|topBatsman
  const [pbSelection, setPbSelection] = useState('');
  const [pbBusy, setPbBusy] = useState(false);
  const [pbError, setPbError] = useState('');
  const [pbMatches, setPbMatches] = useState([]);

  // Load upcoming cricket matches lazily when the bet modal opens.
  useEffect(() => {
    if (!placeBetModal.open) return undefined;
    const q = query(
      collection(db, 'matches'),
      where('status', '==', 'upcoming'),
    );
    const unsub = onSnapshot(q, (snap) => {
      setPbMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setPbMatches([]));
    return () => unsub();
  }, [placeBetModal.open]);

  const openPlaceBet = (user) => {
    setPlaceBetModal({ open: true, target: user });
    setPbType('haruf');
    setPbMarket('GALI');
    setPbNumber(''); setPbAmount('');
    setPbHarufRows([{ id: Date.now(), number: '', amount: '' }]);
    setPbMatchId(''); setPbBetType('winner'); setPbSelection('');
    setPbError('');
  };
  const closePlaceBet = () => {
    if (pbBusy) return;
    setPlaceBetModal({ open: false, target: null });
    setPbError('');
  };

  const submitPlaceBet = async () => {
    if (pbBusy) return;
    setPbError('');
    const target = placeBetModal.target;
    if (!target) return;

    setPbBusy(true);
    try {
      if (pbType === 'haruf') {
        // Multi-row Haruf — same rules as the user-side flow:
        // ₹5–₹50 per number, and a user can only have one bet per
        // (market, number, IST day). Deterministic doc ids guarantee
        // the latter even if two writes race.
        const HARUF_MIN_PER_BET = 5;
        const HARUF_MAX_PER_BET = 50;
        const cleaned = pbHarufRows
          .map((r) => ({
            number: parseInt(r.number, 10),
            amount: Math.round(Number(r.amount) * 100) / 100,
          }))
          .filter((r) =>
            Number.isFinite(r.number) && r.number >= 0 && r.number <= 100 &&
            Number.isFinite(r.amount) && r.amount > 0
          );
        if (cleaned.length === 0) {
          throw new Error(`Add at least one number with amount ₹${HARUF_MIN_PER_BET}–₹${HARUF_MAX_PER_BET}`);
        }
        for (const row of cleaned) {
          if (row.amount < HARUF_MIN_PER_BET) {
            throw new Error(`Number ${row.number}: minimum ₹${HARUF_MIN_PER_BET} per bet`);
          }
          if (row.amount > HARUF_MAX_PER_BET) {
            throw new Error(`Number ${row.number}: maximum ₹${HARUF_MAX_PER_BET} per bet`);
          }
        }
        const seen = new Set();
        for (const row of cleaned) {
          if (seen.has(row.number)) {
            throw new Error(`Number ${row.number} appears twice — combine them into one row`);
          }
          seen.add(row.number);
        }
        const totalBet = cleaned.reduce((sum, r) => sum + r.amount, 0);

        const todayYmd = new Intl.DateTimeFormat('en-CA', {
          timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
        }).format(new Date());
        const safeMarket = String(pbMarket).replace(/\s+/g, '_').toUpperCase();

        await runTransaction(db, async (tx) => {
          const userRef = doc(db, 'users', target.id);

          // ── READ PHASE ──────────────────────────────────
          const snap = await tx.get(userRef);
          if (!snap.exists()) throw new Error('User not found');

          const reservations = [];
          for (const row of cleaned) {
            const betId = `${target.id}_${safeMarket}_${todayYmd}_${row.number}`;
            const betRef = doc(db, 'harufBets', betId);
            const betSnap = await tx.get(betRef);
            if (betSnap.exists()) {
              throw new Error(`User ne ${pbMarket} me number ${row.number} pe aaj pehle hi bet laga rakhi hai. Doosre number pe lagao.`);
            }
            reservations.push({ row, betRef });
          }

          // ── WRITE PHASE ─────────────────────────────────
          const data = snap.data();
          const balance = Number(data.balance ?? data.walletBalance ?? 0) || 0;
          const winning = Number(data.winningMoney) || 0;
          if (balance + winning < totalBet) {
            throw new Error(
              `Insufficient balance: need ${formatCurrency(totalBet)}, have ${formatCurrency(balance + winning)}`
            );
          }
          let remaining = totalBet;
          const fromBalance = Math.min(balance, remaining);
          remaining -= fromBalance;
          const fromWinnings = Math.min(winning, remaining);
          remaining -= fromWinnings;
          const newBalance = Math.round((balance - fromBalance) * 100) / 100;
          const newWinning = Math.round((winning - fromWinnings) * 100) / 100;
          tx.update(userRef, {
            balance: newBalance,
            walletBalance: newBalance,
            winningMoney: newWinning,
            lastActiveAt: serverTimestamp(),
          });
          for (const { row, betRef } of reservations) {
            tx.set(betRef, {
              userId: target.id,
              marketName: pbMarket,
              betType: 'Haruf',
              selectedNumber: row.number,
              betAmount: row.amount,
              timestamp: serverTimestamp(),
              status: 'pending',
              placedByAdmin: true,
              adminId: adminUser?.uid || null,
            });
          }
        });
      } else {
        // Sports bet on behalf of offline user — single bet, single
        // match. Validate the amount field that's still used by the
        // sports tab.
        const amount = Math.round(Number(pbAmount) * 100) / 100;
        if (!Number.isFinite(amount) || amount < 10) {
          throw new Error('Minimum bet ₹10');
        }
        if (!pbMatchId) throw new Error('Pick a match');
        const match = pbMatches.find((m) => m.id === pbMatchId);
        if (!match) throw new Error('Match not found');
        const odds = (() => {
          if (pbBetType === 'winner' || pbBetType === 'toss') {
            return Number(match.odds?.[pbBetType]?.[pbSelection]) || 0;
          }
          if (pbBetType === 'total') {
            return Number(match.odds?.total?.[pbSelection]) || 0;
          }
          if (pbBetType === 'topBatsman') {
            const found = (match.odds?.topBatsman || []).find((x) => x.name === pbSelection);
            return Number(found?.odds) || 0;
          }
          return 0;
        })();
        if (!odds || odds < 1) throw new Error('Pick a valid selection');

        await runTransaction(db, async (tx) => {
          const userRef = doc(db, 'users', target.id);
          const snap = await tx.get(userRef);
          if (!snap.exists()) throw new Error('User not found');
          const data = snap.data();
          const balance = Number(data.balance ?? data.walletBalance ?? 0) || 0;
          const winning = Number(data.winningMoney) || 0;
          if (balance + winning < amount) throw new Error('Insufficient balance to place this bet');
          let remaining = amount;
          const fromBalance = Math.min(balance, remaining);
          remaining -= fromBalance;
          const fromWinnings = Math.min(winning, remaining);
          remaining -= fromWinnings;
          const newBalance = Math.round((balance - fromBalance) * 100) / 100;
          const newWinning = Math.round((winning - fromWinnings) * 100) / 100;
          tx.update(userRef, {
            balance: newBalance,
            walletBalance: newBalance,
            winningMoney: newWinning,
            lastActiveAt: serverTimestamp(),
          });
          const betRef = doc(collection(db, 'sportsBets'));
          tx.set(betRef, {
            userId: target.id,
            matchId: pbMatchId,
            teamASnapshot: match.teamA?.short || match.teamA?.name,
            teamBSnapshot: match.teamB?.short || match.teamB?.name,
            betType: pbBetType,
            selection: pbSelection,
            selectionLabel: `${pbBetType}: ${pbSelection}`,
            oddsAtBet: odds,
            betAmount: amount,
            line: pbBetType === 'total' ? (match.odds?.total?.line ?? null) : null,
            debitedFromBalance: fromBalance,
            debitedFromWinnings: fromWinnings,
            status: 'pending',
            createdAt: serverTimestamp(),
            placedByAdmin: true,
            adminId: adminUser?.uid || null,
          });
        });
      }

      closePlaceBet();
    } catch (err) {
      console.error('Place bet failed:', err);
      setPbError(err.message || 'Failed to place bet');
    } finally {
      setPbBusy(false);
    }
  };

  const openAdjustModal = (user) => {
    setAdjustModal({ open: true, target: user });
    setAdjustField('balance');
    setAdjustDirection('credit');
    setAdjustAmount('');
    setAdjustReason('');
    setAdjustConfirmName('');
    setAdjustStep(1);
    setAdjustError('');
  };

  const closeAdjustModal = () => {
    if (adjustBusy) return;
    setAdjustModal({ open: false, target: null });
    setAdjustError('');
  };

  const submitAdjust = async () => {
    if (adjustBusy) return;
    setAdjustError('');
    const target = adjustModal.target;
    if (!target) return;

    const amount = Math.round(Number(adjustAmount) * 100) / 100;
    if (!Number.isFinite(amount) || amount <= 0) {
      setAdjustError('Enter a positive amount');
      return;
    }
    if (!adjustReason.trim() || adjustReason.trim().length < 4) {
      setAdjustError('Reason is required (min 4 characters)');
      return;
    }
    // The admin must type the user's name verbatim to confirm — extra
    // safety net so a wrong row click doesn't credit/debit the wrong
    // person.
    const expected = (target.name || '').trim();
    if (expected && adjustConfirmName.trim() !== expected) {
      setAdjustError(`Type the user's name exactly to confirm: "${expected}"`);
      return;
    }

    setAdjustBusy(true);
    try {
      await runTransaction(db, async (tx) => {
        const userRef = doc(db, 'users', target.id);
        const snap = await tx.get(userRef);
        if (!snap.exists()) throw new Error('User not found');
        const data = snap.data();
        const current = Number(
          adjustField === 'balance'
            ? (data.balance ?? data.walletBalance ?? 0)
            : (data.winningMoney ?? 0)
        ) || 0;
        const delta = adjustDirection === 'credit' ? amount : -amount;
        const next = Math.round((current + delta) * 100) / 100;
        if (next < 0) {
          throw new Error(`Cannot debit more than the current ${adjustField}: ${formatCurrency(current)}`);
        }
        const update = { [adjustField]: next, lastActiveAt: serverTimestamp() };
        // Keep the legacy walletBalance field in sync if we're touching balance.
        if (adjustField === 'balance') update.walletBalance = next;
        tx.update(userRef, update);
      });

      // Append an audit row so this never looks like an unexplained
      // jump in the user's balance.
      try {
        await addDoc(collection(db, 'transactions'), {
          userId: target.id,
          userName: target.name || null,
          type: adjustDirection === 'credit' ? 'admin_credit' : 'admin_debit',
          field: adjustField,
          amount: adjustDirection === 'credit' ? amount : -amount,
          reason: adjustReason.trim(),
          adjustedByAdminId: adminUser?.uid || null,
          adjustedByAdminName: adminUser?.name || null,
          createdAt: new Date(),
        });
      } catch (auditErr) {
        console.warn('Audit log write failed:', auditErr);
      }

      // Treat manual balance credits the same as a real deposit for
      // commission purposes — i.e. an offline deposit by an admin
      // for someone who couldn't pay online still earns the
      // referrer their 10%. Only fires for credits to `balance` of
      // users who have a referrer attached.
      if (
        adjustDirection === 'credit' &&
        adjustField === 'balance' &&
        target.referredBy
      ) {
        try {
          const commissionAmount = Math.round(amount * 0.10 * 100) / 100;
          await addDoc(collection(db, 'commissions'), {
            referrerId: target.referredBy,
            depositorId: target.id,
            depositorName: target.name || null,
            depositId: null,
            depositAmount: amount,
            commissionAmount,
            rate: 0.10,
            status: 'pending',
            source: 'admin_credit',
            createdAt: new Date(),
            paidAt: null,
          });
        } catch (commErr) {
          console.warn('Commission ledger write failed:', commErr);
        }
      }

      closeAdjustModal();
    } catch (err) {
      console.error('Adjust wallet failed:', err);
      setAdjustError(err.message || 'Failed to adjust wallet');
    } finally {
      setAdjustBusy(false);
    }
  };

  const referrerCandidates = useMemo(() => {
    if (!referrerModal.open) return [];
    const term = referrerSearch.trim().toLowerCase();
    const targetId = referrerModal.target?.id;
    return users
      .filter((u) => u.id !== targetId) // can't set self as referrer
      .filter((u) => {
        if (!term) return true;
        return [u.name, u.phoneNumber, u.email]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .some((s) => s.includes(term));
      })
      .slice(0, 30);
  }, [referrerModal, referrerSearch, users]);

  const openSetReferrer = (user) => {
    setReferrerSearch('');
    setReferrerModal({ open: true, target: user });
  };

  const setUserReferrer = async (referrerUid, referrerName) => {
    if (!referrerModal.target || referrerBusy) return;
    const target = referrerModal.target;
    if (referrerUid === target.id) {
      alert("A user can't be their own referrer.");
      return;
    }
    if (!window.confirm(
      `Set ${referrerName || referrerUid.slice(0, 8)} as ${target.name || 'this user'}'s referrer? ` +
      `From now on, every approved deposit by ${target.name || 'this user'} will accrue 10% commission to ${referrerName || 'them'}.`
    )) return;

    setReferrerBusy(true);
    try {
      await updateDoc(doc(db, 'users', target.id), {
        referredBy: referrerUid,
        referrerSetByAdmin: true,
        referrerSetAt: serverTimestamp(),
      });
      setReferrerModal({ open: false, target: null });
    } catch (err) {
      console.error('Set referrer failed:', err);
      alert('Failed to set referrer: ' + (err.message || 'unknown error'));
    } finally {
      setReferrerBusy(false);
    }
  };

  const clearUserReferrer = async () => {
    if (!referrerModal.target || referrerBusy) return;
    const target = referrerModal.target;
    if (!window.confirm(
      `Remove referrer from ${target.name || 'this user'}? Future deposits will no longer accrue any commission.`
    )) return;

    setReferrerBusy(true);
    try {
      await updateDoc(doc(db, 'users', target.id), { referredBy: null });
      setReferrerModal({ open: false, target: null });
    } catch (err) {
      console.error('Clear referrer failed:', err);
      alert('Failed: ' + (err.message || 'unknown'));
    } finally {
      setReferrerBusy(false);
    }
  };

  // "Create user" modal state. Admin can pre-stage an account for a
  // phone number that hasn't signed up yet. When the user later signs
  // in with their phone OTP, the merge logic in PhoneSignUp.jsx /
  // PhoneSignIn.jsx picks up the pendingUsers doc and applies the
  // welcome bonus.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createBalance, setCreateBalance] = useState('');
  const [createWinning, setCreateWinning] = useState('');
  const [createReferrerId, setCreateReferrerId] = useState('');
  const [createReferrerLabel, setCreateReferrerLabel] = useState('');
  const [createOffline, setCreateOffline] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const resetCreateForm = () => {
    setCreateName(''); setCreatePhone('');
    setCreateBalance(''); setCreateWinning('');
    setCreateReferrerId(''); setCreateReferrerLabel('');
    setCreateOffline(false);
    setCreateError(''); setCreateSuccess('');
  };

  const handleCreateUser = async () => {
    setCreateError(''); setCreateSuccess('');
    const trimmedName = createName.trim();
    const cleanPhone = createPhone.replace(/\D/g, '');
    if (trimmedName.length < 2) { setCreateError('Enter a valid name'); return; }
    // Phone is optional in offline mode (player has no number on file),
    // mandatory for the normal pre-staged flow because the user signs
    // in with that phone via OTP.
    if (!createOffline && cleanPhone.length !== 10) {
      setCreateError('Enter a 10-digit mobile number (or tick "Offline / Demo account")');
      return;
    }
    if (createOffline && cleanPhone && cleanPhone.length !== 10) {
      setCreateError('Phone is optional but if entered, must be 10 digits');
      return;
    }
    const balance = Number(createBalance) || 0;
    const winning = Number(createWinning) || 0;
    if (balance < 0 || winning < 0) { setCreateError('Bonus amounts cannot be negative'); return; }

    setCreateBusy(true);
    try {
      // ── OFFLINE / DEMO ACCOUNT ──────────────────────────────────
      // Player can't / won't sign in with OTP. Admin records bets and
      // payouts on their behalf. We mint a Firestore user doc directly
      // with a synthetic id, no Firebase Auth account.
      if (createOffline) {
        const offlineUid = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
        const userRef = doc(db, 'users', offlineUid);
        await setDoc(userRef, {
          name: trimmedName,
          phoneNumber: cleanPhone ? '+91' + cleanPhone : null,
          balance,
          winningMoney: winning,
          appName: 'truewin',
          role: 'user',
          referredBy: createReferrerId || null,
          referrerSetByAdmin: !!createReferrerId,
          isOffline: true,
          createdByAdmin: true,
          createdAt: serverTimestamp(),
          lastActiveAt: serverTimestamp(),
        });
        // Welcome-bonus credits earn the referrer their 10% commission
        // just like a real cash deposit would.
        if (balance > 0 && createReferrerId) {
          try {
            const commissionAmount = Math.round(balance * 0.10 * 100) / 100;
            await addDoc(collection(db, 'commissions'), {
              referrerId: createReferrerId,
              depositorId: offlineUid,
              depositorName: trimmedName,
              depositId: null,
              depositAmount: balance,
              commissionAmount,
              rate: 0.10,
              status: 'pending',
              source: 'offline_account_open',
              createdAt: new Date(),
              paidAt: null,
            });
          } catch (commErr) {
            console.warn('Commission ledger write failed:', commErr);
          }
        }
        setCreateSuccess(`Offline account "${trimmedName}" created. Place bets via the "Place Bet" button on their row.`);
        setTimeout(() => { setCreateOpen(false); resetCreateForm(); }, 1800);
        return;
      }

      // ── ONLINE / PRE-STAGED ACCOUNT ────────────────────────────
      // The player will sign in with OTP later — we just write to
      // pendingUsers/{phone} and the SignIn page picks it up.
      const phoneId = '+91' + cleanPhone;
      const existing = users.find(u => u.phoneNumber === phoneId);
      if (existing) {
        setCreateError(`A user with this phone already exists (${existing.name || existing.id}).`);
        setCreateBusy(false);
        return;
      }
      const pendingRef = doc(db, 'pendingUsers', phoneId);
      const pendingSnap = await getDoc(pendingRef);
      if (pendingSnap.exists()) {
        if (!window.confirm('A pending account already exists for this number. Overwrite it?')) {
          setCreateBusy(false);
          return;
        }
      }

      await setDoc(pendingRef, {
        name: trimmedName,
        phoneNumber: phoneId,
        balance,
        winningMoney: winning,
        appName: 'truewin',
        referredBy: createReferrerId || null,
        createdAt: serverTimestamp(),
        createdByAdmin: true,
      });
      setCreateSuccess(`Account staged for ${trimmedName} (${phoneId}). It activates the moment they log in with OTP.`);
      setTimeout(() => { setCreateOpen(false); resetCreateForm(); }, 1800);
    } catch (err) {
      console.error('Create user failed:', err);
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreateBusy(false);
    }
  };

  // Real-time subscription so balance / winningMoney / suspended state
  // changes propagate to the admin's table without a page refresh — for
  // example when a user places a bet on another tab their balance drops
  // here instantly.
  useEffect(() => {
    const usersQuery = query(
      collection(db, 'users'),
      where('appName', '==', 'truewin')
    );
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const usersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        // Final sort happens in the filteredUsers useMemo below — it
        // takes the raw list and combines lastActiveAt with the latest
        // top-up / withdrawal timestamps so activity from before
        // lastActiveAt was tracked still bubbles users up.
        setUsers(usersList);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching users: ', err);
        setError('Failed to fetch users. Please check console for details.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  // Make-admin is intentionally NOT in the panel — admin promotion is
  // done through the Firebase Console only. Remove-admin stays so a
  // logged-in admin can demote themselves / a teammate from the UI.
  const removeAdmin = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'user' });
      setUsers(users.map(user => user.id === userId ? { ...user, role: 'user' } : user));
    } catch (error) {
      console.error("Error updating user role: ", error);
      setError("Failed to update user role.");
    }
  };

  const toggleSuspend = async (userId, nextSuspended) => {
    try {
      await updateDoc(doc(db, 'users', userId), { suspended: nextSuspended });
      setUsers(users.map(u => u.id === userId ? { ...u, suspended: nextSuspended } : u));
    } catch (err) {
      console.error('Suspend toggle failed:', err);
      setError('Failed to update user suspension.');
    }
  };

  // Build a per-user "latest activity" timestamp from the user doc's
  // lastActiveAt PLUS their most recent top-up / withdrawal createdAt.
  // This way users whose activity predates the lastActiveAt field
  // (older accounts) still bubble up if they've ever made a deposit
  // or withdrawal — the admin doesn't have to wait for a fresh bet
  // before seeing them at the top.
  const tsOf = (value) => {
    if (!value) return 0;
    if (typeof value?.toDate === 'function') return value.toDate().getTime();
    const t = new Date(value).getTime();
    return Number.isFinite(t) ? t : 0;
  };
  const latestActivityByUser = useMemo(() => {
    const map = new Map();
    const consider = (uid, ts) => {
      if (!uid) return;
      const prev = map.get(uid) || 0;
      if (ts > prev) map.set(uid, ts);
    };
    for (const p of allPayments || []) consider(p.userId, tsOf(p.createdAt));
    for (const w of allWithdrawals || []) consider(w.userId, tsOf(w.createdAt));
    return map;
  }, [allPayments, allWithdrawals]);

  const filteredUsers = useMemo(() => {
    const lowercasedFilter = searchTerm.trim().toLowerCase();
    const matched = !lowercasedFilter ? users : users.filter((user) =>
      user.name?.toLowerCase().includes(lowercasedFilter) ||
      user.email?.toLowerCase().includes(lowercasedFilter) ||
      user.phoneNumber?.includes(lowercasedFilter)
    );

    const activityFor = (u) => {
      const fromDoc = tsOf(u.lastActiveAt);
      const fromTxns = latestActivityByUser.get(u.id) || 0;
      return Math.max(fromDoc, fromTxns);
    };

    return [...matched].sort((a, b) => {
      const diff = activityFor(b) - activityFor(a);
      if (diff !== 0) return diff;
      return (a.name || '').localeCompare(b.name || '');
    });
  }, [searchTerm, users, latestActivityByUser]);

  const allVisibleSelected = filteredUsers.length > 0 &&
    filteredUsers.every(u => selectedIds.has(u.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredUsers.forEach(u => next.delete(u.id));
      } else {
        filteredUsers.forEach(u => next.add(u.id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  // Bulk "Set Referrer" — links every selected user to a single
  // referrer in one go. Useful when a referrer hands over a list
  // of names like "ye sab mere log hain".
  const [bulkReferrerOpen, setBulkReferrerOpen] = useState(false);
  const [bulkReferrerSearch, setBulkReferrerSearch] = useState('');
  const bulkReferrerCandidates = useMemo(() => {
    if (!bulkReferrerOpen) return [];
    const term = bulkReferrerSearch.trim().toLowerCase();
    return users
      .filter((u) => !selectedIds.has(u.id)) // can't set a selected user as their own referrer
      .filter((u) => {
        if (!term) return true;
        return [u.name, u.phoneNumber, u.email]
          .filter(Boolean)
          .map((s) => String(s).toLowerCase())
          .some((s) => s.includes(term));
      })
      .slice(0, 30);
  }, [bulkReferrerOpen, bulkReferrerSearch, users, selectedIds]);

  const runBulkSetReferrer = async (referrerId, referrerName) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(
      `Set ${referrerName || 'this user'} as the referrer for ${ids.length} selected user${ids.length > 1 ? 's' : ''}? ` +
      `Future deposits by them will accrue 10% commission to ${referrerName || 'this user'}.`
    )) return;
    setBulkBusy(true);
    try {
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach((id) => batch.update(doc(db, 'users', id), {
          referredBy: referrerId,
          referrerSetByAdmin: true,
        }));
        await batch.commit();
      }
      setBulkReferrerOpen(false);
      setBulkReferrerSearch('');
      clearSelection();
    } catch (err) {
      console.error('Bulk set referrer failed:', err);
      setError('Bulk set referrer failed. Check console.');
    } finally {
      setBulkBusy(false);
    }
  };

  const runBulkUpdate = async (label, updates) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`${label} ${ids.length} user${ids.length > 1 ? 's' : ''}?`)) return;
    setBulkBusy(true);
    try {
      // Firestore batch limit is 500 writes — chunk just in case.
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.update(doc(db, 'users', id), updates));
        await batch.commit();
      }
      setUsers(prev => prev.map(u => (selectedIds.has(u.id) ? { ...u, ...updates } : u)));
      clearSelection();
    } catch (err) {
      console.error('Bulk update failed:', err);
      setError('Bulk update failed. Check console.');
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    const ids = Array.from(selectedIds);
    const rows = users.filter(u => ids.includes(u.id));
    if (rows.length === 0) return;
    const header = ['id', 'name', 'phoneNumber', 'email', 'role', 'suspended', 'balance', 'winningMoney'];
    const lines = [header.join(',')];
    for (const u of rows) {
      lines.push(header.map(h => {
        const v = u[h];
        if (v === undefined || v === null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') ? `"${s}"` : s;
      }).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatJoinDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const joinDate = timestamp.toDate();
    const today = new Date();
    const isToday = joinDate.getDate() === today.getDate() &&
                    joinDate.getMonth() === today.getMonth() &&
                    joinDate.getFullYear() === today.getFullYear();
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const formattedDate = joinDate.toLocaleDateString(undefined, options);
    return (
      <span className={isToday ? 'text-green-600 font-medium' : 'text-gray-600'}>
        {isToday ? 'New User ' : 'Old User '} ({formattedDate})
      </span>
    );
  };

  if (loading) return <div className="flex justify-center items-center p-8"><Loader /></div>;
  if (error) return <p className="text-red-500 p-6">{error}</p>;

  const selectionCount = selectedIds.size;

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">All Users ({filteredUsers.length})</h2>

      <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 max-w-md p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          onClick={() => { resetCreateForm(); setCreateOpen(true); }}
          className="px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
        >
          + Create User
        </button>
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">Create User Account</h3>
              <button
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Enter the user's details. The account will activate as soon as they sign in with their phone OTP — name and bonus are applied automatically. Existing accounts are not modified.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(''); }}
              placeholder="e.g. Rahul Sharma"
              className="w-full mb-3 p-2.5 border rounded-lg text-sm"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-2.5 bg-gray-100 border rounded-lg text-sm font-semibold text-gray-700">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={createPhone}
                onChange={(e) => {
                  setCreatePhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setCreateError('');
                }}
                placeholder="10-digit number"
                className="flex-1 p-2.5 border rounded-lg text-sm tracking-wide"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Welcome balance</label>
                <input
                  type="number"
                  value={createBalance}
                  onChange={(e) => setCreateBalance(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">Used to play (deposit-style)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Welcome winning</label>
                <input
                  type="number"
                  value={createWinning}
                  onChange={(e) => setCreateWinning(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">Withdrawable winnings</p>
              </div>
            </div>

            <label className="flex items-start gap-2 mb-3 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={createOffline}
                onChange={(e) => setCreateOffline(e.target.checked)}
                className="mt-0.5 h-4 w-4 accent-amber-600"
              />
              <div className="text-xs">
                <p className="font-semibold text-amber-900">Offline / Demo account</p>
                <p className="text-amber-800 mt-0.5">
                  Player kabhi OTP login nahi karega. Admin unke behalf pe bets lagayega
                  aur cash leke wallet adjust karega. Phone optional ho jata hai.
                </p>
              </div>
            </label>

            <label className="block text-sm font-medium text-gray-700 mb-1">
              Refer under (optional)
            </label>
            {createReferrerId ? (
              <div className="flex items-center justify-between mb-3 px-3 py-2 bg-purple-50 border border-purple-200 rounded-lg">
                <div className="min-w-0">
                  <p className="text-xs text-purple-700 font-semibold">Referrer</p>
                  <p className="text-sm font-medium text-purple-900 truncate">{createReferrerLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={() => { setCreateReferrerId(''); setCreateReferrerLabel(''); }}
                  className="text-xs text-red-600 hover:text-red-800 font-semibold"
                >Clear</button>
              </div>
            ) : (
              <div className="mb-3">
                <input
                  type="text"
                  list="create-referrer-options"
                  placeholder="Search by name or phone (optional)"
                  className="w-full p-2.5 border rounded-lg text-sm"
                  onChange={(e) => {
                    const value = e.target.value.trim().toLowerCase();
                    if (!value) return;
                    const match = users.find((u) => {
                      return [u.name, u.phoneNumber, u.email]
                        .filter(Boolean)
                        .some((s) => String(s).toLowerCase() === value);
                    });
                    if (match) {
                      setCreateReferrerId(match.id);
                      setCreateReferrerLabel(`${match.name || 'Unnamed'}${match.phoneNumber ? ' · ' + match.phoneNumber : ''}`);
                    }
                  }}
                />
                <datalist id="create-referrer-options">
                  {users.slice(0, 50).map((u) => (
                    <option
                      key={u.id}
                      value={u.phoneNumber || u.name || u.id}
                    >{u.name || 'Unnamed'}{u.phoneNumber ? ` (${u.phoneNumber})` : ''}</option>
                  ))}
                </datalist>
                <p className="text-[10px] text-gray-500 mt-1">Type a name or phone — pick from the dropdown.</p>
              </div>
            )}

            {createError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                {createSuccess}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
              >Cancel</button>
              <button
                onClick={handleCreateUser}
                disabled={createBusy}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createBusy ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectionCount > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-blue-900 mr-auto">
            {selectionCount} selected
          </span>
          <button
            onClick={() => runBulkUpdate('Suspend', { suspended: true })}
            disabled={bulkBusy}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Suspend
          </button>
          <button
            onClick={() => runBulkUpdate('Unsuspend', { suspended: false })}
            disabled={bulkBusy}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Unsuspend
          </button>
          <button
            onClick={() => runBulkUpdate('Remove admin from', { role: 'user' })}
            disabled={bulkBusy}
            className="bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Remove admin
          </button>
          <button
            onClick={() => { setBulkReferrerSearch(''); setBulkReferrerOpen(true); }}
            disabled={bulkBusy}
            className="bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Set Referrer
          </button>
          <button
            onClick={exportCsv}
            disabled={bulkBusy}
            className="bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Export CSV
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="text-blue-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-blue-100"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full min-w-[880px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all visible"
                />
              </th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Name</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Phone Number</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Email</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Win/Loss</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Role</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Status</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Joined Date</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-600">Total Balance</th>
              <th className="p-4 text-center text-sm font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              // Read both `balance` and the legacy `walletBalance` field
              // — Firebase docs created by older code paths sometimes
              // only have walletBalance, which would make the admin's
              // total read 0 even though the user's wallet shows 20.
              const balanceField = Number(user.balance ?? user.walletBalance ?? 0);
              const winningField = Number(user.winningMoney ?? 0);
              const totalBalance = (Number.isFinite(balanceField) ? balanceField : 0)
                                 + (Number.isFinite(winningField) ? winningField : 0);
              const isSelected = selectedIds.has(user.id);
              const isSuspended = !!user.suspended;
              return (
                <tr
                  key={user.id}
                  className={`border-b border-gray-200 last:border-0 transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(user.id)}
                      aria-label={`Select ${user.name || user.id}`}
                    />
                  </td>
                  <td className="p-4 font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => setSelectedUser(user)}>
                    {user.name || 'N/A'}
                  </td>
                  <td className="p-4 text-gray-600">{user.phoneNumber || 'N/A'}</td>
                  <td className="p-4 text-gray-600">{user.email || 'N/A'}</td>
                  <td className="p-4 text-gray-600"><UserWinLoss userIdentity={user} /></td>
                  <td className="p-4 text-gray-600">{user.role || 'user'}</td>
                  <td className="p-4">
                    <div className="flex flex-col items-start gap-1">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                        isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                      }`}>
                        {isSuspended ? 'Suspended' : 'Active'}
                      </span>
                      {user.isOffline && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase bg-amber-100 text-amber-800 border border-amber-300">
                          Offline
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="p-4 text-left text-gray-600">{formatJoinDate(user.createdAt)}</td>
                  <td className="p-4 text-right font-semibold text-gray-800">{formatCurrency(totalBalance)}</td>
                  <td className="p-4 text-center">
                    <div className="flex flex-col sm:flex-row items-stretch gap-1 justify-center">
                      {user.role === 'admin' && (
                        <button
                          onClick={() => removeAdmin(user.id)}
                          className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-xs"
                        >
                          Remove Admin
                        </button>
                      )}
                      <button
                        onClick={() => toggleSuspend(user.id, !isSuspended)}
                        className={`${
                          isSuspended
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-amber-600 hover:bg-amber-700'
                        } text-white font-bold py-1 px-3 rounded text-xs`}
                      >
                        {isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                      <button
                        onClick={() => openSetReferrer(user)}
                        className="bg-purple-600 hover:bg-purple-700 text-white font-bold py-1 px-3 rounded text-xs"
                        title={user.referredBy ? 'Change referrer' : 'Set a referrer manually'}
                      >
                        {user.referredBy ? 'Change Referrer' : 'Set Referrer'}
                      </button>
                      <button
                        onClick={() => openAdjustModal(user)}
                        className="bg-orange-600 hover:bg-orange-700 text-white font-bold py-1 px-3 rounded text-xs"
                        title="Manually credit or debit this user's wallet (audited)"
                      >
                        Adjust Wallet
                      </button>
                      <button
                        onClick={() => openPlaceBet(user)}
                        className="bg-pink-600 hover:bg-pink-700 text-white font-bold py-1 px-3 rounded text-xs"
                        title="Place a bet on behalf of this user (Haruf / Cricket)"
                      >
                        Place Bet
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {bulkReferrerOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Bulk Set Referrer</h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  Linking <span className="font-semibold">{selectedIds.size}</span> selected user{selectedIds.size !== 1 ? 's' : ''} to one referrer
                </p>
              </div>
              <button
                onClick={() => setBulkReferrerOpen(false)}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            <p className="text-xs text-gray-500 mb-2">
              Pick the user who should receive 10% commission on every approved deposit by every selected user.
              Applies to <em>future</em> deposits only.
            </p>

            <input
              type="text"
              value={bulkReferrerSearch}
              onChange={(e) => setBulkReferrerSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full mb-3 p-2.5 border rounded-lg text-sm"
              autoFocus
            />

            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {bulkReferrerCandidates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No matching users</p>
              ) : bulkReferrerCandidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => runBulkSetReferrer(u.id, u.name)}
                  disabled={bulkBusy}
                  className="w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name || 'Unnamed'}</p>
                    <p className="text-xs text-gray-500 truncate">{u.phoneNumber || u.email || u.id.slice(0, 12)}</p>
                  </div>
                  <span className="text-xs text-purple-600 font-semibold whitespace-nowrap ml-2">
                    Link →
                  </span>
                </button>
              ))}
            </div>

            <div className="flex justify-end mt-4">
              <button
                onClick={() => setBulkReferrerOpen(false)}
                disabled={bulkBusy}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg text-sm"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {referrerModal.open && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {referrerModal.target?.referredBy ? 'Change Referrer' : 'Set Referrer'}
                </h3>
                <p className="text-sm text-gray-500 mt-0.5">
                  for <span className="font-semibold">{referrerModal.target?.name || 'user'}</span>
                  {referrerModal.target?.phoneNumber && (
                    <span className="text-gray-400"> ({referrerModal.target.phoneNumber})</span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setReferrerModal({ open: false, target: null })}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            {referrerModal.target?.referredBy && (
              <div className="mb-3 px-3 py-2 bg-blue-50 border border-blue-200 rounded-lg text-sm text-blue-900">
                Currently referred by:&nbsp;
                <span className="font-semibold">
                  {users.find((u) => u.id === referrerModal.target.referredBy)?.name
                    || referrerModal.target.referredBy.slice(0, 10) + '…'}
                </span>
              </div>
            )}

            <p className="text-xs text-gray-500 mb-2">
              Pick the user who should receive 10% commission on every approved deposit by{' '}
              <span className="font-semibold">{referrerModal.target?.name || 'this user'}</span>.
              The change applies to <em>future</em> deposits only.
            </p>

            <input
              type="text"
              value={referrerSearch}
              onChange={(e) => setReferrerSearch(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full mb-3 p-2.5 border rounded-lg text-sm"
              autoFocus
            />

            <div className="border rounded-lg max-h-64 overflow-y-auto">
              {referrerCandidates.length === 0 ? (
                <p className="text-sm text-gray-500 text-center py-6">No matching users</p>
              ) : referrerCandidates.map((u) => (
                <button
                  key={u.id}
                  onClick={() => setUserReferrer(u.id, u.name)}
                  disabled={referrerBusy}
                  className="w-full text-left p-3 border-b last:border-b-0 hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between"
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{u.name || 'Unnamed'}</p>
                    <p className="text-xs text-gray-500 truncate">{u.phoneNumber || u.email || u.id.slice(0, 12)}</p>
                  </div>
                  <span className="text-xs text-purple-600 font-semibold whitespace-nowrap ml-2">
                    Set →
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center justify-between gap-2 mt-4">
              {referrerModal.target?.referredBy ? (
                <button
                  onClick={clearUserReferrer}
                  disabled={referrerBusy}
                  className="text-sm text-red-600 hover:text-red-800 font-semibold disabled:opacity-50"
                >Remove referrer</button>
              ) : <span />}
              <button
                onClick={() => setReferrerModal({ open: false, target: null })}
                className="px-4 py-2 bg-gray-200 hover:bg-gray-300 text-gray-800 font-semibold rounded-lg text-sm"
              >Cancel</button>
            </div>
          </div>
        </div>
      )}

      {placeBetModal.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">Place Bet on Behalf</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  for <span className="font-semibold">{placeBetModal.target?.name}</span>
                  {placeBetModal.target?.isOffline && (
                    <span className="ml-1 text-amber-700">(offline account)</span>
                  )}
                </p>
              </div>
              <button onClick={closePlaceBet} disabled={pbBusy} className="text-gray-400 hover:text-gray-700 text-2xl leading-none">×</button>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button
                type="button"
                onClick={() => setPbType('haruf')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                  pbType === 'haruf' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >Haruf (Gali / Disawar)</button>
              <button
                type="button"
                onClick={() => setPbType('sports')}
                className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                  pbType === 'sports' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                }`}
              >Cricket</button>
            </div>

            {pbType === 'haruf' ? (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Market</label>
                <select
                  value={pbMarket}
                  onChange={(e) => setPbMarket(e.target.value)}
                  className="w-full mb-3 p-2.5 border rounded-lg text-sm"
                >
                  {['GALI', 'DELHI BAZAAR', 'SHREE GANESH', 'FARIDABAD', 'MATKA MANDI', 'GHAZIABAD', 'DISAWAR'].map((m) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>

                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700">Numbers + amounts</label>
                  <span className="text-xs text-gray-500">
                    Total: <span className="font-semibold text-gray-900">{formatCurrency(harufRowsTotal)}</span>
                  </span>
                </div>
                <div className="space-y-2 mb-2">
                  {pbHarufRows.map((row, idx) => (
                    <div key={row.id} className="flex items-center gap-2">
                      <span className="text-xs text-gray-400 w-5 shrink-0 text-right">{idx + 1}.</span>
                      <input
                        type="number"
                        min="0"
                        max="100"
                        value={row.number}
                        onChange={(e) => { updateHarufRow(row.id, 'number', e.target.value); setPbError(''); }}
                        placeholder="No. (0–100)"
                        className="flex-1 min-w-0 p-2 border rounded-lg text-sm"
                      />
                      <input
                        type="number"
                        min="5"
                        max="50"
                        value={row.amount}
                        onChange={(e) => { updateHarufRow(row.id, 'amount', e.target.value); setPbError(''); }}
                        placeholder="₹5–₹50"
                        className="flex-1 min-w-0 p-2 border rounded-lg text-sm"
                      />
                      <button
                        type="button"
                        onClick={() => removeHarufRow(row.id)}
                        disabled={pbHarufRows.length <= 1}
                        className="text-red-500 hover:text-red-700 disabled:text-gray-300 text-xl leading-none px-1"
                        title="Remove this row"
                      >×</button>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={addHarufRow}
                  className="text-xs font-semibold text-blue-600 hover:text-blue-800 mb-3"
                >+ Add another number</button>
                <p className="text-[11px] text-gray-500 mb-3">
                  Min ₹5, max ₹50 per number. Same number pe ek hi bet allowed
                  hai per din (different number alag se laga sakte ho). Empty row
                  skip ho jaayegi.
                </p>
              </>
            ) : (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Match</label>
                <select
                  value={pbMatchId}
                  onChange={(e) => { setPbMatchId(e.target.value); setPbSelection(''); setPbError(''); }}
                  className="w-full mb-3 p-2.5 border rounded-lg text-sm"
                >
                  <option value="">— Pick an upcoming match —</option>
                  {pbMatches.map((m) => (
                    <option key={m.id} value={m.id}>
                      {(m.teamA?.short || m.teamA?.name) || '?'} vs {(m.teamB?.short || m.teamB?.name) || '?'}
                    </option>
                  ))}
                </select>

                {pbMatchId && (() => {
                  const match = pbMatches.find((m) => m.id === pbMatchId);
                  if (!match) return null;
                  return (
                    <>
                      <label className="block text-sm font-medium text-gray-700 mb-1">Bet type</label>
                      <select
                        value={pbBetType}
                        onChange={(e) => { setPbBetType(e.target.value); setPbSelection(''); }}
                        className="w-full mb-3 p-2.5 border rounded-lg text-sm"
                      >
                        <option value="winner">Match Winner</option>
                        <option value="toss">Toss Winner</option>
                        <option value="total">Total Runs (Over/Under {match.odds?.total?.line ?? '—'})</option>
                        <option value="topBatsman">Top Batsman</option>
                      </select>

                      <label className="block text-sm font-medium text-gray-700 mb-1">Selection</label>
                      <select
                        value={pbSelection}
                        onChange={(e) => setPbSelection(e.target.value)}
                        className="w-full mb-3 p-2.5 border rounded-lg text-sm"
                      >
                        <option value="">— Pick —</option>
                        {pbBetType === 'winner' && [
                          <option key="A" value="A">{match.teamA?.name} (A) @ {match.odds?.winner?.A}x</option>,
                          <option key="B" value="B">{match.teamB?.name} (B) @ {match.odds?.winner?.B}x</option>,
                        ]}
                        {pbBetType === 'toss' && [
                          <option key="A" value="A">{match.teamA?.name} (A) @ {match.odds?.toss?.A}x</option>,
                          <option key="B" value="B">{match.teamB?.name} (B) @ {match.odds?.toss?.B}x</option>,
                        ]}
                        {pbBetType === 'total' && [
                          <option key="over" value="over">Over {match.odds?.total?.line} @ {match.odds?.total?.over}x</option>,
                          <option key="under" value="under">Under {match.odds?.total?.line} @ {match.odds?.total?.under}x</option>,
                        ]}
                        {pbBetType === 'topBatsman' && (match.odds?.topBatsman || []).map((b) => (
                          <option key={b.name} value={b.name}>{b.name} @ {b.odds}x</option>
                        ))}
                      </select>
                    </>
                  );
                })()}
              </>
            )}

            {pbType === 'sports' && (
              <>
                <label className="block text-sm font-medium text-gray-700 mb-1">Bet amount (₹)</label>
                <input
                  type="number"
                  min="10"
                  value={pbAmount}
                  onChange={(e) => { setPbAmount(e.target.value); setPbError(''); }}
                  placeholder="e.g. 50"
                  className="w-full mb-3 p-2.5 border rounded-lg text-sm"
                />
              </>
            )}

            <div className="bg-gray-50 border rounded-lg px-3 py-2 mb-3 text-xs text-gray-600">
              Current balance:{' '}
              <span className="font-semibold text-gray-800">
                {formatCurrency(
                  (Number(placeBetModal.target?.balance ?? placeBetModal.target?.walletBalance ?? 0)) +
                  (Number(placeBetModal.target?.winningMoney ?? 0))
                )}
              </span>
            </div>

            {pbError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                {pbError}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={closePlaceBet}
                disabled={pbBusy}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50"
              >Cancel</button>
              <button
                onClick={submitPlaceBet}
                disabled={pbBusy}
                className="flex-1 px-4 py-2.5 bg-pink-600 text-white font-semibold rounded-lg hover:bg-pink-700 disabled:opacity-50"
              >
                {pbBusy ? 'Placing…' : 'Place Bet'}
              </button>
            </div>
          </div>
        </div>
      )}

      {adjustModal.open && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-lg font-bold text-gray-800">
                  {adjustStep === 1 ? 'Adjust Wallet' : 'Confirm wallet change'}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {adjustModal.target?.name || 'User'}
                  {adjustModal.target?.phoneNumber ? ` · ${adjustModal.target.phoneNumber}` : ''}
                </p>
              </div>
              <button
                onClick={closeAdjustModal}
                disabled={adjustBusy}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            {adjustStep === 1 && (
              <>
                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Field</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustField('balance')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                        adjustField === 'balance' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >Wallet balance</button>
                    <button
                      type="button"
                      onClick={() => setAdjustField('winningMoney')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                        adjustField === 'winningMoney' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >Winning money</button>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Action</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('credit')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                        adjustDirection === 'credit' ? 'bg-green-600 text-white border-green-600' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >+ Credit (add)</button>
                    <button
                      type="button"
                      onClick={() => setAdjustDirection('debit')}
                      className={`px-3 py-2 rounded-lg text-sm font-semibold border ${
                        adjustDirection === 'debit' ? 'bg-red-600 text-white border-red-600' : 'bg-white text-gray-700 border-gray-300'
                      }`}
                    >− Debit (subtract)</button>
                  </div>
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Amount (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={adjustAmount}
                    onChange={(e) => { setAdjustAmount(e.target.value); setAdjustError(''); }}
                    placeholder="e.g. 100"
                    className="w-full p-2.5 border rounded-lg text-sm"
                  />
                </div>

                <div className="mb-3">
                  <label className="block text-sm font-medium text-gray-700 mb-1">Reason (required)</label>
                  <input
                    type="text"
                    value={adjustReason}
                    onChange={(e) => { setAdjustReason(e.target.value); setAdjustError(''); }}
                    placeholder="e.g. Manual deposit credit, dispute resolution"
                    className="w-full p-2.5 border rounded-lg text-sm"
                  />
                </div>

                {adjustError && (
                  <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                    {adjustError}
                  </div>
                )}

                <div className="flex gap-2">
                  <button
                    onClick={closeAdjustModal}
                    className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
                  >Cancel</button>
                  <button
                    onClick={() => {
                      const amount = Number(adjustAmount);
                      if (!Number.isFinite(amount) || amount <= 0) { setAdjustError('Enter a positive amount'); return; }
                      if (!adjustReason.trim() || adjustReason.trim().length < 4) { setAdjustError('Reason is required (min 4 characters)'); return; }
                      setAdjustError('');
                      setAdjustStep(2);
                    }}
                    className="flex-1 px-4 py-2.5 bg-blue-600 text-white font-semibold rounded-lg hover:bg-blue-700"
                  >Review →</button>
                </div>
              </>
            )}

            {adjustStep === 2 && (
              <>
                {(() => {
                  const target = adjustModal.target || {};
                  const current = Number(
                    adjustField === 'balance'
                      ? (target.balance ?? target.walletBalance ?? 0)
                      : (target.winningMoney ?? 0)
                  ) || 0;
                  const amount = Number(adjustAmount) || 0;
                  const delta = adjustDirection === 'credit' ? amount : -amount;
                  const after = Math.max(0, Math.round((current + delta) * 100) / 100);
                  const fieldLabel = adjustField === 'balance' ? 'Wallet balance' : 'Winning money';
                  const actionLabel = adjustDirection === 'credit' ? 'CREDIT' : 'DEBIT';
                  const wrap = adjustDirection === 'credit'
                    ? 'border-green-300 bg-green-50 text-green-900'
                    : 'border-red-300 bg-red-50 text-red-900';
                  return (
                    <>
                      <div className={`mb-4 rounded-xl border p-4 ${wrap}`}>
                        <p className="text-xs uppercase tracking-wider font-bold mb-1">You're about to {actionLabel}</p>
                        <p className="text-3xl font-black">{formatCurrency(amount)}</p>
                        <p className="text-xs mt-1">on <span className="font-semibold">{fieldLabel}</span></p>
                      </div>

                      <div className="mb-4 rounded-xl border border-gray-200 bg-gray-50 p-3 text-sm">
                        <div className="flex justify-between mb-1">
                          <span className="text-gray-600">Current {fieldLabel.toLowerCase()}:</span>
                          <span className="font-semibold">{formatCurrency(current)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-gray-600">After this change:</span>
                          <span className="font-bold">{formatCurrency(after)}</span>
                        </div>
                        <div className="mt-2 pt-2 border-t border-gray-200 text-xs text-gray-600">
                          <span className="font-semibold">Reason:</span> {adjustReason}
                        </div>
                      </div>

                      <div className="mb-3">
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Type the user's name to confirm
                        </label>
                        <p className="text-xs text-gray-500 mb-1.5">
                          Expected: <span className="font-mono font-semibold">{target.name || '(no name)'}</span>
                        </p>
                        <input
                          type="text"
                          value={adjustConfirmName}
                          onChange={(e) => { setAdjustConfirmName(e.target.value); setAdjustError(''); }}
                          placeholder="Type the name exactly"
                          className="w-full p-2.5 border rounded-lg text-sm"
                          autoFocus
                        />
                      </div>

                      {adjustError && (
                        <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                          {adjustError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <button
                          onClick={() => setAdjustStep(1)}
                          disabled={adjustBusy}
                          className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300 disabled:opacity-50"
                        >← Back</button>
                        <button
                          onClick={submitAdjust}
                          disabled={adjustBusy}
                          className={`flex-1 px-4 py-2.5 ${
                            adjustDirection === 'credit' ? 'bg-green-600 hover:bg-green-700' : 'bg-red-600 hover:bg-red-700'
                          } text-white font-semibold rounded-lg disabled:opacity-50`}
                        >
                          {adjustBusy ? 'Applying…' : `Apply ${actionLabel}`}
                        </button>
                      </div>
                    </>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold">Betting History for {selectedUser.name}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-800 font-bold text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <UserBettingHistory userIdentity={selectedUser} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllUsers;
