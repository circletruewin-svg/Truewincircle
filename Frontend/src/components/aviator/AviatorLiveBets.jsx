import { useEffect, useMemo, useState } from "react";
import {
  collection, query, orderBy, limit, onSnapshot, where,
} from "firebase/firestore";
import { db } from "../../firebase";
import { formatCurrency } from "../../utils/formatMoney";

// 99exch / Spribe show "All Bets / My Bets / Top" tabs under the
// flight area so players can see what other people are doing in
// real time. Pure read from aviatorBets — no privacy leak because
// we mask the userId.

const TABS = [
  { id: "all", label: "All Bets" },
  { id: "my",  label: "My Bets"  },
  { id: "top", label: "Top"      },
];

const maskId = (uid) => {
  if (!uid) return "Guest";
  return `User•••${uid.slice(-3).toUpperCase()}`;
};

const fmtTime = (ts) => {
  const d = ts?.toDate?.();
  if (!d) return "";
  return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
};

// Pill colour by cashout multiplier — same scale as the round history strip.
const multBadge = (mult) => {
  if (!Number.isFinite(mult)) return "bg-zinc-700 text-zinc-300";
  if (mult >= 10) return "bg-fuchsia-500 text-white";
  if (mult >= 2)  return "bg-emerald-500 text-black";
  if (mult >= 1.5) return "bg-amber-500 text-black";
  return "bg-rose-600 text-white";
};

function Row({ bet, currentUid }) {
  const isMe = bet.userId === currentUid;
  return (
    <tr className={`border-b border-white/5 ${isMe ? "bg-yellow-400/5" : ""}`}>
      <td className="py-1.5 pl-2 text-[11px] text-gray-300">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {isMe ? <span className="text-yellow-300 font-bold">You</span> : maskId(bet.userId)}
        </span>
      </td>
      <td className="py-1.5 text-[11px] text-gray-400">{fmtTime(bet.createdAt)}</td>
      <td className="py-1.5 text-[11px] text-right">
        {bet.cashoutMultiplier ? (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${multBadge(bet.cashoutMultiplier)}`}>
            {Number(bet.cashoutMultiplier).toFixed(2)}x
          </span>
        ) : <span className="text-gray-500">—</span>}
      </td>
      <td className="py-1.5 pr-2 text-[11px] text-right">
        {bet.won
          ? <span className="text-emerald-300 font-bold">+{formatCurrency(bet.winAmount)}</span>
          : <span className="text-rose-300">−{formatCurrency(bet.betAmount)}</span>}
      </td>
    </tr>
  );
}

export default function AviatorLiveBets({ currentUid }) {
  const [tab, setTab] = useState("all");
  const [allBets, setAllBets] = useState([]);

  // Single subscription — we filter client-side for "My" and "Top" tabs.
  useEffect(() => {
    const q = query(collection(db, "aviatorBets"), orderBy("createdAt", "desc"), limit(80));
    return onSnapshot(q, (snap) => {
      setAllBets(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    }, () => {});
  }, []);

  // Live winners — top horizontal ticker. Subset of allBets filtered
  // to wins; if the user has bets the most recent win stays at the top.
  const winners = useMemo(
    () => allBets.filter((b) => b.won === true).slice(0, 15),
    [allBets]
  );

  // Tab contents.
  const visible = useMemo(() => {
    if (tab === "my")  return allBets.filter((b) => b.userId === currentUid).slice(0, 30);
    if (tab === "top") {
      const today = new Date(); today.setHours(0, 0, 0, 0);
      return [...allBets]
        .filter((b) => {
          const t = b.createdAt?.toDate?.()?.getTime();
          return b.won && Number.isFinite(t) && t >= today.getTime();
        })
        .sort((a, b) => (b.winAmount || 0) - (a.winAmount || 0))
        .slice(0, 30);
    }
    return allBets.slice(0, 30);
  }, [tab, allBets, currentUid]);

  return (
    <div className="space-y-2">
      {/* LIVE WINNERS TICKER — scrolls left-to-right */}
      {winners.length > 0 && (
        <div className="relative overflow-hidden rounded-xl border border-emerald-500/20 bg-emerald-500/5 py-1.5">
          <div className="flex gap-3 animate-marquee whitespace-nowrap px-3">
            {[...winners, ...winners].map((w, i) => (
              <span key={i} className="text-[11px] text-gray-200 inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-emerald-300 font-bold">{maskId(w.userId)}</span>
                <span className="text-gray-400">cashed out at</span>
                <span className={`px-1.5 py-0.5 rounded text-[10px] font-black ${multBadge(w.cashoutMultiplier)}`}>
                  {Number(w.cashoutMultiplier || 0).toFixed(2)}x
                </span>
                <span className="text-emerald-300 font-bold">+{formatCurrency(w.winAmount)}</span>
                <span className="text-gray-700 ml-2">·</span>
              </span>
            ))}
          </div>
          {/* Edge fades */}
          <div className="absolute inset-y-0 left-0 w-8 bg-gradient-to-r from-[#0b0d1a] to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[#0b0d1a] to-transparent pointer-events-none" />
        </div>
      )}

      {/* TABS */}
      <div className="rounded-xl border border-white/5 bg-[#0d1228] overflow-hidden">
        <div className="flex border-b border-white/5">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider transition ${
                tab === t.id ? "bg-yellow-400 text-black" : "text-gray-300 hover:bg-white/5"
              }`}
            >{t.label}</button>
          ))}
        </div>

        <div className="max-h-64 overflow-y-auto">
          <table className="w-full">
            <thead>
              <tr className="text-[9px] uppercase text-gray-500 border-b border-white/5 sticky top-0 bg-[#0d1228]">
                <th className="py-1.5 pl-2 text-left">Player</th>
                <th className="py-1.5 text-left">Time</th>
                <th className="py-1.5 text-right">@</th>
                <th className="py-1.5 pr-2 text-right">Win / Loss</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr><td colSpan="4" className="py-4 text-center text-xs text-gray-500">
                  {tab === "my" ? "Tumne abhi tak bet nahi lagaayi." : "No bets yet."}
                </td></tr>
              ) : visible.map((b) => <Row key={b.id} bet={b} currentUid={currentUid} />)}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
