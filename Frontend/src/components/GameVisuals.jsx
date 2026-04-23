import React from "react";

export function AviatorPlane({ className = "" }) {
  return (
    <div className={`relative ${className}`}>
      <svg viewBox="0 0 260 140" className="h-full w-full drop-shadow-[0_6px_18px_rgba(0,0,0,0.55)]">
        <defs>
          <linearGradient id="fuselage" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f5f7fa" />
            <stop offset="55%" stopColor="#d6dde5" />
            <stop offset="100%" stopColor="#8892a1" />
          </linearGradient>
          <linearGradient id="stripe" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#ef4444" />
            <stop offset="100%" stopColor="#b91c1c" />
          </linearGradient>
          <linearGradient id="wingShade" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#e5ebf2" />
            <stop offset="100%" stopColor="#9aa5b2" />
          </linearGradient>
          <radialGradient id="propDisc" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="rgba(255,255,255,0.85)" />
            <stop offset="40%" stopColor="rgba(220,230,240,0.25)" />
            <stop offset="100%" stopColor="rgba(220,230,240,0)" />
          </radialGradient>
        </defs>

        {/* tail fin */}
        <path d="M36 66 L24 34 L44 40 L56 66 Z" fill="url(#wingShade)" stroke="#55606e" strokeWidth="0.8" />
        {/* horizontal stabilizer */}
        <path d="M28 70 L8 72 L12 82 L36 82 Z" fill="url(#wingShade)" stroke="#55606e" strokeWidth="0.8" />

        {/* fuselage */}
        <path d="M40 72 C 60 60, 120 58, 170 62 C 198 64, 220 70, 236 78 C 220 88, 196 92, 170 92 C 120 94, 60 90, 40 82 Z" fill="url(#fuselage)" stroke="#4b5563" strokeWidth="0.9" />

        {/* red racing stripe */}
        <path d="M56 78 C 96 74, 160 74, 218 80 L 218 84 C 160 78, 96 78, 56 82 Z" fill="url(#stripe)" />

        {/* wing (behind fuselage, rendered after for visibility) */}
        <path d="M96 82 L70 112 L132 98 L178 86 Z" fill="url(#wingShade)" stroke="#55606e" strokeWidth="0.8" />
        <path d="M96 78 L86 52 L148 66 L178 76 Z" fill="url(#wingShade)" stroke="#55606e" strokeWidth="0.8" opacity="0.95" />

        {/* cockpit canopy */}
        <path d="M132 64 C 148 52, 176 54, 184 66 L 180 72 C 170 64, 148 62, 134 70 Z" fill="#1e3a8a" opacity="0.85" />
        <path d="M136 66 C 150 58, 172 58, 180 68" fill="none" stroke="#93c5fd" strokeWidth="0.8" opacity="0.6" />

        {/* nose cone */}
        <path d="M230 74 C 244 76, 252 80, 244 86 C 238 88, 232 84, 230 82 Z" fill="#dc2626" stroke="#7f1d1d" strokeWidth="0.8" />

        {/* propeller spinner */}
        <circle cx="246" cy="80" r="3" fill="#1f2937" />

        {/* spinning propeller disc (motion blur) */}
        <g style={{ transformOrigin: "246px 80px" }} className="origin-center animate-[spin_0.25s_linear_infinite]">
          <ellipse cx="246" cy="80" rx="4" ry="22" fill="url(#propDisc)" opacity="0.9" />
        </g>

        {/* window glints */}
        <circle cx="154" cy="66" r="1.6" fill="#bfdbfe" opacity="0.9" />
        <circle cx="166" cy="66" r="1.6" fill="#bfdbfe" opacity="0.9" />
      </svg>
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
