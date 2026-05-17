import React, { useState, useEffect, useRef } from "react";
import { RecaptchaVerifier, signInWithPhoneNumber } from "firebase/auth";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "react-toastify";
import { auth, db } from "../firebase";
import { doc, getDoc, setDoc, deleteDoc, collection, query, where, getDocs, limit } from "firebase/firestore";
import useAuthStore from "../store/authStore";
import PhoneInput from "react-phone-input-2";
import "react-phone-input-2/lib/style.css";
import { Loader2 } from "lucide-react";
import { buildSessionUser } from "../utils/sessionUser";

const RESEND_COOLDOWN_SECONDS = 30;

const PhoneSignIn = () => {
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [step, setStep] = useState(1);
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  const otpInputRef = useRef(null);
  const navigate = useNavigate();
  const login = useAuthStore((state) => state.login);

  // Hard-reset the reCAPTCHA DOM element. Just clearing the verifier or
  // the innerHTML wasn't enough — Google's grecaptcha library keeps an
  // internal registry keyed by the actual DOM node, so we have to drop
  // the node itself and put a fresh one with the same id back in its
  // place.
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

  // Countdown for the "Resend OTP" button. While this is non-zero,
  // the user must wait — otherwise they'd hammer the SMS endpoint.
  useEffect(() => {
    if (resendCooldown <= 0) return undefined;
    const id = setInterval(() => setResendCooldown((s) => Math.max(0, s - 1)), 1000);
    return () => clearInterval(id);
  }, [resendCooldown]);

  // When we move to the OTP step, focus the input so the user doesn't
  // have to tap it manually after the SMS arrives.
  useEffect(() => {
    if (step === 2) {
      const t = setTimeout(() => otpInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [step]);

  const requestOtp = async ({ resend = false } = {}) => {
    if (!phone) return toast.error("Enter phone number");
    setLoading(true);
    try {
      // Resend needs a fresh verifier — Firebase invalidates each one
      // after a single successful use. We also have to scrub the DOM
      // container, otherwise reCAPTCHA throws
      // "reCAPTCHA has already been rendered in this element".
      if (resend && window.recaptchaVerifier) {
        try { window.recaptchaVerifier.clear(); } catch { /* ignore */ }
        window.recaptchaVerifier = null;
        recreateRecaptchaContainer();
      }
      const verifier = setupRecaptcha();
      // Note: we DON'T await verifier.render() here. signInWithPhoneNumber
      // renders it lazily; awaiting render() added a needless round trip
      // that delayed the SMS send by ~500ms-1s.

      const formattedPhone = phone.startsWith("+") ? phone : `+${phone}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setStep(2);
      setOtp("");
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
      toast.success(resend ? "OTP resent — check your SMS." : "OTP sent successfully!");
    } catch (err) {
      console.error("OTP send error:", err);
      // If the DOM ever does get into a "already rendered" state, recover
      // automatically on the next try by clearing the container.
      if (String(err?.message || '').toLowerCase().includes('already been rendered')) {
        try { window.recaptchaVerifier?.clear(); } catch { /* ignore */ }
        window.recaptchaVerifier = null;
        recreateRecaptchaContainer();
        toast.error("Recaptcha refreshed. Please tap Send / Resend again.");
        return;
      }
      if (err.code === "auth/invalid-app-credential") {
        toast.error("Please sign up first.");
        navigate("/testphonesignup");
      } else if (err.code === "auth/captcha-check-failed") {
        toast.error("Firebase phone login blocked: truewincircle.in aur www.truewincircle.in ko Firebase Auth Authorized Domains me add karna hoga.");
      } else if (err.code === "auth/too-many-requests") {
        // Firebase rate-limits the device/IP when too many OTPs go out
        // in a short window. We do NOT add our own long lockout on top
        // (that just felt like an ever-growing ban). A short normal
        // resend wait + a calm note is enough — the user can retry,
        // switch network, or use a Firebase test number.
        setResendCooldown(RESEND_COOLDOWN_SECONDS);
        toast.info("Thodi der me dobara try karein (ya doosra network).", {
          autoClose: 4000,
        });
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
          // Honour the role the admin stamped on the pending doc —
          // this is how new master accounts come online on first OTP.
          const stagedRole = pendingData.role === 'master' || pendingData.role === 'admin'
            ? pendingData.role
            : 'user';
          const newUserData = {
            phoneNumber: user.phoneNumber,
            name: String(pendingData.name || '').trim(),
            role: stagedRole,
            balance: Number(pendingData.balance) || 0,
            winningMoney: Number(pendingData.winningMoney) || 0,
            referredBy: pendingData.referredBy || null,
            appName: "truewin",
            createdAt: new Date(),
            referralBonusAwarded: false,
          };
          // Masters carry a referral code so their share link works.
          if (stagedRole === 'master' && pendingData.masterCode) {
            newUserData.masterCode = pendingData.masterCode;
          }
          await setDoc(userRef, newUserData, { merge: true });
          try { await deleteDoc(doc(db, "pendingUsers", user.phoneNumber)); }
          catch (delErr) { console.warn("Failed to clear pending entry:", delErr); }
          login(buildSessionUser(user, newUserData));
          toast.success(`Welcome ${newUserData.name || ''}! Your account is ready.`);
          if (stagedRole === 'master') navigate('/master');
          else navigate('/');
        } else {
          // No user doc and no admin pre-stage. Maybe a master/admin
          // created this account "offline" with this exact phone — in
          // that case the person is already registered and should just
          // LOG IN (not be bounced to signup). Find any account on this
          // phone and claim it into the new auth uid.
          let claimed = null;
          try {
            const byPhone = query(
              collection(db, "users"),
              where("phoneNumber", "==", user.phoneNumber),
              limit(1),
            );
            const cs = await getDocs(byPhone);
            if (!cs.empty) claimed = { id: cs.docs[0].id, ...cs.docs[0].data() };
          } catch (claimErr) {
            console.warn("Phone-claim lookup failed (non-fatal):", claimErr);
          }

          if (claimed && claimed.id !== user.uid) {
            const stagedRole = claimed.role === 'master' || claimed.role === 'admin'
              ? claimed.role
              : 'user';
            const claimedData = {
              phoneNumber: user.phoneNumber,
              name: String(claimed.name || '').trim(),
              role: stagedRole,
              balance: Number(claimed.balance ?? claimed.walletBalance ?? 0) || 0,
              winningMoney: Number(claimed.winningMoney) || 0,
              assignedMasterId: claimed.assignedMasterId || null,
              referredBy: claimed.referredBy || null,
              appName: "truewin",
              createdAt: claimed.createdAt || new Date(),
              referralBonusAwarded: claimed.referralBonusAwarded ?? false,
              claimedFrom: claimed.id,
            };
            if (claimed.masterCode) claimedData.masterCode = claimed.masterCode;
            if (claimed.referralCode) claimedData.referralCode = claimed.referralCode;
            await setDoc(userRef, claimedData, { merge: true });
            // Best-effort: drop the old offline ghost so it doesn't
            // show twice. Normal users can't delete it under rules —
            // that's fine, the master/admin lists also de-dupe by phone.
            try { await deleteDoc(doc(db, "users", claimed.id)); }
            catch (delErr) { console.warn("Ghost cleanup skipped (de-duped in lists):", delErr); }
            login(buildSessionUser(user, claimedData));
            toast.success(`Welcome ${claimedData.name || ''}!`);
            if (stagedRole === 'master') navigate('/master');
            else navigate('/');
          } else {
            toast.info("Aapka account nahi hai. Pehle signup karein.");
            await auth.signOut();
            navigate("/testphonesignup");
          }
        }
      }
    } catch (err) {
      console.error("OTP verify error:", err);
      // Friendly Hinglish messages — the raw "Firebase: Error (auth/...)"
      // string was scaring users off the page.
      if (err.code === "auth/invalid-verification-code") {
        toast.error("Galat OTP. Phir se check karke daalein, ya naya OTP mangao.");
        setOtp("");
      } else if (err.code === "auth/code-expired" || err.code === "auth/session-expired") {
        toast.error("OTP expire ho gaya. 'Resend OTP' dabake naya code mangao.");
        setOtp("");
        setResendCooldown(0); // unlock the resend button immediately
      } else if (err.code === "auth/missing-verification-code") {
        toast.error("OTP enter karein.");
      } else if (err.code === "auth/too-many-requests") {
        toast.error("Bahut baar try ho gaya. Thodi der baad try karein.");
      } else if (err.code === "auth/network-request-failed") {
        toast.error("Internet check karein aur dobara try karein.");
      } else {
        toast.error("OTP verify nahi ho paya. Naya OTP mangake try karein.");
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
                OTP verify ho raha hai aur account load ho raha hai…
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
              ← Change phone number
            </button>
          </div>
        )}
        <div id="recaptcha-container"></div>

        <p className="text-center text-xs text-gray-400 mt-6 pt-4 border-t border-white/10">
          Don't have an account?{" "}
          <Link to="/testphonesignup" className="text-yellow-400 font-semibold hover:text-yellow-300">
            Sign up
          </Link>
        </p>
      </div>
    </div>
  );
};

export default PhoneSignIn;
