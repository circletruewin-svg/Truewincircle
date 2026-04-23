import { useEffect, useState, lazy, Suspense } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { getAuth, onAuthStateChanged } from "firebase/auth";
import { doc, getDoc } from "firebase/firestore";
import { db } from './firebase';

import Navbar from './components/Navbar';
import useAuthStore from './store/authStore';
import { ToastContainer } from 'react-toastify';
import 'react-toastify/dist/ReactToastify.css';
import Spinner from './components/Loader';
import { buildSessionUser } from './utils/sessionUser';

const Home = lazy(() => import('./Pages/Home'));
const SpinWheel = lazy(() => import('./Pages/SpinWheel'));
const FixNumber = lazy(() => import('./Pages/FixNumber'));
const WinGame = lazy(() => import('./Pages/WinGame'));
const PhoneSignUp = lazy(() => import('./Pages/PhoneSignUp'));
const PhoneSignIn = lazy(() => import('./Pages/PhoneSignIn'));
const AddCash = lazy(() => import('./Pages/AddCash').then(m => ({ default: m.AddCash })));
const Pay = lazy(() => import('./Pages/Pay'));
const MyWallet = lazy(() => import('./Pages/Wallet').then(m => ({ default: m.MyWallet })));
const PaymentConfirmation = lazy(() => import('./Pages/PaymentConfirmation'));
const Withdraw = lazy(() => import('./Pages/Withdraw'));
const AdminDashboard = lazy(() => import('./Admin/Admin'));
const AdminRoute = lazy(() => import('./Admin/AdminRoute'));
const Profile = lazy(() => import('./Pages/Profile'));
const Support = lazy(() => import('./Pages/Support'));
const History = lazy(() => import('./Pages/History'));
const CasinoHistory = lazy(() => import('./Pages/CasinoHistory'));
const PrivacyPolicy = lazy(() => import('./components/PrivacyPolicy'));
const BettingHistory = lazy(() => import('./components/BettingHistory'));
const GameSummary = lazy(() => import('./Admin/components/ProfitLoss'));
const Referrals = lazy(() => import('./Pages/Referrals'));
const Aviator = lazy(() => import('./Pages/Aviator'));
const TeenPatti = lazy(() => import('./Pages/TeenPatti'));
const DragonTiger = lazy(() => import('./Pages/DragonTiger'));
const AndarBahar = lazy(() => import('./Pages/AndarBahar'));
const ColorPrediction = lazy(() => import('./Pages/ColorPrediction'));
const CoinFlip = lazy(() => import('./Pages/CoinFlip'));
const DiceRoll = lazy(() => import('./Pages/DiceRoll'));
const Notifications = lazy(() => import('./Pages/Notifications'));

const RouteFallback = () => (
  <div className="min-h-screen bg-[#042346] text-white flex items-center justify-center">
    <Spinner />
  </div>
);

const AppContent = () => {
  const location = useLocation();
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

      <Suspense fallback={<RouteFallback />}>
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
          <Route path="/casino-history" element={<CasinoHistory />} />
          <Route path="/privacy" element={<PrivacyPolicy />} />
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
          <Route path="/notifications" element={<Notifications />} />
          <Route path="/admin" element={<AdminRoute><AdminDashboard /></AdminRoute>} />
        </Routes>
      </Suspense>
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
          login(buildSessionUser(userAuth, userSnap.data()));
        } else {
          login(buildSessionUser(userAuth));
        }
      } else {
        login(null);
      }
      setLoadingAuth(false);
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
