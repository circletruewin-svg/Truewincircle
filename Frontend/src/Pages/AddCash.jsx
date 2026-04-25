import { useNavigate } from 'react-router-dom';
import { useState, useEffect, useMemo } from 'react';
import { toast } from 'react-toastify';
import { getAuth } from "firebase/auth";
import { collection, query, where, onSnapshot, limit } from "firebase/firestore";
import { db } from "../firebase";
import { ArrowDownCircle, CheckCircle, Clock, Loader2, XCircle } from 'lucide-react';
import AccountPageShell from '../components/AccountPageShell';

export function AddCash() {
  const navigate = useNavigate();
  const [amount, setAmount] = useState('');
  const [message, setMessage] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [topUps, setTopUps] = useState([]);
  const [user, setUser] = useState(null);

  const auth = getAuth();

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (!currentUser) {
        toast.error('Please log in to add cash.');
        navigate('/');
        return;
      }
      setUser(currentUser);
    });

    return () => unsubscribeAuth();
  }, [auth, navigate]);

  useEffect(() => {
    if (!user) return;

    const q = query(
      collection(db, 'top-ups'),
      where('userId', '==', user.uid),
      limit(20)
    );

    const unsubscribeSnapshot = onSnapshot(
      q,
      (querySnapshot) => {
        const now = new Date();
        const fetchedTopUps = querySnapshot.docs
          .map((snapshot) => ({
            ...snapshot.data(),
            id: snapshot.id,
          }))
          .sort((a, b) => {
            const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
            const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
            return dateB - dateA;
          })
          .filter((topUp) => {
            let createdAtDate = null;
            if (topUp.createdAt?.toDate) {
              createdAtDate = topUp.createdAt.toDate();
            } else if (topUp.createdAt instanceof Date) {
              createdAtDate = topUp.createdAt;
            } else if (typeof topUp.createdAt === 'string') {
              createdAtDate = new Date(topUp.createdAt);
            }

            if (!createdAtDate) return topUp.status === 'pending';

            const diffInHours = (now - createdAtDate) / (1000 * 60 * 60);
            return topUp.status === 'pending' || diffInHours < 24;
          })
          .slice(0, 5);

        setTopUps(fetchedTopUps);
        setIsLoading(false);
      },
      () => setIsLoading(false)
    );

    return () => unsubscribeSnapshot();
  }, [user]);

  const handleNext = () => {
    const parsedAmount = parseInt(amount, 10);
    if (!parsedAmount || parsedAmount < 50 || parsedAmount > 1000000) {
      toast.error('Please enter an amount between ₹50 and ₹1,000,000');
      return;
    }
    if (!message.trim()) {
      toast.error('Please provide a message for the payment.');
      return;
    }
    window.localStorage.setItem('Amount', parsedAmount);
    window.localStorage.setItem('PaymentMessage', message);
    navigate('/pay');
  };

  const quickAmounts = ['50', '500', '1000', '5000', '10000', '25000'];

  const latestRequest = useMemo(() => topUps[0] || null, [topUps]);

  const renderStatusBanner = () => {
    if (!latestRequest) return null;
    const map = {
      pending:  { Icon: Clock,       wrap: 'border-yellow-400/30 bg-yellow-500/10 text-yellow-100', label: 'Pending admin approval' },
      approved: { Icon: CheckCircle, wrap: 'border-green-400/30 bg-green-500/10 text-green-100',   label: 'Approved & credited' },
      rejected: { Icon: XCircle,     wrap: 'border-red-400/30 bg-red-500/10 text-red-100',         label: 'Rejected' },
    };
    const { Icon, wrap, label } = map[latestRequest.status] || map.pending;
    const date = latestRequest.createdAt?.toDate
      ? latestRequest.createdAt.toDate()
      : new Date(latestRequest.createdAt);
    return (
      <div className={`mb-6 flex items-start gap-3 rounded-2xl border px-4 py-3 ${wrap}`}>
        <Icon className="mt-0.5 h-5 w-5 flex-shrink-0" />
        <div className="min-w-0 text-sm">
          <p className="font-semibold">
            Last deposit request: ₹{Number(latestRequest.amount || 0).toFixed(2)} — {label}
          </p>
          <p className="text-xs opacity-80">
            {date.toLocaleString()} · You can still submit a new request below.
          </p>
        </div>
      </div>
    );
  };

  return (
    <AccountPageShell
      title="Add Cash"
      subtitle="Amount enter karein, note add karein, aur payment verification flow complete karein."
      backTo="/wallet"
    >
      {isLoading ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-[28px] border border-white/10 bg-white/5">
          <Loader2 className="mr-3 h-8 w-8 animate-spin text-yellow-400" />
          <p>Loading payment status...</p>
        </div>
      ) : (
        <>
        {renderStatusBanner()}
        <div className="grid gap-6 lg:grid-cols-[1.35fr_0.9fr]">
          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0a2d55] to-[#081f39] p-6 shadow-2xl">
            <div className="border-b border-white/10 pb-5">
              <h2 className="text-2xl font-bold text-yellow-400">Deposit Details</h2>
              <p className="mt-2 text-sm text-slate-300">Same app-style flow: amount, note, payment, proof upload.</p>
            </div>

            <div className="mt-6 rounded-2xl border border-blue-400/20 bg-blue-500/10 p-4 text-sm text-blue-100">
              Correct UPI ya bank details payment page par jo dikhen wahi use karein. Galat account par ki gayi payment process nahi hogi.
            </div>

            <div className="mt-6 grid gap-6 md:grid-cols-2">
              <div>
                <label htmlFor="amount-input" className="mb-2 block text-sm font-medium text-slate-300">
                  Enter Amount
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 flex items-center pl-4 text-lg text-slate-400">₹</span>
                  <input
                    id="amount-input"
                    type="number"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    className="w-full rounded-2xl border border-white/10 bg-white/5 py-3 pl-10 pr-4 text-lg text-white outline-none transition focus:border-yellow-400"
                    placeholder="50 - 1,000,000"
                  />
                </div>
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-300">Quick Select</label>
                <div className="grid grid-cols-3 gap-2">
                  {quickAmounts.map((value) => (
                    <button
                      key={value}
                      onClick={() => setAmount(value)}
                      className="rounded-xl border border-white/10 bg-white/5 py-2 font-bold transition hover:bg-yellow-400 hover:text-slate-950"
                    >
                      ₹{value}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="mt-6">
              <label htmlFor="message-input" className="mb-2 block text-sm font-medium text-slate-300">
                Payment Message
              </label>
              <textarea
                id="message-input"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="min-h-[120px] w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-white outline-none transition focus:border-yellow-400"
                placeholder="e.g. UTR, payment note, ya extra detail"
              />
            </div>

            <button
              onClick={handleNext}
              className="mt-6 w-full rounded-2xl bg-yellow-400 px-4 py-4 text-lg font-black text-slate-950 transition hover:bg-yellow-300"
            >
              Proceed to Payment
            </button>
          </div>

          <div className="space-y-4">
            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <h3 className="text-xl font-bold text-yellow-400">Recent Deposit Activity</h3>
              <p className="mt-2 text-sm text-slate-300">Pending ya recent top-up requests yahin dikhengi.</p>

              <div className="mt-5 space-y-3">
                {topUps.length > 0 ? topUps.map((item) => {
                  const date = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt);
                  const statusColor =
                    item.status === 'approved'
                      ? 'text-green-300'
                      : item.status === 'rejected'
                        ? 'text-red-300'
                        : 'text-yellow-300';

                  return (
                    <div key={item.id} className="rounded-2xl border border-white/10 bg-[#0c2748] p-4">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3">
                          <div className="rounded-full bg-green-500/15 p-2">
                            <ArrowDownCircle className="h-5 w-5 text-green-300" />
                          </div>
                          <div>
                            <p className="font-semibold text-white">Deposit</p>
                            <p className="text-xs text-slate-400">{date.toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-300">+₹{parseFloat(item.amount).toFixed(2)}</p>
                          <p className={`text-xs font-bold uppercase ${statusColor}`}>{item.status || 'pending'}</p>
                        </div>
                      </div>
                    </div>
                  );
                }) : (
                  <div className="rounded-2xl border border-dashed border-white/10 bg-[#0c2748] p-6 text-center text-slate-400">
                    <Clock className="mx-auto mb-3 h-10 w-10 opacity-50" />
                    <p>No recent requests</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
        </>
      )}
    </AccountPageShell>
  );
}
