import React, { useState, useEffect } from "react";
import HarufGrid from "../../Pages/Haruf";
import { Play, BarChart2, X } from "lucide-react";
import ResultChart from "../ResultChart";
import { db } from "../../firebase";
import { collection, query, where, getDocs, limit, doc, onSnapshot } from "firebase/firestore";
import { toast } from "react-toastify";
import { markets } from "../../marketData";

const formatTime12h = (timeString) => {
  if (!timeString || timeString === '..') {
    return '..';
  }
  const [hours, minutes] = timeString.split(':');
  if (!minutes) { 
      return timeString;
  }
  const h = parseInt(hours, 10);
  const ampm = h >= 12 ? 'PM' : 'AM';
  let h12 = h % 12;
  if (h12 === 0) {
    h12 = 12;
  }
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

  useEffect(() => {
    if (!marketName) return;

    const marketInfo = markets.find(m => m.name === marketName);
    const fallbackOpen = marketInfo?.openTime || "..";
    const fallbackClose = marketInfo?.closeTime || "..";

    const timingDocRef = doc(db, 'market_timings', marketName);
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

  const parseTime = (timeString) => {
    if (!timeString || timeString === "..") return null;

    const now = new Date();
    // Support both 12-hour (AM/PM) and 24-hour format
    const parts12 = timeString.match(/(\d+):(\d+)\s*(AM|PM)/i);
    const parts24 = timeString.match(/(\d{1,2}):(\d{2})/);

    let hours, minutes;

    if (parts12) {
        hours = parseInt(parts12[1], 10);
        minutes = parseInt(parts12[2], 10);
        const meridiem = parts12[3].toUpperCase();

        if (meridiem === "PM" && hours < 12) {
          hours += 12;
        } else if (meridiem === "AM" && hours === 12) {
          hours = 0;
        }
    } else if (parts24) {
        hours = parseInt(parts24[1], 10);
        minutes = parseInt(parts24[2], 10);
    } else {
        return null;
    }

    now.setHours(hours, minutes, 0, 0);
    return now;
  };

  useEffect(() => {
    const checkMarketStatus = () => {
      const now = new Date();
      const openDate = parseTime(openTime);
      const closeDate = parseTime(closeTime);

      if (!openDate || !closeDate) {
        setIsMarketOpen(false); // Can't determine, assume closed
        return;
      }

      let currentlyOpen = false;
      // Handles overnight markets (e.g., opens 8 PM, closes 5 AM)
      if (closeDate < openDate) {
        if (now >= openDate || now < closeDate) {
          currentlyOpen = true;
        }
      } else { // Handles markets within the same day
        if (now >= openDate && now < closeDate) {
          currentlyOpen = true;
        }
      }
      setIsMarketOpen(currentlyOpen);
    };

    const interval = setInterval(checkMarketStatus, 1000); // Check every second
    checkMarketStatus(); // Run once immediately

    return () => clearInterval(interval);
  }, [openTime, closeTime]);


  const handleCardClick = () => {
    if (isMarketOpen) {
      setOpen(true);
    } else {
      toast.info(
        `Betting for ${marketName} is closed. It will open at ${formatTime12h(openTime)}.`
      );
    }
  };


  useEffect(() => {
    if (!marketName) return;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const resultsRef = collection(db, "results");
    const q = query(resultsRef, where("marketName", "==", marketName));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const allResults = snapshot.docs.map(doc => ({ 
        id: doc.id, 
        ...doc.data(),
        date: doc.data().date?.toDate() || new Date()
      }));

      // Sort by date descending (latest first)
      allResults.sort((a, b) => b.date - a.date);

      // Latest result goes to the right [ todayResult ]
      // Second latest result goes to the left { yesterdayResult }
      const latest = allResults[0];
      const secondLatest = allResults[1];

      setTodayResult(latest ? latest.number : "..");
      setYesterdayResult(secondLatest ? secondLatest.number : "..");
      
      setLoading(false);
    }, (error) => {
      console.error(`Error listening to results for ${marketName}:`, error);
      setLoading(false);
    });

    return () => unsubscribe();
  }, [marketName]);

  if (showChart) {
    return (
      <ResultChart marketName={marketName} onClose={() => setShowChart(false)} />
    );
  }

  if (open) {
    return (
      <div>
        <div className="bg-sky-800 p-2 flex justify-end">
          <button
            onClick={() => setOpen(false)}
            className="bg-red-500 text-white p-2 rounded-full shadow-lg hover:bg-red-600 transition-colors"
          >
            <X size={24} />
          </button>
        </div>
        <HarufGrid marketName={marketName} />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      {/* Card */}
      <div
        onClick={handleCardClick}
        className="cursor-pointer rounded-xl border-2 border-blue-950 bg-white shadow-md overflow-hidden"
      >
        {/* Header */}
        <div className="bg-yellow-500 text-black font-bold text-center py-2">
          {marketName}
        </div>

        {/* Body */}
        <div className="flex flex-col items-center justify-center gap-2 py-4 px-3">
          {/* Status line */}
          <div className="flex items-center gap-2 text-red-600 text-lg font-bold">
            {loading ? (
              <span>Loading...</span>
            ) : (
              <>
                <span>{`{ ${yesterdayResult} }`}</span>
                <span className="text-black">{`→`}</span>
                <span>{`[ ${todayResult} ]`}</span>
              </>
            )}
          </div>

          {/* Market Running */}
          <p className={`${isMarketOpen ? 'text-green-600' : 'text-red-600'} font-semibold text-sm`}>
            {isMarketOpen ? 'Market is Running' : 'Market is Closed'}
          </p>

          {/* Action row */}
          <div className="flex justify-between items-center w-full mt-2 px-2">
            {/* Left icon */}
            <div
              onClick={(e) => {
                e.stopPropagation();
                setShowChart(true);
              }}
              className="cursor-pointer flex items-center gap-1 text-red-500"
            >
              <BarChart2 size={35} />
            </div>

            {/* Right play button */}
            <button className="bg-[#042346]  p-3 rounded-full hover:bg-yellow-600">
              <Play
                onClick={(e) => {
                  e.stopPropagation();
                  handleCardClick();
                }}
                className="text-white"
                size={24}
              />
            </button>
          </div>

          {/* Timings */}
          <div className="flex justify-between text-sm text-gray-700 w-full mt-3">
            <p>
              <span className="font-medium">Open:</span> {formatTime12h(openTime)}
            </p>
            <p>
              <span className="font-medium">Close:</span> {formatTime12h(closeTime)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MarketCard;
