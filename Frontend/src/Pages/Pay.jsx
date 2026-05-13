import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { app, db } from '../firebase';
import { ref, getDownloadURL, getStorage } from 'firebase/storage';
import { doc, onSnapshot, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import { Clock3 } from 'lucide-react';
import AccountPageShell from '../components/AccountPageShell';

const QR_CACHE_KEY = 'cachedQrUrl';
const QR_CACHE_TS_KEY = 'cachedQrUrlAt';
const QR_CACHE_TTL_MS = 12 * 60 * 60 * 1000;

const Pay = () => {
  const storage = getStorage(app);
  const [timeLeft, setTimeLeft] = useState(300);
  // Render the cached QR immediately if AddCash already prefetched it;
  // we still kick off a fresh fetch in the background to pick up admin
  // or master updates, but the user sees the QR with zero perceived delay.
  const [qrCodeUrl, setQrCodeUrl] = useState(() => {
    try {
      const cached = sessionStorage.getItem(QR_CACHE_KEY);
      const cachedAt = Number(sessionStorage.getItem(QR_CACHE_TS_KEY) || 0);
      if (cached && Date.now() - cachedAt < QR_CACHE_TTL_MS) return cached;
    } catch { /* ignore */ }
    return '';
  });
  const [qrSource, setQrSource] = useState(''); // 'master' | 'admin' | ''
  const navigate = useNavigate();
  const amount = window.localStorage.getItem('Amount');
  const isExpired = timeLeft === 0;

  // Pick the right QR for this user. Order of preference:
  //   1. Master's qrCodeUrl (if user belongs to a master who set one)
  //   2. Admin's default barcodes/qr.jpg
  useEffect(() => {
    let cancelled = false;
    const fetchQrCode = async () => {
      try {
        const auth = getAuth();
        const me = auth.currentUser;
        if (me) {
          // Live-watch the user doc so the page reacts if admin reassigns
          // them to a different master while they're on the page.
          const meSnap = await getDoc(doc(db, 'users', me.uid));
          const masterId = meSnap.exists() ? meSnap.data().assignedMasterId : null;
          if (masterId) {
            const mSnap = await getDoc(doc(db, 'users', masterId));
            if (!cancelled && mSnap.exists() && mSnap.data().qrCodeUrl) {
              setQrCodeUrl(mSnap.data().qrCodeUrl);
              setQrSource('master');
              try {
                sessionStorage.setItem(QR_CACHE_KEY, mSnap.data().qrCodeUrl);
                sessionStorage.setItem(QR_CACHE_TS_KEY, String(Date.now()));
              } catch { /* ignore quota */ }
              return;
            }
          }
        }
        // Fallback: global admin QR.
        const qrCodeRef = ref(storage, 'barcodes/qr.jpg');
        const url = await getDownloadURL(qrCodeRef);
        if (cancelled) return;
        setQrCodeUrl(url);
        setQrSource('admin');
        try {
          sessionStorage.setItem(QR_CACHE_KEY, url);
          sessionStorage.setItem(QR_CACHE_TS_KEY, String(Date.now()));
        } catch { /* ignore quota */ }
      } catch (error) {
        console.error("Error fetching QR code:", error);
      }
    };

    fetchQrCode();
    return () => { cancelled = true; };
  }, [storage]);

  useEffect(() => {
    if (timeLeft > 0) {
      const timer = setInterval(() => {
        setTimeLeft((prevTime) => prevTime - 1);
      }, 1000);
      return () => clearInterval(timer);
    }
  }, [timeLeft]);

  const formatTime = (seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  return (
    <AccountPageShell
      title="Scan & Pay"
      subtitle="QR scan karke payment complete karein. Payment ke baad screenshot confirmation zaroor submit karein."
      backTo="/addcash"
    >
      <div className="mx-auto max-w-4xl">
        {isExpired ? (
          <div className="rounded-[28px] border border-red-400/20 bg-red-500/10 p-8 text-center shadow-xl">
            <h2 className="text-3xl font-black text-red-300">QR Code Expired</h2>
            <p className="mt-3 text-slate-200">Please go back and generate a new payment request.</p>
            <button
              onClick={() => navigate('/addcash')}
              className="mt-6 rounded-2xl bg-yellow-400 px-6 py-3 font-bold text-slate-950 transition hover:bg-yellow-300"
            >
              Go Back
            </button>
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[1.1fr_0.8fr]">
            <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0a2d55] to-[#081f39] p-8 text-center shadow-2xl">
              <p className="text-sm font-semibold uppercase tracking-[0.28em] text-yellow-400">Payment</p>
              <h2 className="mt-3 text-2xl font-black text-white">Pay ₹{amount}</h2>
              <div className="mt-6 inline-block rounded-[28px] bg-white p-4 shadow-lg">
                {qrCodeUrl ? (
                  <img src={qrCodeUrl} alt="QR Code to pay" className="h-64 w-64 rounded-2xl object-cover" />
                ) : (
                  <div className="flex h-64 w-64 items-center justify-center rounded-2xl bg-slate-200 text-slate-500">
                    Loading QR...
                  </div>
                )}
              </div>
              <p className="mt-4 text-slate-300">Scan using any UPI app</p>
              {qrSource === 'master' && (
                <p className="mt-1 text-[11px] uppercase tracking-widest text-emerald-300/80">Your Agent's QR</p>
              )}
            </div>

            <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-xl">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-red-500/10 p-3">
                  <Clock3 className="h-6 w-6 text-red-300" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">Time Remaining</p>
                  <p className="text-4xl font-black text-yellow-400">{formatTime(timeLeft)}</p>
                </div>
              </div>

              <div className="mt-6 rounded-2xl border border-white/10 bg-[#0c2748] p-4 text-sm text-slate-200">
                Payment complete hone ke baad agle step me screenshot upload karna mat bhoolna. Approval ke baad amount wallet me add ho jayega.
              </div>

              <button
                onClick={() => navigate('/payconfirm')}
                className="mt-6 w-full rounded-2xl bg-green-500 px-4 py-4 text-lg font-black text-slate-950 transition hover:bg-green-400"
              >
                I Have Paid
              </button>
            </div>
          </div>
        )}
      </div>
    </AccountPageShell>
  );
};

export default Pay;
