import React, { useState, useEffect, useRef } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { doc, setDoc, query, collection, where, getDocs, getDoc, deleteDoc } from "firebase/firestore";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { Loader2 } from "lucide-react";

const RESEND_COOLDOWN_SECONDS = 30;

const PhoneSignUp = () => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [name, setName] = useState("");
  const [referralCodeInput, setReferralCodeInput] = useState("");
  const [generatedReferralCode, setGeneratedReferralCode] = useState("");
  const [step, setStep] = useState(1);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef(null);
  const navigate = useNavigate();

  // Hard-reset the reCAPTCHA DOM. grecaptcha keeps a registry keyed by
  // the actual DOM node, so on resend we have to drop the node itself
  // and replace it with a fresh one with the same id — clearing
  // innerHTML alone wasn't enough.
  const recreateRecaptchaContainer = () => {
    const old = document.getElementById('recaptcha-container');
    if (!old || !old.parentElement) return;
    const parent = old.parentElement;
    old.remove();
    const fresh = document.createElement('div');
    fresh.id = 'recaptcha-container';
    parent.appendChild(fresh);
  };

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

  // Resend cooldown ticker.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // Auto-focus the OTP input when we transition to step 2.
  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => otpInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  const generateReferralCode = () => {
    const characters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let result = "";
    for (let i = 0; i < 6; i++) {
      result += characters.charAt(Math.floor(Math.random() * characters.length));
    }
    return result;
  };

  const requestOtp = async ({ resend = false } = {}) => {
    if (!resend) {
      if (!name) return toast.error("Enter your name");
      if (!phone) return toast.error("Enter phone number");
    }
    setLoading(true);
    try {
      // Resend needs a fresh verifier AND a clean DOM container,
      // otherwise reCAPTCHA throws "already been rendered in this
      // element" because the previous widget is still attached.
      if (resend && window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch { /* ignore */ }
        window.recaptchaVerifier = null;
        recreateRecaptchaContainer();
      }
      const verifier = setupRecaptcha();
      // No verifier.render() — signInWithPhoneNumber renders lazily and
      // awaiting it added a ~500ms-1s round trip before the SMS send.

      // Only generate the referral code on the first send. Resend should
      // keep the same code so the user's onboarding stays consistent.
      if (!resend) {
        const newReferralCode = generateReferralCode();
        setGeneratedReferralCode(newReferralCode);
      }

      const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setStep(2);
      setOtp("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(resend ? "OTP resent — check your SMS." : "OTP sent successfully!");
    } catch (err) {
      console.error("OTP send error:", err);
      // Auto-recover from the "already rendered" state on the next tap.
      if (String(err?.message || '').toLowerCase().includes('already been rendered')) {
        try { window.recaptchaVerifier?.clear(); } catch { /* ignore */ }
        window.recaptchaVerifier = null;
        recreateRecaptchaContainer();
        // Auto-retry once now that the DOM is clean.
        setTimeout(() => requestOtp({ resend: true }), 100);
        return;
      }
      if (err.code === "auth/invalid-app-credential") {
        toast.error("Invalid registration request. Please try again later.");
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

  const sendOtp = () => requestOtp({ resend: false });
  const resendOtp = () => requestOtp({ resend: true });

  const verifyOtp = async () => {
    if (!otp) return toast.error("Enter OTP");
    setLoading(true);
    try {
      const result = await confirmationResult.confirm(otp);
      const user = result.user;

      const userDocRef = doc(db, "users", user.uid);

      // If this number is already a registered user, don't overwrite
      // their existing data (would clobber balance/winnings/referrals).
      // Send them to the login flow instead.
      const existingSnap = await getDoc(userDocRef);
      if (existingSnap.exists()) {
        await auth.signOut();
        toast.info("Aapka account pehle se hai. Please login.");
        navigate("/login");
        return;
      }

      let referrerId = null;
      if (referralCodeInput) {
        const referrerQuery = query(collection(db, "users"), where("referralCode", "==", referralCodeInput));
        const referrerSnapshot = await getDocs(referrerQuery);

        if (!referrerSnapshot.empty) {
          const referrerDoc = referrerSnapshot.docs[0];
          referrerId = referrerDoc.id;
          toast.success("Referral code applied!");
        } else {
          toast.warn("Invalid referral code. No bonus applied.");
        }
      }

      // If an admin pre-staged this account from the admin panel, merge
      // their pre-set name + welcome bonus + referrer into the new user
      // doc and clear the pendingUsers entry.
      let preName = '';
      let preBalance = 0;
      let preWinning = 0;
      let preReferrer = null;
      try {
        const pendingRef = doc(db, "pendingUsers", user.phoneNumber);
        const pendingSnap = await getDoc(pendingRef);
        if (pendingSnap.exists()) {
          const data = pendingSnap.data();
          preName = String(data.name || '').trim();
          preBalance = Number(data.balance) || 0;
          preWinning = Number(data.winningMoney) || 0;
          preReferrer = data.referredBy || null;
        }
      } catch (preErr) {
        console.warn("Pending user lookup failed:", preErr);
      }

      await setDoc(
        userDocRef,
        {
          phoneNumber: user.phoneNumber,
          name: name || preName || '',
          role: "user",
          referralCode: generatedReferralCode,
          // User-entered referral code wins; falls back to whatever the
          // admin pre-staged (so the "is naam wala user mera hai" flow
          // works even if the user signs up without entering a code).
          referredBy: referrerId || preReferrer,
          balance: preBalance,
          winningMoney: preWinning,
          appName: "truewin",
          createdAt: new Date(),
          referralBonusAwarded: false,
        },
        { merge: true }
      );

      // Best-effort cleanup; rules allow the matching user to delete it.
      if (preName || preBalance || preWinning) {
        try { await deleteDoc(doc(db, "pendingUsers", user.phoneNumber)); }
        catch (delErr) { console.warn("Failed to clear pending entry:", delErr); }
        if (preBalance || preWinning) {
          toast.success(`Welcome bonus applied: ₹${preBalance + preWinning}`);
        }
      }

      toast.success("Sign in successful!");
      navigate("/");
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
            {step === 1 ? "Enter your phone number to continue" : "Enter the OTP sent to your phone"}
          </p>
        </div>

        {step === 1 ? (
          <div className="space-y-4">
            <input
              type="text"
              placeholder="Enter Your Name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 bg-[#042346] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
            />

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

            <input
              type="text"
              placeholder="Referral Code (Optional)"
              value={referralCodeInput}
              onChange={(e) => setReferralCodeInput(e.target.value)}
              className="w-full px-4 py-3 bg-[#042346] border border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-yellow-500"
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
              ref={otpInputRef}
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
                Account ban raha hai aur welcome bonus apply ho raha hai…
              </p>
            )}

            <div className="text-center text-sm text-gray-300 pt-2 border-t border-white/10">
              {resendCooldown > 0 ? (
                <span>Didn't get the OTP? Resend in <span className="text-yellow-400 font-semibold">{resendCooldown}s</span></span>
              ) : (
                <button
                  onClick={resendOtp}
                  disabled={loading}
                  className="text-yellow-400 font-semibold hover:text-yellow-300 disabled:opacity-50"
                >
                  Resend OTP
                </button>
              )}
            </div>
            <button
              onClick={() => { setStep(1); setOtp(""); setResendCooldown(0); }}
              disabled={loading}
              className="w-full text-xs text-gray-400 hover:text-white"
            >
              ← Edit details / change phone
            </button>
          </div>
        )}
        <div id="recaptcha-container"></div>

        <p className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-white/10">
          Already have an account?{" "}
          <Link to="/login" className="text-yellow-400 font-semibold hover:text-yellow-300">
            Login
          </Link>
        </p>
      </div>
    </div>
  );
};

export default PhoneSignUp;
