import React, { useState, useEffect, useMemo } from 'react';
import { collection, onSnapshot, query, doc, updateDoc, writeBatch, where, setDoc, serverTimestamp, getDoc, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase';
import Loader from '../../components/Loader';
import UserBettingHistory from './UserBettingHistory';
import UserWinLoss from './UserWinLoss';
import { formatCurrency } from '../../utils/formatMoney';

const AllUsers = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedIds, setSelectedIds] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);

  // "Create user" modal state. Admin can pre-stage an account for a
  // phone number that hasn't signed up yet. When the user later signs
  // in with their phone OTP, the merge logic in PhoneSignUp.jsx /
  // PhoneSignIn.jsx picks up the pendingUsers doc and applies the
  // welcome bonus.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState('');
  const [createPhone, setCreatePhone] = useState('');
  const [createBalance, setCreateBalance] = useState('');
  const [createWinning, setCreateWinning] = useState('');
  const [createBusy, setCreateBusy] = useState(false);
  const [createError, setCreateError] = useState('');
  const [createSuccess, setCreateSuccess] = useState('');

  const resetCreateForm = () => {
    setCreateName(''); setCreatePhone('');
    setCreateBalance(''); setCreateWinning('');
    setCreateError(''); setCreateSuccess('');
  };

  const handleCreateUser = async () => {
    setCreateError(''); setCreateSuccess('');
    const trimmedName = createName.trim();
    const cleanPhone = createPhone.replace(/\D/g, '');
    if (trimmedName.length < 2) { setCreateError('Enter a valid name'); return; }
    if (cleanPhone.length !== 10) { setCreateError('Enter a 10-digit mobile number'); return; }
    const balance = Number(createBalance) || 0;
    const winning = Number(createWinning) || 0;
    if (balance < 0 || winning < 0) { setCreateError('Bonus amounts cannot be negative'); return; }

    const phoneId = '+91' + cleanPhone;
    setCreateBusy(true);
    try {
      // If a real account already exists with this phone, don't shadow it.
      const existing = users.find(u => u.phoneNumber === phoneId);
      if (existing) {
        setCreateError(`A user with this phone already exists (${existing.name || existing.id}).`);
        setCreateBusy(false);
        return;
      }
      // Don't overwrite if another admin already pre-staged this number.
      const pendingRef = doc(db, 'pendingUsers', phoneId);
      const pendingSnap = await getDoc(pendingRef);
      if (pendingSnap.exists()) {
        if (!window.confirm('A pending account already exists for this number. Overwrite it?')) {
          setCreateBusy(false);
          return;
        }
      }

      await setDoc(pendingRef, {
        name: trimmedName,
        phoneNumber: phoneId,
        balance,
        winningMoney: winning,
        appName: 'truewin',
        createdAt: serverTimestamp(),
        createdByAdmin: true,
      });
      setCreateSuccess(`Account staged for ${trimmedName} (${phoneId}). It activates the moment they log in with OTP.`);
      // Keep modal open briefly so the admin sees the success line.
      setTimeout(() => { setCreateOpen(false); resetCreateForm(); }, 1800);
    } catch (err) {
      console.error('Create user failed:', err);
      setCreateError(err.message || 'Failed to create user');
    } finally {
      setCreateBusy(false);
    }
  };

  // Real-time subscription so balance / winningMoney / suspended state
  // changes propagate to the admin's table without a page refresh — for
  // example when a user places a bet on another tab their balance drops
  // here instantly.
  useEffect(() => {
    const usersQuery = query(
      collection(db, 'users'),
      where('appName', '==', 'truewin')
    );
    const unsubscribe = onSnapshot(
      usersQuery,
      (snapshot) => {
        const usersList = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        usersList.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setUsers(usersList);
        setLoading(false);
      },
      (err) => {
        console.error('Error fetching users: ', err);
        setError('Failed to fetch users. Please check console for details.');
        setLoading(false);
      }
    );
    return () => unsubscribe();
  }, []);

  const makeAdmin = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'admin' });
      setUsers(users.map(user => user.id === userId ? { ...user, role: 'admin' } : user));
    } catch (error) {
      console.error("Error updating user role: ", error);
      setError("Failed to update user role.");
    }
  };

  const removeAdmin = async (userId) => {
    try {
      await updateDoc(doc(db, 'users', userId), { role: 'user' });
      setUsers(users.map(user => user.id === userId ? { ...user, role: 'user' } : user));
    } catch (error) {
      console.error("Error updating user role: ", error);
      setError("Failed to update user role.");
    }
  };

  const toggleSuspend = async (userId, nextSuspended) => {
    try {
      await updateDoc(doc(db, 'users', userId), { suspended: nextSuspended });
      setUsers(users.map(u => u.id === userId ? { ...u, suspended: nextSuspended } : u));
    } catch (err) {
      console.error('Suspend toggle failed:', err);
      setError('Failed to update user suspension.');
    }
  };

  const filteredUsers = useMemo(() => {
    if (!searchTerm.trim()) return users;
    const lowercasedFilter = searchTerm.toLowerCase();
    return users.filter(user =>
      user.name?.toLowerCase().includes(lowercasedFilter) ||
      user.email?.toLowerCase().includes(lowercasedFilter) ||
      user.phoneNumber?.includes(lowercasedFilter)
    );
  }, [searchTerm, users]);

  const allVisibleSelected = filteredUsers.length > 0 &&
    filteredUsers.every(u => selectedIds.has(u.id));

  const toggleSelectAllVisible = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        filteredUsers.forEach(u => next.delete(u.id));
      } else {
        filteredUsers.forEach(u => next.add(u.id));
      }
      return next;
    });
  };

  const toggleSelectOne = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedIds(new Set());

  const runBulkUpdate = async (label, updates) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!window.confirm(`${label} ${ids.length} user${ids.length > 1 ? 's' : ''}?`)) return;
    setBulkBusy(true);
    try {
      // Firestore batch limit is 500 writes — chunk just in case.
      for (let i = 0; i < ids.length; i += 400) {
        const chunk = ids.slice(i, i + 400);
        const batch = writeBatch(db);
        chunk.forEach(id => batch.update(doc(db, 'users', id), updates));
        await batch.commit();
      }
      setUsers(prev => prev.map(u => (selectedIds.has(u.id) ? { ...u, ...updates } : u)));
      clearSelection();
    } catch (err) {
      console.error('Bulk update failed:', err);
      setError('Bulk update failed. Check console.');
    } finally {
      setBulkBusy(false);
    }
  };

  const exportCsv = () => {
    const ids = Array.from(selectedIds);
    const rows = users.filter(u => ids.includes(u.id));
    if (rows.length === 0) return;
    const header = ['id', 'name', 'phoneNumber', 'email', 'role', 'suspended', 'balance', 'winningMoney'];
    const lines = [header.join(',')];
    for (const u of rows) {
      lines.push(header.map(h => {
        const v = u[h];
        if (v === undefined || v === null) return '';
        const s = String(v).replace(/"/g, '""');
        return s.includes(',') ? `"${s}"` : s;
      }).join(','));
    }
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `users-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const formatJoinDate = (timestamp) => {
    if (!timestamp) return 'N/A';
    const joinDate = timestamp.toDate();
    const today = new Date();
    const isToday = joinDate.getDate() === today.getDate() &&
                    joinDate.getMonth() === today.getMonth() &&
                    joinDate.getFullYear() === today.getFullYear();
    const options = { year: 'numeric', month: 'short', day: 'numeric' };
    const formattedDate = joinDate.toLocaleDateString(undefined, options);
    return (
      <span className={isToday ? 'text-green-600 font-medium' : 'text-gray-600'}>
        {isToday ? 'New User ' : 'Old User '} ({formattedDate})
      </span>
    );
  };

  if (loading) return <div className="flex justify-center items-center p-8"><Loader /></div>;
  if (error) return <p className="text-red-500 p-6">{error}</p>;

  const selectionCount = selectedIds.size;

  return (
    <div className="p-4 md:p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-4">All Users ({filteredUsers.length})</h2>

      <div className="mb-4 flex flex-col md:flex-row md:items-center gap-3">
        <input
          type="text"
          placeholder="Search by name, email, or phone..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="flex-1 max-w-md p-3 border border-gray-300 rounded-lg shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none"
        />
        <button
          onClick={() => { resetCreateForm(); setCreateOpen(true); }}
          className="px-4 py-3 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 transition-colors whitespace-nowrap"
        >
          + Create User
        </button>
      </div>

      {createOpen && (
        <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-bold text-gray-800">Create User Account</h3>
              <button
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="text-gray-400 hover:text-gray-700 text-2xl leading-none"
              >×</button>
            </div>

            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Enter the user's details. The account will activate as soon as they sign in with their phone OTP — name and bonus are applied automatically. Existing accounts are not modified.
            </p>

            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input
              type="text"
              value={createName}
              onChange={(e) => { setCreateName(e.target.value); setCreateError(''); }}
              placeholder="e.g. Rahul Sharma"
              className="w-full mb-3 p-2.5 border rounded-lg text-sm"
            />

            <label className="block text-sm font-medium text-gray-700 mb-1">Mobile number</label>
            <div className="flex items-center gap-2 mb-3">
              <span className="px-3 py-2.5 bg-gray-100 border rounded-lg text-sm font-semibold text-gray-700">+91</span>
              <input
                type="tel"
                inputMode="numeric"
                value={createPhone}
                onChange={(e) => {
                  setCreatePhone(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setCreateError('');
                }}
                placeholder="10-digit number"
                className="flex-1 p-2.5 border rounded-lg text-sm tracking-wide"
              />
            </div>

            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Welcome balance</label>
                <input
                  type="number"
                  value={createBalance}
                  onChange={(e) => setCreateBalance(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">Used to play (deposit-style)</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Welcome winning</label>
                <input
                  type="number"
                  value={createWinning}
                  onChange={(e) => setCreateWinning(e.target.value)}
                  placeholder="0"
                  min="0"
                  className="w-full p-2.5 border rounded-lg text-sm"
                />
                <p className="text-[10px] text-gray-500 mt-1">Withdrawable winnings</p>
              </div>
            </div>

            {createError && (
              <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
                {createError}
              </div>
            )}
            {createSuccess && (
              <div className="text-sm text-green-700 bg-green-50 border border-green-200 rounded-lg px-3 py-2 mb-3">
                {createSuccess}
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={() => { setCreateOpen(false); resetCreateForm(); }}
                className="flex-1 px-4 py-2.5 bg-gray-200 text-gray-800 font-semibold rounded-lg hover:bg-gray-300"
              >Cancel</button>
              <button
                onClick={handleCreateUser}
                disabled={createBusy}
                className="flex-1 px-4 py-2.5 bg-green-600 text-white font-semibold rounded-lg hover:bg-green-700 disabled:opacity-50"
              >
                {createBusy ? 'Creating…' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectionCount > 0 && (
        <div className="mb-4 bg-blue-50 border border-blue-200 rounded-lg p-3 flex flex-wrap items-center gap-2">
          <span className="text-sm font-semibold text-blue-900 mr-auto">
            {selectionCount} selected
          </span>
          <button
            onClick={() => runBulkUpdate('Suspend', { suspended: true })}
            disabled={bulkBusy}
            className="bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Suspend
          </button>
          <button
            onClick={() => runBulkUpdate('Unsuspend', { suspended: false })}
            disabled={bulkBusy}
            className="bg-green-600 hover:bg-green-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Unsuspend
          </button>
          <button
            onClick={() => runBulkUpdate('Make admin', { role: 'admin' })}
            disabled={bulkBusy}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Make admin
          </button>
          <button
            onClick={() => runBulkUpdate('Remove admin from', { role: 'user' })}
            disabled={bulkBusy}
            className="bg-gray-600 hover:bg-gray-700 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Remove admin
          </button>
          <button
            onClick={exportCsv}
            disabled={bulkBusy}
            className="bg-slate-700 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold px-3 py-1.5 rounded"
          >
            Export CSV
          </button>
          <button
            onClick={clearSelection}
            disabled={bulkBusy}
            className="text-blue-700 text-xs font-bold px-3 py-1.5 rounded hover:bg-blue-100"
          >
            Clear
          </button>
        </div>
      )}

      <div className="overflow-x-auto bg-white rounded-lg shadow">
        <table className="w-full min-w-[880px]">
          <thead className="bg-gray-50 border-b border-gray-200">
            <tr>
              <th className="p-3 w-10">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleSelectAllVisible}
                  aria-label="Select all visible"
                />
              </th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Name</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Phone Number</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Email</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Win/Loss</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Role</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Status</th>
              <th className="p-4 text-left text-sm font-semibold text-gray-600">Joined Date</th>
              <th className="p-4 text-right text-sm font-semibold text-gray-600">Total Balance</th>
              <th className="p-4 text-center text-sm font-semibold text-gray-600">Action</th>
            </tr>
          </thead>
          <tbody>
            {filteredUsers.map(user => {
              const totalBalance = (user.balance || 0) + (user.winningMoney || 0);
              const isSelected = selectedIds.has(user.id);
              const isSuspended = !!user.suspended;
              return (
                <tr
                  key={user.id}
                  className={`border-b border-gray-200 last:border-0 transition-colors ${
                    isSelected ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}
                >
                  <td className="p-3">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleSelectOne(user.id)}
                      aria-label={`Select ${user.name || user.id}`}
                    />
                  </td>
                  <td className="p-4 font-medium text-blue-600 hover:underline cursor-pointer" onClick={() => setSelectedUser(user)}>
                    {user.name || 'N/A'}
                  </td>
                  <td className="p-4 text-gray-600">{user.phoneNumber || 'N/A'}</td>
                  <td className="p-4 text-gray-600">{user.email || 'N/A'}</td>
                  <td className="p-4 text-gray-600"><UserWinLoss userIdentity={user} /></td>
                  <td className="p-4 text-gray-600">{user.role || 'user'}</td>
                  <td className="p-4">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-semibold ${
                      isSuspended ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'
                    }`}>
                      {isSuspended ? 'Suspended' : 'Active'}
                    </span>
                  </td>
                  <td className="p-4 text-left text-gray-600">{formatJoinDate(user.createdAt)}</td>
                  <td className="p-4 text-right font-semibold text-gray-800">{formatCurrency(totalBalance)}</td>
                  <td className="p-4 text-center">
                    <div className="flex flex-col sm:flex-row items-stretch gap-1 justify-center">
                      {user.role === 'admin' ? (
                        <button
                          onClick={() => removeAdmin(user.id)}
                          className="bg-red-500 hover:bg-red-700 text-white font-bold py-1 px-3 rounded text-xs"
                        >
                          Remove Admin
                        </button>
                      ) : (
                        <button
                          onClick={() => makeAdmin(user.id)}
                          className="bg-blue-500 hover:bg-blue-700 text-white font-bold py-1 px-3 rounded text-xs"
                        >
                          Make Admin
                        </button>
                      )}
                      <button
                        onClick={() => toggleSuspend(user.id, !isSuspended)}
                        className={`${
                          isSuspended
                            ? 'bg-green-600 hover:bg-green-700'
                            : 'bg-amber-600 hover:bg-amber-700'
                        } text-white font-bold py-1 px-3 rounded text-xs`}
                      >
                        {isSuspended ? 'Unsuspend' : 'Suspend'}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {selectedUser && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
            <div className="p-4 border-b flex justify-between items-center sticky top-0 bg-white z-10">
              <h3 className="text-xl font-bold">Betting History for {selectedUser.name}</h3>
              <button onClick={() => setSelectedUser(null)} className="text-gray-500 hover:text-gray-800 font-bold text-2xl">&times;</button>
            </div>
            <div className="p-4">
              <UserBettingHistory userIdentity={selectedUser} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AllUsers;
