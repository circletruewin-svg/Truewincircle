import { useState } from "react";
import { CheckCircle, Loader2, Sparkles, Trophy, Users, ShieldCheck } from "lucide-react";

// Vercel env: VITE_LANDING_FORM_URL=https://script.google.com/macros/s/.../exec
const FORM_URL = import.meta.env.VITE_LANDING_FORM_URL || "";

export default function Landing() {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  const validate = () => {
    if (!name.trim() || name.trim().length < 2) return "Please enter your full name";
    const digits = phone.replace(/\D/g, "");
    if (digits.length !== 10) return "Please enter a valid 10-digit mobile number";
    return "";
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    setError("");
    const errMsg = validate();
    if (errMsg) { setError(errMsg); return; }
    if (!FORM_URL) {
      setError("Form is not configured yet. Please contact support.");
      return;
    }

    setSubmitting(true);
    try {
      // Apps Script Web Apps don't return CORS headers reliably; using
      // text/plain + no-cors keeps the browser happy. We don't need the
      // response body — script writes to the sheet + sends the email.
      await fetch(FORM_URL, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.replace(/\D/g, ""),
          source: "landing",
          submittedAt: new Date().toISOString(),
          ref: typeof document !== "undefined" ? document.referrer : "",
        }),
      });
      setDone(true);
    } catch (err) {
      console.error("Landing submit failed:", err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-[#042346] via-[#06305f] to-[#08407d] text-white flex flex-col">
      <header className="px-5 py-5 flex items-center gap-2">
        <div className="w-7 h-7 border-2 border-yellow-400 rounded-full"></div>
        <span className="font-bold text-lg">
          TrueWin<span className="text-yellow-400">Circle</span>
        </span>
      </header>

      <main className="flex-1 flex items-center justify-center px-5 pb-10">
        <div className="w-full max-w-md">
          {!done ? (
            <>
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-yellow-500/15 border border-yellow-500/30 text-yellow-300 text-xs font-semibold mb-4">
                  <Sparkles className="w-3.5 h-3.5" /> Limited time invite
                </div>
                <h1 className="text-3xl sm:text-4xl font-black leading-tight">
                  Win Exciting <span className="text-yellow-400">Daily Rewards</span>
                </h1>
                <p className="text-slate-300 mt-3 text-sm sm:text-base">
                  Register your number and our team will get back to you within minutes.
                </p>
              </div>

              <form
                onSubmit={onSubmit}
                className="bg-white/5 border border-white/10 rounded-3xl p-5 sm:p-6 shadow-2xl backdrop-blur-sm space-y-4"
                noValidate
              >
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Your name
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => { setName(e.target.value); setError(""); }}
                    placeholder="e.g. Rahul Sharma"
                    autoComplete="name"
                    className="w-full bg-[#042346] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">
                    Mobile number
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="px-3 py-3 bg-[#042346] border border-white/10 rounded-xl text-slate-300 text-sm font-semibold">
                      +91
                    </span>
                    <input
                      type="tel"
                      inputMode="numeric"
                      value={phone}
                      onChange={(e) => {
                        setPhone(e.target.value.replace(/\D/g, "").slice(0, 10));
                        setError("");
                      }}
                      placeholder="10-digit number"
                      autoComplete="tel"
                      className="flex-1 bg-[#042346] border border-white/10 rounded-xl px-4 py-3 text-white placeholder:text-slate-500 outline-none focus:border-yellow-400 focus:ring-2 focus:ring-yellow-400/20 transition tracking-wide"
                    />
                  </div>
                </div>

                {error && (
                  <div className="text-red-300 text-sm bg-red-500/10 border border-red-400/30 rounded-lg px-3 py-2">
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full bg-yellow-400 text-slate-950 font-black text-lg py-3.5 rounded-xl hover:bg-yellow-300 active:bg-yellow-500 transition disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" /> Submitting…
                    </>
                  ) : (
                    "Get Started"
                  )}
                </button>

                <p className="text-[11px] text-slate-400 text-center leading-relaxed">
                  By submitting you agree to be contacted regarding your registration.
                </p>
              </form>

              <div className="grid grid-cols-3 gap-2 mt-5 text-center">
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <Trophy className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-300 font-semibold">Daily Winners</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <Users className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-300 font-semibold">Trusted Players</p>
                </div>
                <div className="bg-white/5 border border-white/10 rounded-xl p-3">
                  <ShieldCheck className="w-4 h-4 text-yellow-400 mx-auto mb-1" />
                  <p className="text-[10px] text-slate-300 font-semibold">Safe & Secure</p>
                </div>
              </div>
            </>
          ) : (
            <div className="bg-white/5 border border-white/10 rounded-3xl p-8 text-center backdrop-blur-sm shadow-2xl">
              <div className="w-16 h-16 mx-auto rounded-full bg-green-500/15 border-2 border-green-400/40 flex items-center justify-center mb-4">
                <CheckCircle className="w-9 h-9 text-green-400" />
              </div>
              <h2 className="text-2xl font-black mb-2">Thank you!</h2>
              <p className="text-slate-300">
                Your details have been received. Our team will contact you shortly.
              </p>
            </div>
          )}
        </div>
      </main>

      <footer className="text-center px-5 py-4 text-[11px] text-slate-500">
        © {new Date().getFullYear()} TrueWinCircle · 18+ only
      </footer>
    </div>
  );
}
