import { useEffect, useState } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from './firebase';

import SpinWheel from './Pages/SpinWheel';
import FixNumber from './Pages/FixNumber';
import WinGame from './Pages/WinGame';
import PhoneSignUp from './Pages/PhoneSignUp';
import Navbar from './components/Navbar';
import Home from './Pages/Home';
import useAuthStore from './store/authStore';
import { AddCash } from './Pages/AddCash';
import Pay from './Pages/Pay';
import { MyWallet } from './Pages/Wallet';
import PaymentConfirmation from './Pages/PaymentConfirmation';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Withdraw from './Pages/Withdraw';
import AdminDashboard from './Admin/Admin';

import AdminRoute from './Admin/AdminRoute';
import Spinner from './components/Loader';
import Profile from './Pages/Profile';
import Support from './Pages/Support';
import History from './Pages/History';
import PrivacyPolicy from './components/PrivacyPolicy';
import BettingHistory from './components/BettingHistory';
import PhoneSignIn from './Pages/PhoneSignIn';
import GameSummary from './Admin/components/ProfitLoss';
import Referrals from './Pages/Referrals';
import Aviator from './Pages/Aviator';
import TeenPatti from './Pages/TeenPatti';
import DragonTiger from './Pages/DragonTiger';
import AndarBahar from './Pages/AndarBahar';
import ColorPrediction from './Pages/ColorPrediction';
import CoinFlip from './Pages/CoinFlip';
import DiceRoll from './Pages/DiceRoll';

const AppContent = () => {
  const location = useLocation();
  // The Navbar will not be shown on the /Admin route
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const showNavbar = location.pathname.toLowerCase() !== '/admin';

  useEffect(() => {
    if (user && user.role === 'admin') {
      navigate('/admin');
    }
  }, [user, navigate]);

  return (
    <>
      {showNavbar && <Navbar />}
      <ToastContainer
        position="top-right"
        autoClose={5000}
        hideProgressBar={false}
        newestOnTop={false}
        closeOnClick
        rtl={false}
        pauseOnFocusLoss
        draggable
        pauseOnHover
        theme="dark"
      />
    
    
        <Routes>
          <Route path="/" element={<Home />} />
        <Route path="/spinwheel" element={<SpinWheel />} />
        <Route path="/fixnumber" element={<FixNumber />} />
        <Route path="/wingame" element={<WinGame />} />
        <Route path="/login" element={<PhoneSignIn />} />
        <Route path="/testphonesignup" element={<PhoneSignUp />} />
        <Route path="/addcash" element={<AddCash />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/pay" element={<Pay />} />
        <Route path="/withdraw" element={<Withdraw />} />
        <Route path="/payconfirm" element={<PaymentConfirmation />} />
        <Route path="/wallet" element={<MyWallet />} />
        <Route path="/support" element={<Support />} />
        <Route path="/history" element={<History />} />
        <Route path="/privacy" element={<PrivacyPolicy/>} />
        <Route path="/p" element={<GameSummary />} />
        <Route path="/refer" element={<Referrals />} />
        <Route path="/bettinghistory" element={<BettingHistory />} />
        <Route path="/aviator" element={<Aviator />} />
        <Route path="/teenpatti" element={<TeenPatti />} />
        <Route path="/dragontiger" element={<DragonTiger />} />
        <Route path="/andarbahar" element={<AndarBahar />} />
        <Route path="/colorprediction" element={<ColorPrediction />} />
        <Route path="/coinflip" element={<CoinFlip />} />
        <Route path="/diceroll" element={<DiceRoll />} />
        <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
      </Routes>
    
    </>
  );
}

const App = () => {
  const { login, user } = useAuthStore();
  const auth = getAuth();
  const [loadingAuth, setLoadingAuth] = useState(!user);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (userAuth) => {
      if (userAuth) {
        const userRef = doc(db, "users", userAuth.uid);
        const userSnap = await getDoc(userRef);
        if (userSnap.exists()) {
          login({ ...userAuth, ...userSnap.data() });
        } else {
          login(userAuth);
        }
      } else {
        login(null);
      }
      setLoadingAuth(false); // Auth state determined
    });

    return () => unsubscribe();
  }, [auth, login]);

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-[#042346] text-white flex items-center justify-center">
        <Spinner />
      </div>
    );
  }

  return <AppContent />;
};

export default App;
