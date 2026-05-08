import { useEffect, useState } from "react";
import { doc, onSnapshot, setDoc, serverTimestamp } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import { db } from "../../firebase";
import { toast } from "react-toastify";

// Default fallback values — used when the settings doc doesn't exist
// yet (first-time admin opens the page on a fresh project).
export const HARUF_LIMIT_DEFAULTS = { min: 5, max: 50 };

export default function HarufLimits() {
  const [min, setMin] = useState(HARUF_LIMIT_DEFAULTS.min);
  const [max, setMax] = useState(HARUF_LIMIT_DEFAULTS.max);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [updatedBy, setUpdatedBy] = useState(null);

  useEffect(() => {
    const ref = doc(db, "settings", "harufLimits");
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const d = snap.data();
        if (Number.isFinite(d.min)) setMin(d.min);
        if (Number.isFinite(d.max)) setMax(d.max);
        setUpdatedAt(d.updatedAt?.toDate?.() || null);
        setUpdatedBy(d.updatedBy || null);
      }
      setLoading(false);
    }, () => setLoading(false));
    return () => unsub();
  }, []);

  const save = async () => {
    const minN = Number(min);
    const maxN = Number(max);
    if (!Number.isFinite(minN) || minN < 1) return toast.error("Minimum should be at least ₹1.");
    if (!Number.isFinite(maxN) || maxN < minN) return toast.error("Maximum should be at least the minimum.");
    if (maxN > 100000) return toast.error("Maximum can't exceed ₹100,000.");

    setSaving(true);
    try {
      await setDoc(doc(db, "settings", "harufLimits"), {
        min: minN,
        max: maxN,
        updatedAt: serverTimestamp(),
        updatedBy: getAuth().currentUser?.uid || null,
      });
      toast.success("Haruf limits updated. New bets will use the new range.");
    } catch (err) {
      toast.error("Save failed: " + (err.message || err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl">
      <h2 className="text-2xl font-bold text-gray-800 mb-2">Haruf bet limits</h2>
      <p className="text-sm text-gray-600 mb-6">
        Per-number cap for <b>all Haruf markets</b> — Gali, Disawar, Faridabad, Ghaziabad, Delhi Bazaar, Shree Ganesh, Matka Mandi.
        User aur admin Place Bet dono is limit ko respect karenge. Change instantly applies — pichhle bets affected nahi honge.
      </p>

      {loading ? (
        <p className="text-gray-500">Loading current limits…</p>
      ) : (
        <div className="bg-white rounded-xl shadow border p-5 space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Minimum (₹) per number</label>
              <input
                type="number"
                min="1"
                step="1"
                value={min}
                onChange={(e) => setMin(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-gray-600 mb-1">Maximum (₹) per number</label>
              <input
                type="number"
                min="1"
                step="1"
                value={max}
                onChange={(e) => setMax(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <button onClick={() => { setMin(5);  setMax(50);   }} className="bg-gray-100 hover:bg-gray-200 rounded-lg py-2">Preset: ₹5 – ₹50</button>
            <button onClick={() => { setMin(10); setMax(100);  }} className="bg-gray-100 hover:bg-gray-200 rounded-lg py-2">Preset: ₹10 – ₹100</button>
            <button onClick={() => { setMin(10); setMax(500);  }} className="bg-gray-100 hover:bg-gray-200 rounded-lg py-2">Preset: ₹10 – ₹500</button>
            <button onClick={() => { setMin(50); setMax(5000); }} className="bg-gray-100 hover:bg-gray-200 rounded-lg py-2">Preset: ₹50 – ₹5000</button>
          </div>

          <div className="border-t pt-4 flex justify-between items-center">
            <div className="text-xs text-gray-500">
              {updatedAt ? <>Last updated: {updatedAt.toLocaleString("en-IN")}</> : <>No saved value yet — using defaults.</>}
            </div>
            <button
              onClick={save}
              disabled={saving}
              className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white font-semibold px-5 py-2 rounded-lg"
            >
              {saving ? "Saving…" : "Save limits"}
            </button>
          </div>
        </div>
      )}

      <div className="mt-6 bg-yellow-50 border border-yellow-200 rounded-xl p-4 text-xs text-yellow-900">
        <p className="font-bold mb-1">Note</p>
        <ul className="list-disc list-inside space-y-1">
          <li>Limit per <b>individual number</b> hai (00-99). Total bet ki limit nahi.</li>
          <li>Andar / Bahar pe single digit dalne pe vo internally 10 numbers me distribute hota hai — har distributed amount limit ke andar hona chahiye.</li>
          <li>Same number pe ek IST-day me ek hi bet allowed hai (vo rule wahi rahega, badla nahi).</li>
        </ul>
      </div>
    </div>
  );
}
