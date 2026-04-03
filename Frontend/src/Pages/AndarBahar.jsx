import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getBiasedWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";

const SUITS = ["?","?","?","?"];
const RANKS = ["A","2","3","4","5","6","7","8","9","10","J","Q","K"];
const rnd = () => ({ suit: SUITS[~~(Math.random()*4)], rank: RANKS[~~(Math.random()*13)] });

function SmCard({ card }) {
  const red = card?.suit==="?"||card?.suit==="?";
  return (
    <div className="w-9 h-12 rounded-lg border-2 border-gray-300 bg-white flex flex-col items-center justify-center text-xs font-bold shadow">
      <span className={red?"text-red-600":"text-gray-900"}>{card?.rank}</span>
      <span className={red?"text-red-600":"text-gray-900"}>{card?.suit}</span>
    </div>
  );
}

const ROUND_SEC = 12;

export default function AndarBahar() {
  const auth = getAuth();
  const user = auth.currentUser;
  const [balance,setBalance]=useState(0);
  const [betAmount,setBetAmount]=useState("");
  const [betSide,setBetSide]=useState(null);
  const [phase,setPhase]=useState("betting");
  const [joker,setJoker]=useState(null);
  const [aCards,setACards]=useState([]);
  const [bCards,setBCards]=useState([]);
  const [winner,setWinner]=useState(null);
  const [msg,setMsg]=useState("");
  const [history,setHistory]=useState([]);
  const [timeLeft,setTimeLeft]=useState(ROUND_SEC);

  const bsRef=useRef(null),baRef=useRef(null),hbRef=useRef(false),blRef=useRef(0),timerRef=useRef(null);
  useEffect(()=>{bsRef.current=betSide;},[betSide]);
  useEffect(()=>{blRef.current=balance;},[balance]);

  useEffect(()=>{if(!user)return;return onSnapshot(doc(db,"users",user.uid),(s)=>{if(s.exists())setBalance(getUserFunds(s.data()).total);});},[user]);
  useEffect(()=>{return onSnapshot(query(collection(db,"abHistory"),orderBy("createdAt","desc"),limit(12)),(s)=>setHistory(s.docs.map(d=>d.data())));},[]);
  useEffect(()=>{startRound();return()=>clearInterval(timerRef.current);},[]);

  const startRound=()=>{
    setPhase("betting");setBetSide(null);bsRef.current=null;baRef.current=null;hbRef.current=false;
    setWinner(null);setMsg("");setJoker(null);setACards([]);setBCards([]);setTimeLeft(ROUND_SEC);
    let t=ROUND_SEC;
    timerRef.current=setInterval(()=>{t--;setTimeLeft(t);if(t<=0){clearInterval(timerRef.current);dealRound();}},1000);
  };

  const dealRound=async()=>{
    setPhase("dealing");
    const j=rnd(); setJoker(j);
    const userBet=bsRef.current;
    const w=userBet?getBiasedWinner(userBet,["andar","bahar"]):Math.random()>0.5?"andar":"bahar";

    const acs=[],bcs=[];
    for(let i=0;i<5;i++){acs.push(rnd());bcs.push(rnd());}

    let idx=0;
    const interval=setInterval(()=>{
      if(idx<5){
        setACards(prev=>[...prev,acs[idx]]);
        setBCards(prev=>[...prev,bcs[idx]]);
        idx++;
      } else {
        clearInterval(interval);
        setWinner(w);setPhase("result");
        finishRound(w,userBet);
      }
    },400);
  };

  const finishRound=async(w,userBet)=>{
    if(hbRef.current&&userBet){
      const amt=baRef.current,won=w===userBet;
      const winAmt=won?parseFloat((amt*1.9).toFixed(2)):0;
      won?setMsg(`?? ${w.toUpperCase()} wins! +?${winAmt}`):setMsg(`?? ${w.toUpperCase()} wins. Lost ?${amt}`);
      if(won) await creditUserWinnings(db, user.uid, winAmt);
      await addDoc(collection(db,"abHistory"),{userId:user.uid,betSide:userBet,winner:w,betAmount:amt,won,createdAt:serverTimestamp()});
    } else {
      await addDoc(collection(db,"abHistory"),{winner:w,createdAt:serverTimestamp()});
    }
    setTimeout(()=>startRound(),4000);
  };

  const placeBet=async(side)=>{
    const amt=parseFloat(betAmount);
    if(!amt||amt<10)return setMsg("Min bet ?10");
    if(amt>blRef.current)return setMsg("Insufficient balance");
    if(phase!=="betting"||hbRef.current)return;
    setBetSide(side);bsRef.current=side;baRef.current=amt;hbRef.current=true;
    await debitUserFunds(db, user.uid, amt);
    setMsg(`? Bet ?${amt} on ${side==="andar"?"Andar":"Bahar"}!`);
  };

  return (
    <div className="min-h-screen bg-[#1a0a2e] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center text-pink-400 py-4">?? ANDAR BAHAR</h1>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {history.map((h,i)=>(
            <span key={i} className={`px-2 py-1 rounded text-xs font-bold flex-shrink-0 ${h.winner==="andar"?"bg-purple-700":"bg-pink-700"}`}>
              {h.winner==="andar"?"A":"B"}
            </span>
          ))}
        </div>
        {phase==="betting"&&<div className="text-center mb-3 text-gray-400">Bet in <span className="text-yellow-400 font-bold text-xl">{timeLeft}s</span></div>}

        <div className="bg-green-950 rounded-3xl p-4 mb-4 border-2 border-green-800">
          <div className="flex justify-center mb-4">
            {joker?(
              <div className="text-center">
                <div className="text-xs text-yellow-400 font-bold mb-1">?? Joker</div>
                <div className="w-16 h-24 rounded-2xl border-4 border-yellow-500 bg-white flex flex-col items-center justify-center">
                  <span className={`text-2xl font-black ${joker.suit==="?"||joker.suit==="?"?"text-red-600":"text-gray-900"}`}>{joker.rank}</span>
                  <span className={`text-3xl ${joker.suit==="?"||joker.suit==="?"?"text-red-600":"text-gray-900"}`}>{joker.suit}</span>
                </div>
              </div>
            ):(
              <div className="w-16 h-24 rounded-2xl border-4 border-yellow-500/30 bg-indigo-900/50 flex items-center justify-center">
                <span className="text-4xl">??</span>
              </div>
            )}
          </div>
          <div className="flex gap-3">
            <div className="flex-1">
              <div className={`text-center font-bold text-sm mb-2 py-1 rounded-lg ${winner==="andar"?"bg-purple-600":"text-purple-400"}`}>
                ANDAR {winner==="andar"?"??":""}
              </div>
              <div className="flex flex-wrap gap-1 justify-center min-h-[3rem]">
                {aCards.map((c,i)=><SmCard key={i} card={c}/>)}
              </div>
            </div>
            <div className="flex-1">
              <div className={`text-center font-bold text-sm mb-2 py-1 rounded-lg ${winner==="bahar"?"bg-pink-600":"text-pink-400"}`}>
                BAHAR {winner==="bahar"?"??":""}
              </div>
              <div className="flex flex-wrap gap-1 justify-center min-h-[3rem]">
                {bCards.map((c,i)=><SmCard key={i} card={c}/>)}
              </div>
            </div>
          </div>
        </div>

        {msg&&<div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}

        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e)=>setBetAmount(e.target.value)} placeholder="Bet amount (Min ?10)"
              disabled={phase!=="betting"||hbRef.current} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"/>
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">?{balance}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50,100,200,500].map(a=>(
              <button key={a} onClick={()=>setBetAmount(a.toString())} disabled={phase!=="betting"||hbRef.current}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">?{a}</button>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <button onClick={()=>placeBet("andar")} disabled={phase!=="betting"||hbRef.current}
              className={`${betSide==="andar"?"bg-purple-500 ring-2 ring-purple-300":"bg-purple-700 hover:bg-purple-600"} rounded-xl py-3 font-bold disabled:opacity-30`}>
              ?? ANDAR {betSide==="andar"?"?":""}
            </button>
            <button onClick={()=>placeBet("bahar")} disabled={phase!=="betting"||hbRef.current}
              className={`${betSide==="bahar"?"bg-pink-500 ring-2 ring-pink-300":"bg-pink-700 hover:bg-pink-600"} rounded-xl py-3 font-bold disabled:opacity-30`}>
              ?? BAHAR {betSide==="bahar"?"?":""}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
