import React, { useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc } from "firebase/firestore";
import useAuthStore from "../store/authStore";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { Loader2 } from "lucide-react";
import { buildSessionUser } from "../utils/sessionUser";

const PhoneSignIn = () => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  const setupRecaptcha = () => {
    if (window.recaptchaVerifier) {
      return window.recaptchaVerifier;
    }

    const verifier = new RecaptchaVerifier(auth, "recaptcha-container", {
      size: "invisible",
      callback: () => {},
      "expired-callback": () => {
        if (window.recaptchaVerifier) {
          window.recaptchaVerifier.clear();
          window.recaptchaVerifier = null;
        }
      },
    });

    window.recaptchaVerifier = verifier;
    return verifier;
  };

  useEffect(() => {
    setupRecaptcha();

    return () => {
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    };
  }, []);

  const sendOtp = async () => {
    if (!phone) return toast.error("Enter phone number");
    setLoading(true);

    try {
      const verifier = setupRecaptcha();
      await verifier.render();

      const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
      const result = await signInWithPhoneNumber(
        auth,
        formattedPhone,
        verifier
      );
      setConfirmationResult(result);
      setStep(2);
      toast.success("OTP Sent Successfully!");
    } catch (err) {
      console.error("OTP send error:", err);
      if (err.code === "auth/invalid-app-credential") {
        toast.error("Please sign up first.");
        navigate("/testphonesignup");
      } else if (err.code === "auth/captcha-check-failed") {
        toast.error("Firebase phone login blocked: truewincircle.in aur www.truewincircle.in ko Firebase Auth Authorized Domains me add karna hoga.");
      } else if (err.code === "auth/too-many-requests") {
        toast.error("Too many attempts. Please try again after some time.");
      } else {
        toast.error(err.message || "An error occurred while sending OTP.");
      }
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp) return toast.error("Enter OTP");
    setLoading(true);
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;
      const userRef = doc(db, "users", user.uid);
      const userSnap = await getDoc(userRef);

      if (userSnap.exists()) {
        if (userSnap.data().suspended) {
          await auth.signOut();
          toast.error("Your account has been suspended. Please contact support.");
          return;
        }
        login(buildSessionUser(user, userSnap.data()));
        toast.success("Sign in successful!");
        navigate("/");
      } else {
        // No user doc yet — check if an admin pre-staged this account.
        // The lookup is wrapped in its own try/catch so a permissions
        // glitch (e.g. rules not deployed yet) doesn't kill the whole
        // OTP flow — we just fall through to the normal "please sign
        // up" path.
        let pendingData = null;
        try {
          const pendingRef = doc(db, "pendingUsers", user.phoneNumber);
          const pendingSnap = await getDoc(pendingRef);
          if (pendingSnap.exists()) pendingData = pendingSnap.data();
        } catch (pendErr) {
          console.warn("Pending user lookup failed (non-fatal):", pendErr);
        }

        if (pendingData) {
          const newUserData = {
            phoneNumber: user.phoneNumber,
            name: String(pendingData.name || '').trim(),
            role: "user",
            balance: Number(pendingData.balance) || 0,
            winningMoney: Number(pendingData.winningMoney) || 0,
            referredBy: pendingData.referredBy || null,
            appName: "truewin",
            createdAt: new Date(),
            referralBonusAwarded: false,
          };
          await setDoc(userRef, newUserData, { merge: true });
          try { await deleteDoc(doc(db, "pendingUsers", user.phoneNumber)); }
          catch (delErr) { console.warn("Failed to clear pending entry:", delErr); }
          login(buildSessionUser(user, newUserData));
          toast.success(`Welcome ${newUserData.name || ''}! Your account is ready.`);
          navigate("/");
        } else {
          toast.error("Please sign up first.");
          await auth.signOut();
          navigate("/testphonesignup");
        }
      }
    } catch (err) {
      console.error("OTP verify error:", err);
      if (err.code === "auth/invalid-verification-code") {
        toast.error("Invalid OTP. Please check and try again.");
      } else {
        toast.error(err.message || "An error occurred while verifying OTP.");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#042346] text-white flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md mx-auto bg-[#0a2d55] p-6 md:p-8 rounded-xl shadow-lg">
        <div className="text-center mb-6">
          <h1 className="font-bold text-3xl mb-2">
            TrueWin<span className="text-yellow-500">Circle</span>
          </h1>
          <p className="text-gray-300">
            {step === 1
              ? "Enter your phone number to log in"
              : "Enter the OTP sent to your phone"}
          </p>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <PhoneInput
              country={"in"}
              value={phone}
              onChange={(value) => setPhone(value)}
              inputStyle={{
                width: "100%",
                height: "50px",
                backgroundColor: "#042346",
                color: "white",
                border: "1px solid #4b5563",
                borderRadius: "0.5rem",
                paddingLeft: "50px",
              }}
              buttonStyle={{
                backgroundColor: "#042346",
                border: "1px solid #4b5563",
                borderRadius: "0.5rem 0 0 0.5rem",
              }}
              dropdownStyle={{
                backgroundColor: "#042346",
                color: "white",
              }}
            />
            <button
              onClick={sendOtp}
              disabled={loading}
              className="w-full bg-yellow-500 text-black font-bold px-5 py-3 rounded-full hover:bg-yellow-600 transition-colors duration-300 disabled:bg-yellow-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Sending OTP…</span>
                </>
              ) : (
                "Send OTP"
              )}
            </button>
            {loading && (
              <p className="text-center text-xs text-gray-300 animate-pulse">
                SMS aane me 10–30 second lag sakte hain. Please wait…
              </p>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
              disabled={loading}
              className="w-full px-4 py-3 bg-[#042346] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500 disabled:opacity-60 tracking-widest text-center text-lg"
            />
            <button
              onClick={verifyOtp}
              disabled={loading || otp.length < 4}
              className="w-full bg-yellow-500 text-black font-bold px-5 py-3 rounded-full hover:bg-yellow-600 transition-colors duration-300 disabled:bg-yellow-300 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Verifying…</span>
                </>
              ) : (
                "Verify OTP"
              )}
            </button>
            {loading && (
              <p className="text-center text-xs text-gray-300 animate-pulse">
                OTP verify ho raha hai aur account load ho raha hai…
              </p>
            )}
          </div>
        )}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
};

export default PhoneSignIn;
