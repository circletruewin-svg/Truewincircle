import React from 'react'
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
