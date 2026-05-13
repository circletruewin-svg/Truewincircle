import React, { useEffect, useMemo, useState } from 'react';
import {
  collection, doc, onSnapshot, query, where, addDoc, setDoc, serverTimestamp,
  orderBy, limit, getDocs, updateDoc, runTransaction,
} from 'firebase/firestore';
import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  Users, LayoutDashboard, Link as LinkIcon, CreditCard, DollarSign,
  LogOut, Menu, X, Copy, ChevronLeft, UserPlus, History, ArrowLeft,
  QrCode,
} from 'lucide-react';
import { ToastContainer, toast } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import { db, auth, app } from '../firebase';
import useAuthStore from '../store/authStore';
import { formatCurrency } from '../utils/formatMoney';
import { buildMasterReferralLink } from '../utils/master';
import { getUserFunds } from '../utils/userFunds';
import { playChime } from '../utils/gameSfx';

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
  { id: 'qr',        label: 'My Payment QR',     icon: QrCode,          short: 'QR'      },
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

// Helper: atomic transfer between master and player. Used by the
// Adjust Wallet modal AND the deposit approval flow. Direction is
// "credit_player" (master → player) or "debit_player" (player → master).
async function transferBetweenMasterAndPlayer({ masterUid, playerUid, amount, direction, note }) {
  if (!(amount > 0)) throw new Error('Amount > 0 zaroori hai.');
  await runTransaction(db, async (tx) => {
    const masterRef = doc(db, 'users', masterUid);
    const playerRef = doc(db, 'users', playerUid);
    const ms = await tx.get(masterRef);
    const ps = await tx.get(playerRef);
    if (!ms.exists() || !ps.exists()) throw new Error('Master ya player doc nahi mila.');

    const mBalance = Number(ms.data().balance ?? ms.data().walletBalance ?? 0);
    const pBalance = Number(ps.data().balance ?? ps.data().walletBalance ?? 0);
    const pWinning = Number(ps.data().winningMoney ?? 0);

    if (direction === 'credit_player') {
      if (mBalance < amount) throw new Error(`Master ke paas sirf ₹${mBalance.toFixed(2)} hai.`);
      const newM = Math.round((mBalance - amount) * 100) / 100;
      const newP = Math.round((pBalance + amount) * 100) / 100;
      tx.update(masterRef, { balance: newM, walletBalance: newM });
      tx.update(playerRef, { balance: newP, walletBalance: newP });
    } else {
      // debit_player: pull from balance first, then winningMoney.
      const playerTotal = pBalance + pWinning;
      if (playerTotal < amount) throw new Error(`Player ke paas sirf ₹${playerTotal.toFixed(2)} hai.`);
      let fromBalance = Math.min(pBalance, amount);
      let fromWinning = amount - fromBalance;
      const newM = Math.round((mBalance + amount) * 100) / 100;
      const newPBalance = Math.round((pBalance - fromBalance) * 100) / 100;
      const newPWinning = Math.round((pWinning - fromWinning) * 100) / 100;
      tx.update(masterRef, { balance: newM, walletBalance: newM });
      tx.update(playerRef, { balance: newPBalance, walletBalance: newPBalance, winningMoney: newPWinning });
    }
  });

  // Audit row outside the transaction (best-effort; not critical to
  // the balance change).
  try {
    await addDoc(collection(db, 'masterLedger'), {
      type: direction === 'credit_player' ? 'master_to_player' : 'player_to_master',
      masterId: masterUid,
      playerId: playerUid,
      amount,
      note: note || null,
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.warn('masterLedger insert failed:', err);
  }
}

function AdjustWalletModal({ master, player, onClose }) {
  const [direction, setDirection] = useState('credit_player'); // credit_player | debit_player
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    const value = Number(amount);
    if (!value || value <= 0) return toast.error('Amount enter karo.');
    setBusy(true);
    try {
      await transferBetweenMasterAndPlayer({
        masterUid: master.uid,
        playerUid: player.id,
        amount: value,
        direction,
        note: note.trim() || null,
      });
      toast.success(`${direction === 'credit_player' ? 'Credit' : 'Debit'} of ₹${value} done.`);
      onClose();
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Operation failed.');
    } finally {
      setBusy(false);
    }
  };

  const masterBalance = Number(master.balance ?? master.walletBalance ?? 0);
  const playerBalance = Number(player.balance ?? player.walletBalance ?? 0);
  const playerWinning = Number(player.winningMoney ?? 0);

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-end md:items-center justify-center p-4">
      <div className="w-full max-w-md bg-[#0d1228] border border-white/10 rounded-2xl text-white">
        <div className="border-b border-white/5 p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Adjust Wallet</h3>
          <button onClick={onClose} className="text-gray-400 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm text-gray-300">
            <b>{player.name || 'Player'}</b> · current balance:{' '}
            <span className="text-emerald-300 font-bold">{formatCurrency(playerBalance)}</span>
            {playerWinning > 0 && <> + winning <span className="text-yellow-300">{formatCurrency(playerWinning)}</span></>}
          </p>

          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDirection('credit_player')}
              className={`py-3 rounded-xl font-bold text-sm ${direction === 'credit_player' ? 'bg-emerald-600 text-white' : 'bg-white/5 text-gray-300'}`}
            >+ Credit Player</button>
            <button
              onClick={() => setDirection('debit_player')}
              className={`py-3 rounded-xl font-bold text-sm ${direction === 'debit_player' ? 'bg-rose-600 text-white' : 'bg-white/5 text-gray-300'}`}
            >− Debit Player</button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1">Amount (₹)</label>
            <input
              type="number"
              min="1"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
              placeholder="0"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-widest text-gray-400 mb-1">Reason / note (optional)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Cash deposit, refund, etc."
              className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
            />
          </div>

          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3 text-xs text-amber-200">
            {direction === 'credit_player' ? (
              <>Tumhare points <b>{formatCurrency(masterBalance)}</b> me se <b>₹{Number(amount) || 0}</b> kat ke player ke wallet me jaayenge.</>
            ) : (
              <>Player ke wallet se <b>₹{Number(amount) || 0}</b> kat ke tumhare points <b>{formatCurrency(masterBalance)}</b> me wapas aayenge.</>
            )}
          </div>
        </div>
        <div className="border-t border-white/5 p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-white/10 text-white rounded">Cancel</button>
          <button
            onClick={submit}
            disabled={busy || !amount}
            className={`px-4 py-2 text-white font-bold rounded disabled:opacity-40 ${direction === 'credit_player' ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-rose-600 hover:bg-rose-500'}`}
          >
            {busy ? 'Saving…' : `${direction === 'credit_player' ? '+ Credit' : '− Debit'} ₹${amount || 0}`}
          </button>
        </div>
      </div>
    </div>
  );
}

// Map a bet doc from one of the game-history collections to a human-
// readable {title, sub, status} so the player drill-down can show
// "GALI · Number 04 · Pending" instead of the bare collection name.
function describeBet(b) {
  switch (b.src) {
    case 'harufBets': {
      const market = (b.marketName || 'Market').toUpperCase();
      const num = b.selectedNumber != null ? String(b.selectedNumber).padStart(2, '0') : '?';
      return {
        title: `${market} · ${num}`,
        sub: 'Haruf',
        status: b.status || 'pending',
      };
    }
    case 'sportsBets': {
      const teamA = b.teamASnapshot || '';
      const teamB = b.teamBSnapshot || '';
      return {
        title: b.selectionLabel || `${teamA} vs ${teamB}`,
        sub: `Cricket · ${(b.betType || '').replace('Batsman', ' Batsman')}`,
        status: b.status || 'pending',
      };
    }
    case 'aviatorBets':
      return {
        title: b.won === true
          ? `Cashed @ ${Number(b.cashoutMultiplier || 0).toFixed(2)}x`
          : `Crashed @ ${Number(b.crashPoint || 0).toFixed(2)}x`,
        sub: 'Aviator',
        status: b.won === true ? 'won' : 'lost',
      };
    case 'colorBets':       return { title: `Color · ${b.selection || ''}`, sub: 'Color',     status: b.won === true ? 'won' : b.won === false ? 'lost' : 'pending' };
    case 'diceBets':        return { title: `Dice · ${b.selection || ''}`,  sub: 'Dice',      status: b.won === true ? 'won' : b.won === false ? 'lost' : 'pending' };
    case 'lucky7History':   return { title: `Lucky 7 · ${b.bet || ''}`,     sub: 'Lucky 7',   status: b.won === true ? 'won' : 'lost' };
    case 'rouletteHistory': return { title: `Roulette · ${b.label || b.number || ''}`, sub: 'Roulette', status: b.won === true ? 'won' : 'lost' };
    default:
      return {
        title: b.src.replace(/History|Bets/g, ''),
        sub: '',
        status: b.status || (b.won === true ? 'won' : b.won === false ? 'lost' : 'pending'),
      };
  }
}

const BET_STATUS_BADGE = {
  pending:  'bg-amber-500/20 text-amber-300',
  won:      'bg-emerald-500/20 text-emerald-300',
  lost:     'bg-rose-500/20 text-rose-300',
  refunded: 'bg-zinc-500/20 text-zinc-200',
};

// Player drill-down — opened from My Players. Shows balance + recent
// activity across the games + payments. All reads are scoped to that
// player's userId so Firestore rules pass (master is allowed to read
// their own players).
function PlayerDetailView({ player, master, onBack }) {
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

  const [adjustOpen, setAdjustOpen] = useState(false);

  return (
    <div className="p-4 md:p-6 space-y-3">
      <button onClick={onBack} className="inline-flex items-center gap-1 text-sm bg-white/10 hover:bg-white/15 rounded-full px-3 py-1.5">
        <ArrowLeft className="h-3.5 w-3.5" /> Back
      </button>

      <div className="rounded-2xl bg-[#0d1228] border border-white/5 p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-white">{player.name || '—'}</h2>
            <p className="text-xs text-gray-400">{player.phoneNumber || (player.isOffline ? 'Offline player' : '—')}</p>
          </div>
          <button
            onClick={() => setAdjustOpen(true)}
            className="bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl px-4 py-2 text-sm"
          >
            Adjust Wallet
          </button>
        </div>
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

      {adjustOpen && master?.uid && (
        <AdjustWalletModal master={master} player={player} onClose={() => setAdjustOpen(false)} />
      )}

      <div className="rounded-2xl bg-[#0d1228] border border-white/5">
        <p className="px-4 py-2.5 border-b border-white/5 text-[11px] uppercase tracking-widest text-gray-400 font-bold">Recent bets</p>
        {bets.length === 0 ? (
          <p className="p-4 text-xs text-gray-500 text-center">No bets yet.</p>
        ) : (
          <ul className="divide-y divide-white/5">
            {bets.slice(0, 15).map((b) => {
              const d = describeBet(b);
              return (
                <li key={`${b.src}_${b.id}`} className="px-4 py-2 text-xs flex items-center justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <p className="text-white font-semibold truncate">{d.title}</p>
                    <p className="text-[10px] text-gray-500">{d.sub} · {fmtTime(b.createdAt || b.timestamp)}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-gray-300">₹{Number(b.betAmount || 0).toFixed(0)}</p>
                    <span className={`inline-block text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full mt-0.5 ${BET_STATUS_BADGE[d.status] || BET_STATUS_BADGE.pending}`}>
                      {d.status}
                      {d.status === 'won' && b.winAmount > 0 && ` · +₹${Number(b.winAmount).toFixed(0)}`}
                    </span>
                  </div>
                </li>
              );
            })}
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

// Master's own UPI / payment QR. Whatever the master saves here is
// what their players see on the Pay page — instead of the global
// admin QR. If the master hasn't set one yet, players keep seeing
// the admin QR (fallback in Pay.jsx).
function PaymentQRView({ master }) {
  const [uploading, setUploading] = useState(false);
  const [urlInput, setUrlInput] = useState('');
  const [savingUrl, setSavingUrl] = useState(false);

  const currentUrl = master?.qrCodeUrl || '';

  const onPickFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Sirf image file allowed hai.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image 5 MB se chhoti honi chahiye.');
      return;
    }
    setUploading(true);
    try {
      const storage = getStorage(app);
      // .png keeps QR sharp; even if the user uploads JPEG, Storage
      // doesn't care about the extension — it's just for cache keying.
      const path = `masters/${master.uid}/qr.png`;
      const sref = storageRef(storage, path);
      await uploadBytes(sref, file, { contentType: file.type });
      const downloadUrl = await getDownloadURL(sref);
      await updateDoc(doc(db, 'users', master.uid), {
        qrCodeUrl: downloadUrl,
        qrUpdatedAt: serverTimestamp(),
      });
      toast.success('QR upload ho gaya. Tumhare players ko ab ye QR dikhega.');
    } catch (err) {
      console.error(err);
      toast.error('Upload fail: ' + (err.message || err));
    } finally {
      setUploading(false);
    }
  };

  const saveUrl = async () => {
    const url = urlInput.trim();
    if (!url) return toast.error('URL paste karo.');
    if (!/^https?:\/\//.test(url)) return toast.error('Sirf https://... wala URL chalega.');
    setSavingUrl(true);
    try {
      await updateDoc(doc(db, 'users', master.uid), {
        qrCodeUrl: url,
        qrUpdatedAt: serverTimestamp(),
      });
      setUrlInput('');
      toast.success('QR URL save ho gaya.');
    } catch (err) {
      toast.error('Save fail: ' + (err.message || err));
    } finally {
      setSavingUrl(false);
    }
  };

  const clearQr = async () => {
    if (!window.confirm('QR hata do? Tumhare players wapas admin ka default QR dekhne lagenge.')) return;
    try {
      await updateDoc(doc(db, 'users', master.uid), {
        qrCodeUrl: null,
        qrUpdatedAt: serverTimestamp(),
      });
      toast.success('QR clear kar diya.');
    } catch (err) {
      toast.error('Clear fail: ' + (err.message || err));
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-4">
      <h2 className="text-lg font-bold text-white">My Payment QR</h2>
      <p className="text-xs text-gray-400">
        Tumhare players ko Add Cash → Pay page pe ye QR dikhega. Jab tumhe paise mile, deposit approval me jaake confirm karna — tumhare master points us amount se kam ho jayenge aur player ke wallet me jaayenge.
      </p>

      {/* Current QR preview */}
      <div className="rounded-2xl border border-white/5 bg-[#0d1228] p-4">
        <p className="text-[11px] uppercase tracking-widest text-gray-400 mb-3">Current QR</p>
        {currentUrl ? (
          <div className="flex flex-col md:flex-row items-center gap-4">
            <div className="rounded-2xl bg-white p-3 shadow-lg">
              <img src={currentUrl} alt="Your QR" className="w-48 h-48 object-contain" />
            </div>
            <div className="flex-1 text-xs text-gray-400 break-all">
              <p className="text-[10px] uppercase tracking-widest text-emerald-400 mb-1 font-bold">Active</p>
              <p className="mb-2">Ye QR tumhare saare players ko Pay page pe dikh raha hai.</p>
              <a href={currentUrl} target="_blank" rel="noreferrer" className="text-blue-300 underline">Open full image</a>
              <button onClick={clearQr} className="block mt-3 text-rose-300 hover:text-rose-200 text-xs">Remove QR (revert to admin's default)</button>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-4 text-sm text-amber-200">
            Abhi koi QR set nahi hai. Niche se upload karo ya URL paste karo. Jab tak set nahi karoge, tumhare players ko admin ka default QR dikhega.
          </div>
        )}
      </div>

      {/* Upload via file picker */}
      <div className="rounded-2xl border border-white/5 bg-[#0d1228] p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold">Upload new QR (image)</p>
        <p className="text-xs text-gray-500">
          PNG / JPG. Apne UPI app me "QR" share/save karke yahan upload kar do.
        </p>
        <label className="block">
          <input type="file" accept="image/*" disabled={uploading} onChange={onPickFile} className="hidden" />
          <span className={`block text-center w-full bg-yellow-400 hover:bg-yellow-300 text-black font-black rounded-xl py-3 cursor-pointer ${uploading ? 'opacity-40 cursor-not-allowed' : ''}`}>
            {uploading ? 'Uploading…' : '📁 Choose image'}
          </span>
        </label>
      </div>

      {/* Or paste a URL */}
      <div className="rounded-2xl border border-white/5 bg-[#0d1228] p-4 space-y-3">
        <p className="text-[11px] uppercase tracking-widest text-gray-400 font-bold">Or paste image URL</p>
        <p className="text-xs text-gray-500">
          Agar QR pehle se kahin hosted hai (drive, imgur, etc.) to seedha URL daal do.
        </p>
        <input
          type="url"
          value={urlInput}
          onChange={(e) => setUrlInput(e.target.value)}
          placeholder="https://example.com/your-qr.png"
          className="w-full bg-[#070b1e] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white"
        />
        <button
          onClick={saveUrl}
          disabled={savingUrl || !urlInput.trim()}
          className="w-full bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 rounded-xl py-3 font-bold text-white"
        >
          {savingUrl ? 'Saving…' : 'Save URL'}
        </button>
      </div>

      <p className="text-[11px] text-gray-500 px-1">
        Tip: phone me UPI app kholo → "My QR" → screenshot le ke yahan upload kar do.
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
      Coming soon.
    </div>
  );
}

// Build a Map of playerId → player doc so the approval rows can show
// name + phone without a per-row Firestore round-trip.
function buildPlayerMap(players) {
  const map = new Map();
  for (const p of players) map.set(p.id, p);
  return map;
}

const fmtTimeStamp = (ts) => {
  const d = ts?.toDate?.();
  return d ? d.toLocaleString('en-IN') : '—';
};

// ─────────────────────────────────────────────────────────────────
// Deposit Approvals — pending top-ups from this master's players.
// Approving: atomic credit_player transfer; reject: status change only.
// ─────────────────────────────────────────────────────────────────
function DepositApprovalsView({ master, players }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending'); // pending | all
  const [busyId, setBusyId] = useState(null);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const playerIds = useMemo(() => players.map((p) => p.id), [players]);
  const masterBalance = Number(master?.balance ?? master?.walletBalance ?? 0);

  // Firestore `in` queries max out at 30. If a master has more
  // players we chunk; for now we cap the visible feed at the first
  // 30 (most masters won't hit this).
  useEffect(() => {
    if (!playerIds.length) { setItems([]); return undefined; }
    const ids = playerIds.slice(0, 30);
    const q = query(collection(db, 'top-ups'), where('userId', 'in', ids));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta;
      });
      setItems(rows);
    }, () => setItems([]));
  }, [playerIds.join(',')]);

  const visible = useMemo(() => (
    filter === 'pending' ? items.filter((i) => i.status === 'pending') : items
  ), [items, filter]);

  const approve = async (tu) => {
    const player = playerMap.get(tu.userId);
    if (!player) return toast.error('Player record nahi mila.');
    const amount = Number(tu.amount || 0);
    if (!(amount > 0)) return toast.error('Amount invalid.');
    if (amount > masterBalance) {
      return toast.error(`Tumhare paas sirf ${formatCurrency(masterBalance)} hain — admin se top-up lo.`);
    }
    if (!window.confirm(`Approve ${formatCurrency(amount)} deposit for ${player.name || 'player'}?\nTumhare points ${formatCurrency(masterBalance)} se ${formatCurrency(masterBalance - amount)} ho jayenge.`)) return;

    setBusyId(tu.id);
    try {
      await transferBetweenMasterAndPlayer({
        masterUid: master.uid,
        playerUid: tu.userId,
        amount,
        direction: 'credit_player',
        note: `Deposit approval · top-up ${tu.id}`,
      });
      await updateDoc(doc(db, 'top-ups', tu.id), { status: 'approved' });
      toast.success(`Approved · ${formatCurrency(amount)} credited.`);
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Approve fail.');
    } finally {
      setBusyId(null);
    }
  };

  const reject = async (tu) => {
    const reason = window.prompt('Reject reason (optional):', '');
    if (reason === null) return; // user cancelled
    setBusyId(tu.id);
    try {
      const payload = { status: 'rejected' };
      if (reason.trim()) payload.adminComment = reason.trim();
      await updateDoc(doc(db, 'top-ups', tu.id), payload);
      toast.info('Rejected.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Reject fail.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-bold text-white">Deposit Approvals</h2>
        <div className="text-xs text-gray-400">My points: <span className="text-yellow-300 font-bold">{formatCurrency(masterBalance)}</span></div>
      </div>
      <p className="text-xs text-gray-400">
        Tumhare players ne paise transfer kar diye (UPI etc), screenshot upload kiya — yahan se approve karoge to <b>tumhare points kat ke unke wallet me jaayenge</b>.
      </p>

      <div className="flex gap-2">
        <button onClick={() => setFilter('pending')} className={`text-xs px-3 py-1.5 rounded-full font-bold ${filter === 'pending' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-gray-300'}`}>Pending</button>
        <button onClick={() => setFilter('all')}     className={`text-xs px-3 py-1.5 rounded-full font-bold ${filter === 'all' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-gray-300'}`}>All</button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-gray-400 bg-[#0d1228]">
          {filter === 'pending' ? 'Koi pending deposit nahi.' : 'Abhi tak koi deposit request nahi.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((tu) => {
            const p = playerMap.get(tu.userId) || {};
            const amount = Number(tu.amount || 0);
            const isPending = tu.status === 'pending';
            return (
              <div key={tu.id} className="rounded-2xl border border-white/5 bg-[#0d1228] p-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold text-white text-sm">{p.name || '—'}</p>
                    <p className="text-[11px] text-gray-400">{p.phoneNumber || '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{fmtTimeStamp(tu.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-emerald-300 font-black text-lg">{formatCurrency(amount)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      tu.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                      tu.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{tu.status || 'pending'}</span>
                  </div>
                </div>
                {tu.paymentProof && (
                  <div className="mt-2">
                    <p className="text-[10px] uppercase tracking-widest text-gray-400 mb-1">Payment screenshot</p>
                    <a href={tu.paymentProof} target="_blank" rel="noreferrer" className="block">
                      <img
                        src={tu.paymentProof}
                        alt="Payment proof"
                        className="rounded-lg max-h-48 w-full object-contain bg-black/40 border border-white/10"
                      />
                      <span className="block mt-1 text-[11px] text-blue-300 underline">Open full size</span>
                    </a>
                  </div>
                )}
                {tu.utr && <p className="text-[11px] text-gray-400 mt-1">UTR: <span className="font-mono">{tu.utr}</span></p>}
                {tu.message && <p className="text-[11px] text-gray-400 mt-1">Note: {tu.message}</p>}
                {tu.adminComment && <p className="text-[11px] text-rose-300 mt-1">Reject reason: {tu.adminComment}</p>}

                {isPending && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => approve(tu)}
                      disabled={busyId === tu.id || amount > masterBalance}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-lg py-2 text-sm font-bold"
                    >
                      {busyId === tu.id ? '…' : amount > masterBalance ? `Need ${formatCurrency(amount - masterBalance)} more` : '✓ Approve'}
                    </button>
                    <button
                      onClick={() => reject(tu)}
                      disabled={busyId === tu.id}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 rounded-lg py-2 text-sm font-bold"
                    >
                      ✗ Reject
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {playerIds.length > 30 && (
        <p className="text-[11px] text-amber-300">Note: 30 se zyada players hain — sirf pehle 30 ke deposits dikha rahe hain abhi.</p>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Withdrawal Approvals — master pays cash externally and clicks
// "Approved". On reject, the winning balance is refunded.
// ─────────────────────────────────────────────────────────────────
function WithdrawalApprovalsView({ master, players }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('pending');
  const [busyId, setBusyId] = useState(null);
  const playerMap = useMemo(() => buildPlayerMap(players), [players]);
  const playerIds = useMemo(() => players.map((p) => p.id), [players]);

  useEffect(() => {
    if (!playerIds.length) { setItems([]); return undefined; }
    const ids = playerIds.slice(0, 30);
    const q = query(collection(db, 'withdrawals'), where('userId', 'in', ids));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      rows.sort((a, b) => {
        const ta = a.createdAt?.toDate?.()?.getTime() || 0;
        const tb = b.createdAt?.toDate?.()?.getTime() || 0;
        return tb - ta;
      });
      setItems(rows);
    }, () => setItems([]));
  }, [playerIds.join(',')]);

  const visible = useMemo(() => (
    filter === 'pending' ? items.filter((i) => i.status === 'pending') : items
  ), [items, filter]);

  // Approve = master pays cash externally; system just records the
  // status change. No balance moves on this side (the user's winning
  // money was already deducted when they raised the withdrawal).
  const approve = async (w) => {
    if (!window.confirm(`Confirm karte ho ki tumne ${formatCurrency(w.amount || 0)} cash ${playerMap.get(w.userId)?.name || 'player'} ko de diye?`)) return;
    setBusyId(w.id);
    try {
      await updateDoc(doc(db, 'withdrawals', w.id), { status: 'approved' });
      toast.success('Marked as paid.');
    } catch (err) {
      toast.error(err.message || 'Approve fail.');
    } finally {
      setBusyId(null);
    }
  };

  // Reject = refund the amount to the player's winningMoney AND
  // because that movement is a credit to the player, we also need
  // to debit the master's pool by the same amount. Symmetry keeps
  // the rules satisfied and the audit log honest.
  const reject = async (w) => {
    const reason = window.prompt('Reject reason (optional):', '');
    if (reason === null) return;
    const amount = Number(w.amount || 0);
    if (!(amount > 0)) {
      toast.error('Amount invalid — cannot refund.');
      return;
    }
    setBusyId(w.id);
    try {
      await runTransaction(db, async (tx) => {
        const wdRef = doc(db, 'withdrawals', w.id);
        const masterRef = doc(db, 'users', master.uid);
        const playerRef = doc(db, 'users', w.userId);
        const wdSnap = await tx.get(wdRef);
        const mSnap = await tx.get(masterRef);
        const pSnap = await tx.get(playerRef);
        if (!wdSnap.exists()) throw new Error('Withdrawal nahi mila.');
        if (wdSnap.data().status !== 'pending') throw new Error('Pehle hi process ho chuka.');

        // Master debits, player gets the amount back into winningMoney.
        const mBal = Number(mSnap.data().balance ?? 0);
        if (mBal < amount) throw new Error(`Refund ke liye master ke paas sirf ${formatCurrency(mBal)} hai.`);
        const newM = Math.round((mBal - amount) * 100) / 100;
        const pWin = Number(pSnap.data().winningMoney ?? 0);
        const newPW = Math.round((pWin + amount) * 100) / 100;

        tx.update(masterRef, { balance: newM, walletBalance: newM });
        tx.update(playerRef, { winningMoney: newPW });

        const payload = { status: 'rejected' };
        if (reason.trim()) payload.adminComment = reason.trim();
        tx.update(wdRef, payload);
      });

      try {
        await addDoc(collection(db, 'masterLedger'), {
          type: 'withdrawal_reject',
          masterId: master.uid,
          playerId: w.userId,
          amount,
          note: `Withdrawal rejected · refunded to player`,
          createdAt: serverTimestamp(),
        });
      } catch {}

      toast.info('Rejected · amount refunded to player winnings.');
    } catch (err) {
      console.error(err);
      toast.error(err.message || 'Reject fail.');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 md:p-6 space-y-3">
      <h2 className="text-lg font-bold text-white">Withdrawal Approvals</h2>
      <p className="text-xs text-gray-400">
        Player ne winning paise withdraw karne maange. Tum cash ya UPI se unhe pay karo (apne taraf se), phir <b>Approve</b> dabake "paid" mark kar do. Reject karoge to player ko paise wapas mil jayenge (tumhare points se kat ke).
      </p>

      <div className="flex gap-2">
        <button onClick={() => setFilter('pending')} className={`text-xs px-3 py-1.5 rounded-full font-bold ${filter === 'pending' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-gray-300'}`}>Pending</button>
        <button onClick={() => setFilter('all')}     className={`text-xs px-3 py-1.5 rounded-full font-bold ${filter === 'all' ? 'bg-yellow-400 text-black' : 'bg-white/10 text-gray-300'}`}>All</button>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-2xl border border-white/10 p-6 text-center text-sm text-gray-400 bg-[#0d1228]">
          {filter === 'pending' ? 'Koi pending withdrawal nahi.' : 'Abhi tak koi withdrawal nahi.'}
        </div>
      ) : (
        <div className="space-y-2">
          {visible.map((w) => {
            const p = playerMap.get(w.userId) || {};
            const amount = Number(w.amount || 0);
            const isPending = w.status === 'pending';
            return (
              <div key={w.id} className="rounded-2xl border border-white/5 bg-[#0d1228] p-3">
                <div className="flex justify-between items-start gap-3">
                  <div>
                    <p className="font-bold text-white text-sm">{p.name || '—'}</p>
                    <p className="text-[11px] text-gray-400">{p.phoneNumber || '—'}</p>
                    <p className="text-[10px] text-gray-500 mt-0.5">{fmtTimeStamp(w.createdAt)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-yellow-300 font-black text-lg">{formatCurrency(amount)}</p>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${
                      w.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                      w.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                      'bg-amber-500/20 text-amber-300'
                    }`}>{w.status || 'pending'}</span>
                  </div>
                </div>
                {(w.upi || w.bankAccount || w.accountNumber || w.ifsc) && (
                  <div className="mt-2 text-[11px] text-gray-300 space-y-0.5">
                    {w.upi && <p>UPI: <span className="font-mono">{w.upi}</span></p>}
                    {w.accountNumber && <p>A/C: <span className="font-mono">{w.accountNumber}</span></p>}
                    {w.ifsc && <p>IFSC: <span className="font-mono">{w.ifsc}</span></p>}
                  </div>
                )}
                {w.adminComment && <p className="text-[11px] text-rose-300 mt-1">Reason: {w.adminComment}</p>}

                {isPending && (
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <button
                      onClick={() => approve(w)}
                      disabled={busyId === w.id}
                      className="bg-emerald-600 hover:bg-emerald-500 disabled:opacity-30 rounded-lg py-2 text-sm font-bold"
                    >{busyId === w.id ? '…' : '✓ Paid · Approve'}</button>
                    <button
                      onClick={() => reject(w)}
                      disabled={busyId === w.id}
                      className="bg-rose-600 hover:bg-rose-500 disabled:opacity-30 rounded-lg py-2 text-sm font-bold"
                    >✗ Reject · Refund</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      {playerIds.length > 30 && (
        <p className="text-[11px] text-amber-300">Note: 30 se zyada players hain — sirf pehle 30 ke withdrawals dikha rahe hain abhi.</p>
      )}
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

  // ── Notification sound + toast on new pending deposits/withdrawals ──
  // Mirrors the admin's notification UX so a master also gets pinged
  // when one of their players submits something. Only fires for docs
  // whose createdAt is AFTER the master opened the panel — we don't
  // want a barrage of old pendings on every refresh.
  useEffect(() => {
    if (!user?.uid || players.length === 0) return undefined;
    const playerIds = players.map((p) => p.id).slice(0, 30);
    if (!playerIds.length) return undefined;

    const subscribedAt = Date.now();
    const isAfter = (createdAt) => {
      let t;
      if (createdAt?.toDate) t = createdAt.toDate().getTime();
      else if (typeof createdAt === 'string') t = new Date(createdAt).getTime();
      else if (createdAt instanceof Date) t = createdAt.getTime();
      return Number.isFinite(t) && t > subscribedAt - 5000;
    };

    const tu = query(collection(db, 'top-ups'), where('userId', 'in', playerIds));
    const unsubTU = onSnapshot(tu, (snap) => {
      const fresh = snap.docChanges().filter((c) => {
        if (c.type !== 'added') return false;
        const d = c.doc.data();
        return d.status === 'pending' && isAfter(d.createdAt);
      });
      if (fresh.length > 0) {
        try { playChime(); } catch {}
        toast.info(`💰 ${fresh.length} naya deposit approval pending`);
      }
    }, () => {});

    const wd = query(collection(db, 'withdrawals'), where('userId', 'in', playerIds));
    const unsubWD = onSnapshot(wd, (snap) => {
      const fresh = snap.docChanges().filter((c) => {
        if (c.type !== 'added') return false;
        const d = c.doc.data();
        return d.status === 'pending' && isAfter(d.createdAt);
      });
      if (fresh.length > 0) {
        try { playChime(); } catch {}
        toast.info(`🏦 ${fresh.length} naya withdrawal pending`);
      }
    }, () => {});

    return () => { unsubTU(); unsubWD(); };
  }, [user?.uid, players.length]);

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
      return <PlayerDetailView player={openPlayer} master={master} onBack={() => setOpenPlayer(null)} />;
    }
    switch (activeTab) {
      case 'dashboard': return <DashboardView master={master} playerCount={players.length} onJump={switchTab} />;
      case 'players':   return <PlayersListView players={players} onOpenPlayer={(p) => setOpenPlayer(p)} />;
      case 'addPlayer': return <AddPlayerView masterUid={user?.uid} onCreated={() => switchTab('players')} />;
      case 'activity':  return <ActivityView masterUid={user?.uid} />;
      case 'qr':        return <PaymentQRView master={master} />;
      case 'deposits':  return <DepositApprovalsView master={master} players={players} />;
      case 'withdraws': return <WithdrawalApprovalsView master={master} players={players} />;
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

      {/* Mobile bottom nav — horizontal scroll so all sections
          (including QR / Activity / Link) stay reachable in one tap. */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-[#0a0f24] border-t border-white/10">
        <div className="flex overflow-x-auto no-scrollbar" style={{ scrollbarWidth: 'none' }}>
          {SECTIONS.map((s) => (
            <button
              key={s.id}
              onClick={() => switchTab(s.id)}
              className={`shrink-0 basis-1/5 flex flex-col items-center gap-0.5 py-2 text-[10px] ${
                activeTab === s.id && !openPlayer ? 'text-yellow-400' : 'text-gray-400'
              }`}
            >
              <s.icon className="h-5 w-5" />
              {s.short}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
