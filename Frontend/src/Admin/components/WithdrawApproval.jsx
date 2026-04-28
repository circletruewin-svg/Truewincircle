import React, { useMemo, useState } from 'react';
import { Check, X, Search } from 'lucide-react';
import { formatCurrency } from '../../utils/formatMoney';

// Modal for showing detailed user info - Copied from PaymentApproval.jsx
const UserInfoModal = ({ user, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
      <h4 className="font-semibold text-lg mb-4 text-gray-800">User Information</h4>
      {user ? (
        <div className="space-y-2 text-gray-700">
          <p><strong>Name:</strong> {user.name || 'N/A'}</p>
          <p><strong>Phone Number:</strong> {user.phoneNumber || 'N/A'}</p>
        </div>
      ) : (
        <p className="text-gray-600">User information not available.</p>
      )}
      <button onClick={onClose} className="mt-6 w-full bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">
        Close
      </button>
    </div>
  </div>
);

const WithdrawApproval = ({ withdrawals, userDetails, handleWithdrawalApproval }) => {
  const [userInfoModal, setUserInfoModal] = useState({ isOpen: false, user: null });
  const [searchTerm, setSearchTerm] = useState('');

  const filteredWithdrawals = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matched = !term ? withdrawals : withdrawals.filter((withdrawal) => {
      const user = userDetails[withdrawal.userId] || {};
      const name = (withdrawal.name || user.name || '').toLowerCase();
      const phone = (user.phoneNumber || '').toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
    // Newest first.
    const tsOf = (w) => {
      const v = w.createdAt;
      if (!v) return 0;
      if (v?.toDate) return v.toDate().getTime();
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    return [...matched].sort((a, b) => tsOf(b) - tsOf(a));
  }, [withdrawals, userDetails, searchTerm]);

  return (
    <div className="p-6">
      {userInfoModal.isOpen && <UserInfoModal user={userInfoModal.user} onClose={() => setUserInfoModal({ isOpen: false, user: null })} />}
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-semibold">Withdrawal Approvals</h3>
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search by name or phone…"
              className="w-full pl-9 pr-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left p-4 font-medium">User</th>
                <th className="text-left p-4 font-medium">Amount</th>
                <th className="text-left p-4 font-medium">Method</th>
                <th className="text-left p-4 font-medium">Details</th> 
                <th className="text-left p-4 font-medium">Status</th>
               
                <th className="text-left p-4 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredWithdrawals.length === 0 && (
                <tr>
                  <td colSpan={6} className="p-6 text-center text-gray-500">
                    {searchTerm ? 'No withdrawals match your search.' : 'No withdrawals to display.'}
                  </td>
                </tr>
              )}
              {filteredWithdrawals.map(withdrawal => (
                <tr key={withdrawal.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <button
                        onClick={() => setUserInfoModal({ isOpen: true, user: userDetails[withdrawal.userId] })}
                        className="font-medium text-blue-600 hover:underline"
                    >
                        {withdrawal.name || userDetails[withdrawal.userId]?.name || 'Unknown User'}
                    </button>
                  </td>
                  <td className="p-4 font-medium">{formatCurrency(withdrawal.amount)}</td>
                  <td className="p-4">{withdrawal.method === 'upi' ? 'UPI' : 'Bank Transfer'}</td> 
                  <td className="p-4"> 
                    {withdrawal.method === 'upi' ? (
                      withdrawal.upiId
                    ) : (
                      <div className="flex flex-col text-sm">
                        <span>Acc: {withdrawal.accountNumber}</span>
                        <span>IFSC: {withdrawal.ifscCode}</span>
                        <span>Bank: {withdrawal.bankName}</span>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      withdrawal.status === 'pending' 
                        ? 'bg-yellow-100 text-yellow-800' 
                        : withdrawal.status === 'approved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-red-100 text-red-800'
                    }`}>
                      {withdrawal.status}
                    </span>
                  </td>
                 
                  <td className="p-4">
                    {withdrawal.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleWithdrawalApproval(withdrawal.id, 'approved', withdrawal.userId, withdrawal.amount)}
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleWithdrawalApproval(withdrawal.id, 'rejected', withdrawal.userId, withdrawal.amount)}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default WithdrawApproval;
