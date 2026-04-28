import React, { useMemo, useState } from 'react';
import { Check, X, Trash2, Eye, Search } from 'lucide-react';
import { formatCurrency } from '../../utils/formatMoney';

// Modal for showing the full payment message
const MessageModal = ({ message, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
      <h4 className="font-semibold text-lg mb-4 text-gray-800">Full Payment Message</h4>
      <p className="text-gray-600 whitespace-pre-wrap bg-gray-100 p-4 rounded-md">{message}</p>
      <button onClick={onClose} className="mt-6 w-full bg-gray-700 text-white py-2 rounded-lg hover:bg-gray-600 transition-colors">
        Close
      </button>
    </div>
  </div>
);

// Modal for showing detailed user info
const UserInfoModal = ({ user, onClose }) => (
  <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
    <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
      <h4 className="font-semibold text-lg mb-4 text-gray-800">User Information</h4>
      {user ? (
        <div className="space-y-2 text-gray-700">
          <p><strong>Name:</strong> {user.name || 'N/A'}</p>
          <p><strong>Phone Number:</strong> {user.phoneNumber || 'N/A'}</p>
          {/* Add more user info fields here if needed */}
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

// Modal for selecting a rejection reason
const RejectionModal = ({ onConfirm, onCancel }) => {
  const [reason, setReason] = useState('');
  const reasons = ["Wrong screenshot", "Amount mismatch", "Not clear", "Fake"];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
        <h4 className="font-semibold text-lg mb-4 text-gray-800">Select Rejection Reason</h4>
        <div className="space-y-2">
          <select 
            value={reason} 
            onChange={(e) => setReason(e.target.value)}
            className="w-full p-2 border rounded-md bg-gray-50"
          >
            <option value="" disabled>-- Select a reason --</option>
            {reasons.map(r => <option key={r} value={r}>{r}</option>)}
          </select>
        </div>
        <div className="mt-6 flex space-x-4">
          <button onClick={onCancel} className="w-full bg-gray-200 text-gray-800 py-2 rounded-lg hover:bg-gray-300 transition-colors">
            Cancel
          </button>
          <button 
            onClick={() => onConfirm(reason)}
            disabled={!reason}
            className="w-full bg-red-500 text-white py-2 rounded-lg hover:bg-red-600 transition-colors disabled:bg-red-300"
          >
            Confirm Rejection
          </button>
        </div>
      </div>
    </div>
  );
};

const PaymentApproval = ({ payments, userDetails, handlePaymentApproval, handleDeletePayment }) => {
  const [messageModal, setMessageModal] = useState({ isOpen: false, message: '' });
  const [rejectionModal, setRejectionModal] = useState({ isOpen: false, payment: null });
  const [userInfoModal, setUserInfoModal] = useState({ isOpen: false, user: null });
  const [processingIds, setProcessingIds] = useState({});
  const [searchTerm, setSearchTerm] = useState('');

  const handleApproveClick = (payment) => {
    if (processingIds[payment.id]) return;
    setProcessingIds(prev => ({ ...prev, [payment.id]: true }));
    handlePaymentApproval(payment.id, 'approved', payment.userId, payment.amount);
  };

  const handleRejectClick = (payment) => {
    setRejectionModal({ isOpen: true, payment });
  };

  const confirmRejection = (reason) => {
    const { payment } = rejectionModal;
    if (payment && reason) {
      handlePaymentApproval(payment.id, 'rejected', payment.userId, payment.amount, reason);
      setRejectionModal({ isOpen: false, payment: null });
    }
  };

  const filteredPayments = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const matched = !term ? payments : payments.filter((payment) => {
      const user = userDetails[payment.userId] || {};
      const name = (payment.name || user.name || '').toLowerCase();
      const phone = (user.phoneNumber || '').toLowerCase();
      return name.includes(term) || phone.includes(term);
    });
    // Newest first — admin almost always wants the latest deposit on top.
    const tsOf = (p) => {
      const v = p.createdAt;
      if (!v) return 0;
      if (v?.toDate) return v.toDate().getTime();
      const t = new Date(v).getTime();
      return Number.isFinite(t) ? t : 0;
    };
    return [...matched].sort((a, b) => tsOf(b) - tsOf(a));
  }, [payments, userDetails, searchTerm]);

  return (
    <div className="p-6">
      {messageModal.isOpen && <MessageModal message={messageModal.message} onClose={() => setMessageModal({ isOpen: false, message: '' })} />}
      {userInfoModal.isOpen && <UserInfoModal user={userInfoModal.user} onClose={() => setUserInfoModal({ isOpen: false, user: null })} />}
      {rejectionModal.isOpen && <RejectionModal onCancel={() => setRejectionModal({ isOpen: false, payment: null })} onConfirm={confirmRejection} />}

      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <h3 className="text-lg font-semibold">Payment Approvals</h3>
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
                <th className="text-left p-4 font-medium">Message</th>
                <th className="text-left p-4 font-medium">Proof</th>
                <th className="text-left p-4 font-medium">Status</th>
                <th className="text-left p-4 font-medium">Date</th>
                <th className="text-left p-4 font-medium">Actions</th>
                <th className="text-left p-4 font-medium">Delete</th>
              </tr>
            </thead>
            <tbody>
              {filteredPayments.length === 0 && (
                <tr>
                  <td colSpan={8} className="p-6 text-center text-gray-500">
                    {searchTerm ? 'No payments match your search.' : 'No payments to display.'}
                  </td>
                </tr>
              )}
              {filteredPayments.map(payment => (
                <tr key={payment.id} className="border-b hover:bg-gray-50">
                  <td className="p-4">
                    <button onClick={() => setUserInfoModal({ isOpen: true, user: userDetails[payment.userId] })} className="font-medium text-blue-600 hover:underline">
                      {payment.name || userDetails[payment.userId]?.name || 'Unknown User'}
                    </button>
                  </td>
                  <td className="p-4 font-medium">{formatCurrency(payment.amount)}</td>
                  <td className="p-4 max-w-xs">
                    {payment.message ? (
                      payment.message.length > 30 ? (
                        <div className="flex items-center space-x-2">
                          <span className="truncate">{payment.message}</span>
                          <button onClick={() => setMessageModal({ isOpen: true, message: payment.message })} className="p-1 text-gray-500 hover:text-gray-800">
                            <Eye size={16} />
                          </button>
                        </div>
                      ) : ( payment.message )
                    ) : ( <span className="text-gray-400">--</span> )}
                  </td>
                  <td className="p-4">
                    <a href={payment.paymentProof} target="_blank" rel="noopener noreferrer" className="text-blue-500 hover:underline">
                      View Proof
                    </a>
                  </td>
                  <td className="p-4">
                    <span className={`px-2 py-1 rounded-full text-xs ${
                      payment.status === 'pending' ? 'bg-yellow-100 text-yellow-800' : 
                      payment.status === 'approved' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
                    }`}>
                      {payment.status}
                    </span>
                  </td>
                  <td className="p-4 text-gray-600">{payment.date}</td>
                  <td className="p-4">
                    {payment.status === 'pending' && (
                      <div className="flex space-x-2">
                        <button 
                          onClick={() => handleApproveClick(payment)}
                          disabled={processingIds[payment.id]}
                          className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:bg-green-300 disabled:cursor-not-allowed"
                        >
                          <Check className="h-4 w-4" />
                        </button>
                        <button 
                          onClick={() => handleRejectClick(payment)}
                          className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="p-4">
                    <button 
                      onClick={() => handleDeletePayment(payment.id)}
                      className="p-2 bg-gray-500 text-white rounded-lg hover:bg-gray-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
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

export default PaymentApproval;
