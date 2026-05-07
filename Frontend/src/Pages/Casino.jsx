import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import Navbar from "../components/Navbar";

// 99exch-style grid of casino tiles. Game definitions are kept here
// so adding a new game is a one-line edit; everything else (filters,
// search, badges) just reads the metadata.
const GAMES = [
  // ── Existing in-house games ─────────────────────────────────
  { id: "aviator",     title: "Aviator",        sub: "Fly & Cash Out",      route: "/aviator",         emoji: "✈️", badge: "Hot",   tag: "crash", live: true  },
  { id: "color",       title: "Color Predict",  sub: "Red · Green · Violet",route: "/colorprediction", emoji: "🎨", badge: "Fast",  tag: "lottery",live: true  },
  { id: "teenpatti",   title: "Teen Patti",     sub: "Player vs Dealer",    route: "/teenpatti",       emoji: "🃏", badge: "Card",  tag: "card",   live: true  },
  { id: "dragontiger", title: "Dragon Tiger",   sub: "Higher card wins",    route: "/dragontiger",     emoji: "🐉", badge: "New",   tag: "card",   live: true  },
  { id: "andarbahar",  title: "Andar Bahar",    sub: "Classic card duel",   route: "/andarbahar",      emoji: "🎴", badge: "Card",  tag: "card",   live: true  },
  { id: "coinflip",    title: "Coin Flip",      sub: "Heads or Tails",      route: "/coinflip",        emoji: "🪙", badge: "Fast",  tag: "fast",   live: true  },
  { id: "diceroll",    title: "Dice Roll",      sub: "Pick 1-6 · 5.5x",      route: "/diceroll",        emoji: "🎲", badge: "Lucky", tag: "fast",   live: true  },
  // ── New 99exch-style games ──────────────────────────────────
  { id: "lucky7",   title: "Lucky 7",   sub: "Low · Equal · High",  route: "/lucky7",   emoji: "7️⃣",  badge: "New",  tag: "card", live: true },
  { id: "32cards",  title: "32 Cards",  sub: "Pick A / B / C / D",  route: "/32cards",  emoji: "♠️",  badge: "New",  tag: "card", live: true },
  { id: "roulette", title: "Roulette",  sub: "European 0-36",       route: "/roulette", emoji: "🎯",  badge: "Hot",  tag: "wheel",live: true },
  { id: "baccarat", title: "Baccarat",  sub: "Player · Banker · Tie",route: "/baccarat", emoji: "🂡",  badge: "VIP",  tag: "card", live: true },
  { id: "mines",    title: "Mines",     sub: "Reveal & cash out",   route: "/mines",    emoji: "💣",  badge: "Hot",  tag: "crash",live: true },
  { id: "plinko",   title: "Plinko",    sub: "Drop · Multiplier",   route: "/plinko",   emoji: "🎰",  badge: "New",  tag: "crash",live: true },
  { id: "hilo",     title: "Hi-Lo",     sub: "Higher or Lower?",    route: "/hilo",     emoji: "📈",  badge: "Fast", tag: "card", live: true },
];

const TAGS = [
  { id: "all",     label: "All Games" },
  { id: "card",    label: "Cards"     },
  { id: "wheel",   label: "Wheel"     },
  { id: "crash",   label: "Crash"     },
  { id: "fast",    label: "Fast"      },
  { id: "lottery", label: "Lottery"   },
];

const BADGE_STYLES = {
  Hot:   "bg-rose-500/90  text-white",
  New:   "bg-emerald-500/90 text-black",
  Fast:  "bg-cyan-400/90 text-black",
  Card:  "bg-yellow-400/90 text-black",
  Lucky: "bg-fuchsia-500/90 text-white",
  VIP:   "bg-amber-500/90 text-black",
};

function GameCard({ game }) {
  return (
    <Link
      to={game.route}
      className="group relative block overflow-hidden rounded-xl border border-white/10 bg-gradient-to-br from-[#0f1733] via-[#0a1227] to-[#070b1e] p-3 shadow-[0_0_0_1px_rgba(120,180,255,0.05)] hover:border-yellow-400/50 hover:shadow-[0_0_28px_-4px_rgba(250,204,21,0.45)] transition-all"
    >
      {/* Glow accent */}
      <div className="pointer-events-none absolute -top-10 -right-10 h-32 w-32 rounded-full bg-yellow-400/10 blur-2xl group-hover:bg-yellow-400/30 transition" />
      <div className="pointer-events-none absolute -bottom-12 -left-8 h-28 w-28 rounded-full bg-cyan-400/10 blur-2xl group-hover:bg-cyan-400/20 transition" />

      <div className="relative flex flex-col items-center text-center">
        <div className="relative mb-2">
          <div className="absolute -inset-1 rounded-2xl bg-gradient-to-br from-yellow-400/30 to-cyan-400/20 blur-md opacity-0 group-hover:opacity-100 transition" />
          <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-[#172044] text-3xl ring-1 ring-white/5">
            {game.emoji}
          </div>
        </div>

        <h3 className="text-[13px] font-bold text-white leading-tight">{game.title}</h3>
        <p className="mt-0.5 text-[10px] text-gray-400 leading-tight">{game.sub}</p>

        <div className="mt-2 flex items-center justify-center gap-1.5">
          {game.live && (
            <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              LIVE
            </span>
          )}
          {game.badge && (
            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded-full ${BADGE_STYLES[game.badge] || "bg-white/10 text-white"}`}>
              {game.badge}
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}

export default function Casino() {
  const [tag, setTag] = useState("all");
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GAMES.filter((g) => (tag === "all" || g.tag === tag) && (
      !q || g.title.toLowerCase().includes(q) || g.sub.toLowerCase().includes(q)
    ));
  }, [tag, search]);

  return (
    <div className="min-h-screen bg-[#05081a] text-white pt-20">
      <Navbar />

      {/* Hero band */}
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-[#0a1745] via-[#08102e] to-[#05081a]" />
        <div className="absolute -top-24 -left-20 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
        <div className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-yellow-400/15 blur-3xl" />
        <div className="absolute bottom-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-yellow-400/40 to-transparent" />

        <div className="relative max-w-7xl mx-auto px-4 py-8 md:py-12">
          <div className="flex items-center gap-3 mb-3">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-[11px] font-black tracking-[0.25em] uppercase text-emerald-300">
              Live Casino
            </span>
          </div>
          <h1 className="text-3xl md:text-5xl font-black bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 bg-clip-text text-transparent">
            CASINO ARENA
          </h1>
          <p className="mt-2 text-sm text-gray-400 max-w-xl">
            Aviator se Roulette tak — 14+ live games, ek hi wallet, instant payouts.
          </p>

          {/* Search */}
          <div className="mt-5 max-w-md">
            <div className="flex items-center gap-2 bg-[#0d1430]/80 border border-white/10 rounded-xl px-3 py-2.5 backdrop-blur">
              <span className="text-gray-400">🔍</span>
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search games…"
                className="flex-1 bg-transparent text-sm text-white placeholder-gray-500 outline-none"
              />
              {search && (
                <button onClick={() => setSearch("")} className="text-gray-500 hover:text-white text-sm">×</button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Tag filters */}
      <div className="sticky top-16 z-20 bg-[#05081a]/85 backdrop-blur border-b border-white/5">
        <div className="max-w-7xl mx-auto px-4 py-3 overflow-x-auto">
          <div className="flex gap-2 whitespace-nowrap">
            {TAGS.map((t) => (
              <button
                key={t.id}
                onClick={() => setTag(t.id)}
                className={`px-4 py-1.5 rounded-full text-xs font-bold uppercase tracking-wider transition ${
                  tag === t.id
                    ? "bg-yellow-400 text-black shadow-[0_0_18px_-2px_rgba(250,204,21,0.6)]"
                    : "bg-[#0d1430] text-gray-300 hover:bg-[#152055] border border-white/5"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Game grid */}
      <div className="max-w-7xl mx-auto px-4 py-6 pb-12">
        {filtered.length === 0 ? (
          <p className="text-center text-gray-400 py-12">No games match your search.</p>
        ) : (
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-7 gap-3">
            {filtered.map((g) => <GameCard key={g.id} game={g} />)}
          </div>
        )}

        <div className="mt-10 text-center text-[10px] uppercase tracking-[0.25em] text-gray-600">
          Play responsibly · 18+ only
        </div>
      </div>
    </div>
  );
}
