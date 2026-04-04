import React from "react";

export function AviatorPlane({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 240 120" className="h-full w-full drop-shadow-[0_0_18px_rgba(255,61,113,0.45)]">
        <defs>
          <linearGradient id="planeBody" x1="0%" x2="100%">
            <stop offset="0%" stopColor="#ff4477" />
            <stop offset="100%" stopColor="#c1124f" />
          </linearGradient>
        </defs>
        <path d="M28 72 L112 58 L168 58 L196 34 L214 40 L188 64 L204 76 L188 84 L160 72 L118 74 L84 92 L58 92 L82 72 L28 72 Z" fill="url(#planeBody)" />
        <path d="M90 54 L126 28 L138 30 L118 56 Z" fill="#ff6a93" />
        <path d="M104 72 L144 96 L124 96 L88 78 Z" fill="#ff6a93" />
        <circle cx="203" cy="58" r="10" fill="#101828" stroke="#ff8cb1" strokeWidth="3" />
        <circle cx="61" cy="70" r="5" fill="#991b3f" />
        <text x="130" y="69" textAnchor="middle" fontSize="18" fontWeight="900" fill="#2b0014">X</text>
      </svg>
      <div className="absolute right-3 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full border border-rose-200/40 bg-white/10 animate-spin">
        <span className="absolute h-[2px] w-7 bg-rose-100/90" />
        <span className="absolute h-7 w-[2px] bg-rose-100/90" />
      </div>
    </div>
  );
}

export function CoinToken({ side, className = "" }) {
  const isHeads = side === "heads";

  return (
    <div
      className={`relative flex items-center justify-center rounded-full border-4 ${
        isHeads
          ? "border-yellow-300 bg-[radial-gradient(circle_at_30%_30%,#fde68a,#d97706_70%)]"
          : "border-slate-300 bg-[radial-gradient(circle_at_30%_30%,#e2e8f0,#475569_70%)]"
      } ${className}`}
    >
      <div className="absolute inset-2 rounded-full border border-white/30" />
      <span className="text-2xl font-black text-white drop-shadow-md">{isHeads ? "H" : "T"}</span>
    </div>
  );
}

export function CardBack({ className = "" }) {
  return (
    <div className={`relative overflow-hidden rounded-xl border border-sky-300/40 bg-[linear-gradient(145deg,#0f3d8a,#1d4ed8,#0f172a)] ${className}`}>
      <div className="absolute inset-2 rounded-lg border border-white/15" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,#60a5fa55,transparent_45%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(135deg,transparent_20%,rgba(255,255,255,0.06)_20%,rgba(255,255,255,0.06)_23%,transparent_23%,transparent_43%,rgba(255,255,255,0.06)_43%,rgba(255,255,255,0.06)_46%,transparent_46%)]" />
      <div className="absolute inset-0 flex items-center justify-center text-xs font-black tracking-[0.35em] text-sky-100">TWC</div>
    </div>
  );
}

export function DragonTigerBadge({ side, className = "" }) {
  const isDragon = side === "dragon";

  return (
    <div
      className={`relative flex items-center justify-center rounded-2xl border ${
        isDragon
          ? "border-red-400/40 bg-[radial-gradient(circle_at_top,#ef444455,transparent_50%),linear-gradient(135deg,#3f0b12,#111827)]"
          : "border-blue-400/40 bg-[radial-gradient(circle_at_top,#3b82f655,transparent_50%),linear-gradient(135deg,#0f1b3d,#111827)]"
      } ${className}`}
    >
      <span className={`text-3xl font-black tracking-[0.2em] ${isDragon ? "text-red-200" : "text-blue-200"}`}>
        {isDragon ? "DR" : "TG"}
      </span>
    </div>
  );
}

export function JokerBadge({ className = "" }) {
  return (
    <div className={`relative flex items-center justify-center rounded-2xl border border-yellow-300/50 bg-[radial-gradient(circle_at_top,#fde04755,transparent_45%),linear-gradient(160deg,#312e81,#0f172a)] ${className}`}>
      <div className="absolute inset-2 rounded-xl border border-white/15" />
      <span className="text-sm font-black tracking-[0.25em] text-yellow-100">JOKER</span>
    </div>
  );
}

export function DiceFace({ value, className = "" }) {
  const dotMap = {
    1: [[50, 50]],
    2: [[30, 30], [70, 70]],
    3: [[30, 30], [50, 50], [70, 70]],
    4: [[30, 30], [70, 30], [30, 70], [70, 70]],
    5: [[30, 30], [70, 30], [50, 50], [30, 70], [70, 70]],
    6: [[30, 28], [70, 28], [30, 50], [70, 50], [30, 72], [70, 72]],
  };

  return (
    <svg viewBox="0 0 100 100" className={className}>
      <rect x="10" y="10" width="80" height="80" rx="18" fill="white" stroke="#e2e8f0" strokeWidth="6" />
      {(dotMap[value] || []).map(([x, y], index) => (
        <circle key={index} cx={x} cy={y} r="7" fill="#111827" />
      ))}
    </svg>
  );
}

export function ColorOrb({ color, className = "" }) {
  const config = {
    red: "from-red-300 via-red-500 to-red-800",
    green: "from-emerald-300 via-emerald-500 to-emerald-800",
    violet: "from-fuchsia-300 via-violet-500 to-violet-800",
  };

  return (
    <div className={`relative rounded-full bg-gradient-to-br ${config[color]} shadow-[inset_0_10px_18px_rgba(255,255,255,0.18),0_8px_20px_rgba(15,23,42,0.45)] ${className}`}>
      <div className="absolute inset-[18%] rounded-full border border-white/25" />
    </div>
  );
}
