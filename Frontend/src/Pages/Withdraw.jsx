// src/components/Withdraw.jsx

import { useState, useEffect } from 'react';
import { useNavigate } from "react-router-dom";
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc, runTransaction, collection, query, where, orderBy, limit, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";
import { toast } from "react-toastify";
import { ArrowLeft, IndianRupee } from "lucide-react";
import SocialButtons from '../components/Soical';

const Withdraw = () => {
  const navigate = useNavigate();
  const auth = getAuth();
  
  const [user, setUser] = useState(null);
  const [authStatusLoaded, setAuthStatusLoaded] = useState(false);

  const [amount, setAmount] = useState('');
  const [upiId, setUpiId] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [confirmAccountNumber, setConfirmAccountNumber] = useState(''); // NEW
  const [ifscCode, setIfscCode] = useState('');
  const [bankName, setBankName] = useState('');
  const [method, setMethod] = useState('upi');

  const [loading, setLoading] = useState(true);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [error, setError] = useState('');
  const [winningMoney, setWinningMoney] = useState(0);
  const [withdrawals, setWithdrawals] = useState([]);

  // Account number match status
  const accountsMatch = accountNumber && confirmAccountNumber && accountNumber === confirmAccountNumber;
  const accountsMismatch = accountNumber && confirmAccountNumber && accountNumber !== confirmAccountNumber;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthStatusLoaded(true);
    });
    return () => unsubscribe();
  }, [auth]);

  useEffect(() => {
    const fetchWinningMoney = async () => {
      if (user) {
        try {
          const userRef = doc(db, "users", user.uid);
          const userSnap = await getDoc(userRef);
          if (userSnap.exists()) {
            setWinningMoney(parseFloat(userSnap.data().winningMoney) || 0);
          } else {
            toast.error("User data not found.");
            setError("User data not found.");
          }
        } catch (err) {
          console.error("Error fetching winning money:", err);
          toast.error("Failed to load winning money.");
          setError("Failed to load winning money.");
        } finally {
          setLoading(false);
        }
      }
    };

    if (authStatusLoaded) {
      if (user) {
        fetchWinningMoney();
      } else {
        setLoading(false);
        setError("Please log in to withdraw.");
      }
    }
  }, [user, authStatusLoaded]);

  useEffect(() => {
    if (!user) {
      setWithdrawals([]);
      return;
    }

    const q = query(
      collection(db, "withdrawals"),
      where("userId", "==", user.uid),
      limit(20)
    );

    const unsubscribe = onSnapshot(q, (querySnapshot) => {
      const now = new Date();
      const fetchedWithdrawals = querySnapshot.docs
        .map(doc => ({ ...doc.data(), id: doc.id }))
        .sort((a, b) => {
          const dateA = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt);
          const dateB = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt);
          return dateB - dateA;
        })
        .filter(w => {
          let createdAtDate = null;
          if (w.createdAt?.toDate) createdAtDate = w.createdAt.toDate();
          else if (w.createdAt instanceof Date) createdAtDate = w.createdAt;
          else if (typeof w.createdAt === 'string') createdAtDate = new Date(w.createdAt);

          if (!createdAtDate) return w.status === 'pending';
          const diffInHours = (now - createdAtDate) / (1000 * 60 * 60);
          return w.status === 'pending' || diffInHours < 24;
        })
        .slice(0, 5);
      setWithdrawals(fetchedWithdrawals);
    }, (err) => {
      console.error("Error fetching withdrawals:", err);
      if (err.code === 'failed-precondition') {
        toast.error("Query index missing. Check console for link to create it.");
      } else {
        toast.error("Could not load recent withdrawals.");
      }
    });

    return () => unsubscribe();
  }, [user?.uid]);

  const validateUPI = (upi) => {
    const upiRegex = /^[\w.-]+@[\w.-]+$/;
    return upiRegex.test(upi);
  };

  const validateIFSC = (ifsc) => {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    return ifscRegex.test(ifsc.toUpperCase());
  };

  const handleAccountNumberChange = (e) => {
    // Only allow numbers
    const val = e.target.value.replace(/\D/g, '');
    setAccountNumber(val);
  };

  const handleConfirmAccountNumberChange = (e) => {
    // Only allow numbers
    const val = e.target.value.replace(/\D/g, '');
    setConfirmAccountNumber(val);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    const withdrawalAmount = parseFloat(amount);
    if (isNaN(withdrawalAmount) || withdrawalAmount <= 0) {
      toast.error('Please enter a valid amount.');
      return;
    }

    if (withdrawalAmount > winningMoney) {
      toast.error('Insufficient winning money.');
      return;
    }
    if (withdrawalAmount < 200) {
      toast.error('Minimum withdrawal amount is ₹200.');
      return;
    }

    if (method === 'upi' && !validateUPI(upiId)) {
      toast.error('Please enter a valid UPI ID (e.g., user@bank).');
      return;
    }

    if (method === 'bank') {
      if (!accountNumber || !confirmAccountNumber || !ifscCode || !bankName) {
        toast.error('Please fill in all bank details.');
        return;
      }

      // Account number match check
      if (accountNumber !== confirmAccountNumber) {
        toast.error('Account numbers do not match! Please check and try again.');
        return;
      }

      // IFSC validation
      if (!validateIFSC(ifscCode)) {
        toast.error('Invalid IFSC Code format (e.g., SBIN0001234).');
        return;
      }
    }

    if (!user) {
      toast.error('User not logged in.');
      return;
    }

    setSubmitLoading(true);

    try {
      await runTransaction(db, async (transaction) => {
        const userRef = doc(db, "users", user.uid);
        const userSnap = await transaction.get(userRef);

        if (!userSnap.exists()) {
          throw new Error("User data not found in Firestore.");
        }

        const currentWinningMoney = userSnap.data().winningMoney || 0;
        const userName = userSnap.data().name || 'Anonymous';

        if (currentWinningMoney < withdrawalAmount) {
          throw new Error("Insufficient winning money for withdrawal.");
        }

        transaction.update(userRef, { winningMoney: currentWinningMoney - withdrawalAmount });

        const withdrawalsCollectionRef = collection(db, 'withdrawals');
        transaction.set(doc(withdrawalsCollectionRef), {
          userId: user.uid,
          name: userName,
          amount: withdrawalAmount,
          method,
          upiId: method === 'upi' ? upiId : '',
          accountNumber: method === 'bank' ? accountNumber : '',
          ifscCode: method === 'bank' ? ifscCode.toUpperCase() : '',
          bankName: method === 'bank' ? bankName : '',
          status: 'pending',
          createdAt: new Date(),
        });
      });

      toast.success('Withdrawal request submitted successfully!');
      setAmount('');
      setUpiId('');
      setAccountNumber('');
      setConfirmAccountNumber('');
      setIfscCode('');
      setBankName('');
    } catch (err) {
      console.error('Withdrawal error:', err);
      toast.error(`Withdrawal failed: ${err.message}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  return (
    <div className="font-roboto min-h-screen bg-[#042346] text-white p-4 lg:p-8">
      <div className="max-w-6xl mx-auto flex items-center mb-6">
        <button
          onClick={() => navigate("/wallet")}
          className="p-2 rounded-full hover:bg-white/10 transition-colors"
        >
          <ArrowLeft className="w-6 h-6 text-yellow-500" />
        </button>
        <h1 className="text-2xl font-bold ml-4">Withdraw Winning Money</h1>
      </div>

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <p>Loading...</p>
        </div>
      ) : error ? (
        <div className="text-center text-red-500 h-64 flex items-center justify-center">
          <p>{error}</p>
        </div>
      ) : (
        <main className="max-w-6xl mx-auto w-full pt-4">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">

            {/* Withdrawal Form */}
            <div className="lg:col-span-7 xl:col-span-8 order-1">
              <div className="bg-[#0a2d55] rounded-xl p-6 lg:p-10 shadow-lg space-y-6 border border-white/5">
                <div className="text-center lg:text-left mb-4">
                  <h2 className="text-xl lg:text-2xl font-semibold text-yellow-500 mb-2">Make a Withdrawal</h2>
                  <p className="text-lg text-gray-300">Available Winning Money:</p>
                  <p className="text-4xl lg:text-5xl font-bold text-yellow-500 flex items-center justify-center lg:justify-start">
                    <IndianRupee className="w-8 h-8 lg:w-10 lg:h-10 mr-2" />
                    {winningMoney.toFixed(2)}
                  </p>
                </div>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                      <label htmlFor="amount" className="block text-sm font-medium text-gray-300 mb-2">Amount to Withdraw</label>
                      <input
                        id="amount"
                        type="number"
                        placeholder="Min ₹200"
                        value={amount}
                        onChange={(e) => setAmount(e.target.value)}
                        required
                        className="w-full bg-[#042346] border border-gray-600 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white text-lg"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="block text-sm font-medium text-gray-300">Method</label>
                      <div className="flex gap-4">
                        <button type="button" onClick={() => setMethod('upi')} className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${method === 'upi' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>UPI</button>
                        <button type="button" onClick={() => setMethod('bank')} className={`flex-1 py-3 rounded-lg font-semibold transition-colors ${method === 'bank' ? 'bg-yellow-500 text-black' : 'bg-gray-700 text-white hover:bg-gray-600'}`}>Bank</button>
                      </div>
                    </div>
                  </div>

                  {method === 'upi' && (
                    <div className="animate-in fade-in slide-in-from-top-2">
                      <label className="block text-sm font-medium text-gray-300 mb-2">UPI ID</label>
                      <input
                        type="text"
                        placeholder="Enter your UPI ID (e.g., user@upi)"
                        value={upiId}
                        onChange={(e) => setUpiId(e.target.value)}
                        required={method === 'upi'}
                        className="w-full bg-[#042346] border border-gray-600 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                      />
                    </div>
                  )}

                  {method === 'bank' && (
                    <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                      
                      {/* Account Number */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">Bank Account Number</label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Enter Account Number"
                          value={accountNumber}
                          onChange={handleAccountNumberChange}
                          required={method === 'bank'}
                          className="w-full bg-[#042346] border border-gray-600 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                        />
                      </div>

                      {/* Confirm Account Number */}
                      <div>
                        <label className="block text-sm font-medium text-gray-300 mb-2">
                          Confirm Account Number
                          {accountsMatch && (
                            <span className="ml-2 text-green-400 text-xs font-semibold">✓ Match</span>
                          )}
                          {accountsMismatch && (
                            <span className="ml-2 text-red-400 text-xs font-semibold">✗ Not Matching</span>
                          )}
                        </label>
                        <input
                          type="text"
                          inputMode="numeric"
                          placeholder="Re-enter Account Number"
                          value={confirmAccountNumber}
                          onChange={handleConfirmAccountNumberChange}
                          required={method === 'bank'}
                          onPaste={(e) => e.preventDefault()} // Prevent paste for security
                          className={`w-full bg-[#042346] border px-4 py-3 rounded-lg focus:outline-none focus:ring-2 text-white transition-colors ${
                            accountsMatch
                              ? 'border-green-500 focus:ring-green-500'
                              : accountsMismatch
                              ? 'border-red-500 focus:ring-red-500'
                              : 'border-gray-600 focus:ring-yellow-500'
                          }`}
                        />
                        {accountsMismatch && (
                          <p className="text-red-400 text-xs mt-1">⚠️ Account numbers do not match!</p>
                        )}
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* IFSC Code */}
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">IFSC Code</label>
                          <input
                            type="text"
                            placeholder="e.g., SBIN0001234"
                            value={ifscCode}
                            onChange={(e) => setIfscCode(e.target.value.toUpperCase())}
                            required={method === 'bank'}
                            maxLength={11}
                            className="w-full bg-[#042346] border border-gray-600 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white uppercase"
                          />
                        </div>

                        {/* Bank Name */}
                        <div>
                          <label className="block text-sm font-medium text-gray-300 mb-2">Bank Name</label>
                          <input
                            type="text"
                            placeholder="e.g., State Bank of India"
                            value={bankName}
                            onChange={(e) => setBankName(e.target.value)}
                            required={method === 'bank'}
                            className="w-full bg-[#042346] border border-gray-600 px-4 py-3 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 text-white"
                          />
                        </div>
                      </div>
                    </div>
                  )}

                  {(() => {
                    const parsedAmount = parseFloat(amount);
                    const amountInvalid =
                      !amount ||
                      isNaN(parsedAmount) ||
                      parsedAmount < 200 ||
                      parsedAmount > winningMoney;
                    const bankInvalid = method === 'bank' && accountsMismatch;
                    return (
                      <button
                        type="submit"
                        disabled={submitLoading || amountInvalid || bankInvalid}
                        className="w-full bg-yellow-500 text-black font-bold py-4 rounded-lg hover:bg-yellow-600 transition-all text-lg shadow-lg shadow-yellow-500/20 disabled:bg-gray-500 disabled:cursor-not-allowed"
                      >
                        {submitLoading ? 'Processing...' : 'Request Withdrawal'}
                      </button>
                    );
                  })()}
                </form>
              </div>
            </div>

            {/* Recent Withdrawals */}
            <div className="lg:col-span-5 xl:col-span-4 order-2 space-y-4">
              {withdrawals.length > 0 ? (
                <>
                  <h2 className="text-yellow-400 font-bold text-lg lg:text-xl px-1">Recent Withdrawals</h2>
                  <div className="space-y-4">
                    {withdrawals.map((w) => (
                      <div key={w.id} className="bg-[#0a2d55] rounded-xl p-5 shadow-lg space-y-2 border-l-4 border-yellow-500 hover:border-white transition-colors">
                        <div className="flex justify-between items-start">
                          <div>
                            <h3 className="font-bold text-gray-100">Withdrawal ({w.method?.toUpperCase()})</h3>
                            <p className="text-[10px] text-gray-400">{w.createdAt?.toDate().toLocaleString()}</p>
                          </div>
                          <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase ${
                            w.status === 'approved' ? 'bg-green-500/20 text-green-400 border border-green-500/30' :
                            w.status === 'rejected' ? 'bg-red-500/20 text-red-400 border border-red-500/30' :
                            'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30'
                          }`}>
                            {w.status}
                          </span>
                        </div>
                        <p className="text-xs text-gray-300 truncate">{w.method === 'upi' ? w.upiId : `${w.accountNumber} (${w.bankName})`}</p>
                        <p className="text-[10px] text-blue-400 italic">Credits within 10-24 hours</p>
                        <div className="pt-1">
                          <p className="text-xl font-bold text-red-400">-₹{w.amount.toFixed(2)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div className="hidden lg:block bg-[#0a2d55]/50 border border-dashed border-gray-700 rounded-xl p-8 text-center text-gray-500">
                  <p>No recent withdrawal activity</p>
                </div>
              )}
            </div>

          </div>
        </main>
      )}
      <div className="mt-8">
        <SocialButtons />
      </div>
    </div>
  );
};

export default Withdraw;
