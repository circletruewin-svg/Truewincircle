import React, { useState, useEffect } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useNavigate } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import useAuthStore from "../store/authStore";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
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
        login(buildSessionUser(user, userSnap.data()));
        toast.success("Sign in successful!");
        navigate("/");
      } else {
        toast.error("Please sign up first.");
        await auth.signOut();
        navigate("/testphonesignup");
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
              className="w-full bg-yellow-500 text-black font-bold px-5 py-3 rounded-full hover:bg-yellow-600 transition-colors duration-300 disabled:bg-gray-400"
            >
              {loading ? "Sending..." : "Send OTP"}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter OTP"
              value={otp}
              onChange={(e) => setOtp(e.target.value)}
              className="w-full px-4 py-3 bg-[#042346] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />
            <button
              onClick={verifyOtp}
              className="w-full bg-yellow-500 text-black font-bold px-5 py-3 rounded-full hover:bg-yellow-600 transition-colors duration-300"
            >
              Verify OTP
            </button>
          </div>
        )}
        <div id="recaptcha-container"></div>
      </div>
    </div>
  );
};

export default PhoneSignIn;
