import React from 'react';
import { Navigate } from 'react-router-dom';
import useAuthStore from '../store/authStore';

// Mirror of AdminRoute — only role === 'master' may enter /master.
// Admin and regular users are bounced to their respective homes so a
// shared device can't accidentally browse into another role's panel.
const MasterRoute = ({ children }) => {
  const { user } = useAuthStore();
  if (!user) return <Navigate to="/login" />;
  if (user.role === 'admin')  return <Navigate to="/admin" />;
  if (user.role !== 'master') return <Navigate to="/" />;
  return children;
};

export default MasterRoute;
