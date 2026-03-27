import React, { useState, useEffect } from "react";
import HarufGrid from "../../Pages/Haruf";
import { Play, BarChart2, X } from "lucide-react";
import ResultChart from "../ResultChart";
import { db } from "../../firebase";
import { collection, query, where, onSnapshot, doc } from "firebase/firestore";
import { toast } from "react-toastify";
import { markets } from "../../marketData";

const formatTime12h = (timeString) => {
  if (!timeString || timeString === "..") return "..";
  const [hours, minutes] = timeString.split(":");
  const h = parseInt(hours);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12 || 12;
  return `${h12}:${minutes} ${ampm}`;
};

const MarketCard = ({ marketName }) => {
  const [open, setOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [todayResult, setTodayResult] = useState("..");
  const [yesterdayResult, setYesterdayResult] = useState("..");
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [openTime, setOpenTime] = useState("..");
  const [closeTime, setCloseTime] = useState("..");

  useEffect(() => {
    const marketInfo = markets.find(m => m.name === marketName);
    setOpenTime(marketInfo?.openTime || "..");
    setCloseTime(marketInfo?.closeTime || "..");
  }, [marketName]);

  useEffect(() => {
    const q = query(collection(db, "results"), where("marketName", "==", marketName));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      }));

      results.sort((a, b) => b.date - a.date);

      setTodayResult(results[0]?.number || "..");
      setYesterdayResult(results[1]?.number || "..");
    });

    return () => unsubscribe();
  }, [marketName]);

  const handlePlay = (e) => {
    e.stopPropagation();
    if (isMarketOpen) {
      setOpen(true);
    } else {
      toast.info(`Market closed. Opens at ${formatTime12h(openTime)}`);
    }
  };

  if (showChart) {
    return <ResultChart marketName={marketName} onClose={() => setShowChart(false)} />;
  }

  if (open) {
    return (
      <div>
        <div className="bg-sky-800 p-2 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="bg-red-500 text-white p-2 rounded-full"
          >
            <X size={24} />
          </button>
        </div>
        <HarufGrid marketName={marketName} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto group">
      
      {/* CARD */}
      <div className="rounded-xl border-2 border-blue-900 bg-white shadow-lg overflow-hidden 
                      transition-all duration-300 hover:shadow-2xl hover:scale-[1.02] cursor-pointer">

        {/* HEADER */}
        <div className="bg-yellow-500 text-black font-bold text-center py-2 tracking-wide">
          {marketName}
        </div>

        {/* BODY */}
        <div className="flex flex-col items-center py-4 px-3 gap-2">

          {/* RESULT */}
          <div className="text-lg font-bold text-red-600 flex items-center gap-2">
            <span>{`{ ${yesterdayResult} }`}</span>
            <span className="text-black">→</span>
            <span>{`[ ${todayResult} ]`}</span>
          </div>

          {/* STATUS */}
          <p className={`text-sm font-semibold ${isMarketOpen ? "text-green-600" : "text-red-600"}`}>
            {isMarketOpen ? "Market is Running" : "Market Closed"}
          </p>

          {/* ACTION SECTION */}
          <div className="flex justify-between items-center w-full mt-3 px-3">

            {/* PAST RESULT */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowChart(true);
              }}
              className="flex flex-col items-center cursor-pointer transition-all duration-200 hover:scale-110"
            >
              <BarChart2 size={28} className="text-red-500 group-hover:text-red-600" />
              <span className="text-xs text-gray-500 mt-1">Past Result</span>
            </div>

            {/* PLAY BUTTON */}
            <div className="flex flex-col items-center">
              <button
                onClick={handlePlay}
                className="bg-[#042346] p-3 rounded-full transition-all duration-300 
                           hover:bg-yellow-500 hover:shadow-lg hover:scale-110"
              >
                <Play className="text-white" size={22} />
              </button>
              <span className="text-xs text-gray-500 mt-1">Play Now</span>
            </div>

          </div>

          {/* TIMING */}
          <div className="flex justify-between w-full text-sm text-gray-700 mt-3">
            <p><b>Open:</b> {formatTime12h(openTime)}</p>
            <p><b>Close:</b> {formatTime12h(closeTime)}</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MarketCard;
