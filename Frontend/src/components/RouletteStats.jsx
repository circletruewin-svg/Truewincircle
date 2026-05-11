import { useMemo } from "react";

const RED = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const colorOf = (n) => (n === 0 ? "green" : RED.has(n) ? "red" : "black");

// Side panel that mirrors the "statistics" widget Evolution / 99exch
// show next to a roulette table. Pulls everything from the recent
// numbers slice the parent already subscribes to.

export default function RouletteStats({ recent }) {
  const stats = useMemo(() => {
    const empty = {
      total: 0,
      red: 0, black: 0, green: 0,
      even: 0, odd: 0,
      low: 0, high: 0,
      hot: [], cold: [],
    };
    if (!Array.isArray(recent) || recent.length === 0) return empty;

    const freq = new Map();
    for (let n = 0; n <= 36; n++) freq.set(n, 0);

    const out = { ...empty, total: recent.length };
    for (const n of recent) {
      if (!Number.isFinite(n)) continue;
      freq.set(n, (freq.get(n) || 0) + 1);
      const c = colorOf(n);
      if (c === "red")   out.red += 1;
      if (c === "black") out.black += 1;
      if (c === "green") out.green += 1;
      if (n === 0) continue;
      if (n % 2 === 0) out.even += 1; else out.odd += 1;
      if (n <= 18)     out.low += 1;  else out.high += 1;
    }

    const sortedByFreq = [...freq.entries()].sort((a, b) => b[1] - a[1]);
    out.hot  = sortedByFreq.slice(0, 4).filter(([, c]) => c > 0).map(([n, c]) => ({ n, c }));
    out.cold = sortedByFreq.slice(-4).reverse().map(([n, c]) => ({ n, c }));
    return out;
  }, [recent]);

  // Render a horizontal bar that splits two counts visually.
  const Split = ({ leftLabel, leftCount, leftColor, rightLabel, rightCount, rightColor }) => {
    const total = leftCount + rightCount || 1;
    const lp = Math.round((leftCount / total) * 100);
    return (
      <div className="text-[10px]">
        <div className="flex items-center justify-between mb-1 text-gray-300">
          <span>{leftLabel} <span className="text-white font-bold">{leftCount}</span></span>
          <span>{rightLabel} <span className="text-white font-bold">{rightCount}</span></span>
        </div>
        <div className="flex h-1.5 rounded-full overflow-hidden border border-white/5">
          <div className={leftColor}  style={{ width: `${lp}%`  }} />
          <div className={rightColor} style={{ width: `${100 - lp}%` }} />
        </div>
      </div>
    );
  };

  const NumberPill = ({ n, count, dim }) => (
    <div className="flex flex-col items-center">
      <span className={`w-7 h-7 rounded-full flex items-center justify-center text-[11px] font-bold ${
        colorOf(n) === "red" ? "bg-rose-700" :
        colorOf(n) === "black" ? "bg-zinc-900 border border-white/10" :
        "bg-emerald-700"
      } ${dim ? "opacity-60" : ""}`}>{n}</span>
      <span className="text-[9px] text-gray-500 mt-0.5">{count}×</span>
    </div>
  );

  return (
    <div className="rounded-2xl border border-white/5 bg-[#0d1228] p-3 space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-[10px] uppercase tracking-widest text-gray-400 font-bold">Statistics</p>
        <span className="text-[9px] text-gray-500">last {stats.total} spins</span>
      </div>

      {/* Hot numbers */}
      <div>
        <p className="text-[10px] text-rose-300 mb-1.5">🔥 Hot</p>
        <div className="flex gap-2 justify-around">
          {stats.hot.length === 0 ? (
            <span className="text-[10px] text-gray-500">No data yet.</span>
          ) : stats.hot.map((h) => <NumberPill key={h.n} n={h.n} count={h.c} />)}
        </div>
      </div>

      {/* Cold numbers */}
      <div>
        <p className="text-[10px] text-cyan-300 mb-1.5">❄️ Cold</p>
        <div className="flex gap-2 justify-around">
          {stats.cold.length === 0 ? (
            <span className="text-[10px] text-gray-500">No data yet.</span>
          ) : stats.cold.map((h) => <NumberPill key={h.n} n={h.n} count={h.c} dim />)}
        </div>
      </div>

      {/* Distributions */}
      <div className="space-y-2 pt-1 border-t border-white/5">
        <Split
          leftLabel="RED" leftCount={stats.red} leftColor="bg-rose-600"
          rightLabel="BLACK" rightCount={stats.black} rightColor="bg-zinc-700"
        />
        <Split
          leftLabel="EVEN" leftCount={stats.even} leftColor="bg-indigo-500"
          rightLabel="ODD" rightCount={stats.odd} rightColor="bg-amber-500"
        />
        <Split
          leftLabel="1-18" leftCount={stats.low} leftColor="bg-cyan-500"
          rightLabel="19-36" rightCount={stats.high} rightColor="bg-fuchsia-500"
        />
        {stats.green > 0 && (
          <p className="text-[10px] text-emerald-300 text-center pt-1">0 came up <b>{stats.green}×</b></p>
        )}
      </div>
    </div>
  );
}
