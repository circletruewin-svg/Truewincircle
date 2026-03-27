import React, { useState, useEffect } from "react";
import HarufGrid from "../../Pages/Haruf";
import { Play, X } from "lucide-react";
import ResultChart from "../ResultChart";
import { db } from "../../firebase";
import { collection, query, where, doc, onSnapshot } from "firebase/firestore";
import { toast } from "react-toastify";
import { markets } from "../../marketData";

// ✅ TIME FORMAT FIX
const formatTime12h = (timeString) => {
  if (!timeString || timeString === "..") return "..";

  if (timeString.includes("AM") || timeString.includes("PM")) {
    return timeString;
  }

  const [hours, minutes] = timeString.split(":");
  if (!minutes) return timeString;

  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? "PM" : "AM";
  let h12 = h % 12;
  if (h12 === 0) h12 = 12;

  return `${h12}:${minutes} ${ampm}`;
};

const MarketCard = ({ marketName }) => {
  const [open, setOpen] = useState(false);
  const [showChart, setShowChart] = useState(false);
  const [todayResult, setTodayResult] = useState("..");
  const [yesterdayResult, setYesterdayResult] = useState("..");
  const [loading, setLoading] = useState(true);
  const [isMarketOpen, setIsMarketOpen] = useState(true);
  const [openTime, setOpenTime] = useState("..");
  const [closeTime, setCloseTime] = useState("..");

  // 🔥 TIMINGS
  useEffect(() => {
    const marketInfo = markets.find(m => m.name === marketName);
    const fallbackOpen = marketInfo?.openTime || "..";
    const fallbackClose = marketInfo?.closeTime || "..";

    const timingDocRef = doc(db, "market_timings", marketName);
    const unsubscribe = onSnapshot(timingDocRef, (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data();
        setOpenTime(data.openTime || fallbackOpen);
        setCloseTime(data.closeTime || fallbackClose);
      } else {
        setOpenTime(fallbackOpen);
        setCloseTime(fallbackClose);
      }
    });

    return () => unsubscribe();
  }, [marketName]);

  // 🔥 MARKET STATUS
  const parseTime = (timeString) => {
    if (!timeString || timeString === "..") return null;

    const now = new Date();
    const parts = timeString.match(/(\d+):(\d+)/);
    if (!parts) return null;

    const hours = parseInt(parts[1]);
    const minutes = parseInt(parts[2]);

    now.setHours(hours, minutes, 0, 0);
    return now;
  };

  useEffect(() => {
    const check = () => {
      const now = new Date();
      const openDate = parseTime(openTime);
      const closeDate = parseTime(closeTime);

      if (!openDate || !closeDate) return setIsMarketOpen(false);

      if (closeDate < openDate) {
        setIsMarketOpen(now >= openDate || now < closeDate);
      } else {
        setIsMarketOpen(now >= openDate && now < closeDate);
      }
    };

    const interval = setInterval(check, 1000);
    check();
    return () => clearInterval(interval);
  }, [openTime, closeTime]);

  const handleCardClick = () => {
    if (isMarketOpen) {
      setOpen(true);
    } else {
      toast.info(`Betting closed. Opens at ${formatTime12h(openTime)}`);
    }
  };

  // 🔥 RESULTS
  useEffect(() => {
    const q = query(
      collection(db, "results"),
      where("marketName", "==", marketName)
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const results = snapshot.docs.map(doc => ({
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date(),
      }));

      results.sort((a, b) => b.date - a.date);

      setTodayResult(results[0]?.number || "..");
      setYesterdayResult(results[1]?.number || "..");
      setLoading(false);
    });

    return () => unsubscribe();
  }, [marketName]);

  if (showChart) {
    return <ResultChart marketName={marketName} onClose={() => setShowChart(false)} />;
  }

  if (open) {
    return (
      <div>
        <div className="bg-sky-800 p-2 flex justify-end">
          <button onClick={() => setOpen(false)} className="bg-red-500 p-2 rounded-full">
            <X size={24} />
          </button>
        </div>
        <HarufGrid marketName={marketName} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">

      <div
        onClick={handleCardClick}
        className="cursor-pointer rounded-xl border-2 border-blue-950 bg-white shadow-md overflow-hidden hover:shadow-xl transition"
      >

        {/* HEADER */}
        <div className="bg-yellow-500 text-center py-2 font-bold">
          {marketName}
        </div>

        {/* BODY */}
        <div className="py-4 px-3">

          {/* RESULT */}
          <div className="text-center text-red-600 font-bold text-lg">
            {loading ? "..." : `{ ${yesterdayResult} } → [ ${todayResult} ]`}
          </div>

          {/* STATUS */}
          <p className={`${isMarketOpen ? "text-green-600" : "text-red-600"} font-semibold text-sm text-center`}>
            {isMarketOpen ? "Market is Running" : "Market Closed"}
          </p>

          {/* 🔥 LEFT + RIGHT LAYOUT */}
          <div className="flex justify-between items-center w-full px-3 mt-4">

            {/* LEFT: Animated Bars */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowChart(true);
              }}
              className="flex flex-col items-center cursor-pointer group"
            >
              <div className="flex gap-1 items-end">
                <div className="w-1 h-6 bg-red-500 animate-bounce"></div>
                <div className="w-1 h-8 bg-red-500 animate-bounce delay-150"></div>
                <div className="w-1 h-5 bg-red-500 animate-bounce delay-300"></div>
              </div>

              <span className="text-xs text-gray-500 mt-1 group-hover:text-blue-600">
                Past Result
              </span>
            </div>

            {/* RIGHT: Play Button */}
            <div className="flex flex-col items-center">
              <button
                className="bg-[#042346] p-3 rounded-full hover:bg-yellow-600 transition"
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
              >
                <Play size={22} className="text-white" />
              </button>
              <span className="text-xs text-gray-500 mt-1">Play Now</span>
            </div>

          </div>

          {/* TIME */}
          <div className="flex justify-between w-full text-sm mt-4 px-2">
            <p><b>Open:</b> {formatTime12h(openTime)}</p>
            <p><b>Close:</b> {formatTime12h(closeTime)}</p>
          </div>

        </div>
      </div>
    </div>
  );
};

export default MarketCard;
