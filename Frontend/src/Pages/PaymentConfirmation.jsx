import { useEffect, useState } from 'react';
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
import { addDoc, collection, doc, getDoc, getDocs, onSnapshot, query, where } from "firebase/firestore";
import { db } from "../firebase";
import AccountPageShell from '../components/AccountPageShell';

export default function PaymentConfirmation() {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [paymentProof, setPaymentProof] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState('confirming');
  const [topUpId, setTopUpId] = useState(null);
  const [rejectionComment, setRejectionComment] = useState('');
  const [amount, setAmount] = useState(0);
  const [message, setMessage] = useState('');

  const navigate = useNavigate();
  const auth = getAuth();
  const user = auth.currentUser;

  useEffect(() => {
    if (!user) {
      setError('Please log in to confirm payment.');
      setTimeout(() => navigate('/'), 3000);
      return;
    }

    const findExistingRequest = async () => {
      const q = query(collection(db, 'top-ups'), where('userId', '==', user.uid));

      try {
        const querySnapshot = await getDocs(q);
        const pendingDocs = querySnapshot.docs
          .map((snapshot) => ({ id: snapshot.id, ...snapshot.data() }))
          .filter((snapshot) => snapshot.status === 'pending');

        if (pendingDocs.length > 0) {
          pendingDocs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          const latestPendingDoc = pendingDocs[0];
          setTopUpId(latestPendingDoc.id);
          setAmount(latestPendingDoc.amount);
          setPaymentStatus('pending');
          localStorage.setItem('currentPendingTopUpId', latestPendingDoc.id);
          return;
        }

        const storedAmount = parseFloat(localStorage.getItem('Amount') || 0);
        const storedMessage = localStorage.getItem('PaymentMessage') || '';
        if (storedAmount > 0) {
          setAmount(storedAmount);
          setMessage(storedMessage);
          setPaymentStatus('confirming');
          localStorage.removeItem('currentPendingTopUpId');
        } else {
          navigate('/wallet');
        }
      } catch (err) {
        console.error("Error finding pending top-up:", err);
        setError("Could not check payment status. Please try again later.");
        setTimeout(() => navigate('/wallet'), 3000);
      }
    };

    findExistingRequest();
  }, [user, navigate]);

  useEffect(() => {
    if (!topUpId) return undefined;

    const unsubscribe = onSnapshot(doc(db, 'top-ups', topUpId), (snapshot) => {
      const data = snapshot.data();
      if (!data) return;

      switch (data.status) {
        case 'approved':
          setPaymentStatus('approved');
          toast.success("Payment approved! Your balance has been updated.");
          localStorage.removeItem('currentPendingTopUpId');
          localStorage.removeItem('Amount');
          localStorage.removeItem('PaymentMessage');
          setTimeout(() => navigate('/wallet'), 3000);
          break;
        case 'rejected':
          setPaymentStatus('rejected');
          setRejectionComment(data.adminComment || 'Your payment could not be verified.');
          localStorage.removeItem('currentPendingTopUpId');
          localStorage.removeItem('Amount');
          localStorage.removeItem('PaymentMessage');
          break;
        default:
          break;
      }
    });

    return () => unsubscribe();
  }, [topUpId, navigate]);

  const handleConfirmPayment = async () => {
    if (!paymentProof) {
      setError('Please upload a payment screenshot.');
      return;
    }

    setPaymentStatus('pending');
    setUploading(true);
    setError('');

    try {
      const storage = getStorage();
      const storageRef = ref(storage, `paymentProofs/${user.uid}/${Date.now()}_${paymentProof.name}`);
      await uploadBytes(storageRef, paymentProof);
      const proofUrl = await getDownloadURL(storageRef);

      const userDocRef = doc(db, 'users', user.uid);
      const userDocSnap = await getDoc(userDocRef);
      const name = userDocSnap.exists() ? userDocSnap.data().name : 'Unknown User';

      const topUpRef = await addDoc(collection(db, 'top-ups'), {
        userId: user.uid,
        name,
        amount,
        message,
        status: 'pending',
        paymentProof: proofUrl,
        createdAt: new Date().toISOString(),
      });

      setTopUpId(topUpRef.id);
      localStorage.setItem('currentPendingTopUpId', topUpRef.id);
      toast.success("Payment request submitted successfully!");
      navigate('/addcash');
    } catch (err) {
      console.error('Error submitting top-up request:', err);
      setError('Failed to submit request. Please check your connection and try again.');
      setPaymentStatus('confirming');
    } finally {
      setUploading(false);
    }
  };

  const renderContent = () => {
    if (error) {
      return (
        <div className="flex items-center space-x-3 rounded-2xl border border-red-500/20 bg-red-500/10 p-4 text-red-200">
          <AlertCircle className="h-6 w-6 flex-shrink-0" />
          <p>{error}</p>
        </div>
      );
    }

    if (paymentStatus === 'pending') {
      return (
        <div className="flex flex-col items-center space-y-6 text-center">
          <Clock className="h-24 w-24 text-yellow-500" />
          <h2 className="text-3xl font-bold text-white">Request Submitted</h2>
          <p className="max-w-sm text-gray-300">Status: Pending Admin Approval</p>
          <p className="max-w-md text-sm text-gray-400">
            We have received your payment request and this page will update automatically after admin approval or rejection.
          </p>
          <div className="rounded-2xl border border-yellow-500/20 bg-yellow-500/10 p-4 text-yellow-200">
            Go back home and continue playing while approval is in progress.
          </div>
        </div>
      );
    }

    if (paymentStatus === 'approved') {
      return (
        <div className="flex flex-col items-center space-y-4 text-center">
          <CheckCircle className="h-24 w-24 text-green-500" />
          <h2 className="text-3xl font-bold text-green-400">Payment Approved!</h2>
          <p className="text-gray-300">₹{amount} has been added to your wallet. Redirecting...</p>
        </div>
      );
    }

    if (paymentStatus === 'rejected') {
      return (
        <div className="flex flex-col items-center space-y-6 text-center">
          <XCircle className="h-24 w-24 text-red-500" />
          <h2 className="text-3xl font-bold text-red-400">Payment Rejected</h2>
          <p className="max-w-md text-gray-300">Reason: {rejectionComment}</p>
          <button
            onClick={() => navigate('/support')}
            className="w-full max-w-xs rounded-2xl bg-blue-600 py-3 font-bold text-white transition hover:bg-blue-500"
          >
            Contact Support
          </button>
        </div>
      );
    }

    return (
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
            onChange={(event) => setPaymentProof(event.target.files[0])}
            className="hidden"
          />
        </div>

        <button
          onClick={handleConfirmPayment}
          className="flex w-full items-center justify-center space-x-3 rounded-2xl bg-gradient-to-r from-purple-600 to-blue-600 py-4 text-lg font-bold text-white shadow-2xl transition hover:from-purple-700 hover:to-blue-700"
          disabled={uploading}
        >
          <WalletIcon className="h-6 w-6" />
          <span>{uploading ? 'Submitting...' : 'Submit for Verification'}</span>
        </button>
      </div>
    );
  };

  return (
    <AccountPageShell
      title="Payment Confirmation"
      subtitle="Screenshot upload karke payment verification request submit karein."
      backTo="/pay"
    >
      <div className="flex min-h-[70vh] flex-col items-center justify-center p-6 text-white">
        {renderContent()}
      </div>
    </AccountPageShell>
  );
}
