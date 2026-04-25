import React, { useEffect, useRef, useState } from 'react';
import {
  Users,
  CreditCard,
  Trophy,
  DollarSign,
  QrCode,
  Check,
  X,
  Eye,
  Edit,
  Plus,
  Search,
  Bell,
  Settings,
  LogOut,
  Menu,
  Link as LinkIcon,
  TrendingUp,
  UserPlus,
  Star,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { db, auth } from '../firebase';
import { collection, query, onSnapshot, doc, runTransaction, getDocs, getDoc, where, deleteDoc, updateDoc, addDoc } from 'firebase/firestore';
import useAuthStore from '../store/authStore';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import useNotificationSound from './hooks/useNotificationSound';
import { createNotification } from '../utils/notifications';
import { formatCurrency } from '../utils/formatMoney';
import MatchManagement from './components/MatchManagement';

// Component Imports
import AllUsers from './components/AllUsers';
import BarCodeUpdate from './components/BarCodeUpdate';
import Bets from './components/Bets';
import DashboardView from './components/DashboardView';
import Links from './components/Links';
import MarqueeUpdate from './components/MarqueeUpdate';
import PaymentApproval from './components/PaymentApproval';
import ProfitLoss from './components/ProfitLoss';
import SliderUpdate from './components/SliderUpdate';
import WinnerApprove from './components/WinnerApprove';
import WithdrawApproval from './components/WithdrawApproval';
import ReferralComponent from './components/Refferal';
import Table from './components/Table';
import TransactionSummary from './components/TransactionSummary';
import { toDateValue } from '../utils/dateHelpers';

// ── NEW ──────────────────────────────────────────────────────────
import GamesStats from './components/GamesStats';
// ─────────────────────────────────────────────────────────────────


const AdminDashboard = () => {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarOpen, setSidebarOpen] = useState(false);
  
  const [truewinUserMap, setTruewinUserMap] = useState({});
  const [payments, setPayments] = useState([]);
  const [allPayments, setAllPayments] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [allWithdrawals, setAllWithdrawals] = useState([]);
  const [winners, setWinners] = useState([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [userDetails, setUserDetails] = useState({});

  const { user, setUser } = useAuthStore();
  const isAdmin = user?.role === 'admin';

  // --- SOUND NOTIFICATIONS ---
  const {
    enabled: soundEnabled, setEnabled: setSoundEnabled,
    volume: soundVolume, setVolume: setSoundVolume,
    choice: soundChoice, setChoice: setSoundChoice,
    vibrate: soundVibrate, setVibrate: setSoundVibrate,
    play: playNotification,
    options: soundOptions,
    customSounds,
    addCustomSound,
    removeCustomSound,
  } = useNotificationSound();
  const [soundPanelOpen, setSoundPanelOpen] = useState(false);
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');
  // Refs so the snapshot callbacks always read the latest values
  // without needing to be torn down and re-subscribed on each change.
  const truewinUserMapRef = useRef({});
  const playNotificationRef = useRef(playNotification);
  useEffect(() => { truewinUserMapRef.current = truewinUserMap; }, [truewinUserMap]);
  useEffect(() => { playNotificationRef.current = playNotification; }, [playNotification]);

  // --- DATA FETCHING ---
  useEffect(() => {
    if (!isAdmin) return;

    const truewinUsersQuery = query(collection(db, 'users'), where('appName', '==', 'truewin'));
    const unsubscribeTruewinUsers = onSnapshot(truewinUsersQuery, (snapshot) => {
      const newTruewinUserMap = {};
      snapshot.docs.forEach(d => { newTruewinUserMap[d.id] = true; });
      setTruewinUserMap(newTruewinUserMap);
      setTotalUsers(snapshot.size);
    });

    // Skip the initial snapshot (which reports every existing doc as "added")
    // so we only ring on records that arrive after the dashboard is open.
    let isFirstPaymentSnapshot = true;
    const paymentsQuery = query(collection(db, 'top-ups'));
    const unsubscribePayments = onSnapshot(paymentsQuery, (snapshot) => {
      const fetchedPayments = snapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt || null,
        date: toDateValue(d.data().createdAt)?.toLocaleDateString('en-IN') || 'N/A',
        userId: d.data().userId
      }));
      setAllPayments(fetchedPayments);

      if (!isFirstPaymentSnapshot) {
        // Don't filter by appName — admin should hear about every new
        // pending deposit. The table view does its own filtering for
        // display, but the sound is a safety net.
        const newPending = snapshot.docChanges().filter(c => {
          if (c.type !== 'added') return false;
          const data = c.doc.data();
          return data.status === 'pending';
        });
        if (newPending.length > 0) {
          playNotificationRef.current?.();
          toast.info(
            `💰 ${newPending.length} new payment approval${newPending.length > 1 ? 's' : ''} received!`
          );
        }
      }
      isFirstPaymentSnapshot = false;
    });

    let isFirstWithdrawalSnapshot = true;
    const withdrawalsQuery = query(collection(db, 'withdrawals'));
    const unsubscribeWithdrawals = onSnapshot(withdrawalsQuery, (snapshot) => {
      const fetchedWithdrawals = snapshot.docs.map(d => ({
        id: d.id, ...d.data(),
        createdAt: d.data().createdAt || null,
        date: toDateValue(d.data().createdAt)?.toLocaleDateString('en-IN') || 'N/A',
        userId: d.data().userId
      }));
      setAllWithdrawals(fetchedWithdrawals);

      if (!isFirstWithdrawalSnapshot) {
        const newPending = snapshot.docChanges().filter(c => {
          if (c.type !== 'added') return false;
          const data = c.doc.data();
          return data.status === 'pending';
        });
        if (newPending.length > 0) {
          playNotificationRef.current?.();
          toast.info(
            `🏦 ${newPending.length} new withdrawal approval${newPending.length > 1 ? 's' : ''} received!`
          );
        }
      }
      isFirstWithdrawalSnapshot = false;
    });

    const winnersQuery = query(collection(db, 'winners'));
    const unsubscribeWinners = onSnapshot(winnersQuery, (snapshot) => {
      const fetchedWinners = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setWinners(fetchedWinners);
    });

    return () => {
      unsubscribeTruewinUsers();
      unsubscribePayments();
      unsubscribeWithdrawals();
      unsubscribeWinners();
    };
  }, [isAdmin]);

  useEffect(() => {
    if (!isAdmin || !Object.keys(truewinUserMap).length) {
      setPayments([]);
      setWithdrawals([]);
      return;
    }

    const truewinPayments = allPayments.filter(p => truewinUserMap[p.userId]);
    setPayments(truewinPayments);

    const truewinWithdrawals = allWithdrawals.filter(w => truewinUserMap[w.userId]);
    setWithdrawals(truewinWithdrawals);

    const paymentUserIds = [...new Set(truewinPayments.map(p => p.userId))];
    const withdrawalUserIds = [...new Set(truewinWithdrawals.map(w => w.userId))];
    const userIdsToFetch = [...new Set([...paymentUserIds, ...withdrawalUserIds])];

    fetchMissingUserDetails(userIdsToFetch);
  }, [isAdmin, allPayments, allWithdrawals, truewinUserMap]);

  const fetchMissingUserDetails = (userIds) => {
    userIds.forEach(async (userId) => {
      if (!userDetails[userId] && truewinUserMap[userId]) {
        try {
          const userDocRef = doc(db, 'users', userId);
          const userSnap = await getDoc(userDocRef);
          if (userSnap.exists()) {
            setUserDetails(prev => ({ ...prev, [userId]: userSnap.data() }));
          }
        } catch (error) {
          console.error("Error fetching user details:", userId, error);
        }
      }
    });
  };

  // --- ACTION HANDLERS ---
  const handlePaymentApproval = async (paymentId, action, userId, amount, reason = null) => {
    let notifyReferrer = null; // track if a referral bonus needs a notification
    try {
      await runTransaction(db, async (transaction) => {
        const paymentRef = doc(db, 'top-ups', paymentId);
        const userRef = doc(db, 'users', userId);
        let userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error("User not found.");
        const userData = userSnap.data();

        const paymentUpdateData = { status: action };
        if (action === 'rejected' && reason) paymentUpdateData.adminComment = reason;
        transaction.update(paymentRef, paymentUpdateData);

        if (action === 'approved') {
          const currentBalance = userData.balance || 0;
          transaction.update(userRef, { balance: currentBalance + amount });

          if (amount >= 50 && userData.referredBy && userData.referralBonusAwarded === false) {
            const referrerRef = doc(db, "users", userData.referredBy);
            const referrerSnap = await transaction.get(referrerRef);
            if (referrerSnap.exists()) {
              const referrerBalance = referrerSnap.data().balance || 0;
              transaction.update(referrerRef, { balance: referrerBalance + 50 });
              transaction.update(userRef, { referralBonusAwarded: true });
              const newTransactionRef = doc(collection(db, "transactions"));
              transaction.set(newTransactionRef, {
                userId: userData.referredBy,
                type: "referral_bonus_received",
                amount: 50,
                referredUserId: userId,
                referredUserName: userData.name,
                createdAt: new Date(),
              });
              notifyReferrer = { referrerId: userData.referredBy, referredName: userData.name };
            }
          }
        }
      });

      // Notify the user — runs outside the transaction (notifications
      // are subcollection writes that don't need to be atomic with the
      // payment update).
      if (action === 'approved') {
        await createNotification(userId, {
          type: 'deposit',
          title: `Deposit of ${formatCurrency(amount)} approved`,
          body: 'Your wallet balance has been credited.',
          link: '/wallet',
        });
      } else if (action === 'rejected') {
        await createNotification(userId, {
          type: 'deposit',
          title: `Deposit of ${formatCurrency(amount)} rejected`,
          body: reason || 'Please contact support for details.',
          link: '/addcash',
        });
      }

      if (notifyReferrer) {
        await createNotification(notifyReferrer.referrerId, {
          type: 'referral',
          title: `Referral bonus ${formatCurrency(50)} credited`,
          body: `${notifyReferrer.referredName || 'Your referred user'} made their first deposit.`,
          link: '/refer',
        });
      }

      toast.success(`Payment ${action} successfully!`);
    } catch (error) {
      toast.error(`Failed to ${action} payment. ${error.message}`);
    }
  };

  const handleWithdrawalApproval = async (withdrawalId, action, userId, amount) => {
    try {
      await runTransaction(db, async (transaction) => {
        const withdrawalRef = doc(db, 'withdrawals', withdrawalId);
        transaction.update(withdrawalRef, { status: action });
        if (action === 'rejected') {
          const userRef = doc(db, 'users', userId);
          const userSnap = await transaction.get(userRef);
          if (userSnap.exists()) {
            const currentWinningMoney = userSnap.data().winningMoney || 0;
            transaction.update(userRef, { winningMoney: currentWinningMoney + amount });
          }
        }
      });

      await createNotification(userId, {
        type: 'withdrawal',
        title:
          action === 'approved'
            ? `Withdrawal of ${formatCurrency(amount)} approved`
            : `Withdrawal of ${formatCurrency(amount)} rejected`,
        body:
          action === 'approved'
            ? 'Funds will reach your account within 10–24 hours.'
            : 'The amount has been returned to your winning balance.',
        link: '/withdraw',
      });

      toast.success(`Withdrawal ${action} successfully!`);
    } catch (error) {
      toast.error(`Failed to ${action} withdrawal.`);
    }
  };

  const handleDeletePayment = async (paymentId) => {
    try {
      await deleteDoc(doc(db, 'top-ups', paymentId));
      toast.success('Payment record deleted successfully!');
    } catch (error) {
      toast.error('Failed to delete payment record.');
    }
  };

  const handleWinnerAnnouncement = async (winnerId) => {
    let notifyWinner = null;
    try {
      await runTransaction(db, async (transaction) => {
        const winnerRef = doc(db, 'winners', winnerId);
        const winnerSnap = await transaction.get(winnerRef);
        if (!winnerSnap.exists() || winnerSnap.data().status !== 'pending_approval') {
          throw new Error('Winner not found or already processed.');
        }
        const { userId, prize } = winnerSnap.data();
        const userRef = doc(db, 'users', userId);
        const userSnap = await transaction.get(userRef);
        if (!userSnap.exists()) throw new Error('User not found.');
        transaction.update(winnerRef, { status: 'announced' });
        const currentWinnings = userSnap.data().winningMoney || 0;
        transaction.update(userRef, { winningMoney: currentWinnings + prize });
        notifyWinner = { userId, prize };
      });

      if (notifyWinner) {
        await createNotification(notifyWinner.userId, {
          type: 'win',
          title: `You won ${formatCurrency(notifyWinner.prize)}!`,
          body: 'Your prize has been credited to your winning balance.',
          link: '/wallet',
        });
      }

      toast.success('Winner announced and credited successfully!');
    } catch (error) {
      toast.error(error.message || 'Failed to announce winner.');
    }
  };

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      toast.success("Logged out successfully!");
    } catch (error) {
      toast.error("Failed to log out.");
    }
  };

  // --- SIDEBAR ---
  const Sidebar = () => (
    <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-gray-900 text-white p-4 transform ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300 ease-in-out md:translate-x-0 md:w-72 flex flex-col`}>
      <div className="mb-8 flex justify-center items-center flex-shrink-0">
        <div>
          <h1 className="text-2xl font-bold text-center">True Win Circle</h1>
          <p className="text-gray-400 text-center text-sm">Admin Dashboard</p>
          {isAdmin && user && (
            <div className="text-gray-400 text-center text-xs mt-1">
              {user.name && <p>Name: {user.name}</p>}
              {user.email && <p>Email: {user.email}</p>}
              {user.phoneNumber && <p>Phone: {user.phoneNumber}</p>}
            </div>
          )}
        </div>
      </div>

      <nav className="space-y-2 overflow-y-auto">
        {[
          { id: 'dashboard',    label: 'Dashboard',          icon: Settings   },
          { id: 'allUsers',     label: 'All Users',           icon: Users      },
          { id: 'barcodes',     label: 'Barcode Management',  icon: QrCode     },
          { id: 'payments',     label: 'Payment Approvals',   icon: CreditCard },
          { id: 'withdrawals',  label: 'Withdrawal Approval', icon: DollarSign },
          { id: 'marquee',      label: 'Screen Text',         icon: Edit       },
          { id: 'matches',      label: '🏏 Cricket Matches',  icon: Trophy     },
          { id: 'harufUpdate',  label: 'Market Results',      icon: Edit       },
          { id: 'sliderUpdate', label: 'Carousel Slides',     icon: Edit       },
          { id: 'socialLinks',  label: 'Social Links',        icon: LinkIcon   },
          { id: 'winGameBets',  label: 'Win Game Bets',       icon: Trophy     },
          { id: 'profitLoss',   label: 'Profit & Loss',       icon: TrendingUp },
          { id: 'transactions', label: 'Transactions',        icon: CreditCard },
          // ── NEW ──────────────────────────────────────────────────────
          { id: 'gamesStats',   label: '🎮 Games Stats',      icon: Star       },
          // ─────────────────────────────────────────────────────────────
        ].map(item => (
          <button
            key={item.id}
            onClick={() => { setActiveTab(item.id); setSidebarOpen(false); }}
            className={`w-full flex items-center justify-start space-x-3 p-3 rounded-lg transition-colors ${
              activeTab === item.id ? 'bg-blue-600' : 'hover:bg-gray-800'
            }`}
          >
            <item.icon className="h-5 w-5 flex-shrink-0" />
            <span>{item.label}</span>
          </button>
        ))}

        <button
          onClick={handleLogout}
          className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-800 text-red-400"
        >
          <LogOut className="h-5 w-5" />
          <span>Logout</span>
        </button>
      </nav>
    </div>
  );

  // --- HEADER ---
  const Header = () => (
    <div className="bg-white shadow-sm border-b p-4 flex items-center justify-between">
      <div className="flex items-center space-x-4">
        <button onClick={() => setSidebarOpen(!isSidebarOpen)} className="md:hidden p-2">
          {isSidebarOpen ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}
        </button>
        <h2 className="text-2xl font-semibold capitalize">
          {activeTab
            .replace('allUsers',    'All Users')
            .replace('harufUpdate', 'Market Results')
            .replace('sliderUpdate','Carousel Slides')
            .replace('socialLinks', 'Social Links')
            .replace('winGameBets', 'Win Game Bets')
            .replace('profitLoss',  'Profit & Loss')
            .replace('transactions','Transactions')
            .replace('referrals',   'Referrals')
            .replace('gamesStats',  '🎮 Games Stats')
          }
        </h2>
      </div>
      <div className="relative flex items-center space-x-2">
        <button
          onClick={() => setSoundPanelOpen(o => !o)}
          title="Notification settings"
          className={`p-2 rounded-lg border transition-colors ${
            soundEnabled
              ? 'bg-blue-50 border-blue-200 text-blue-600 hover:bg-blue-100'
              : 'bg-gray-100 border-gray-200 text-gray-500 hover:bg-gray-200'
          }`}
        >
          {soundEnabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
        </button>
        {soundPanelOpen && (
          <>
            <div
              className="fixed inset-0 z-40"
              onClick={() => setSoundPanelOpen(false)}
            />
            <div className="absolute right-0 top-12 z-50 w-80 bg-white rounded-xl shadow-2xl border p-4 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="font-semibold text-gray-800">Notification Settings</h4>
                <button
                  onClick={() => setSoundPanelOpen(false)}
                  className="p-1 text-gray-400 hover:text-gray-700"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <label className="flex items-center justify-between text-sm">
                <span className="text-gray-700 font-medium">Sound on new approval</span>
                <input
                  type="checkbox"
                  checked={soundEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setSoundEnabled(next);
                    if (next) playNotification();
                  }}
                  className="h-4 w-4 accent-blue-600"
                />
              </label>

              <div className={soundEnabled ? '' : 'opacity-50 pointer-events-none'}>
                <div className="flex items-center justify-between text-sm mb-1">
                  <span className="text-gray-700 font-medium">Volume</span>
                  <span className="text-gray-500 text-xs">{Math.round(soundVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={soundVolume}
                  onChange={(e) => setSoundVolume(e.target.value)}
                  className="w-full accent-blue-600"
                />
              </div>

              <div className={soundEnabled ? '' : 'opacity-50 pointer-events-none'}>
                <label className="block text-sm text-gray-700 font-medium mb-1">Sound</label>
                <div className="flex items-center gap-2">
                  <select
                    value={soundChoice}
                    onChange={(e) => setSoundChoice(e.target.value)}
                    className="flex-1 p-2 border rounded-lg bg-gray-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {soundOptions.map(o => (
                      <option key={o.id} value={o.id}>{o.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={() => playNotification()}
                    className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                  >
                    Test
                  </button>
                </div>
              </div>

              <label className="flex items-center justify-between text-sm pt-1 border-t">
                <span className="text-gray-700 font-medium">
                  Vibrate on mobile
                  {typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function' && (
                    <span className="block text-xs text-gray-400 font-normal">(not supported on this device)</span>
                  )}
                </span>
                <input
                  type="checkbox"
                  checked={soundVibrate}
                  onChange={(e) => setSoundVibrate(e.target.checked)}
                  className="h-4 w-4 accent-blue-600"
                />
              </label>

              <div className="pt-2 border-t">
                <p className="text-sm font-semibold text-gray-700 mb-2">Custom sounds</p>

                {customSounds.length > 0 ? (
                  <ul className="mb-2 space-y-1 max-h-28 overflow-y-auto">
                    {customSounds.map((s) => (
                      <li key={s.id} className="flex items-center justify-between text-xs bg-gray-50 rounded-md px-2 py-1.5">
                        <span className="truncate text-gray-700">{s.label}</span>
                        <button
                          onClick={() => removeCustomSound(s.id)}
                          className="ml-2 text-red-500 hover:text-red-700"
                          title="Delete"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-gray-500 mb-2">No custom sounds yet. Upload an MP3/WAV or paste a URL.</p>
                )}

                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => { setCustomLabel(e.target.value); setCustomError(''); }}
                  placeholder="Label (e.g. Loud bell)"
                  className="w-full mb-2 p-2 border rounded-md bg-gray-50 text-sm"
                />
                <input
                  type="text"
                  value={customUrl}
                  onChange={(e) => { setCustomUrl(e.target.value); setCustomError(''); }}
                  placeholder="https://example.com/sound.mp3 (optional)"
                  className="w-full mb-2 p-2 border rounded-md bg-gray-50 text-sm"
                />
                <div className="flex items-center gap-2">
                  <label className="flex-1 cursor-pointer text-center px-3 py-2 text-xs font-medium border rounded-md bg-gray-50 text-gray-700 hover:bg-gray-100">
                    Upload file
                    <input
                      type="file"
                      accept="audio/*"
                      className="hidden"
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        try {
                          const entry = await addCustomSound({ label: customLabel || file.name, file });
                          setSoundChoice(entry.id);
                          setCustomLabel('');
                          setCustomUrl('');
                          setCustomError('');
                          toast.success('Custom sound added');
                        } catch (err) {
                          setCustomError(err.message || 'Failed to add sound');
                        } finally {
                          e.target.value = '';
                        }
                      }}
                    />
                  </label>
                  <button
                    onClick={async () => {
                      if (!customUrl.trim()) {
                        setCustomError('Paste a URL or use Upload file');
                        return;
                      }
                      try {
                        const entry = await addCustomSound({ label: customLabel || 'Custom URL', url: customUrl.trim() });
                        setSoundChoice(entry.id);
                        setCustomLabel('');
                        setCustomUrl('');
                        setCustomError('');
                        toast.success('Custom sound added');
                      } catch (err) {
                        setCustomError(err.message || 'Failed to add sound');
                      }
                    }}
                    className="flex-1 px-3 py-2 text-xs font-medium bg-blue-600 text-white rounded-md hover:bg-blue-700"
                  >
                    Add URL
                  </button>
                </div>
                {customError && (
                  <p className="text-xs text-red-600 mt-1.5">{customError}</p>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );

  // --- CONTENT ROUTER ---
  const renderContent = () => {
    const stats = {
      totalUsers:         totalUsers,
      pendingPayments:    payments.filter(p => p.status === 'pending').length,
      winnersAnnounced:   winners.filter(w => w.status === 'announced').length,
      pendingWithdrawals: withdrawals.filter(w => w.status === 'pending').length,
      approvedDeposits: payments.filter(p => p.status === 'approved').reduce((acc, item) => acc + Number(item.amount || 0), 0),
      approvedWithdrawals: withdrawals.filter(w => w.status === 'approved').reduce((acc, item) => acc + Number(item.amount || 0), 0),
    };

    switch (activeTab) {
      case 'dashboard':   return <DashboardView stats={stats} />;
      case 'allUsers':    return <AllUsers />;
      case 'referrals':   return <ReferralComponent />;
      case 'barcodes':    return <BarCodeUpdate />;
      case 'payments':
        return (
          <PaymentApproval
            payments={payments}
            userDetails={userDetails}
            handlePaymentApproval={handlePaymentApproval}
            handleDeletePayment={handleDeletePayment}
          />
        );
      case 'winners':
        return (
          <WinnerApprove
            winners={winners}
            handleWinnerAnnouncement={handleWinnerAnnouncement}
          />
        );
      case 'withdrawals':
        return (
          <WithdrawApproval
            withdrawals={withdrawals}
            userDetails={userDetails}
            handleWithdrawalApproval={handleWithdrawalApproval}
          />
        );
      case 'marquee':       return <MarqueeUpdate />;
      case 'matches':       return <MatchManagement />;
      case 'harufUpdate':   return <Table />;
      case 'sliderUpdate':  return <SliderUpdate />;
      case 'socialLinks':   return <Links />;
      case 'winGameBets':   return <Bets />;
      case 'profitLoss':    return <ProfitLoss />;
      case 'transactions':  return <TransactionSummary payments={payments} withdrawals={withdrawals} userDetails={userDetails} />;

      // ── NEW ────────────────────────────────────────────────────────
      case 'gamesStats':    return <GamesStats />;
      // ──────────────────────────────────────────────────────────────

      default:              return <DashboardView stats={stats} />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-100">
      <Sidebar />
      {isSidebarOpen && (
        <div
          className="fixed inset-0 z-10 bg-black bg-opacity-50 md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex-1 flex flex-col overflow-hidden md:ml-72">
        <ToastContainer />
        <Header />
        <main className="flex-1 overflow-y-auto">
          {renderContent()}
        </main>
      </div>
    </div>
  );
};

export default AdminDashboard;



