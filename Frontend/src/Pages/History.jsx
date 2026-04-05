import React, { useEffect, useMemo, useState } from "react";
import { collection, getDocs, query, where } from "firebase/firestore";
import { ArrowDownCircle, ArrowUpCircle, AlertTriangle, Clock, Gift, ShieldX, Trophy } from "lucide-react";
import { db } from "../firebase";
import Loader from "../components/Loader";
import Navbar from "../components/Navbar";
import useAuthStore from "../store/authStore";
import { formatDateTime, toDateValue } from "../utils/dateHelpers";
import { formatCurrency, roundMoney } from "../utils/formatMoney";
import { fetchUserHistoryRecords, summarizeUserHistory } from "../utils/userHistorySources";

const normalizeDocDate = (value) => toDateValue(value);

const buildFinancialItems = async (userId) => {
  const depositsQuery = query(collection(db, "top-ups"), where("userId", "==", userId));
  const withdrawalsQuery = query(collection(db, "withdrawals"), where("userId", "==", userId));
  const referralBonusQuery = query(
    collection(db, "transactions"),
    where("userId", "==", userId),
    where("type", "==", "referral_bonus")
  );

  const [depositsSnapshot, withdrawalsSnapshot, referralBonusSnapshot] = await Promise.all([
    getDocs(depositsQuery),
    getDocs(withdrawalsQuery),
    getDocs(referralBonusQuery),
  ]);

  const deposits = depositsSnapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const date = normalizeDocDate(data.createdAt);
      if (!date) return null;

      return {
        id: `deposit-${docSnap.id}`,
        type: "deposit",
        title: "Deposit",
        subtitle: data.status || "pending",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  const withdrawals = withdrawalsSnapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const date = normalizeDocDate(data.createdAt);
      if (!date) return null;

      return {
        id: `withdrawal-${docSnap.id}`,
        type: "withdrawal",
        title: data.method === "upi" ? "Withdrawal (UPI)" : data.method === "bank" ? "Withdrawal (Bank)" : "Withdrawal",
        subtitle: data.status || "pending",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  const referralBonuses = referralBonusSnapshot.docs
    .map((docSnap) => {
      const data = docSnap.data();
      const date = normalizeDocDate(data.createdAt);
      if (!date) return null;

      return {
        id: `referral-${docSnap.id}`,
        type: "referral_bonus",
        title: "Referral Bonus",
        subtitle: "Received",
        amount: Number(data.amount || 0),
        date,
        raw: data,
      };
    })
    .filter(Boolean);

  return [...deposits, ...withdrawals, ...referralBonuses];
};

const mapGameRecordToFeedItem = (record) => {
  const amount = Number(record.amount || 0);
  const payout = Number(record.payout || 0);

  if (record.status === "win") {
    return {
      id: `game-${record.sourceId}-${record.id}`,
      type: "win",
      title: `${record.gameName} Win`,
      subtitle: record.title,
      amount: payout,
      betAmount: amount,
      date: toDateValue(record.createdAt),
      raw: record,
    };
  }

  if (record.status === "loss") {
    return {
      id: `game-${record.sourceId}-${record.id}`,
      type: "loss",
      title: `${record.gameName} Loss`,
      subtitle: record.title,
      amount,
      betAmount: amount,
      date: toDateValue(record.createdAt),
      raw: record,
    };
  }

  return {
    id: `game-${record.sourceId}-${record.id}`,
    type: "bet_placed",
    title: `${record.gameName} Bet`,
    subtitle: record.title,
    amount,
    betAmount: amount,
    date: toDateValue(record.createdAt),
    raw: record,
  };
};

const SummaryCard = ({ label, value, className = "" }) => (
  <div className={`rounded-2xl border border-gray-800 bg-gray-800/80 p-4 ${className}`}>
    <p className="text-sm text-gray-400">{label}</p>
    <p className="mt-2 text-2xl font-black text-white">{value}</p>
  </div>
);

const History = () => {
  const user = useAuthStore((state) => state.user);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!user?.uid) {
        setError("Please log in to view your history.");
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const [financialItems, gameRecords] = await Promise.all([
          buildFinancialItems(user.uid),
          fetchUserHistoryRecords(db, user.uid),
        ]);

        const gameItems = gameRecords.map(mapGameRecordToFeedItem).filter((item) => item.date);
        const combinedHistory = [...financialItems, ...gameItems].sort((a, b) => b.date.getTime() - a.date.getTime());
        setHistory(combinedHistory);
      } catch (err) {
        console.error("Error fetching transaction history:", err);
        setError("Failed to load transaction history.");
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [user?.uid]);

  const summary = useMemo(() => {
    const gameSummary = summarizeUserHistory(
      history
        .filter((item) => ["win", "loss", "bet_placed"].includes(item.type))
        .map((item) => ({
          status: item.type === "bet_placed" ? "pending" : item.type,
          amount: item.betAmount || item.amount || 0,
          payout: item.type === "win" ? item.amount || 0 : 0,
        }))
    );

    const deposits = history
      .filter((item) => item.type === "deposit" && item.subtitle === "approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    const withdrawals = history
      .filter((item) => item.type === "withdrawal" && item.subtitle === "approved")
      .reduce((sum, item) => sum + Number(item.amount || 0), 0);

    return {
      win: roundMoney(gameSummary.win),
      loss: roundMoney(gameSummary.loss),
      deposits: roundMoney(deposits),
      withdrawals: roundMoney(withdrawals),
    };
  }, [history]);

  const renderHistoryItem = (item) => {
    let Icon;
    let amountColor = "text-white";
    let sign = "";
    let statusColor = "text-gray-400";

    switch (item.type) {
      case "deposit":
        Icon = <ArrowDownCircle className="text-green-500" />;
        amountColor = "text-green-500";
        sign = "+";
        statusColor = item.subtitle === "approved" ? "text-green-400" : item.subtitle === "rejected" ? "text-red-400" : "text-yellow-400";
        break;
      case "withdrawal":
        Icon = <ArrowUpCircle className="text-red-500" />;
        amountColor = "text-red-500";
        sign = "-";
        statusColor = item.subtitle === "approved" ? "text-green-400" : item.subtitle === "rejected" ? "text-red-400" : "text-yellow-400";
        break;
      case "win":
        Icon = <Trophy className="text-yellow-500" />;
        amountColor = "text-yellow-500";
        sign = "+";
        break;
      case "loss":
        Icon = <ShieldX className="text-gray-500" />;
        amountColor = "text-red-400";
        sign = "-";
        break;
      case "bet_placed":
        Icon = <Clock className="text-blue-400" />;
        amountColor = "text-blue-300";
        sign = "-";
        statusColor = "text-blue-400";
        break;
      case "referral_bonus":
        Icon = <Gift className="text-purple-500" />;
        amountColor = "text-purple-400";
        sign = "+";
        statusColor = "text-green-400";
        break;
      default:
        return null;
    }

    const stamp = formatDateTime(item.date);
    const detailLine =
      item.type === "withdrawal"
        ? item.raw?.method === "upi"
          ? item.raw?.upiId
          : [item.raw?.bankName, item.raw?.accountNumber].filter(Boolean).join(" - ")
        : item.subtitle;

    return (
      <div key={item.id} className="bg-gray-800 p-4 rounded-lg flex items-center justify-between shadow-md">
        <div className="flex items-center space-x-4">
          <div className="p-2 rounded-full bg-gray-900">{Icon}</div>
          <div>
            <p className="font-semibold">{item.title}</p>
            <p className="text-xs text-gray-400">{stamp.date} {stamp.time}</p>
            <p className="text-xs text-gray-500 mt-0.5">{detailLine}</p>
          </div>
        </div>
        <div className="text-right">
          <p className={`font-bold text-lg ${amountColor}`}>
            {sign}{formatCurrency(item.amount || 0)}
          </p>
          <p className={`text-xs capitalize font-semibold ${statusColor}`}>
            {item.subtitle}
          </p>
        </div>
      </div>
    );
  };

  if (loading) return <Loader />;

  if (error) {
    return (
      <div className="text-center text-red-400 mt-20 p-4 flex flex-col items-center">
        <AlertTriangle className="w-12 h-12 mb-4" />
        <h2 className="text-xl font-semibold">An Error Occurred</h2>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="font-roboto bg-gray-900 text-white min-h-screen">
      <Navbar />
      <div className="max-w-4xl mx-auto p-4 pt-24">
        <h1 className="text-3xl font-black text-yellow-400 mb-6 text-center">Transaction History</h1>

        <div className="grid grid-cols-1 gap-4 mb-6 md:grid-cols-2 xl:grid-cols-4">
          <SummaryCard label="Total Wins" value={formatCurrency(summary.win)} />
          <SummaryCard label="Total Losses" value={formatCurrency(summary.loss)} />
          <SummaryCard label="Approved Deposits" value={formatCurrency(summary.deposits)} />
          <SummaryCard label="Approved Withdrawals" value={formatCurrency(summary.withdrawals)} />
        </div>

        {history.length === 0 ? (
          <p className="text-center text-gray-400">You have no transactions yet.</p>
        ) : (
          <div className="space-y-4">{history.map(renderHistoryItem)}</div>
        )}
      </div>
    </div>
  );
};

export default History;
