// ══════════════════ TeenPatti.jsx ══════════════════
import { useState, useEffect, useRef } from “react”;
import { db } from “../firebase”;
import { doc, onSnapshot, updateDoc, addDoc, collection, serverTimestamp, query, orderBy, limit } from “firebase/firestore”;
import { getAuth } from “firebase/auth”;
import Navbar from “../components/Navbar”;
import { getBiasedWinner } from “../utils/houseEdge”;
import { calcDeduction, getTotalBalance } from “../utils/balanceUtils”;

const SUITS=[“♠”,“♥”,“♦”,“♣”],RANKS=[“A”,“2”,“3”,“4”,“5”,“6”,“7”,“8”,“9”,“10”,“J”,“Q”,“K”];
const rnd=()=>({suit:SUITS[~(Math.random()*4)],rank:RANKS[~(Math.random()*13)]});
function Card({card,hidden}){
const red=card?.suit===“♥”||card?.suit===“♦”;
return(<div className={`w-14 h-20 rounded-xl border-2 flex flex-col items-center justify-center font-bold text-base shadow-lg select-none ${hidden?"bg-blue-900 border-blue-500":"bg-white border-gray-300"}`}>
{hidden?<span className="text-blue-300 text-2xl">🂠</span>:
<><span className={red?“text-red-600”:“text-gray-900”}>{card?.rank}</span><span className={`text-xl ${red?"text-red-600":"text-gray-900"}`}>{card?.suit}</span></>}

  </div>);
}
const ROUND_SEC=15;

export default function TeenPatti(){
const auth=getAuth(),user=auth.currentUser;
const[balance,setBalance]=useState(0);
const[winningMoney,setWinningMoney]=useState(0);
const[totalBalance,setTotalBalance]=useState(0);
const[betAmount,setBetAmount]=useState(””);
const[betSide,setBetSide]=useState(null);
const[phase,setPhase]=useState(“betting”);
const[pCards,setPCards]=useState([]);
const[dCards,setDCards]=useState([]);
const[winner,setWinner]=useState(null);
const[msg,setMsg]=useState(””);
const[history,setHistory]=useState([]);
const[timeLeft,setTimeLeft]=useState(ROUND_SEC);
const[revealed,setRevealed]=useState(false);
const bsRef=useRef(null),baRef=useRef(null),hbRef=useRef(false),balRef=useRef(0),winRef=useRef(0),timerRef=useRef(null);

useEffect(()=>{bsRef.current=betSide;},[betSide]);
useEffect(()=>{
if(!user)return;
return onSnapshot(doc(db,“users”,user.uid),(s)=>{
if(s.exists()){const d=s.data();const b=d.balance??0,w=d.winningMoney??0;
setBalance(b);setWinningMoney(w);setTotalBalance(b+w);balRef.current=b;winRef.current=w;}
});
},[user]);
useEffect(()=>{return onSnapshot(query(collection(db,“teenPattiHistory”),orderBy(“createdAt”,“desc”),limit(12)),(s)=>setHistory(s.docs.map(d=>d.data())));},[]);
useEffect(()=>{startRound();return()=>clearInterval(timerRef.current);},[]);

const startRound=()=>{
clearInterval(timerRef.current);
setPhase(“betting”);setBetSide(null);bsRef.current=null;baRef.current=null;hbRef.current=false;
setWinner(null);setMsg(””);setRevealed(false);setPCards([]);setDCards([]);setTimeLeft(ROUND_SEC);
let t=ROUND_SEC;
timerRef.current=setInterval(()=>{t–;setTimeLeft(t);if(t<=0){clearInterval(timerRef.current);dealRound();}},1000);
};
const dealRound=async()=>{
setPhase(“dealing”);
const pc=[rnd(),rnd(),rnd()],dc=[rnd(),rnd(),rnd()];setPCards(pc);setDCards(dc);
const userBet=bsRef.current;
const w=userBet?getBiasedWinner(userBet,[“player”,“dealer”]):Math.random()>0.5?“player”:“dealer”;
setTimeout(async()=>{
setRevealed(true);setWinner(w);setPhase(“result”);
if(hbRef.current&&userBet){
const amt=baRef.current,won=w===userBet;
const winAmt=won?parseFloat((amt*1.9).toFixed(2)):0;
won?setMsg(`🎉 ${w.toUpperCase()} wins! +₹${winAmt}`):setMsg(`😞 ${w.toUpperCase()} wins. Lost ₹${amt}`);
if(won)await updateDoc(doc(db,“users”,user.uid),{winningMoney:winRef.current+winAmt});
await addDoc(collection(db,“teenPattiHistory”),{userId:user.uid,betSide:userBet,winner:w,betAmount:amt,won,createdAt:serverTimestamp()});
}else await addDoc(collection(db,“teenPattiHistory”),{winner:w,createdAt:serverTimestamp()});
setTimeout(()=>startRound(),4000);
},2000);
};
const placeBet=async(side)=>{
const amt=parseFloat(betAmount);
if(!amt||amt<10)return setMsg(“Min bet ₹10”);
const total=getTotalBalance(balRef.current,winRef.current);
if(amt>total)return setMsg(`Insufficient balance ❌ (Total: ₹${total.toFixed(0)})`);
if(phase!==“betting”||hbRef.current)return;
setBetSide(side);bsRef.current=side;baRef.current=amt;hbRef.current=true;
setMsg(`✅ Bet ₹${amt} on ${side==="player"?"Player":"Dealer"}!`);
const {newBalance,newWinning}=calcDeduction(amt,balRef.current,winRef.current);
await updateDoc(doc(db,“users”,user.uid),{balance:newBalance,winningMoney:newWinning});
};

return(<div className="min-h-screen bg-[#0a1628] text-white"><Navbar/>
<div className="max-w-lg mx-auto px-4 pb-8">
<h1 className="text-2xl font-black text-center text-yellow-400 py-4">🃏 TEEN PATTI</h1>
<div className="flex gap-1.5 overflow-x-auto pb-2 mb-3">
{history.map((h,i)=>(<span key={i} className={`px-2.5 py-1 rounded-full text-xs font-bold flex-shrink-0 ${h.winner==="player"?"bg-blue-700":"bg-red-700"}`}>{h.winner===“player”?“P”:“D”}</span>))}
</div>
{phase===“betting”&&<div className="mb-3"><div className="flex justify-between text-xs text-gray-500 mb-1"><span>Betting closes in {timeLeft}s</span></div>
<div className="bg-gray-800 rounded-full h-2 overflow-hidden"><div className={`h-2 rounded-full transition-all duration-1000 ${timeLeft>8?"bg-green-500":timeLeft>4?"bg-yellow-500":"bg-red-500 animate-pulse"}`} style={{width:`${(timeLeft/ROUND_SEC)*100}%`}}/></div></div>}
<div className="bg-green-900 rounded-3xl p-5 mb-4 border-4 border-yellow-700">
<div className="text-center text-gray-300 text-sm font-semibold mb-2">DEALER</div>
<div className="flex justify-center gap-2 mb-4">{phase===“betting”?[1,2,3].map(i=><Card key={i} hidden/>):dCards.map((c,i)=><Card key={i} card={c} hidden={!revealed}/>)}</div>
{winner&&<div className={`text-center font-black text-xl py-2 rounded-xl mb-3 ${winner==="player"?"bg-blue-600/50":"bg-red-600/50"}`}>🏆 {winner.toUpperCase()} WINS!</div>}
<div className="text-center text-gray-300 text-sm font-semibold mb-2">PLAYER</div>
<div className="flex justify-center gap-2">{phase===“betting”?[1,2,3].map(i=><Card key={i} hidden/>):pCards.map((c,i)=><Card key={i} card={c} hidden={false}/>)}</div>
</div>
{msg&&<div className="text-center text-sm font-semibold text-yellow-300 bg-yellow-900/20 rounded-xl py-2 px-3 mb-3">{msg}</div>}
{/* Balance display */}
<div className="grid grid-cols-3 gap-2 mb-3">
<div className="bg-[#12152b] rounded-xl p-2 text-center border border-gray-800"><div className="text-xs text-gray-500">Wallet</div><div className="text-sm font-bold text-white">₹{balance.toFixed(0)}</div></div>
<div className="bg-[#12152b] rounded-xl p-2 text-center border border-yellow-800"><div className="text-xs text-gray-500">Winnings</div><div className="text-sm font-bold text-yellow-400">₹{winningMoney.toFixed(0)}</div></div>
<div className="bg-green-900/40 rounded-xl p-2 text-center border border-green-700"><div className="text-xs text-gray-400">Total</div><div className="text-sm font-bold text-green-400">₹{totalBalance.toFixed(0)}</div></div>
</div>
<div className="bg-[#12152b] rounded-2xl p-4 border border-gray-800">
<div className="flex gap-2 mb-3">
<input type=“number” value={betAmount} onChange={(e)=>setBetAmount(e.target.value)} placeholder=“Bet amount (Min ₹10)” disabled={phase!==“betting”||hbRef.current} className=“flex-1 bg-[#0b0d1a] border border-gray-700 rounded-xl px-3 py-2.5 text-sm text-white”/>
</div>
<div className="grid grid-cols-4 gap-2 mb-3">{[50,100,200,500].map(a=>(<button key={a} onClick={()=>setBetAmount(a.toString())} disabled={phase!==“betting”||hbRef.current} className=“bg-gray-800 hover:bg-gray-700 disabled:opacity-30 rounded-lg py-1.5 text-xs font-bold”>₹{a}</button>))}</div>
<div className="grid grid-cols-2 gap-3">
<button onClick={()=>placeBet(“player”)} disabled={phase!==“betting”||hbRef.current} className={`rounded-xl py-3 font-bold ${betSide==="player"?"bg-blue-500 ring-2 ring-blue-300":"bg-blue-700 hover:bg-blue-600"} disabled:opacity-30 disabled:cursor-not-allowed`}>🧑 PLAYER {betSide===“player”?“✅”:””}</button>
<button onClick={()=>placeBet(“dealer”)} disabled={phase!==“betting”||hbRef.current} className={`rounded-xl py-3 font-bold ${betSide==="dealer"?"bg-red-500 ring-2 ring-red-300":"bg-red-700 hover:bg-red-600"} disabled:opacity-30 disabled:cursor-not-allowed`}>🏦 DEALER {betSide===“dealer”?“✅”:””}</button>
</div>
</div>
</div>

  </div>);
}
