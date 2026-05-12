import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where,
} from 'firebase/firestore';
import {
  Users, LayoutDashboard, Link as LinkIcon, CreditCard, DollarSign,
  LogOut, Menu, X, Copy, ChevronRight,
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { db, auth } from '../firebase';
import useAuthStore from '../store/authStore';
import { formatCurrency } from '../utils/formatMoney';
import { buildMasterReferralLink } from '../utils/master';
import { getUserFunds } from '../utils/userFunds';

// ─────────────────────────────────────────────────────────────────
// Phase 1 master panel. Sidebar + 3 placeholder sections wired to
// the data we already have (balance, player count, referral code).
// Phase 2 will add the credit/debit + add-player + approval flows.
// ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard',         icon: LayoutDashboard },
  { id: 'players',   label: 'My Players',        icon: Users           },
  { id: 'deposits',  label: 'Deposit Approvals', icon: CreditCard      },
  { id: 'withdraws', label: 'Withdrawal Approvals', icon: DollarSign   },
  { id: 'link',      label: 'My Referral Link',  icon: LinkIcon        },
];

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-2xl border border-white/10 p-4 bg-gradient-to-br ${accent}`}>
      <p className="text-[11px] uppercase tracking-widest text-white/70">{label}</p>
      <p className="text-2xl md:text-3xl font-black text-white mt-1">{value}</p>
    </div>
  );
}

function DashboardView({ master, playerCount }) {
  const balance = getUserFunds(master).balance;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Namaste, {master.name || 'Master'}</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="My Points"    value={formatCurrency(balance)} accent="from-yellow-600 to-amber-700" />
        <StatCard label="My Players"   value={playerCount}             accent="from-emerald-600 to-emerald-800" />
        <StatCard label="Today's Flow" value="—"                       accent="from-fuchsia-600 to-fuchsia-800" />
      </div>

      <div className="mt-4 rounded-2xl border border-yellow-400/20 bg-[#1a1300] p-4 text-sm text-yellow-100">
        <p className="font-bold mb-1">Quick note</p>
        <ul className="list-disc list-inside text-xs text-yellow-200/80 space-y-1">
          <li>Tumhare points = ye bata raha hai ki tum kitne points apne players ko distribute kar sakte ho.</li>
          <li>Player ke deposit approve karne par tumhare points kat jayenge — uske wallet me jaayenge.</li>
          <li>Player game me jeete to tumhara nuksan nahi hota — house ka loss hai.</li>
          <li>Points kam padein to admin se top-up karwana padega.</li>
        </ul>
      </div>
    </div>
  );
}

function PlayersListView({ players }) {
  return (
    <div className="p-4 md:p-6">
      <h2 className="text-lg font-bold text-white mb-3">My Players ({players.length})</h2>
      {players.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-gray-400 bg-[#0d1228]">
          Abhi tak koi player nahi. Apna referral link share karo — naye signups tumhare under aa jayenge.
        </div>
      ) : (
        <div className="rounded-2xl border border-white/10 bg-[#0d1228] overflow-hidden">
          <table className="w-full">
            <thead className="bg-[#111733] text-[10px] uppercase text-gray-400">
              <tr>
                <th className="py-2 px-3 text-left">Name</th>
                <th className="py-2 px-3 text-left">Phone</th>
                <th className="py-2 px-3 text-right">Balance</th>
                <th className="py-2 px-3 text-right">Winning</th>
                <th className="py-2 px-3 text-center">Status</th>
              </tr>
            </thead>
            <tbody>
              {players.map((p) => (
                <tr key={p.id} className="border-t border-white/5 text-sm">
                  <td className="py-2 px-3 text-white">{p.name || '—'}</td>
                  <td className="py-2 px-3 text-gray-300">{p.phoneNumber || '—'}</td>
                  <td className="py-2 px-3 text-right text-emerald-300">{formatCurrency(p.balance ?? p.walletBalance ?? 0)}</td>
                  <td className="py-2 px-3 text-right text-yellow-300">{formatCurrency(p.winningMoney ?? 0)}</td>
                  <td className="py-2 px-3 text-center">
                    {p.suspended
                      ? <span className="text-[10px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">SUSPENDED</span>
                      : <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">ACTIVE</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="text-[11px] text-gray-500 mt-3">
        Phase 2 me yahan se player banane, wallet adjust karne aur suspend karne ka access milega.
      </p>
    </div>
  );
}

function LinkView({ master }) {
  const link = master.masterCode ? buildMasterReferralLink(master.masterCode) : '';

  const copy = async (text, label) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied!`);
    } catch {
      toast.error('Copy failed — manually select and copy.');
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">My referral link</h2>

      {!master.masterCode ? (
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-200">
          Admin ne abhi tumhe master code assign nahi kiya. Unhe contact karo — ye fix ho jayega.
        </div>
      ) : (
        <>
          <div className="rounded-2xl border border-yellow-400/30 bg-[#1a1300] p-4">
            <p className="text-[11px] uppercase tracking-widest text-yellow-300 mb-2">Your code</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-3xl font-black text-yellow-200 tracking-widest">{master.masterCode}</span>
              <button
                onClick={() => copy(master.masterCode, 'Code')}
                className="bg-yellow-400 text-black font-bold rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#0d1228] p-4">
            <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-2">Share link</p>
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm text-emerald-200 break-all">{link}</span>
              <button
                onClick={() => copy(link, 'Link')}
                className="shrink-0 bg-emerald-500 text-black font-bold rounded-lg px-3 py-1.5 text-xs flex items-center gap-1"
              >
                <Copy className="h-3 w-3" /> Copy
              </button>
            </div>
            <p className="text-[11px] text-gray-500 mt-2">
              WhatsApp / Telegram me ye link bhejo. Jo us link se signup karega vo tumhare under aa jayega — uske deposit tumhe approve karne honge.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

function Placeholder({ title }) {
  return (
    <div className="p-6 text-sm text-gray-400">
      <h2 className="text-lg font-bold text-white mb-2">{title}</h2>
      Phase 2 me ye section live ho jayega. Abhi sirf foundation lock kar raha hu.
    </div>
  );
}

export default function MasterDashboard() {
  const { user, setUser } = useAuthStore();
  const [master, setMaster] = useState(user || {});
  const [players, setPlayers] = useState([]);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Live master doc — balance fluctuates whenever admin tops up or
  // (in phase 2) a deposit is approved.
  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setMaster({ uid: snap.id, ...snap.data() });
    });
  }, [user?.uid]);

  // Players under this master.
  useEffect(() => {
    if (!user?.uid) return undefined;
    const q = query(collection(db, 'users'), where('assignedMasterId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      setPlayers(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => setPlayers([]));
  }, [user?.uid]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      setUser(null);
      toast.success('Logged out.');
    } catch { toast.error('Logout failed.'); }
  };

  const content = useMemo(() => {
    switch (activeTab) {
      case 'dashboard': return <DashboardView master={master} playerCount={players.length} />;
      case 'players':   return <PlayersListView players={players} />;
      case 'deposits':  return <Placeholder title="Deposit Approvals" />;
      case 'withdraws': return <Placeholder title="Withdrawal Approvals" />;
      case 'link':      return <LinkView master={master} />;
      default:          return <DashboardView master={master} playerCount={players.length} />;
    }
  }, [activeTab, master, players]);

  return (
    <div className="flex h-screen bg-[#05081a] text-white">
      {/* Sidebar */}
      <div className={`fixed inset-y-0 left-0 z-30 w-72 bg-[#0a0f24] border-r border-white/5 p-4 flex flex-col transform transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      } md:translate-x-0`}>
        <div className="mb-6 text-center">
          <h1 className="text-xl font-black text-yellow-400 tracking-widest">TRUEWIN</h1>
          <p className="text-[11px] uppercase tracking-widest text-gray-500 mt-1">Master Panel</p>
          {master.name && <p className="text-xs text-gray-300 mt-2">{master.name}</p>}
          {master.masterCode && (
            <p className="mt-1 inline-block bg-yellow-400/10 text-yellow-300 px-2 py-0.5 rounded-full text-[10px] font-bold">
              {master.masterCode}
            </p>
          )}
        </div>

        <div className="mb-4 rounded-xl border border-yellow-400/20 bg-[#1a1300] p-3 text-center">
          <p className="text-[10px] uppercase tracking-widest text-yellow-400 mb-1">My Points</p>
          <p className="text-xl font-black text-yellow-200">{formatCurrency(getUserFunds(master).balance)}</p>
        </div>

        <nav className="space-y-1 overflow-y-auto flex-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => { setActiveTab(s.id); setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                activeTab === s.id
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <s.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{s.label}</span>
              <ChevronRight className="h-3.5 w-3.5 opacity-50" />
            </button>
          ))}
        </nav>

        <button onClick={handleLogout} className="mt-4 flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-rose-300 hover:bg-rose-500/10">
          <LogOut className="h-4 w-4" /> Logout
        </button>
      </div>

      {/* Backdrop on mobile */}
      {sidebarOpen && (
        <div onClick={() => setSidebarOpen(false)} className="fixed inset-0 z-20 bg-black/60 md:hidden" />
      )}

      <div className="flex-1 flex flex-col md:ml-72">
        <ToastContainer position="top-right" autoClose={4000} theme="dark" />
        <div className="bg-[#0d1228] border-b border-white/5 px-4 py-3 flex items-center justify-between md:justify-end">
          <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5">
            <Menu className="h-5 w-5" />
          </button>
          <div className="text-xs text-gray-400">
            Players: <span className="text-white font-bold">{players.length}</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{content}</main>
      </div>
    </div>
  );
}
