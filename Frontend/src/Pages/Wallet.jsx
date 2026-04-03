import { useEffect, useState } from "react";
import { getAuth } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { IndianRupee, Wallet as WalletIcon, TrendingUp, PlusCircle, ArrowUpCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import AccountPageShell from "../components/AccountPageShell";

export function MyWallet() {
  const navigate = useNavigate();
  const auth = getAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [walletBalance, setWalletBalance] = useState(0);
  const [winningMoney, setWinningMoney] = useState(0);

  useEffect(() => {
    let unsubscribeUserDoc = null;

    const unsubscribeAuth = auth.onAuthStateChanged((currentUser) => {
      if (unsubscribeUserDoc) {
        unsubscribeUserDoc();
        unsubscribeUserDoc = null;
      }

      if (!currentUser) {
        setError("Please log in to view your wallet.");
        setLoading(false);
        return;
      }

      const userRef = doc(db, "users", currentUser.uid);
      unsubscribeUserDoc = onSnapshot(
        userRef,
        (userSnap) => {
          if (userSnap.exists()) {
            setWalletBalance(parseFloat(userSnap.data().balance) || 0);
            setWinningMoney(parseFloat(userSnap.data().winningMoney) || 0);
            setError("");
          } else {
            setError("User data not found.");
          }
          setLoading(false);
        },
        () => {
          setError("Failed to load wallet data.");
          setLoading(false);
        }
      );
    });

    return () => {
      if (unsubscribeUserDoc) unsubscribeUserDoc();
      unsubscribeAuth();
    };
  }, [auth]);

  const totalBalance = walletBalance + winningMoney;

  return (
    <AccountPageShell
      title="My Wallet"
      subtitle="Top wallet summary, winning money, aur quick actions ek hi clean screen par."
      backTo="/"
      actions={
        <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-right">
          <p className="text-xs uppercase tracking-[0.2em] text-slate-300">Total Balance</p>
          <p className="mt-1 text-2xl font-black text-yellow-400">₹{totalBalance.toFixed(2)}</p>
        </div>
      }
    >
      {loading ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-[28px] border border-white/10 bg-white/5">
          <p>Loading wallet...</p>
        </div>
      ) : error ? (
        <div className="flex min-h-[40vh] items-center justify-center rounded-[28px] border border-red-400/30 bg-red-500/10 px-6 text-center text-red-200">
          <p>{error}</p>
        </div>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-[28px] border border-white/10 bg-gradient-to-br from-[#0a2d55] to-[#081f39] p-6 shadow-2xl">
            <div className="flex items-center justify-between gap-4 border-b border-white/10 pb-5">
              <div className="flex items-center gap-3">
                <div className="rounded-2xl bg-yellow-500/15 p-3">
                  <WalletIcon className="h-7 w-7 text-yellow-400" />
                </div>
                <div>
                  <p className="text-sm text-slate-300">Available Funds</p>
                  <h2 className="text-3xl font-black text-white">₹{totalBalance.toFixed(2)}</h2>
                </div>
              </div>
            </div>

            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3">
                  <PlusCircle className="h-6 w-6 text-green-400" />
                  <p className="text-sm font-semibold text-slate-300">Wallet Balance</p>
                </div>
                <p className="mt-3 text-3xl font-black text-white">₹{walletBalance.toFixed(2)}</p>
                <button
                  onClick={() => navigate("/addcash")}
                  className="mt-5 w-full rounded-xl bg-green-500 px-4 py-3 font-bold text-slate-950 transition hover:bg-green-400"
                >
                  Add Cash
                </button>
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                <div className="flex items-center gap-3">
                  <TrendingUp className="h-6 w-6 text-yellow-400" />
                  <p className="text-sm font-semibold text-slate-300">Winning Money</p>
                </div>
                <p className="mt-3 text-3xl font-black text-white">₹{winningMoney.toFixed(2)}</p>
                <button
                  onClick={() => navigate("/withdraw")}
                  className="mt-5 w-full rounded-xl bg-yellow-400 px-4 py-3 font-bold text-slate-950 transition hover:bg-yellow-300"
                >
                  Withdraw
                </button>
              </div>
            </div>
          </div>

          <div className="rounded-[28px] border border-white/10 bg-white/5 p-6 shadow-xl">
            <h3 className="text-xl font-bold text-yellow-400">Quick Actions</h3>
            <p className="mt-2 text-sm text-slate-300">Jo top wallet icon se milta hai, wahi quick flow yahan bhi rahega.</p>

            <div className="mt-6 space-y-3">
              <button
                onClick={() => navigate("/addcash")}
                className="flex w-full items-center justify-between rounded-2xl border border-green-400/20 bg-green-500/10 px-4 py-4 text-left transition hover:bg-green-500/15"
              >
                <span>
                  <span className="block font-semibold text-white">Add Cash</span>
                  <span className="text-sm text-slate-300">Deposit request submit karein</span>
                </span>
                <PlusCircle className="h-5 w-5 text-green-300" />
              </button>

              <button
                onClick={() => navigate("/withdraw")}
                className="flex w-full items-center justify-between rounded-2xl border border-yellow-400/20 bg-yellow-500/10 px-4 py-4 text-left transition hover:bg-yellow-500/15"
              >
                <span>
                  <span className="block font-semibold text-white">Withdraw</span>
                  <span className="text-sm text-slate-300">Winning money payout request</span>
                </span>
                <ArrowUpCircle className="h-5 w-5 text-yellow-300" />
              </button>

              <button
                onClick={() => navigate("/history")}
                className="flex w-full items-center justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-4 text-left transition hover:bg-white/10"
              >
                <span>
                  <span className="block font-semibold text-white">History</span>
                  <span className="text-sm text-slate-300">Transactions aur betting activity</span>
                </span>
                <IndianRupee className="h-5 w-5 text-slate-300" />
              </button>
            </div>
          </div>
        </div>
      )}
    </AccountPageShell>
  );
}
