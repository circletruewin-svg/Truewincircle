import React from 'react'
import { Link } from 'react-router-dom'
import NextResultTimer from '../components/NextResultTimer'
import LiveBettingHighlights from '../components/LiveSlider'
import CasinoRoulette from './SpinWheel'
import Footer from '../components/Footer'
import MarketCard from '../components/Cards.jsx/MarketCard'
import Carousel from '../components/Carousel'
import Marquee from '../components/Marquee'
import SocialButtons from '../components/Soical'
import WinGame from './WinGame'
import LiveCasinoSection from '../components/LiveCasinoSection'
import SportsSection from '../components/SportsSection'

const Home = () => {
  return (
    <div className='bg-slate-50 pt-20'>
      <Marquee/>
      <Carousel/>
      <SocialButtons/>

      <div className='mx-auto max-w-7xl px-4 md:px-6'>
        <NextResultTimer/>
        <LiveBettingHighlights/>
      </div>

      {/* Section 1 — Cricket (IPL first, full-width prominent section) */}
      <div className='mx-auto max-w-7xl px-4 md:px-6'>
        <SportsSection />
      </div>

      <div className='mx-auto max-w-7xl px-4 md:px-6'>
        {/* Section 2 — Gali / Disawar markets */}
        <div className='mb-5'><MarketCard marketName="GALI" openTime="03:00 PM" closeTime="08:40 PM" /></div>
        <div className='mb-5'><MarketCard marketName="DELHI BAZAAR" openTime="08:00 PM" closeTime="06:40 PM" /></div>
        <div className='mb-5'><MarketCard marketName="SHREE GANESH" openTime="12:00 PM" closeTime="08:00 PM" /></div>
        <div className='mb-5'><MarketCard marketName="FARIDABAD" openTime="03:00 PM" closeTime="08:40 PM" /></div>
        <div className='mb-5'><MarketCard marketName="MATKA MANDI" openTime="11:00 PM" closeTime="05:40 PM" /></div>
        <div className='mb-5'><MarketCard marketName="GHAZIABAD" openTime="03:00 PM" closeTime="08:40 PM" /></div>
        <div className='mb-5'><MarketCard marketName="DISAWAR" openTime="03:00 PM" closeTime="08:40 PM" /></div>
      </div>

      {/* Casino Arena entry — 99exch-style hub */}
      <div className='mx-auto max-w-7xl px-4 md:px-6 mt-8'>
        <Link
          to="/casino"
          className="relative block overflow-hidden rounded-2xl border border-yellow-400/30 bg-gradient-to-r from-[#08102e] via-[#1a0d3a] to-[#08102e] p-5 shadow-[0_0_40px_-12px_rgba(250,204,21,0.4)] hover:shadow-[0_0_60px_-8px_rgba(250,204,21,0.6)] transition-shadow"
        >
          <div className="absolute -top-12 -right-10 h-40 w-40 rounded-full bg-yellow-400/20 blur-3xl" />
          <div className="absolute -bottom-14 -left-10 h-40 w-40 rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="relative flex items-center justify-between gap-4">
            <div>
              <p className="text-[10px] uppercase tracking-[0.25em] text-emerald-300 font-bold mb-1">● LIVE CASINO</p>
              <h2 className="text-2xl md:text-3xl font-black bg-gradient-to-r from-yellow-300 via-amber-200 to-yellow-400 bg-clip-text text-transparent">
                Casino Arena
              </h2>
              <p className="text-xs text-gray-300 mt-1">Aviator · Roulette · Mines · Plinko · Lucky 7 · Baccarat · 14+ games</p>
            </div>
            <div className="hidden sm:flex items-center gap-2 bg-yellow-400 text-black font-black px-4 py-2 rounded-full text-sm">
              ENTER →
            </div>
          </div>
        </Link>
      </div>

      {/* Section 3 — Live casino */}
      <LiveCasinoSection />

      <div className='mx-auto max-w-7xl px-4 pb-10 md:px-6'>
        <WinGame/>
        <CasinoRoulette/>
      </div>

      <Footer/>
    </div>
  )
}

export default Home
