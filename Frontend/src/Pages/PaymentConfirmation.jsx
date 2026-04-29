import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'react-toastify';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  IndianRupee,
  ShieldCheck,
  UploadCloud,
  Wallet as WalletIcon,
  XCircle,
} from 'lucide-react';
import { getAuth } from "firebase/auth";
import { getStorage, ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { addDoc, collection, doc, getDoc, limit, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { db } from "../firebase";
import AccountPageShell from '../components/AccountPageShell';

const toDate = (value) => {
  if (!value) return null;
  if (value?.toDate) return value.toDate();
  if (value instanceof Date) return value;
  if (typeof value === 'string') return new Date(value);
  return null;
};

export default function PaymentConfirmation() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [paymentProof, setPaymentProof] = useState(null);
  const [submissionState, setSubmissionState] = useState('idle'); // idle | submitted | error
  const [recentTopUps, setRecentTopUps] = useState([]);

  const navigate = useNavigate();
  const auth = getAuth();
  const user = auth.currentUser;

  const amount = useMemo(() => {
    const stored = parseFloat(localStorage.getItem('Amount') || 0);
    return Number.isFinite(stored) && stored > 0 ? stored : 0;
  }, []);
  const message = useMemo(() => localStorage.getItem('PaymentMessage') || '', []);

  // If user landed here directly without selecting an amount on /addcash,
  // bounce them back so they don't end up on a dead-end screen.
  useEffect(() => {
    if (!user) {
      setError('Please log in to confirm payment.');
      setTimeout(() => navigate('/'), 2500);
      return;
    }
    if (amount <= 0) {
      navigate('/addcash');
    }
  }, [user, amount, navigate]);

  // Live status of recent top-ups so the user can see what happened to
  // earlier requests without leaving this screen.
  useEffect(() => {
    if (!user) return undefined;

    const q = query(
      collection(db, 'top-ups'),
      where('userId', '==', user.uid),
      limit(20),
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const now = Date.now();
      const docs = snapshot.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .map(d => ({ ...d, _date: toDate(d.createdAt) }))
        .sort((a, b) => (b._date?.getTime() || 0) - (a._date?.getTime() || 0))
        .filter(d => {
          if (d.status === 'pending') return true;
          if (!d._date) return false;
          return (now - d._date.getTime()) / (1000 * 60 * 60) < 24;
        })
        .slice(0, 4);
      setRecentTopUps(docs);
    });

    return () => unsubscribe();
  }, [user]);

  const handleConfirmPayment = async () => {
    if (!paymentProof) {
      setError('Please upload a payment screenshot.');
      return;
    }
    if (amount <= 0) {
      setError('Amount missing — please start again from Add Cash.');
      return;
    }

    setUploading(true);
    setError('');

    try {
      const storage = getStorage();
      const storageRef = ref(storage, `paymentProofs/${user.uid}/${Date.now()}_${paymentProof.name}`);
      await uploadBytes(storageRef, paymentProof);
      const proofUrl = await getDownloadURL(storageRef);

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      if (userDocSnap.exists() && userDocSnap.data().suspended) {
        throw new Error("Your account is suspended. Please contact support before depositing.");
      }
      const name = userDocSnap.exists() ? userDocSnap.data().name : 'Unknown User';

      await addDoc(collection(db, 'top-ups'), {
        userId: user.uid,
        name,
        amount,
        message,
        status: 'pending',
        paymentProof: proofUrl,
        createdAt: new Date().toISOString(),
      });

      // Bump lastActiveAt so the user shows up at the top of the
      // admin's All Users list right after submitting.
      try {
        await setDoc(userDocRef, { lastActiveAt: serverTimestamp() }, { merge: true });
      } catch { /* non-fatal */ }

      // Done — clear the request-specific bits so the next deposit starts
      // fresh, but DON'T touch any other pending request the user has.
      localStorage.removeItem('Amount');
      localStorage.removeItem('PaymentMessage');
      setSubmissionState('submitted');
      toast.success("Payment request submitted successfully!");
      setTimeout(() => navigate('/addcash'), 1200);
    } catch (err) {
      console.error('Error submitting top-up request:', err);
      // Pass through the suspended-account message so the user can see it.
      const friendly = err?.message?.includes('suspended')
        ? err.message
        : 'Failed to submit request. Please check your connection and try again.';
      setError(friendly);
      setSubmissionState('error');
    } finally {
      setUploading(false);
    }
  };

  const StatusBadge = ({ status }) => {
    const map = {
      pending:  { Icon: Clock,       className: 'border-yellow-500/30 bg-yellow-500/10 text-yellow-200', label: 'Pending Approval' },
      approved: { Icon: CheckCircle, className: 'border-green-500/30 bg-green-500/10 text-green-200',    label: 'Approved' },
      rejected: { Icon: XCircle,     className: 'border-red-500/30 bg-red-500/10 text-red-200',          label: 'Rejected' },
    };
    const { Icon, className, label } = map[status] || map.pending;
    return (
      <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${className}`}>
        <Icon className="h-3.5 w-3.5" />
        {label}
      </span>
    );
  };

  const RecentRequests = () => {
    if (recentTopUps.length === 0) return null;
    return (
      <div className="w-full max-w-md space-y-3">
        <p className="px-1 text-sm font-semibold uppercase tracking-wider text-slate-300">
          Your recent requests
        </p>
        {recentTopUps.map((item) => (
          <div
            key={item.id}
            className="rounded-2xl border border-white/10 bg-white/5 p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="font-semibold text-white">₹{Number(item.amount || 0).toFixed(2)} deposit</p>
                <p className="truncate text-xs text-slate-400">
                  {item._date ? item._date.toLocaleString() : 'Just now'}
                </p>
              </div>
              <StatusBadge status={item.status} />
            </div>
            {item.status === 'rejected' && item.adminComment && (
              <p className="mt-2 rounded-lg border border-red-500/20 bg-red-500/5 p-2 text-xs text-red-200">
                Reason: {item.adminComment}
              </p>
            )}
          </div>
        ))}
      </div>
    );
  };

  const renderForm = () => (
    <div className="w-full max-w-md space-y-6">
      <div className="rounded-2xl border border-white/10 bg-white/5 p-6 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-to-r from-green-500 to-emerald-500">
              <IndianRupee className="h-6 w-6 text-white" />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-white">Payment Amount</h3>
              <p className="text-sm text-gray-400">Ready to process</p>
            </div>
          </div>
          <p className="text-3xl font-bold text-white">₹{amount}</p>
        </div>

        <div className="flex items-center space-x-2 rounded-lg bg-green-500/10 p-3 text-green-300">
          <ShieldCheck className="h-5 w-5" />
          <span className="text-sm font-medium">Secure Transaction</span>
        </div>
      </div>

      <div>
        <label
          htmlFor="file-upload"
          className="flex w-full cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 bg-white/5 p-6 text-center transition-colors hover:bg-white/10"
        >
          <UploadCloud className="mb-3 h-10 w-10 text-purple-400" />
          <span className="font-semibold text-white">{paymentProof ? 'File Selected' : 'Upload Screenshot'}</span>
          <span className="mt-1 text-xs text-gray-400">{paymentProof ? paymentProof.name : 'PNG, JPG, GIF up to 10MB'}</span>
        </label>
        <input
          id="file-upload"
          type="file"
          accept="image/*"
          onChange={(event) => setPaymentProof(event.target.files[0])}
          className="hidden"
        />
      </div>

      <button
        onClick={handleConfirmPayment}
        className="flex w-full items-center justify-center space-x-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 py-4 text-lg font-bold text-white shadow-2xl transition hover:from-purple-700 hover:to-blue-700 disabled:opacity-60"
        disabled={uploading || submissionState === 'submitted'}
      >
        <WalletIcon className="h-6 w-6" />
        <span>
          {submissionState === 'submitted'
            ? 'Submitted! Redirecting…'
            : uploading
              ? 'Submitting...'
              : 'Submit for Verification'}
        </span>
      </button>

      {error && (
        <div className="flex items-center space-x-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
          <AlertCircle className="h-6 w-6 flex-shrink-0" />
          <p className="text-sm">{error}</p>
        </div>
      )}
    </div>
  );

  return (
    <AccountPageShell
      title="Payment Confirmation"
      subtitle="Screenshot upload karke payment verification request submit karein."
      backTo="/pay"
    >
      <div className="flex min-h-[70vh] flex-col items-center gap-8 p-6 text-white">
        <RecentRequests />
        {amount > 0 && renderForm()}
      </div>
    </AccountPageShell>
  );
}
