import { Link } from "react-router-dom";

export default function Footer() {
  return (
    <footer className="relative bg-[#001F4D] text-white text-center pt-32 pb-8">
      

      {/* Footer Content */}
      <div className="max-w-3xl mx-auto space-y-4 px-4">
        <p className="text-sm opacity-80">
          © {new Date().getFullYear()} TrueWinCircle • All Rights Reserved
        </p>
        <div className="flex justify-center gap-6 text-sm opacity-80">
          
          <Link to="/privacy" className="hover:text-yellow-400 transition">Privacy Policy</Link>
          <Link to="/privacy" className="hover:text-yellow-400 transition">Terms</Link>
          <Link to="/support" className="hover:text-yellow-400 transition">Support</Link>
        </div>
      </div>
    </footer>
  );
}
