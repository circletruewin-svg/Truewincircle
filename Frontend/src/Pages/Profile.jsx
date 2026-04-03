import React, { useState, useEffect } from "react";
import { LogOut, Wallet, ArrowUpCircle, ArrowDownCircle, Copy, UserPlus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import useAuthStore from "../store/authStore";
import { db } from "../firebase";
import { doc, getDoc, collection, query, where, getCountFromServer } from "firebase/firestore";
import { toast } from "react-toastify";


export default function ProfilePage() {
  const user = useAuthStore((state) => state.user);
  const logout = useAuthStore((state) => state.logout); 
  const navigate = useNavigate();

  const [balances, setBalances] = useState({ wallet: 0, winning: 0 });
  const [totalBets, setTotalBets] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfileData = async () => {
      if (!user) {
        navigate("/login");
        return;
      }
      if (user?.uid) {
        setLoading(true);
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            const data = userSnap.data();
            setBalances({
              wallet: data.balance || 0,
              winning: data.winningMoney || 0,
            });
          } else {
            toast.error("User data not found.");
          }

          const betsCollectionRef = collection(db, "bets");
          const q = query(betsCollectionRef, where("userId", "==", user.uid));
          const snapshot = await getCountFromServer(q);
          setTotalBets(snapshot.data().count);
        } catch (error) {
          console.error("Error fetching user profile data:", error);
          toast.error("Could not load profile data.");
        } finally {
          setLoading(false);
        }
      } else {
        setLoading(false);
      }
    };

    fetchProfileData();
  }, [user, navigate]);

  const handleCopy = (text) => {
    if (text) {
      navigator.clipboard.writeText(text)
        .then(() => toast.success("Referral code copied!"))
        .catch(() => toast.error("Failed to copy."));
    }
  };

  const handleLogout = () => {
    if (logout) {
      logout();
    }
    navigate('/login');
  };

  const totalBalance = balances.wallet + balances.winning;

  return (
    <div className="font-roboto bg-gray-900 text-white min-h-screen p-4 pt-20">
      <div className="max-w-4xl mx-auto">
        {/* Profile Card */}
        <div className="w-full bg-gradient-to-br from-gray-800 via-gray-900 to-black text-white rounded-2xl shadow-xl p-4 md:p-6">
          {/* Header */}
          <div className="flex items-center space-x-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-2xl font-bold">
              {user?.name ? user.name.charAt(0).toUpperCase() : "U"}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{user?.name || "Username"}</h2>
              <p className="text-sm opacity-80">ID: {user?.uid ? user.uid.substring(0, 6) : "#123456"}</p>
              <p className="text-sm opacity-80">Phone: {user?.phoneNumber || "N/A"}</p>
              {user?.referralCode && (
                <div className="flex items-center space-x-2 mt-1">
                  <p className="text-sm opacity-80">Referral: {user.referralCode}</p>
                  <button onClick={() => handleCopy(user.referralCode)} className="p-1 hover:bg-gray-700 rounded-full transition-colors">
                      <Copy size={14} />
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Balance */}
          <div className="mt-4 bg-gray-800 rounded-xl p-4">
            <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Wallet className="text-yellow-400" />
                  <span className="font-semibold">Total Balance</span>
                </div>
                {loading ? <p className="text-sm">Loading...</p> : <span className="text-lg font-bold text-green-400">₹{totalBalance.toFixed(2)}</span>}
            </div>
            <div className="mt-3 pt-3 border-t border-gray-700 text-sm opacity-80 grid grid-cols-2 gap-2">
                <span>Wallet: ₹{balances.wallet.toFixed(2)}</span>
                <span>Winnings: ₹{balances.winning.toFixed(2)}</span>
            </div>
          </div>

      

          {/* Actions */}
          <div className="mt-5 flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
            <button onClick={() => navigate('/addcash')} className="flex-1 py-2 md:py-3 bg-green-600 hover:bg-green-500 rounded-xl flex items-center justify-center space-x-2 font-semibold transition-colors">
              <ArrowDownCircle size={18} />
              <span>Deposit</span>
            </button>
            <button onClick={() => navigate('/withdraw')} className="flex-1 py-2 md:py-3 bg-yellow-600 hover:bg-yellow-500 rounded-xl flex items-center justify-center space-x-2 font-semibold transition-colors">
              <ArrowUpCircle size={18} />
              <span>Withdraw</span>
            </button>
            <button onClick={() => navigate('/refer')} className="flex-1 py-2 md:py-3 bg-blue-600 hover:bg-blue-500 rounded-xl flex items-center justify-center space-x-2 font-semibold transition-colors">
              <UserPlus size={18} />
              <span>Refer & Earn</span>
            </button>
          </div>

          {/* Logout */}
          <button onClick={handleLogout} className="mt-4 w-full py-2 md:py-3 bg-red-600 hover:bg-red-500 rounded-xl flex items-center justify-center space-x-2 font-semibold transition-colors">
            <LogOut size={18} />
            <span>Logout</span>
          </button>
        </div>


      </div>
    </div>
  );
}
