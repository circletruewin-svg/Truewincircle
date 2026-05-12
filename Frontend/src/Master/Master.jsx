import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, addDoc, setDoc, serverTimestamp,
  orderBy, limit, getDocs,
} from 'firebase/firestore';
import {
  Users, LayoutDashboard, Link as LinkIcon, CreditCard, DollarSign,
  LogOut, Menu, X, Copy, ChevronLeft, UserPlus, History, ArrowLeft,
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { db, auth } from '../firebase';
import useAuthStore from '../store/authStore';
import { formatCurrency } from '../utils/formatMoney';
import { buildMasterReferralLink } from '../utils/master';
import { getUserFunds } from '../utils/userFunds';

// ─────────────────────────────────────────────────────────────────
// Phase 1 master panel — now with:
//  - Add Player (manual user creation, like admin offline flow)
//  - Click a player → drill-down view with their balance + recent
//    bets / deposits / withdrawals
//  - My Activity (master's own ledger entries from masterLedger)
//  - Mobile-optimised — bottom nav, large touch targets
// Approvals + credit/debit land in Phase 2.
// ─────────────────────────────────────────────────────────────────

const SECTIONS = [
  { id: 'dashboard', label: 'Dashboard',         icon: LayoutDashboard, short: 'Home'    },
  { id: 'players',   label: 'My Players',        icon: Users,           short: 'Players' },
  { id: 'addPlayer', label: 'Add Player',        icon: UserPlus,        short: 'Add'     },
  { id: 'deposits',  label: 'Deposit Approvals', icon: CreditCard,      short: 'Deposit' },
  { id: 'withdraws', label: 'Withdrawal Approvals', icon: DollarSign,   short: 'Withdraw'},
  { id: 'activity',  label: 'My Activity',       icon: History,         short: 'Log'     },
  { id: 'link',      label: 'My Referral Link',  icon: LinkIcon,        short: 'Link'    },
];

function StatCard({ label, value, accent }) {
  return (
    <div className={`rounded-2xl border border-white/10 p-4 bg-gradient-to-br ${accent}`}>
      <p className="text-[11px] uppercase tracking-widest text-white/70">{label}</p>
      <p className="text-2xl md:text-3xl font-black text-white mt-1">{value}</p>
    </div>
  );
}

function DashboardView({ master, playerCount, onJump }) {
  const balance = getUserFunds(master).balance;
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Namaste, {master.name || 'Master'}</h2>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <StatCard label="My Points"    value={formatCurrency(balance)} accent="from-yellow-600 to-amber-700" />
        <StatCard label="My Players"   value={playerCount}             accent="from-emerald-600 to-emerald-800" />
        <StatCard label="Today's Flow" value="—"                       accent="from-fuchsia-600 to-fuchsia-800" />
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <button onClick={() => onJump('addPlayer')} className="rounded-xl bg-emerald-600 hover:bg-emerald-500 py-3 px-3 text-left">
          <UserPlus className="h-5 w-5 mb-1" />
          <p className="font-bold text-sm">+ Add Player</p>
          <p className="text-[11px] text-emerald-100/80">Naya user banao</p>
        </button>
        <button onClick={() => onJump('players')} className="rounded-xl bg-blue-600 hover:bg-blue-500 py-3 px-3 text-left">
          <Users className="h-5 w-5 mb-1" />
          <p className="font-bold text-sm">View Players</p>
          <p className="text-[11px] text-blue-100/80">Sab dekho</p>
        </button>
        <button onClick={() => onJump('link')} className="rounded-xl bg-yellow-500 hover:bg-yellow-400 text-black py-3 px-3 text-left">
          <LinkIcon className="h-5 w-5 mb-1" />
          <p className="font-bold text-sm">Share Link</p>
          <p className="text-[11px] opacity-80">WhatsApp pe bhejo</p>
        </button>
        <button onClick={() => onJump('activity')} className="rounded-xl bg-fuchsia-700 hover:bg-fuchsia-600 py-3 px-3 text-left">
          <History className="h-5 w-5 mb-1" />
          <p className="font-bold text-sm">Activity</p>
          <p className="text-[11px] text-fuchsia-100/80">Apna log dekho</p>
        </button>
      </div>

      <div className="rounded-2xl border border-yellow-400/20 bg-[#1a1300] p-4 text-sm text-yellow-100">
        <p className="font-bold mb-1">Quick note</p>
        <ul className="list-disc list-inside text-xs text-yellow-200/80 space-y-1">
          <li>Tumhare points = jitne points apne players ko distribute kar sakte ho.</li>
          <li>Player ke deposit approve karne par tumhare points kat jayenge — uske wallet me jaayenge.</li>
          <li>Player game me jeete to tumhara nuksan nahi hota — house ka loss hai.</li>
          <li>Points kam padein to admin se top-up karwana padega.</li>
        </ul>
      </div>
    </div>
  );
}

function PlayersListView({ players, onOpenPlayer }) {
  const [search, setSearch] = useState('');
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return players;
    return players.filter((p) =>
      (p.name || '').toLowerCase().includes(q) ||
      (p.phoneNumber || '').toLowerCase().includes(q)
    );
  }, [players, search]);

  return (
    <div className="p-4 md:p-6 space-y-3">
      <h2 className="text-lg font-bold text-white">My Players ({players.length})</h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name or phone…"
        className="w-full bg-[#0d1228] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
      />

      {filtered.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-gray-400 bg-[#0d1228]">
          {players.length === 0
            ? 'Abhi tak koi player nahi. Apna referral link share karo ya "+ Add Player" se manually banao.'
            : 'Search me koi match nahi.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((p) => {
            const balance = Number(p.balance ?? p.walletBalance ?? 0);
            const winning = Number(p.winningMoney ?? 0);
            return (
              <button
                key={p.id}
                onClick={() => onOpenPlayer(p)}
                className="w-full text-left bg-[#0d1228] hover:bg-[#13193a] border border-white/5 rounded-2xl p-3 transition"
              >
                <div className="flex justify-between items-start gap-3">
                  <div className="flex-1">
                    <p className="font-bold text-white">{p.name || '—'}</p>
                    <p className="text-xs text-gray-400">{p.phoneNumber || (p.isOffline ? 'Offline player' : '—')}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-emerald-300 font-bold">{formatCurrency(balance)}</p>
                    <p className="text-[10px] text-yellow-300">Win: {formatCurrency(winning)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-1.5">
                  {p.suspended
                    ? <span className="text-[9px] bg-rose-500/20 text-rose-300 px-2 py-0.5 rounded-full">SUSPENDED</span>
                    : <span className="text-[9px] bg-emerald-500/20 text-emerald-300 px-2 py-0.5 rounded-full">ACTIVE</span>}
                  {p.isOffline && <span className="text-[9px] bg-amber-500/20 text-amber-300 px-2 py-0.5 rounded-full">OFFLINE</span>}
                  <span className="ml-auto text-[10px] text-gray-500">tap to view →</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Player drill-down — opened from My Players. Shows balance + recent
// activity across the games + payments. All reads are scoped to that
// player's userId so Firestore rules pass (master is allowed to read
// their own players).
function PlayerDetailView({ player, onBack }) {
  const [bets, setBets] = useState([]);
  const [deposits, setDeposits] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);

  // Pool of game-history collections we surface in one feed. We don't
  // try to be exhaustive — just the popular ones; "View all" can come
  // later if needed.
  useEffect(() => {
    if (!player?.id) return undefined;
    const cols = ['aviatorBets', 'sportsBets', 'harufBets', 'colorBets', 'diceBets', 'lucky7History', 'rouletteHistory'];
    const unsubs = cols.map((c) => {
      const q = query(collection(db, c), where('userId', '==', player.id), limit(20));
      return onSnapshot(q, (snap) => {
        const rows = snap.docs.map((d) => ({ id: d.id, src: c, ...d.data() }));
        setBets((prev) => {
          const without = prev.filter((b) => b.src !== c);
          return [...without, ...rows].sort((a, b) => {
            const ta = a.createdAt?.toDate?.()?.getTime?.() || a.timestamp?.toDate?.()?.getTime?.() || 0;
            const tb = b.createdAt?.toDate?.()?.getTime?.() || b.timestamp?.toDate?.()?.getTime?.() || 0;
            return tb - ta;
          }).slice(0, 30);
        });
      }, () => {});
    });
    return () => unsubs.forEach((u) => u());
  }, [player?.id]);

  useEffect(() => {
    if (!player?.id) return undefined;
    const q = query(collection(db, 'top-ups'), where('userId', '==', player.id), limit(20));
    return onSnapshot(q, (snap) => setDeposits(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [player?.id]);

  useEffect(() => {
    if (!player?.id) return undefined;
    const q = query(collection(db, 'withdrawals'), where('userId', '==', player.id), limit(20));
    return onSnapshot(q, (snap) => setWithdrawals(snap.docs.map((d) => ({ id: d.id, ...d.data() }))), () => {});
  }, [player?.id]);

  const fmtTime = (ts) => {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString('en-IN') : '—';
  };

  const balance = Number(player.balance ?? player.walletBalance ?? 0);
  const winning = Number(player.winningMoney ?? 0);

  return (
    <div className="p-4 md:p-6 space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm bg-white/10 hover:bg-white/15 rounded-full px-3 py-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="rounded-2xl bg-[#0d1228] border border-white/5 p-4">
        <h2 className="text-lg font-bold text-white">{player.name || '—'}</h2>
        <p className="text-xs text-gray-400">{player.phoneNumber || (player.isOffline ? 'Offline player' : '—')}</p>
        <div className="grid grid-cols-2 gap-3 mt-3">
          <div className="rounded-xl bg-emerald-900/30 border border-emerald-700/30 p-3">
            <p className="text-[10px] uppercase tracking-widest text-emerald-300">Balance</p>
            <p className="text-xl font-black text-emerald-200">{formatCurrency(balance)}</p>
          </div>
          <div className="rounded-xl bg-yellow-900/30 border border-yellow-700/30 p-3">
            <p className="text-[10px] uppercase tracking-widest text-yellow-300">Winning</p>
            <p className="text-xl font-black text-yellow-200">{formatCurrency(winning)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl bg-[#0d1228] border border-white/5">
        <p className="px-4 py-2.5 border-b border-white/5 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Recent bets</p>
        {bets.length === 0 ? (
          <p className="p-4 text-xs text-gray-500 text-center">No bets yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {bets.slice(0, 15).map((b) => (
              <li key={`${b.src}_${b.id}`} className="px-4 py-2 text-xs flex items-center justify-between">
                <div>
                  <p className="text-white font-semibold capitalize">{b.src.replace('History', '').replace('Bets', '')}</p>
                  <p className="text-[10px] text-gray-500">{fmtTime(b.createdAt || b.timestamp)}</p>
                </div>
                <div className="text-right">
                  <p className="text-gray-300">₹{Number(b.betAmount || 0).toFixed(0)}</p>
                  {b.won === true && <p className="text-emerald-300 text-[10px] font-bold">+₹{Number(b.winAmount || 0).toFixed(0)}</p>}
                  {b.won === false && <p className="text-rose-300 text-[10px]">lost</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <div className="rounded-2xl bg-[#0d1228] border border-white/5">
          <p className="px-4 py-2.5 border-b border-white/5 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Deposits</p>
          {deposits.length === 0 ? (
            <p className="p-4 text-xs text-gray-500 text-center">No deposits yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {deposits.slice(0, 10).map((d) => (
                <li key={d.id} className="px-4 py-2 text-xs flex justify-between">
                  <div>
                    <p className="text-white font-semibold">₹{Number(d.amount || 0).toFixed(0)}</p>
                    <p className="text-[10px] text-gray-500">{fmtTime(d.createdAt)}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    d.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                    d.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>{d.status || 'pending'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl bg-[#0d1228] border border-white/5">
          <p className="px-4 py-2.5 border-b border-white/5 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Withdrawals</p>
          {withdrawals.length === 0 ? (
            <p className="p-4 text-xs text-gray-500 text-center">No withdrawals yet.</p>
          ) : (
            <ul className="divide-y divide-white/5">
              {withdrawals.slice(0, 10).map((w) => (
                <li key={w.id} className="px-4 py-2 text-xs flex justify-between">
                  <div>
                    <p className="text-white font-semibold">₹{Number(w.amount || 0).toFixed(0)}</p>
                    <p className="text-[10px] text-gray-500">{fmtTime(w.createdAt)}</p>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                    w.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                    w.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                    'bg-amber-500/20 text-amber-300'
                  }`}>{w.status || 'pending'}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

// Add Player — mirrors the admin Offline Player flow but stamps the
// new user with assignedMasterId = master.uid so the master owns them.
function AddPlayerView({ masterUid, onCreated }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const trimmedName = name.trim();
    const cleanPhone = phone.replace(/\D/g, '');
    if (trimmedName.length < 2) return toast.error('Naam zaroori hai.');
    if (cleanPhone && cleanPhone.length !== 10) return toast.error('Phone optional hai — agar daala to 10 digit hona chahiye.');
    const opening = Number(balance) || 0;
    if (opening < 0) return toast.error('Balance negative nahi ho sakta.');

    setBusy(true);
    try {
      const offlineUid = `offline-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
      await setDoc(doc(db, 'users', offlineUid), {
        name: trimmedName,
        phoneNumber: cleanPhone ? '+91' + cleanPhone : null,
        balance: opening,
        winningMoney: 0,
        appName: 'truewin',
        role: 'user',
        assignedMasterId: masterUid,
        isOffline: true,
        createdByMaster: true,
        createdByUid: masterUid,
        createdAt: serverTimestamp(),
        lastActiveAt: serverTimestamp(),
      });
      toast.success(`${trimmedName} create ho gaya.`);
      setName(''); setPhone(''); setBalance('');
      onCreated?.();
    } catch (err) {
      console.error(err);
      toast.error('Player banane me dikkat: ' + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">Add new player</h2>
      <p className="text-xs text-gray-400">
        Agar user khud OTP se signup nahi kar pa raha to yahan se manually create kar do. Phone optional hai (jab tak OTP login nahi hota, "offline" account rahega).
      </p>

      <div className="rounded-2xl bg-[#0d1228] border border-white/5 p-4 space-y-3">
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1">Player name *</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Player ka naam"
            className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1">Phone (optional, 10 digits)</label>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="9876543210"
            className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
        </div>
        <div>
          <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1">Opening balance (₹)</label>
          <input
            type="number"
            min="0"
            value={balance}
            onChange={(e) => setBalance(e.target.value)}
            placeholder="0"
            className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
          />
          <p className="text-[10px] text-gray-500 mt-1">
            Yahan se balance directly daal sakte ho. Future me Phase 2 me "credit/debit player" wala flow alag se aayega jo tumhare master pool se kat ke jaayega.
          </p>
        </div>

        <button
          onClick={submit}
          disabled={busy}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl py-3 font-black text-white"
        >
          {busy ? 'Creating…' : '+ Create Player'}
        </button>
      </div>
    </div>
  );
}

// Master's own activity log — pulls masterLedger entries where
// masterId == me. Useful for "kab admin ne kitne points diye" history.
function ActivityView({ masterUid }) {
  const [entries, setEntries] = useState([]);
  useEffect(() => {
    if (!masterUid) return undefined;
    const q = query(collection(db, 'masterLedger'), where('masterId', '==', masterUid));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta;
      });
      setEntries(rows);
    }, () => setEntries([]));
  }, [masterUid]);

  const fmtTime = (ts) => {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString('en-IN') : '—';
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <h2 className="text-lg font-bold text-white">My Activity</h2>
      <p className="text-xs text-gray-400">Admin ne tumhe kab kitne points credit / debit kiye.</p>
      {entries.length === 0 ? (
        <p className="rounded-2xl border border-white/10 p-6 text-center text-sm text-gray-400 bg-[#0d1228]">
          Koi adjustment nahi hua abhi tak.
        </p>
      ) : (
        <div className="rounded-2xl border border-white/5 bg-[#0d1228] overflow-hidden">
          <ul className="divide-y divide-white/5">
            {entries.map((e) => (
              <li key={e.id} className="px-4 py-3 flex items-center justify-between">
                <div>
                  <p className={`text-sm font-bold ${e.type === 'admin_to_master' ? 'text-emerald-300' : 'text-rose-300'}`}>
                    {e.type === 'admin_to_master' ? '+ Credit' : '− Debit'}
                  </p>
                  <p className="text-[10px] text-gray-500">{fmtTime(e.createdAt)} · {e.note || '—'}</p>
                </div>
                <p className={`font-black ${e.type === 'admin_to_master' ? 'text-emerald-200' : 'text-rose-200'}`}>
                  {formatCurrency(e.amount)}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
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
              WhatsApp / Telegram me ye link bhejo. Jo user us link se signup karega vo tumhare under aa jayega — uske deposit tumhe approve karne honge.
            </p>
          </div>

          <button
            onClick={() => {
              if (navigator.share) {
                navigator.share({
                  title: 'TrueWin Circle',
                  text: 'Khelo aur jeeto! TrueWin Circle pe sign up karo —',
                  url: link,
                }).catch(() => {});
              } else {
                copy(link, 'Link');
              }
            }}
            className="w-full bg-yellow-400 text-black font-black py-3 rounded-xl"
          >
            📤 Share via WhatsApp
          </button>
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
  const [openPlayer, setOpenPlayer] = useState(null);

  useEffect(() => {
    if (!user?.uid) return undefined;
    return onSnapshot(doc(db, 'users', user.uid), (snap) => {
      if (snap.exists()) setMaster({ uid: snap.id, ...snap.data() });
    });
  }, [user?.uid]);

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

  const switchTab = (id) => {
    setActiveTab(id);
    setOpenPlayer(null);
    setSidebarOpen(false);
  };

  const content = useMemo(() => {
    // Player drill-down hijacks the content area when set, regardless
    // of which sidebar section is currently active.
    if (openPlayer) {
      return <PlayerDetailView player={openPlayer} onBack={() => setOpenPlayer(null)} />;
    }
    switch (activeTab) {
      case 'dashboard': return <DashboardView master={master} playerCount={players.length} onJump={switchTab} />;
      case 'players':   return <PlayersListView players={players} onOpenPlayer={(p) => setOpenPlayer(p)} />;
      case 'addPlayer': return <AddPlayerView masterUid={user?.uid} onCreated={() => switchTab('players')} />;
      case 'activity':  return <ActivityView masterUid={user?.uid} />;
      case 'deposits':  return <Placeholder title="Deposit Approvals" />;
      case 'withdraws': return <Placeholder title="Withdrawal Approvals" />;
      case 'link':      return <LinkView master={master} />;
      default:          return <DashboardView master={master} playerCount={players.length} onJump={switchTab} />;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, master, players, openPlayer, user?.uid]);

  const balance = getUserFunds(master).balance;

  return (
    <div className="flex h-screen bg-[#05081a] text-white">
      {/* Sidebar (desktop) */}
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
          <p className="text-xl font-black text-yellow-200">{formatCurrency(balance)}</p>
        </div>

        <nav className="space-y-1 overflow-y-auto flex-1">
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => switchTab(s.id)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
                activeTab === s.id && !openPlayer
                  ? 'bg-yellow-400 text-black font-bold'
                  : 'text-gray-300 hover:bg-white/5'
              }`}
            >
              <s.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{s.label}</span>
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

      <div className="flex-1 flex flex-col md:ml-72 pb-16 md:pb-0">
        <ToastContainer position="top-right" autoClose={4000} theme="dark" />
        <div className="bg-[#0d1228] border-b border-white/5 px-4 py-3 flex items-center justify-between sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <button onClick={() => setSidebarOpen(true)} className="md:hidden p-1.5">
              <Menu className="h-5 w-5" />
            </button>
            <h2 className="text-sm font-bold text-yellow-300 capitalize">
              {openPlayer ? openPlayer.name || 'Player' : (SECTIONS.find((s) => s.id === activeTab)?.label || 'Master')}
            </h2>
          </div>
          <div className="text-xs">
            <span className="text-gray-500">Points · </span>
            <span className="text-yellow-300 font-bold">{formatCurrency(balance)}</span>
          </div>
        </div>
        <main className="flex-1 overflow-y-auto">{content}</main>
      </div>

      {/* Mobile bottom nav — fixed, 5 main tabs */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0a0f24] border-t border-white/10 grid grid-cols-5">
        {SECTIONS.slice(0, 5).map((s) => (
          <button
            key={s.id}
            onClick={() => switchTab(s.id)}
            className={`flex flex-col items-center gap-0.5 py-2 text-[10px] ${
              activeTab === s.id && !openPlayer ? 'text-yellow-400' : 'text-gray-400'
            }`}
          >
            <s.icon className="h-5 w-5" />
            {s.short}
          </button>
        ))}
      </div>
    </div>
  );
}
