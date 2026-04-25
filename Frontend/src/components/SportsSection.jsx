import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

// Full-width prominent cricket section for the Home page.
// This is the platform's headline product during IPL season so the
// styling is intentionally large, dark and attention-grabbing.
export default function SportsSection() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("status", "==", "upcoming"),
      orderBy("startTime", "asc"),
      limit(6)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      () => setLoading(false)
    );
    return () => unsub();
  }, []);

  const fmtTime = (ts) => {
    const d = ts?.toDate?.();
    if (!d) return "";
    return d.toLocaleString("en-IN", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <section className="relative mb-8 -mx-4 md:-mx-6 overflow-hidden">
      {/* Stadium-style gradient backdrop */}
      <div className="relative bg-gradient-to-br from-[#07224a] via-[#0a3d2f] to-[#042346] px-4 md:px-8 py-6 md:py-8 border-y-2 border-yellow-500/40 shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
        {/* Decorative glow */}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(234,179,8,0.15),transparent_40%),radial-gradient(circle_at_80%_80%,rgba(16,185,129,0.12),transparent_40%)] pointer-events-none" />
        {/* Subtle stadium line pattern */}
        <div className="absolute inset-0 bg-[linear-gradient(90deg,transparent_98%,rgba(255,255,255,0.04)_98%)] bg-[length:40px_40px] pointer-events-none" />

        <div className="relative max-w-7xl mx-auto">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-yellow-500/20 border-2 border-yellow-400 flex items-center justify-center text-3xl">
                🏏
              </div>
              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-2xl md:text-3xl font-black text-white tracking-tight">
                    CRICKET BETTING
                  </h2>
                  <span className="relative inline-flex items-center gap-1 bg-red-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
                    <span className="relative flex h-1.5 w-1.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                      <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-white" />
                    </span>
                    LIVE
                  </span>
                </div>
                <p className="text-xs md:text-sm text-emerald-200">
                  IPL & all cricket matches · Bet on Winner, Toss, Runs, Top Batsman
                </p>
              </div>
            </div>
            <Link
              to="/sports"
              className="hidden md:inline-flex items-center gap-1 bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-sm px-4 py-2 rounded-lg transition"
            >
              View all matches →
            </Link>
          </div>

          {/* Matches */}
          {loading ? (
            <div className="bg-white/5 border border-white/10 rounded-2xl p-10 text-center">
              <p className="text-gray-300">Loading matches…</p>
            </div>
          ) : matches.length === 0 ? (
            <Link
              to="/sports"
              className="block bg-gradient-to-r from-emerald-700 via-emerald-600 to-teal-600 rounded-2xl p-6 md:p-8 shadow-lg border border-emerald-400/30 hover:border-yellow-400 transition group"
            >
              <div className="flex items-center justify-between flex-wrap gap-4">
                <div>
                  <p className="text-yellow-300 text-xs font-bold uppercase tracking-widest mb-1">
                    COMING SOON
                  </p>
                  <h3 className="text-2xl md:text-3xl font-black text-white mb-1">
                    Next cricket fixtures loading soon
                  </h3>
                  <p className="text-emerald-100 text-sm md:text-base">
                    Live odds on every IPL match. Match winner, toss, total runs, top batsman.
                  </p>
                </div>
                <div className="text-6xl md:text-7xl opacity-70 group-hover:scale-110 transition-transform">
                  🏏
                </div>
              </div>
              <div className="mt-4 inline-flex items-center gap-1 bg-yellow-500 text-black font-bold text-sm px-4 py-2 rounded-lg">
                Open Cricket Arena →
              </div>
            </Link>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {matches.slice(0, 3).map((m) => {
                  const oddsA = m.odds?.winner?.A;
                  const oddsB = m.odds?.winner?.B;
                  const tossA = m.odds?.toss?.A;
                  const totalLine = m.odds?.total?.line;
                  const batsmenCount = (m.odds?.topBatsman || []).length;
                  return (
                    <Link
                      key={m.id}
                      to="/sports"
                      className="relative block bg-gradient-to-br from-[#0a2d55] to-[#042346] rounded-2xl border-2 border-white/10 hover:border-yellow-400 hover:shadow-[0_0_30px_rgba(234,179,8,0.25)] transition p-4 overflow-hidden"
                    >
                      {/* Top ribbon */}
                      <div className="flex items-center justify-between mb-3">
                        <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-widest">
                          🏏 {m.matchType || "T20"}
                        </span>
                        <span className="text-xs text-gray-300 font-semibold">
                          {fmtTime(m.startTime)}
                        </span>
                      </div>

                      {/* Teams */}
                      <div className="text-center mb-4">
                        <div className="text-xl md:text-2xl font-black text-white leading-tight">
                          {m.teamA?.short || m.teamA?.name}
                        </div>
                        <div className="text-yellow-400 text-xs font-bold my-0.5 tracking-widest">
                          VS
                        </div>
                        <div className="text-xl md:text-2xl font-black text-white leading-tight">
                          {m.teamB?.short || m.teamB?.name}
                        </div>
                      </div>

                      {/* Winner odds */}
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-gradient-to-br from-emerald-700 to-emerald-900 rounded-lg py-2 px-3 text-center">
                          <div className="text-[10px] text-emerald-200 font-semibold uppercase">
                            {m.teamA?.short || "A"} Win
                          </div>
                          <div className="text-lg font-black text-yellow-300">
                            {oddsA ? `${Number(oddsA).toFixed(2)}x` : "—"}
                          </div>
                        </div>
                        <div className="bg-gradient-to-br from-blue-700 to-blue-900 rounded-lg py-2 px-3 text-center">
                          <div className="text-[10px] text-blue-200 font-semibold uppercase">
                            {m.teamB?.short || "B"} Win
                          </div>
                          <div className="text-lg font-black text-yellow-300">
                            {oddsB ? `${Number(oddsB).toFixed(2)}x` : "—"}
                          </div>
                        </div>
                      </div>

                      {/* Additional bet types pill */}
                      <div className="flex flex-wrap gap-1.5 mb-3">
                        {tossA && (
                          <span className="text-[10px] bg-white/5 border border-white/10 text-gray-200 px-2 py-0.5 rounded-full">
                            Toss
                          </span>
                        )}
                        {totalLine != null && (
                          <span className="text-[10px] bg-white/5 border border-white/10 text-gray-200 px-2 py-0.5 rounded-full">
                            Over/Under {totalLine}
                          </span>
                        )}
                        {batsmenCount > 0 && (
                          <span className="text-[10px] bg-white/5 border border-white/10 text-gray-200 px-2 py-0.5 rounded-full">
                            Top Batsman ({batsmenCount})
                          </span>
                        )}
                      </div>

                      {/* CTA */}
                      <div className="bg-yellow-500 hover:bg-yellow-400 text-black text-sm font-black text-center rounded-lg py-2 transition">
                        Place Bet →
                      </div>
                    </Link>
                  );
                })}
              </div>

              {/* Mobile "View all" button (desktop has it in header) */}
              <div className="mt-4 md:hidden">
                <Link
                  to="/sports"
                  className="block bg-yellow-500 hover:bg-yellow-400 text-black font-bold text-center py-3 rounded-lg"
                >
                  View all {matches.length} matches →
                </Link>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
