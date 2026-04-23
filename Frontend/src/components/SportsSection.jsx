import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { collection, onSnapshot, query, where, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";

// Compact sports section shown at the top of Home (Section #1).
// Lists the next 3 upcoming cricket matches and deep-links users to the
// full /sports page for full odds + bet placement.
export default function SportsSection() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = query(
      collection(db, "matches"),
      where("status", "==", "upcoming"),
      orderBy("startTime", "asc"),
      limit(3)
    );
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const fmtTime = (ts) => {
    const d = ts?.toDate?.();
    if (!d) return "";
    return d.toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <section className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-black text-[#042346]">🏏 Cricket Betting</h2>
          <p className="text-xs text-gray-500">IPL & all cricket matches</p>
        </div>
        <Link to="/sports" className="text-xs font-bold text-yellow-600 hover:text-yellow-700">
          View all →
        </Link>
      </div>

      {loading ? (
        <div className="bg-white rounded-xl border border-gray-200 p-4 text-center text-sm text-gray-500">
          Loading…
        </div>
      ) : matches.length === 0 ? (
        <Link to="/sports" className="block bg-gradient-to-r from-emerald-600 to-blue-700 rounded-xl p-4 text-white shadow">
          <div className="flex items-center justify-between">
            <div>
              <p className="font-bold">No matches listed yet</p>
              <p className="text-xs text-emerald-100 opacity-90">Tap to check for new IPL fixtures.</p>
            </div>
            <span className="text-2xl">🏏</span>
          </div>
        </Link>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {matches.map((m) => {
            const oddsA = m.odds?.winner?.A;
            const oddsB = m.odds?.winner?.B;
            return (
              <Link
                key={m.id}
                to="/sports"
                className="block bg-white rounded-xl border border-gray-200 hover:border-yellow-400 hover:shadow-md transition p-3"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] uppercase tracking-widest text-emerald-700 font-bold">
                    {m.matchType || "T20"}
                  </span>
                  <span className="text-[10px] text-gray-500">{fmtTime(m.startTime)}</span>
                </div>
                <div className="text-sm font-bold text-[#042346] mb-2">
                  {m.teamA?.short || m.teamA?.name}
                  <span className="text-yellow-500 mx-1">vs</span>
                  {m.teamB?.short || m.teamB?.name}
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="bg-emerald-50 rounded-md py-1 text-center">
                    <div className="text-[10px] text-gray-500">{m.teamA?.short || "A"}</div>
                    <div className="text-sm font-black text-emerald-800">{oddsA ? `${Number(oddsA).toFixed(2)}x` : "—"}</div>
                  </div>
                  <div className="bg-blue-50 rounded-md py-1 text-center">
                    <div className="text-[10px] text-gray-500">{m.teamB?.short || "B"}</div>
                    <div className="text-sm font-black text-blue-800">{oddsB ? `${Number(oddsB).toFixed(2)}x` : "—"}</div>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </section>
  );
}
