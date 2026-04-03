import React from 'react';
import { Link } from 'react-router-dom';

const games = [
  {
    title: 'Aviator',
    subtitle: 'Fly & Cash Out',
    route: '/aviator',
    emoji: '✈️',
    badge: 'Hot',
    accent: 'from-[#1f4b99] via-[#23447f] to-[#16263f]',
  },
  {
    title: 'Color Predict',
    subtitle: 'Red Green Violet',
    route: '/colorprediction',
    emoji: '🎨',
    badge: 'Fast',
    accent: 'from-[#58228d] via-[#4b237b] to-[#2e154a]',
  },
  {
    title: 'Teen Patti',
    subtitle: 'Player vs Dealer',
    route: '/teenpatti',
    emoji: '🃏',
    badge: 'Card',
    accent: 'from-[#0a6b4b] via-[#0c543c] to-[#083226]',
  },
  {
    title: 'Dragon Tiger',
    subtitle: 'Dragon vs Tiger',
    route: '/dragontiger',
    emoji: '🐉',
    badge: 'New',
    accent: 'from-[#8f2d16] via-[#6e1e14] to-[#43140d]',
  },
  {
    title: 'Andar Bahar',
    subtitle: 'Classic card action',
    route: '/andarbahar',
    emoji: '🎴',
    badge: 'Card',
    accent: 'from-[#8e1e70] via-[#6d1654] to-[#3c0d2f]',
  },
  {
    title: 'Coin Flip',
    subtitle: 'Heads or Tails',
    route: '/coinflip',
    emoji: '🪙',
    badge: 'Fast',
    accent: 'from-[#9f4d12] via-[#7a370c] to-[#482007]',
  },
  {
    title: 'Dice Roll',
    subtitle: 'Pick 1-6, Win 5.5x',
    route: '/diceroll',
    emoji: '🎲',
    badge: 'Lucky',
    accent: 'from-[#2a364b] via-[#1d2838] to-[#121926]',
  },
];

export default function LiveCasinoSection() {
  return (
    <section className="mx-auto mt-10 w-full max-w-7xl px-4 md:px-6">
      <div className="relative overflow-hidden rounded-[28px] border border-[#0d3b6d]/15 bg-white shadow-lg">
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-r from-[#08213e] via-[#0b2c53] to-[#08213e]" />
        <div className="absolute right-[-6rem] top-[-5rem] h-40 w-40 rounded-full bg-yellow-400/15 blur-3xl" />
        <div className="absolute left-[-4rem] top-24 h-32 w-32 rounded-full bg-cyan-400/10 blur-3xl" />

        <div className="relative px-5 pb-6 pt-8 md:px-8">
          <div className="mx-auto mb-8 flex w-fit items-center gap-3 rounded-full border border-white/10 bg-[#072548] px-5 py-2 shadow-lg">
            <span className="inline-flex h-2.5 w-2.5 animate-pulse rounded-full bg-green-400" />
            <span className="text-sm font-black uppercase tracking-[0.22em] text-yellow-400">Live Casino</span>
          </div>

          <div className="mb-8 text-center">
            <h2 className="text-2xl font-black text-[#0a2342] md:text-3xl">Quick Play Casino Games</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm text-slate-600 md:text-base">
              Yeh section market cards se alag hai. Fast casino-style games ek dedicated block me grouped hain for quick access.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            {games.map((game, index) => (
              <div
                key={game.title}
                className="animate-[fadeInUp_0.45s_ease-out_both]"
                style={{ animationDelay: `${index * 80}ms` }}
              >
                <Link
                  to={game.route}
                  className={`group block min-h-[120px] overflow-hidden rounded-[22px] border border-white/20 bg-gradient-to-r ${game.accent} p-[1px] shadow-md transition-transform duration-300 hover:-translate-y-1`}
                >
                  <div className="relative flex h-full min-h-[118px] items-center justify-between overflow-hidden rounded-[21px] bg-black/10 px-5 py-5 backdrop-blur-sm">
                    <div className="absolute inset-y-0 right-[-2rem] w-28 rotate-12 bg-white/5 blur-2xl transition-transform duration-500 group-hover:translate-x-4" />
                    <div className="relative flex items-center gap-4">
                      <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-white/12 text-3xl shadow-inner">
                        {game.emoji}
                      </div>
                      <div>
                        <h3 className="text-xl font-black text-white">{game.title}</h3>
                        <p className="mt-1 text-sm text-white/75">{game.subtitle}</p>
                      </div>
                    </div>

                    <div className="relative flex flex-col items-end gap-6">
                      <span className="rounded-full bg-white/14 px-3 py-1 text-xs font-bold uppercase tracking-[0.15em] text-white/90">
                        {game.badge}
                      </span>
                      <span className="text-sm font-semibold text-white/80 transition-transform duration-300 group-hover:translate-x-1">
                        Play Now
                      </span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

