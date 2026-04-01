import { useNavigate } from 'react-router-dom';

const GAMES = [
  { label:"Aviator",       emoji:"✈️",  desc:"Fly & Cash Out",     bg:"from-sky-950 to-blue-900",    border:"border-sky-600",    badge:"🔥 HOT",   badgeC:"bg-red-600",    path:"/aviator"           },
  { label:"Color Predict", emoji:"🎨",  desc:"Red Green Violet",   bg:"from-indigo-950 to-purple-900",border:"border-purple-600", badge:"⚡ FAST",  badgeC:"bg-purple-700", path:"/color-prediction"  },
  { label:"Teen Patti",    emoji:"🃏",  desc:"Player vs Dealer",   bg:"from-green-950 to-emerald-900",border:"border-green-600",  badge:"♠ CARD",   badgeC:"bg-green-700",  path:"/teen-patti"        },
  { label:"Dragon Tiger",  emoji:"🐉",  desc:"Dragon vs Tiger",    bg:"from-red-950 to-orange-900",   border:"border-red-600",    badge:"🆕 NEW",   badgeC:"bg-orange-600", path:"/dragon-tiger"      },
  { label:"Andar Bahar",   emoji:"🎴",  desc:"Andar ya Bahar?",    bg:"from-purple-950 to-pink-900",  border:"border-pink-600",   badge:"♠ CARD",   badgeC:"bg-pink-700",   path:"/andar-bahar"       },
  { label:"Coin Flip",     emoji:"🪙",  desc:"Heads or Tails",     bg:"from-yellow-950 to-amber-900", border:"border-yellow-600", badge:"⚡ FAST",  badgeC:"bg-yellow-600", path:"/coin-flip"         },
  { label:"Dice Roll",     emoji:"🎲",  desc:"Pick 1-6, Win 5.5x", bg:"from-gray-900 to-slate-800",   border:"border-gray-500",   badge:"🎯 LUCKY", badgeC:"bg-gray-600",   path:"/dice-roll"         },
  { label:"1-12 Win",      emoji:"🔢",  desc:"Bet on a number",    bg:"from-teal-950 to-cyan-900",    border:"border-teal-600",   badge:"📈 WIN",   badgeC:"bg-teal-600",   path:"/wingame"           },
];

const LiveGamesGrid = () => {
  const navigate = useNavigate();
  return (
    <div className="px-3 py-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-black text-white tracking-wide">🎮 Live Casino Games</h2>
        <span className="text-xs text-green-400 font-bold animate-pulse">● LIVE</span>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {GAMES.map((game) => (
          <button
            key={game.path}
            onClick={() => navigate(game.path)}
            className={`relative bg-gradient-to-br ${game.bg} border ${game.border}
              rounded-2xl p-4 text-left hover:scale-[1.03] active:scale-[0.97]
              transition-all duration-150 shadow-xl overflow-hidden`}
          >
            <span className={`absolute top-2 right-2 ${game.badgeC} text-white text-[9px] font-black px-1.5 py-0.5 rounded-full`}>
              {game.badge}
            </span>
            <div className="text-4xl mb-2 drop-shadow">{game.emoji}</div>
            <div className="text-white font-bold text-sm leading-tight">{game.label}</div>
            <div className="text-gray-400 text-xs mt-0.5">{game.desc}</div>
          </button>
        ))}
      </div>
    </div>
  );
};

export default LiveGamesGrid;
