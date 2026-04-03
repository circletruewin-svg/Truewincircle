import { useState, useEffect } from "react";
import { User, Menu, X, Wallet } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import useAuthStore from "../store/authStore";
import { getAuth, signOut } from "firebase/auth";
import { doc, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function Navbar() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const login = useAuthStore((state) => state.login);
  const logout = useAuthStore((state) => state.logout);
  const auth = getAuth();
  const location = useLocation();

  useEffect(() => {
    if (user?.uid) {
      const userDocRef = doc(db, "users", user.uid);
      const unsubscribe = onSnapshot(userDocRef, (docSnap) => {
        if (docSnap.exists()) {
          const currentUser = useAuthStore.getState().user;
          login({ ...currentUser, ...docSnap.data() });
        }
      });
      return () => unsubscribe();
    }
  }, [user?.uid, login]);

  // Example wallet amount (replace with API/store value)
  const walletAmount = (user?.balance || 0) + (user?.winningMoney || 0);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      logout();
      setAccountOpen(false);
      setMobileMenuOpen(false);
    } catch (error) {
      console.error("Error logging out:", error);
    }
  };

  const handleLogoClick = () => {
    if (location.pathname === "/") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
    // On other pages, the Link component will handle navigation to "/"
  };

  return (
    <div className="fixed top-0 left-0 w-full bg-[#042346] text-white px-4 md:px-8 py-3 flex justify-between items-center shadow-md z-50">
      {/* Logo */}
      <div className="flex items-center gap-2">
        <Link
          to={"/"}
          onClick={handleLogoClick}
          className="flex items-center gap-2"
        >
          <div className="w-6 h-6 border-2 border-yellow-500 rounded-full"></div>
          <span className="font-bold text-lg">
            TrueWin<span className="text-yellow-500">Circle</span>
          </span>
        </Link>
      </div>

      {/* Desktop Menu */}
      <div className="hidden md:flex items-center gap-6">
        <Link to="/" className="hover:text-yellow-500">
          Home
        </Link>
       

        <Link to="/support" className="hover:text-yellow-500">
          Support
        </Link>
        <Link to="/privacy" className="hover:text-yellow-500">
          Terms & Conditions
        </Link>

        {user ? (
          <>
            {/* Wallet Icon with Amount */}
            <Link
              to="/wallet"
              className="relative flex items-center hover:text-yellow-500"
            >
              <Wallet size={24} />
              <span className="ml-1 font-semibold">₹{walletAmount}</span>
            </Link>

            {/* Account dropdown */}
            <div className="relative">
              <button
                onClick={() => setAccountOpen(!accountOpen)}
                className="flex items-center gap-1 hover:text-yellow-500"
              >
                Account <User size={24} />
              </button>
              {accountOpen && (
                <div className="absolute right-0 mt-2 w-40 bg-white text-black rounded-md shadow-lg z-10">
                  <Link
                    to="/profile"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Profile
                  </Link>
                  <Link
                    to="/wallet"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Wallet
                  </Link>
                  <Link
                    to="/withdraw"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Withdraw
                  </Link>
                  <Link
                    to="/refer"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Reffer & Earn
                  </Link>
                  <Link
                    to="/addcash"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Add Cash
                  </Link>
                  <Link
                    to="/history"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    History
                  </Link>
                  <Link
                    to="/support"
                    className="block px-4 py-2 hover:bg-gray-100"
                  >
                    Support
                  </Link>
                  <button
                    onClick={handleLogout}
                    className="block w-full text-left px-4 py-2 hover:bg-gray-100"
                  >
                    Logout
                  </button>
                </div>
              )}
            </div>
          </>
        ) : (
          <div className="flex items-center gap-4">
            <Link
              to="/login"
              className="bg-yellow-500 text-black font-bold px-5 py-2 rounded-full hover:bg-yellow-600"
            >
              Login
            </Link>
            <Link
              to="/testphonesignup"
              className="bg-gray-700 text-white font-bold px-5 py-2 rounded-full hover:bg-gray-600"
            >
              Sign Up
            </Link>
          </div>
        )}
      </div>

      {/* Mobile Menu Button + Wallet (side by side) */}
      <div className="md:hidden flex items-center gap-4">
        {user && (
          <Link to="/wallet" className="relative flex items-center">
            <Wallet size={26} />
            <span className="ml-1 font-semibold">{walletAmount}</span>
          </Link>
        )}

        <button onClick={() => setMobileMenuOpen(!mobileMenuOpen)}>
          {mobileMenuOpen ? <X size={28} /> : <Menu size={28} />}
        </button>
      </div>

      {/* Mobile Menu */}
      {mobileMenuOpen && (
        <div className="absolute top-full left-0 w-full bg-[#042346] md:hidden flex flex-col items-center gap-4 py-4 z-50">
          <Link
            to="/"
            className="hover:text-yellow-500"
            onClick={() => setMobileMenuOpen(false)}
          >
            Home
          </Link>
        
          <div className="w-3/4 border-t border-gray-700 my-1"></div>

          {user ? (
            <>
              <Link
                to="/profile"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                Profile
              </Link>
              <Link
                to="/wallet"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                Wallet
              </Link>
              <Link
                to="/history"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                History
              </Link>
              <Link
                to="/withdraw"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                Withdraw
              </Link>
              <Link
                to="/addcash"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                Add Cash
              </Link>

              <Link
                to="/support"
                className="hover:text-yellow-500"
                onClick={() => setMobileMenuOpen(false)}
              >
                Support
              </Link>
              <button onClick={handleLogout} className="hover:text-yellow-500">
                Logout
              </button>
            </>
          ) : (
            <div className="flex items-center gap-4">
              <Link
                to="/login"
                className="bg-yellow-500 text-black font-bold px-5 py-2 rounded-full hover:bg-yellow-600"
                onClick={() => setMobileMenuOpen(false)}
              >
                Login
              </Link>
              <Link
                to="/testphonesignup"
                className="bg-gray-700 text-white font-bold px-5 py-2 rounded-full hover:bg-gray-600"
                onClick={() => setMobileMenuOpen(false)}
              >
                Sign Up
              </Link>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
