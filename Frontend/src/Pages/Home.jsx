import React from 'react'
import { useNavigate } from 'react-router-dom'
import Navbar from '../components/Navbar'
import FixNumber from './FixNumber'
import NextResultTimer from '../components/NextResultTimer'
import LiveBettingHighlights from '../components/LiveSlider'
import CasinoRoulette from './SpinWheel'
import Footer from '../components/Footer'
import MarketCard from '../components/Cards.jsx/MarketCard'
import Carousel from '../components/Carousel'
import Marquee from '../components/Marquee'
import SocialButtons from '../components/Soical'
import WinGame from './WinGame'
import LiveGamesGrid from '../components/LiveGamesGrid'

const Home = () => {
  return (
    <div className='pt-20'>
      <Marquee/>
      <Carousel/>
      <SocialButtons/>
      <NextResultTimer/>
      <LiveBettingHighlights/>
      <div className='mb-5'><MarketCard marketName="GHAZIABAD"    openTime="03:00 PM" closeTime="08:40 PM" /></div>
      <div className='mb-5'><MarketCard marketName="DELHI BAZAAR" openTime="08:00 PM" closeTime="06:40 PM" /></div>
      <div className='mb-5'><MarketCard marketName="GALI"         openTime="03:00 PM" closeTime="08:40 PM" /></div>
      <div className='mb-5'><MarketCard marketName="DISAWAR"      openTime="03:00 PM" closeTime="08:40 PM" /></div>
      <div className='mb-5'><MarketCard marketName="MATKA MANDI"  openTime="11:00 PM" closeTime="05:40 PM" /></div>
      <div className='mb-5'><MarketCard marketName="SHREE GANESH" openTime="12:00 PM" closeTime="08:00 PM" /></div>
      <div className='mb-5'><MarketCard marketName="FARIDABAD"    openTime="03:00 PM" closeTime="08:40 PM" /></div>

      <LiveGamesGrid />

      <WinGame/>
      <CasinoRoulette/>
      <Footer/>
    </div>
  )
}

export default Home
