<<<<<<< HEAD
// ══════════════════ DragonTiger.jsx ══════════════════
import { useState, useEffect, useRef } from “react”;
import { db } from “../firebase”;
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, orderBy, limit } from “firebase/firestore”;
import { getAuth } from “firebase/auth”;
import Navbar from “../components/Navbar”;
import { getBiasedWinner } from “../utils/houseEdge”;
import { calcDeduction, getTotalBalance } from “../utils/balanceUtils”;
=======
// ═══════════════════════════════════════════════
// DragonTiger.jsx — Auto House Edge Version
// ═══════════════════════════════════════════════
import { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import { doc, onSnapshot, addDoc, collection, serverTimestamp, query, orderBy, limit } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import Navbar from "../components/Navbar";
import { getBiasedWinner } from "../utils/houseEdge";
import { creditUserWinnings, debitUserFunds, getUserFunds } from "../utils/userFunds";
>>>>>>> 8ec39b4 (Fix wallet, support, live casino, and admin updates)

const SUITS=[“♠”,“♥”,“♦”,“♣”],RANKS=[“A”,“2”,“3”,“4”,“5”,“6”,“7”,“8”,“9”,“10”,“J”,“Q”,“K”],RANK_VALS={A:1,2:2,3:3,4:4,5:5,6:6,7:7,8:8,9:9,10:10,J:11,Q:12,K:13};
const rnd=()=>{const r=RANKS[~(Math.random()*13)];return{suit:SUITS[~(Math.random()*4)],rank:r,val:RANK_VALS[r]};};
function BigCard({card,hidden,side}){
const red=card?.suit===“♥”||card?.suit===“♦”;
return(<div className={`w-24 h-36 rounded-2xl border-4 flex flex-col items-center justify-center shadow-xl ${hidden?"bg-indigo-900 border-indigo-500":"bg-white"} ${side==="dragon"?"border-red-500":"border-blue-500"}`}>
{hidden?<span className="text-5xl">🂠</span>:
<><div className={`text-3xl font-black ${red?"text-red-600":"text-gray-900"}`}>{card?.rank}</div><div className={`text-5xl ${red?"text-red-600":"text-gray-900"}`}>{card?.suit}</div></>}

  </div>);
}
const ROUND_SEC=12;

export default function DragonTiger(){
const auth=getAuth(),user=auth.currentUser;
const[balance,setBalance]=useState(0);const[winningMoney,setWinningMoney]=useState(0);const[totalBalance,setTotalBalance]=useState(0);
const[betAmount,setBetAmount]=useState(””);const[betSide,setBetSide]=useState(null);const[phase,setPhase]=useState(“betting”);
const[dc,setDc]=useState(null);const[tc,setTc]=useState(null);const[winner,setWinner]=useState(null);const[msg,setMsg]=useState(””);
const[history,setHistory]=useState([]);const[timeLeft,setTimeLeft]=useState(ROUND_SEC);const[revealed,setRevealed]=useState(false);
const bsRef=useRef(null),baRef=useRef(null),hbRef=useRef(false),balRef=useRef(0),winRef=useRef(0),timerRef=useRef(null);

useEffect(()=>{bsRef.current=betSide;},[betSide]);
useEffect(()=>{if(!user)return;return onSnapshot(doc(db,“users”,user.uid),(s)=>{if(s.exists()){const d=s.data();const b=d.balance??0,w=d.winningMoney??0;setBalance(b);setWinningMoney(w);setTotalBalance(b+w);balRef.current=b;winRef.current=w;}});},[user]);
useEffect(()=>{return onSnapshot(query(collection(db,“dtHistory”),orderBy(“createdAt”,“desc”),limit(15)),(s)=>setHistory(s.docs.map(d=>d.data())));},[]);
useEffect(()=>{startRound();return()=>clearInterval(timerRef.current);},[]);

const startRound=()=>{
clearInterval(timerRef.current);
setPhase(“betting”);setBetSide(null);bsRef.current=null;baRef.current=null;hbRef.current=false;
setWinner(null);setMsg(””);setRevealed(false);setDc(null);setTc(null);setTimeLeft(ROUND_SEC);
let t=ROUND_SEC;timerRef.current=setInterval(()=>{t–;setTimeLeft(t);if(t<=0){clearInterval(timerRef.current);dealRound();}},1000);
};
const dealRound=async()=>{
setPhase(“dealing”);const d=rnd(),t=rnd();setDc(d);setTc(t);
const userBet=bsRef.current;
const w=userBet?getBiasedWinner(userBet,[“dragon”,“tiger”,“tie”]):[“dragon”,“tiger”][~~(Math.random()*2)];
setTimeout(async()=>{
setRevealed(true);setWinner(w);setPhase(“result”);
if(hbRef.current&&userBet){
const amt=baRef.current,won=w===userBet;const mult=userBet===“tie”?8:1.9;const winAmt=won?parseFloat((amt*mult).toFixed(2)):0;
won?setMsg(`🎉 ${w.toUpperCase()} wins! +₹${winAmt}`):setMsg(`😞 ${w.toUpperCase()} wins. Lost ₹${amt}`);
if(won)await updateDoc(doc(db,“users”,user.uid),{winningMoney:winRef.current+winAmt});
await addDoc(collection(db,“dtHistory”),{userId:user.uid,betSide:userBet,winner:w,betAmount:amt,won,createdAt:serverTimestamp()});
}else await addDoc(collection(db,“dtHistory”),{winner:w,createdAt:serverTimestamp()});
setTimeout(()=>startRound(),4000);
},2000);
};
const placeBet=async(side)=>{
const amt=parseFloat(betAmount);if(!amt||amt<10)return setMsg(“Min bet ₹10”);
const total=getTotalBalance(balRef.current,winRef.current);
if(amt>total)return setMsg(`Insufficient balance ❌ (Total: ₹${total.toFixed(0)})`);
if(phase!==“betting”||hbRef.current)return;
setBetSide(side);bsRef.current=side;baRef.current=amt;hbRef.current=true;
setMsg(`✅ Bet ₹${amt} on ${side.toUpperCase()}!`);
const {newBalance,newWinning}=calcDeduction(amt,balRef.current,winRef.current);
await updateDoc(doc(db,“users”,user.uid),{balance:newBalance,winningMoney:newWinning});
};

<<<<<<< HEAD
return(<div className="min-h-screen bg-[#0d1117] text-white"><Navbar/>
<div className="max-w-lg mx-auto px-4 pb-8">
<h1 className="text-2xl font-black text-center py-4">🐉 DRAGON <span className="text-gray-500">vs</span> 🐯 TIGER</h1>
<div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">{history.map((h,i)=>(<span key={i} className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0 ${h.winner==="dragon"?"bg-red-700":h.winner==="tiger"?"bg-blue-700":"bg-green-700"}`}>{h.winner===“dragon”?“D”:h.winner===“tiger”?“T”:”=”}</span>))}</div>
{phase===“betting”&&<div className="text-center mb-3 text-gray-400">Bet in <span className="text-yellow-400 font-bold text-xl">{timeLeft}s</span></div>}
<div className="flex justify-around items-center bg-green-950 rounded-3xl p-6 mb-4 border-2 border-green-800">
<div className="text-center"><div className="text-red-400 font-bold mb-2">🐉 DRAGON</div><BigCard card={dc} hidden={!revealed} side="dragon"/></div>
<div className="text-3xl font-black text-yellow-400">VS</div>
<div className="text-center"><div className="text-blue-400 font-bold mb-2">🐯 TIGER</div><BigCard card={tc} hidden={!revealed} side="tiger"/></div>
</div>
{winner&&<div className={`text-center text-xl font-black py-2 rounded-xl mb-3 ${winner==="dragon"?"bg-red-800":winner==="tiger"?"bg-blue-800":"bg-green-800"}`}>{winner===“dragon”?“🐉 Dragon Wins!”:winner===“tiger”?“🐯 Tiger Wins!”:“🤝 Tie!”}</div>}
{msg&&<div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}
<div className="grid grid-cols-3 gap-2 mb-3">
<div className="bg-[#12152b] rounded-xl p-2 text-center border border-gray-800"><div className="text-xs text-gray-500">Wallet</div><div className="text-sm font-bold text-white">₹{balance.toFixed(0)}</div></div>
<div className="bg-[#12152b] rounded-xl p-2 text-center border border-yellow-800"><div className="text-xs text-gray-500">Winnings</div><div className="text-sm font-bold text-yellow-400">₹{winningMoney.toFixed(0)}</div></div>
<div className="bg-green-900/40 rounded-xl p-2 text-center border border-green-700"><div className="text-xs text-gray-400">Total</div><div className="text-sm font-bold text-green-400">₹{totalBalance.toFixed(0)}</div></div>
</div>
<div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
<div className="flex gap-2 mb-3"><input type=“number” value={betAmount} onChange={(e)=>setBetAmount(e.target.value)} placeholder=“Bet amount (Min ₹10)” disabled={phase!==“betting”||hbRef.current} className=“flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white”/></div>
<div className="grid grid-cols-4 gap-2 mb-3">{[50,100,200,500].map(a=>(<button key={a} onClick={()=>setBetAmount(a.toString())} disabled={phase!==“betting”||hbRef.current} className=“bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold”>₹{a}</button>))}</div>
<div className="grid grid-cols-3 gap-2">{[{s:“dragon”,l:“🐉 Dragon”,c:“bg-red-700”},{s:“tiger”,l:“🐯 Tiger”,c:“bg-blue-700”},{s:“tie”,l:“🤝 Tie 8x”,c:“bg-green-700”}].map(({s,l,c})=>(<button key={s} onClick={()=>placeBet(s)} disabled={phase!==“betting”||hbRef.current} className={`${c} ${betSide===s?"ring-2 ring-yellow-400":""} rounded-xl py-2.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed`}>{l}{betSide===s?” ✅”:””}</button>))}</div>
</div>
</div>

  </div>);
=======
  useEffect(()=>{ if(!user)return; return onSnapshot(doc(db,"users",user.uid),(s)=>{ if(s.exists())setBalance(getUserFunds(s.data()).total); }); },[user]);
  useEffect(()=>{ return onSnapshot(query(collection(db,"dtHistory"),orderBy("createdAt","desc"),limit(15)),(s)=>setHistory(s.docs.map(d=>d.data()))); },[]);
  useEffect(()=>{ startRound(); return ()=>clearInterval(timerRef.current); },[]);

  const startRound=()=>{
    setPhase("betting");setBetSide(null);bsRef.current=null;baRef.current=null;hbRef.current=false;
    setWinner(null);setMsg("");setRevealed(false);setDc(null);setTc(null);setTimeLeft(ROUND_SEC);
    let t=ROUND_SEC;
    timerRef.current=setInterval(()=>{ t--;setTimeLeft(t); if(t<=0){clearInterval(timerRef.current);dealRound();} },1000);
  };

  const dealRound=async()=>{
    setPhase("dealing");
    const d=rnd(),t=rnd(); setDc(d);setTc(t);
    const userBet=bsRef.current;
    const w=userBet ? getBiasedWinner(userBet,["dragon","tiger","tie"]) : ["dragon","tiger"][~~(Math.random()*2)];

    setTimeout(async()=>{
      setRevealed(true);setWinner(w);setPhase("result");
      if(hbRef.current&&userBet){
        const amt=baRef.current,won=w===userBet;
        const mult=userBet==="tie"?8:1.9;
        const winAmt=won?parseFloat((amt*mult).toFixed(2)):0;
        won?setMsg(`🎉 ${w.toUpperCase()} wins! +₹${winAmt}`):setMsg(`😞 ${w.toUpperCase()} wins. Lost ₹${amt}`);
        if(won) await creditUserWinnings(db, user.uid, winAmt);
        await addDoc(collection(db,"dtHistory"),{userId:user.uid,betSide:userBet,winner:w,betAmount:amt,won,createdAt:serverTimestamp()});
      } else {
        await addDoc(collection(db,"dtHistory"),{winner:w,createdAt:serverTimestamp()});
      }
      setTimeout(()=>startRound(),4000);
    },2000);
  };

  const placeBet=async(side)=>{
    const amt=parseFloat(betAmount);
    if(!amt||amt<10)return setMsg("Min bet ₹10");
    if(amt>blRef.current)return setMsg("Insufficient balance");
    if(phase!=="betting"||hbRef.current)return;
    setBetSide(side);bsRef.current=side;baRef.current=amt;hbRef.current=true;
    await debitUserFunds(db, user.uid, amt);
    setMsg(`✅ Bet ₹${amt} on ${side.toUpperCase()}!`);
  };

  return (
    <div className="min-h-screen bg-[#0d1117] text-white">
      <Navbar />
      <div className="max-w-lg mx-auto px-4 pb-8">
        <h1 className="text-2xl font-black text-center py-4">🐉 DRAGON <span className="text-gray-500">vs</span> 🐯 TIGER</h1>
        <div className="flex gap-1.5 overflow-x-auto pb-2 mb-3 scrollbar-hide">
          {history.map((h,i)=>(
            <span key={i} className={`w-7 h-7 rounded-full text-xs font-bold flex items-center justify-center flex-shrink-0
              ${h.winner==="dragon"?"bg-red-700":h.winner==="tiger"?"bg-blue-700":"bg-green-700"}`}>
              {h.winner==="dragon"?"D":h.winner==="tiger"?"T":"="}
            </span>
          ))}
        </div>
        {phase==="betting"&&<div className="text-center mb-3 text-gray-400">Bet in <span className="text-yellow-400 font-bold text-xl">{timeLeft}s</span></div>}
        <div className="flex justify-around items-center bg-green-950 rounded-3xl p-6 mb-4 border-2 border-green-800">
          <div className="text-center"><div className="text-red-400 font-bold mb-2">🐉 DRAGON</div><BigCard card={dc} hidden={!revealed} side="dragon"/></div>
          <div className="text-3xl font-black text-yellow-400">VS</div>
          <div className="text-center"><div className="text-blue-400 font-bold mb-2">🐯 TIGER</div><BigCard card={tc} hidden={!revealed} side="tiger"/></div>
        </div>
        {winner&&<div className={`text-center text-xl font-black py-2 rounded-xl mb-3 ${winner==="dragon"?"bg-red-800":winner==="tiger"?"bg-blue-800":"bg-green-800"}`}>
          {winner==="dragon"?"🐉 Dragon Wins!":winner==="tiger"?"🐯 Tiger Wins!":"🤝 Tie!"}
        </div>}
        {msg&&<div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}
        <div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
          <div className="flex gap-2 mb-3">
            <input type="number" value={betAmount} onChange={(e)=>setBetAmount(e.target.value)} placeholder="Bet amount (Min ₹10)"
              disabled={phase!=="betting"||hbRef.current} className="flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white"/>
            <div className="bg-gray-800 rounded-xl px-3 py-2.5 text-xs text-gray-400">₹{balance}</div>
          </div>
          <div className="grid grid-cols-4 gap-2 mb-3">
            {[50,100,200,500].map(a=>(
              <button key={a} onClick={()=>setBetAmount(a.toString())} disabled={phase!=="betting"||hbRef.current}
                className="bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold">₹{a}</button>
            ))}
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[{s:"dragon",l:"🐉 Dragon",c:"bg-red-700 hover:bg-red-600"},{s:"tiger",l:"🐯 Tiger",c:"bg-blue-700 hover:bg-blue-600"},{s:"tie",l:"🤝 Tie 8x",c:"bg-green-700 hover:bg-green-600"}].map(({s,l,c})=>(
              <button key={s} onClick={()=>placeBet(s)} disabled={phase!=="betting"||hbRef.current}
                className={`${c} ${betSide===s?"ring-2 ring-yellow-400":""} rounded-xl py-2.5 text-xs font-bold disabled:opacity-30 disabled:cursor-not-allowed`}>
                {l}{betSide===s?" ✅":""}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
>>>>>>> 8ec39b4 (Fix wallet, support, live casino, and admin updates)
}
