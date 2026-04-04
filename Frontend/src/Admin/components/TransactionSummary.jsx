import React, { useMemo, useState } from "react";
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import { ArrowDownCircle, ArrowUpCircle, Calendar } from "lucide-react";
import { formatCurrency } from "../../utils/formatMoney";
import { getPresetRange, isDateInRange, toDateValue } from "../../utils/dateHelpers";

export default function TransactionSummary({ payments = [], withdrawals = [], userDetails = {} }) {
  const initialRange = getPresetRange("today");
  const [preset, setPreset] = useState("today");
  const [startDate, setStartDate] = useState(initialRange.start);
  const [endDate, setEndDate] = useState(initialRange.end);

  const filteredPayments = useMemo(
    () => payments.filter((payment) => isDateInRange(payment.createdAt, startDate, endDate)),
    [payments, startDate, endDate]
  );

  const filteredWithdrawals = useMemo(
    () => withdrawals.filter((withdrawal) => isDateInRange(withdrawal.createdAt, startDate, endDate)),
    [withdrawals, startDate, endDate]
  );

  const summary = useMemo(() => {
    const approvedDeposits = filteredPayments.filter((payment) => payment.status === "approved");
    const approvedWithdrawals = filteredWithdrawals.filter((withdrawal) => withdrawal.status === "approved");

    return {
      depositsCount: approvedDeposits.length,
      withdrawalsCount: approvedWithdrawals.length,
      depositsAmount: approvedDeposits.reduce((acc, item) => acc + Number(item.amount || 0), 0),
      withdrawalsAmount: approvedWithdrawals.reduce((acc, item) => acc + Number(item.amount || 0), 0),
    };
  }, [filteredPayments, filteredWithdrawals]);

  const applyPresetFilter = (nextPreset) => {
    setPreset(nextPreset);
    const nextRange = getPresetRange(nextPreset);
    setStartDate(nextRange.start);
    setEndDate(nextRange.end);
  };

  const renderRows = (items, type) => {
    if (!items.length) {
      return <div className="rounded-xl bg-gray-50 px-4 py-5 text-sm text-gray-500">Is range me koi {type} record nahi mila.</div>;
    }

    return (
      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white">
        <table className="w-full min-w-[680px]">
          <thead className="bg-gray-50">
            <tr className="text-left text-sm text-gray-600">
              <th className="px-4 py-3">User</th>
              <th className="px-4 py-3">Amount</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Date</th>
              <th className="px-4 py-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {items
              .slice()
              .sort((a, b) => (toDateValue(b.createdAt)?.getTime() || 0) - (toDateValue(a.createdAt)?.getTime() || 0))
              .map((item) => (
                <tr key={item.id} className="border-t border-gray-100 text-sm text-gray-700">
                  <td className="px-4 py-3 font-semibold">{item.name || userDetails[item.userId]?.name || "Unknown User"}</td>
                  <td className="px-4 py-3 font-bold text-gray-900">{formatCurrency(item.amount)}</td>
                  <td className="px-4 py-3 capitalize">{item.status || "pending"}</td>
                  <td className="px-4 py-3">{toDateValue(item.createdAt)?.toLocaleString("en-IN") || "N/A"}</td>
                  <td className="px-4 py-3">
                    {type === "deposit"
                      ? item.message || item.paymentMethod || "Top-up request"
                      : item.method === "upi"
                        ? item.upiId || "UPI withdrawal"
                        : `${item.bankName || "Bank"} / ${item.accountNumber || "N/A"}`}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  };

  return (
    <div className="space-y-6 p-6">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h3 className="text-2xl font-bold text-gray-900">Deposit & Withdrawal Summary</h3>
          <p className="mt-1 text-sm text-gray-600">By default today ka data dikh raha hai. Calendar aur quick filters se kisi bhi range ka total deposit aur withdrawal dekh sakte ho.</p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 rounded-xl border border-gray-200 bg-white px-3 py-2 text-sm text-gray-700">
            <Calendar className="h-4 w-4 text-blue-600" />
            <DatePicker selected={startDate} onChange={(date) => setStartDate(date)} selectsStart startDate={startDate} endDate={endDate} className="w-28 outline-none" />
            <span>to</span>
            <DatePicker selected={endDate} onChange={(date) => setEndDate(date)} selectsEnd startDate={startDate} endDate={endDate} minDate={startDate} className="w-28 outline-none" />
          </div>
          {[{ id: "today", label: "Today" }, { id: "yesterday", label: "Yesterday" }, { id: "7days", label: "Last 7 Days" }].map((item) => (
            <button
              key={item.id}
              onClick={() => applyPresetFilter(item.id)}
              className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${preset === item.id ? "bg-blue-600 text-white" : "border border-gray-200 bg-white text-gray-700 hover:border-blue-300"}`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Approved Deposits</p>
          <p className="mt-3 text-3xl font-black text-gray-900">{summary.depositsCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Deposit Amount</p>
          <p className="mt-3 text-3xl font-black text-green-600">{formatCurrency(summary.depositsAmount)}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Approved Withdrawals</p>
          <p className="mt-3 text-3xl font-black text-gray-900">{summary.withdrawalsCount}</p>
        </div>
        <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
          <p className="text-sm font-medium text-gray-500">Withdrawal Amount</p>
          <p className="mt-3 text-3xl font-black text-red-500">{formatCurrency(summary.withdrawalsAmount)}</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowDownCircle className="h-5 w-5 text-green-600" />
            <h4 className="text-lg font-bold text-gray-900">Deposits</h4>
          </div>
          {renderRows(filteredPayments, "deposit")}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <ArrowUpCircle className="h-5 w-5 text-red-500" />
            <h4 className="text-lg font-bold text-gray-900">Withdrawals</h4>
          </div>
          {renderRows(filteredWithdrawals, "withdrawal")}
        </div>
      </div>
    </div>
  );
}
