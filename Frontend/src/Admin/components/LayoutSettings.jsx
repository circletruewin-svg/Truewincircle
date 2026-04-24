import React, { useEffect, useState } from "react";
import { db } from "../../firebase";
import { doc, onSnapshot, setDoc } from "firebase/firestore";
import { toast } from "react-toastify";
import { Eye, EyeOff } from "lucide-react";

// Admin page for toggling which home-page banners are visible to users.
// Writes to Firestore at settings/layout so the change propagates to
// every client in real time via onSnapshot.
export default function LayoutSettings() {
  const [showCountdown, setShowCountdown] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const unsub = onSnapshot(
      doc(db, "settings", "layout"),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data();
          // default ON — only false when admin explicitly disables
          setShowCountdown(data.showCountdown !== false);
        } else {
          setShowCountdown(true);
        }
        setLoading(false);
      },
      (err) => {
        console.error("layout settings read failed:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, []);

  const persist = async (updates) => {
    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "layout"), updates, { merge: true });
      toast.success("Layout updated.");
    } catch (err) {
      console.error(err);
      toast.error("Update failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const toggleCountdown = () => {
    const next = !showCountdown;
    setShowCountdown(next); // optimistic
    persist({ showCountdown: next });
  };

  return (
    <div className="p-6">
      <div className="bg-white rounded-lg shadow-sm">
        <div className="p-6 border-b">
          <h3 className="text-lg font-semibold">Home page layout</h3>
          <p className="text-xs text-gray-500 mt-1">
            Enable or disable sections on the user-facing Home page. Changes apply instantly to every visitor.
          </p>
        </div>

        <div className="p-6 space-y-4">
          {loading ? (
            <p className="text-gray-500 text-sm">Loading settings…</p>
          ) : (
            <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border">
              <div className="flex items-start gap-3">
                <div className={`mt-0.5 w-9 h-9 rounded-full flex items-center justify-center ${showCountdown ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-500"}`}>
                  {showCountdown ? <Eye size={18} /> : <EyeOff size={18} />}
                </div>
                <div>
                  <p className="font-semibold text-gray-800">Next Result Countdown & Jackpot banner</p>
                  <p className="text-xs text-gray-500">
                    The dark card on Home that shows the countdown timer on the left and the jackpot on the right.
                  </p>
                </div>
              </div>

              <button
                onClick={toggleCountdown}
                disabled={saving}
                className={`relative inline-flex h-7 w-14 items-center rounded-full transition-colors disabled:opacity-50 ${
                  showCountdown ? "bg-green-500" : "bg-gray-400"
                }`}
                aria-pressed={showCountdown}
              >
                <span
                  className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${
                    showCountdown ? "translate-x-8" : "translate-x-1"
                  }`}
                />
              </button>
            </div>
          )}

          <div className="text-xs text-gray-500 pt-4 border-t">
            More toggles (Live Betting Highlights, individual market cards, etc.) can be added here later.
          </div>
        </div>
      </div>
    </div>
  );
}
