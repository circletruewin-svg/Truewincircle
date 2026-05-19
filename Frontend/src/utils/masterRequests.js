// Single source of truth for approving / rejecting a master's
// deposit-or-withdrawal request (the `masterRequests` collection).
//
// Used by BOTH the admin "Master Management" tab and the main
// Payment / Withdrawal Approval screens, so the money logic lives
// in exactly one place.
//
//   deposit  approve → credit master points
//   withdraw approve → points ALREADY deducted at request time
//                      (req.debited) → just close it out
//   withdraw reject  → REFUND the held points back to the master
//   deposit  reject  → nothing to refund (no debit happened)
//
// Atomic + logged to masterLedger. Returns a short message string
// for the caller to toast. Throws on failure.

import {
  doc, collection, addDoc, updateDoc, runTransaction, serverTimestamp,
} from 'firebase/firestore';

const r2 = (n) => Math.round(n * 100) / 100;

export async function decideMasterRequest(db, req, action, reason = '') {
  const amount = Number(req.amount || 0);
  if (!(amount > 0)) throw new Error('Invalid amount.');
  const isWithdraw = req.type === 'withdrawal';
  const wasDebited = req.debited === true; // immediate-deduct flow

  if (action === 'rejected') {
    if (isWithdraw && wasDebited) {
      // Refund the points we held when the request was placed.
      await runTransaction(db, async (tx) => {
        const mRef = doc(db, 'users', req.masterId);
        const rRef = doc(db, 'masterRequests', req.id);
        const mSnap = await tx.get(mRef);
        const rSnap = await tx.get(rRef);
        if (!mSnap.exists()) throw new Error('Master not found.');
        if (!rSnap.exists() || rSnap.data().status !== 'pending') throw new Error('Already processed.');
        const cur = Number(mSnap.data().balance ?? mSnap.data().walletBalance ?? 0);
        const nb = r2(cur + amount);
        tx.update(mRef, { balance: nb, walletBalance: nb });
        tx.update(rRef, { status: 'rejected', adminComment: (reason || '').trim() || null });
      });
      await addDoc(collection(db, 'masterLedger'), {
        type: 'master_withdraw_refund',
        masterId: req.masterId,
        masterName: req.masterName || null,
        amount,
        note: 'Withdrawal request rejected — points refunded',
        createdAt: serverTimestamp(),
      });
      return `Rejected — ₹${amount} points wapas master ko refund kar diye.`;
    }
    await updateDoc(doc(db, 'masterRequests', req.id), {
      status: 'rejected', adminComment: (reason || '').trim() || null,
    });
    return 'Request rejected.';
  }

  // action === 'approved'
  if (isWithdraw && wasDebited) {
    // Points already deducted at request time. Just close it out.
    await runTransaction(db, async (tx) => {
      const rRef = doc(db, 'masterRequests', req.id);
      const rSnap = await tx.get(rRef);
      if (!rSnap.exists() || rSnap.data().status !== 'pending') throw new Error('Already processed.');
      tx.update(rRef, { status: 'approved' });
    });
    await addDoc(collection(db, 'masterLedger'), {
      type: 'master_to_admin',
      masterId: req.masterId,
      masterName: req.masterName || null,
      amount,
      note: 'Master withdrawal request approved (points pre-deducted)',
      createdAt: serverTimestamp(),
    });
    return `Withdrawal approved — ₹${amount} cash out karo.`;
  }

  // deposit approve (or legacy withdrawal without pre-deduct):
  // adjust master balance now.
  await runTransaction(db, async (tx) => {
    const mRef = doc(db, 'users', req.masterId);
    const rRef = doc(db, 'masterRequests', req.id);
    const mSnap = await tx.get(mRef);
    const rSnap = await tx.get(rRef);
    if (!mSnap.exists()) throw new Error('Master not found.');
    if (!rSnap.exists() || rSnap.data().status !== 'pending') throw new Error('Already processed.');
    const cur = Number(mSnap.data().balance ?? mSnap.data().walletBalance ?? 0);
    const next = req.type === 'deposit' ? cur + amount : cur - amount;
    if (next < 0) throw new Error(`Master ke paas sirf ₹${r2(cur)} hai.`);
    tx.update(mRef, { balance: r2(next), walletBalance: r2(next) });
    tx.update(rRef, { status: 'approved' });
  });
  await addDoc(collection(db, 'masterLedger'), {
    type: req.type === 'deposit' ? 'admin_to_master' : 'master_to_admin',
    masterId: req.masterId,
    masterName: req.masterName || null,
    amount,
    note: `Master ${req.type} request approved`,
    createdAt: serverTimestamp(),
  });
  return `${req.type === 'deposit' ? 'Credited' : 'Debited'} ₹${amount}.`;
}
