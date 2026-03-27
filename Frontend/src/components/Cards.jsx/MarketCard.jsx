import React, { useState, useEffect } from "react";
import { Play } from "lucide-react";
import { db } from "../../firebase";
import {
  collection,
  query,
  where,
  getDocs,
  limit,
  doc,
  onSnapshot,
} from "firebase/firestore";

const MarketCard = ({ marketName, openTime, closeTime }) => {
  const [open, setOpen] = useState(false);
  const [todayResult, setTodayResult] = useState("--");
  const [yesterdayResult, setYesterdayResult] = useState("--");
  const [loading, setLoading] = useState(true);

  // 🔥 FETCH DATA (same logic)
  useEffect(() => {
    const fetchData = async () => {
      try {
        const q = query(
          collection(db, "results"),
          where("market", "==", marketName),
          limit(2)
        );

        const snapshot = await getDocs(q);

        let results = [];
        snapshot.forEach((doc) => {
          results.push(doc.data());
        });

        if (results[0]) setTodayResult(results[0].result);
        if (results[1]) setYesterdayResult(results[1].result);

        setLoading(false);
      } catch (err) {
        console.error(err);
      }
    };

    fetchData();
  }, [marketName]);

  return (
    <div className="bg-white rounded-xl shadow-md border-2 border-blue-900 overflow-hidden transition hover:shadow-xl">

      {/* HEADER */}
      <div className="bg-yellow-500 text-center py-2 font-bold text-black">
        {marketName}
      </div>

      {/* BODY */}
      <div className="p-4 flex justify-between items-center">

        {/* LEFT SIDE */}
        <div className="flex flex-col items-center gap-2">

          {/* RESULT */}
          <div className="text-red-600 font-bold text-lg">
            {loading ? "--" : `{ ${yesterdayResult} } → [ ${todayResult} ]`}
          </div>

          {/* STATUS */}
          <div className="text-green-600 text-sm">
            Market is Running
          </div>

          {/* 🔥 ANIMATED RED BARS */}
          <div className="flex gap-1 mt-2 items-end">
            <div className="w-1 bg-red-500 h-4 animate-bounce delay-75"></div>
            <div className="w-1 bg-red-500 h-6 animate-bounce delay-150"></div>
            <div className="w-1 bg-red-500 h-3 animate-bounce delay-300"></div>
          </div>

          {/* LABEL */}
          <div className="text-xs text-gray-500">
            Past Result
          </div>
        </div>

        {/* RIGHT SIDE */}
        <div className="flex flex-col items-center gap-2">

          {/* PLAY BUTTON */}
          <button
            onClick={() => setOpen(true)}
            className="bg-blue-900 text-white p-3 rounded-full hover:scale-110 transition shadow-md hover:shadow-lg"
          >
            <Play size={20} />
          </button>

          <div className="text-xs text-gray-500">
            Play Now
          </div>
        </div>
      </div>

      {/* FOOTER (🔥 FIXED TIME — NO FORMAT FUNCTION) */}
      <div className="flex justify-between px-4 pb-3 text-sm">
        <p>
          <b>Open:</b> {openTime}
        </p>
        <p>
          <b>Close:</b> {closeTime}
        </p>
      </div>
    </div>
  );
};

export default MarketCard;
