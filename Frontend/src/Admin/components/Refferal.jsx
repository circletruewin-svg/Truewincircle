import React from "react";
import { Users, Wallet, UserPlus, ArrowRight } from "lucide-react";

export default function ReferralComponent() {
  const referredUsers = [
    { name: "John Doe", earned: 120 },
    { name: "Sarah Parker", earned: 80 },
    { name: "Michael Lee", earned: 50 },
  ];

  const totalEarnings = referredUsers.reduce((sum, u) => sum + u.earned, 0);

  return (
    <div className="w-full p-6 max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="rounded-2xl p-6 bg-gray-900 border border-gray-700 shadow-lg text-white">
        <h2 className="text-xl font-semibold flex items-center gap-2 mb-3">
          <UserPlus className="w-5 h-5" /> Referral Summary
        </h2>

        <p className="text-gray-300 text-sm">Below is the list of people you referred and the amount you earned from each.</p>
      </div>

      {/* Total Earnings */}
      <div className="rounded-2xl p-5 bg-gray-900 border border-gray-700 shadow-lg flex items-center justify-between text-white">
        <div className="flex items-center gap-3">
          <Wallet className="w-8 h-8 text-green-400" />
          <div>
            <p className="text-sm text-gray-300">Total Referral Earnings</p>
            <h3 className="text-2xl font-semibold text-green-400">₹{totalEarnings}</h3>
          </div>
        </div>
      </div>

      {/* Referred Users List */}
      <div className="rounded-2xl p-6 bg-gray-900 border border-gray-700 shadow-lg text-white">
        <h3 className="text-lg font-semibold flex items-center gap-2 mb-4">
          <Users className="w-5 h-5" /> Referred Users
        </h3>

        {referredUsers.length === 0 ? (
          <p className="text-gray-400 text-sm">You haven't referred anyone yet.</p>
        ) : (
          <div className="space-y-3">
            {referredUsers.map((user, index) => (
              <div
                key={index}
                className="flex items-center justify-between p-3 rounded-xl bg-gray-800 border border-gray-700 hover:bg-gray-750 transition"
              >
                <div className="flex items-center gap-3">
                  <ArrowRight className="w-4 h-4 text-gray-400" />
                  <p className="text-gray-200 font-medium">{user.name}</p>
                </div>
                <p className="text-green-400 font-semibold">₹{user.earned}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}