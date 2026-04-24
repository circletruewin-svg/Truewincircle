import React, { useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CreditCard, DollarSign, Trophy, Users, Eye, EyeOff } from 'lucide-react';
import { db } from '../../firebase';
import { doc, getDoc, onSnapshot, setDoc } from 'firebase/firestore';
import { toast } from 'react-toastify';
import { formatCurrency } from '../../utils/formatMoney';

const DashboardView = ({ stats }) => {
  const [jackpotAmount, setJackpotAmount] = useState('');
  const [lastWinnerName, setLastWinnerName] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCountdown, setShowCountdown] = useState(true);
  const [layoutSaving, setLayoutSaving] = useState(false);

  const statItems = [
    { title: 'Total Users', value: String(stats.totalUsers || 0), icon: Users, color: 'bg-blue-500' },
    { title: 'Pending Payments', value: String(stats.pendingPayments || 0), icon: CreditCard, color: 'bg-yellow-500' },
    { title: 'Winners Announced', value: String(stats.winnersAnnounced || 0), icon: Trophy, color: 'bg-green-500' },
    { title: 'Pending Withdrawals', value: String(stats.pendingWithdrawals || 0), icon: DollarSign, color: 'bg-red-500' },
    { title: 'Approved Deposits', value: formatCurrency(stats.approvedDeposits || 0), icon: ArrowDownCircle, color: 'bg-emerald-500' },
    { title: 'Approved Withdrawals', value: formatCurrency(stats.approvedWithdrawals || 0), icon: ArrowUpCircle, color: 'bg-rose-500' },
  ];

  useEffect(() => {
    const fetchJackpotInfo = async () => {
      setLoading(true);
      try {
        const jackpotRef = doc(db, 'settings', 'jackpot');
        const docSnap = await getDoc(jackpotRef);
        if (docSnap.exists()) {
          const data = docSnap.data();
          setJackpotAmount(data.currentJackpot || '');
          setLastWinnerName(data.lastWinner || '');
        }
      } catch (error) {
        console.error('Error fetching jackpot info for admin:', error);
        toast.error('Failed to fetch jackpot info.');
      }
      setLoading(false);
    };

    fetchJackpotInfo();
  }, []);

  // Live subscription to the Home layout toggle so the Dashboard
  // switch always reflects the current setting.
  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, 'settings', 'layout'),
      (snap) => {
        if (snap.exists()) setShowCountdown(snap.data().showCountdown !== false);
        else setShowCountdown(true);
      },
      () => setShowCountdown(true)
    );
    return () => unsub();
  }, []);

  const toggleCountdown = async () => {
    const next = !showCountdown;
    setShowCountdown(next);
    setLayoutSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'layout'), { showCountdown: next }, { merge: true });
      toast.success(next ? 'Countdown banner enabled.' : 'Countdown banner disabled.');
    } catch (err) {
      setShowCountdown(!next); // rollback on error
      toast.error('Update failed: ' + err.message);
    } finally {
      setLayoutSaving(false);
    }
  };

  const handleUpdateJackpot = async () => {
    setLoading(true);
    try {
      const jackpotRef = doc(db, 'settings', 'jackpot');
      await setDoc(
        jackpotRef,
        {
          currentJackpot: jackpotAmount,
          lastWinner: lastWinnerName,
        },
        { merge: true }
      );
      toast.success('Jackpot information updated successfully!');
    } catch (error) {
      console.error('Error updating jackpot info:', error);
      toast.error('Failed to update jackpot information.');
    }
    setLoading(false);
  };

  return (
    <div className="p-6">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3 mb-8">
        {statItems.map((stat, index) => (
          <div key={index} className="bg-white rounded-lg shadow-sm p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600 mb-1">{stat.title}</p>
                <p className="text-3xl font-bold">{stat.value}</p>
              </div>
              <div className={`${stat.color} p-3 rounded-lg`}>
                <stat.icon className="h-6 w-6 text-white" />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="bg-white rounded-lg shadow-sm p-5 mt-8">
        <h3 className="text-lg font-semibold mb-4">Home page layout</h3>
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
          <div className="flex items-start gap-3">
            <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center ${showCountdown ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
              {showCountdown ? <Eye size={18} /> : <EyeOff size={18} />}
            </div>
            <div>
              <p className="font-semibold text-gray-800">Show Countdown & Jackpot banner on Home</p>
              <p className="text-xs text-gray-500">
                Toggle the dark card with the Next Result Countdown (left) and Jackpot (right) that appears above the cricket section.
              </p>
            </div>
          </div>
          <button
            onClick={toggleCountdown}
            disabled={layoutSaving}
            className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
              showCountdown ? "bg-green-500" : "bg-gray-400"
            }`}
            aria-pressed={showCountdown}
          >
            <span
              className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                showCountdown ? "translate-x-8" : "translate-x-1"
              }`}
            />
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-6 mt-8">
        <h3 className="text-lg font-semibold mb-4">Jackpot Winner Management</h3>
        <div className="space-y-4">
          <div>
            <label htmlFor="jackpotAmount" className="block text-sm font-medium text-gray-700">Current Jackpot Amount</label>
            <input
              type="text"
              id="jackpotAmount"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
              value={jackpotAmount}
              onChange={(e) => setJackpotAmount(e.target.value)}
              disabled={loading}
            />
          </div>
          <div>
            <label htmlFor="lastWinnerName" className="block text-sm font-medium text-gray-700">Last Winner Name</label>
            <input
              type="text"
              id="lastWinnerName"
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
              value={lastWinnerName}
              onChange={(e) => setLastWinnerName(e.target.value)}
              disabled={loading}
            />
          </div>
          <button
            onClick={handleUpdateJackpot}
            className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700"
            disabled={loading}
          >
            {loading ? 'Updating...' : 'Update Jackpot Info'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default DashboardView;
