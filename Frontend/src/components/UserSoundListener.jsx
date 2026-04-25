import { useEffect, useRef } from 'react';
import { collection, onSnapshot, query, where } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { db } from '../firebase';
import useAuthStore from '../store/authStore';
import { useUserSoundContext } from '../contexts/UserSoundContext';

// Watches the logged-in user's top-ups and withdrawals. When the admin
// approves/rejects an existing pending request (status transitions),
// plays the appropriate sound + toast. Mounted once at app level.
export default function UserSoundListener() {
  const user = useAuthStore((s) => s.user);
  const { playApproval, playRejection } = useUserSoundContext();

  // Ref so the snapshot callbacks see the latest play* functions without
  // being torn down whenever they're recreated.
  const playRef = useRef({ playApproval, playRejection });
  useEffect(() => {
    playRef.current = { playApproval, playRejection };
  }, [playApproval, playRejection]);

  useEffect(() => {
    if (!user?.uid) return undefined;

    // Track previous status per doc so we only fire on transitions.
    const lastStatus = new Map();
    let isFirstTopUp = true;
    let isFirstWithdrawal = true;

    const handleChanges = (snapshot, kind) => {
      const isFirst = kind === 'top-ups' ? isFirstTopUp : isFirstWithdrawal;

      snapshot.docChanges().forEach((change) => {
        const id = change.doc.id;
        const data = change.doc.data();
        const next = data?.status;
        const prev = lastStatus.get(id);
        lastStatus.set(id, next);

        if (isFirst) return;
        if (!next || next === 'pending') return;
        if (prev === next) return;

        if (next === 'approved') {
          playRef.current.playApproval?.();
          toast.success(
            kind === 'top-ups'
              ? `✅ Deposit approved — ₹${data.amount} credited to your wallet`
              : `✅ Withdrawal approved — ₹${data.amount}`,
            { autoClose: 6000 }
          );
        } else if (next === 'rejected') {
          playRef.current.playRejection?.();
          toast.error(
            kind === 'top-ups'
              ? `❌ Deposit rejected${data.adminComment ? ` — ${data.adminComment}` : ''}`
              : `❌ Withdrawal rejected`,
            { autoClose: 7000 }
          );
        }
      });

      if (kind === 'top-ups') isFirstTopUp = false;
      else isFirstWithdrawal = false;
    };

    const topUpsQuery = query(
      collection(db, 'top-ups'),
      where('userId', '==', user.uid)
    );
    const unsubTopUps = onSnapshot(
      topUpsQuery,
      (snap) => handleChanges(snap, 'top-ups'),
      () => {}
    );

    const withdrawalsQuery = query(
      collection(db, 'withdrawals'),
      where('userId', '==', user.uid)
    );
    const unsubWithdrawals = onSnapshot(
      withdrawalsQuery,
      (snap) => handleChanges(snap, 'withdrawals'),
      () => {}
    );

    return () => {
      unsubTopUps();
      unsubWithdrawals();
    };
  }, [user?.uid]);

  return null;
}
