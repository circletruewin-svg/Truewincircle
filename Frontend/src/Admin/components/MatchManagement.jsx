import React, { useEffect, useState } from "react";
import {
  collection, onSnapshot, query, orderBy, addDoc, doc, updateDoc,
  deleteDoc, serverTimestamp, Timestamp,
} from "firebase/firestore";
import { db } from "../../firebase";
import { toast } from "react-toastify";
import { settleMatch } from "../../utils/sportsSettlement";

const MATCH_TYPES = ["T20", "ODI", "Test"];

// Turn HTML datetime-local input value ("YYYY-MM-DDTHH:mm") into Firestore Timestamp.
function inputToTimestamp(v) {
  if (!v) return null;
  const d = new Date(v);
  if (isNaN(d.getTime())) return null;
  return Timestamp.fromDate(d);
}

// Reverse helper for editing an existing match.
function timestampToInput(ts) {
  const d = ts?.toDate?.();
  if (!d) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

const EMPTY_MATCH = {
  teamAName: "",
  teamAShort: "",
  teamBName: "",
  teamBShort: "",
  matchType: "T20",
  venue: "",
  startTime: "",
  oddsWA: 1.85, oddsWB: 1.85,
  oddsTA: 1.9, oddsTB: 1.9,
  totalLine: 180.5, oddsOver: 1.85, oddsUnder: 1.85,
  batsmen: [{ name: "", odds: 3.5 }, { name: "", odds: 3.5 }, { name: "", odds: 4.0 }, { name: "", odds: 4.0 }],
};

function MatchFormModal({ initial, onClose, onSaved }) {
  const [form, setForm] = useState(initial || EMPTY_MATCH);
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm((p) => ({ ...p, [k]: v }));
  const setBatsman = (i, field, value) => {
    setForm((p) => {
      const next = [...p.batsmen];
      next[i] = { ...next[i], [field]: value };
      return { ...p, batsmen: next };
    });
  };

  const save = async () => {
    if (!form.teamAName || !form.teamBName) return toast.error("Both team names required.");
    if (!form.startTime) return toast.error("Start time required.");
    const start = inputToTimestamp(form.startTime);
    if (!start) return toast.error("Invalid start time.");

    const payload = {
      teamA: { name: form.teamAName.trim(), short: form.teamAShort.trim() || form.teamAName.slice(0, 3).toUpperCase() },
      teamB: { name: form.teamBName.trim(), short: form.teamBShort.trim() || form.teamBName.slice(0, 3).toUpperCase() },
      sport: "cricket",
      matchType: form.matchType,
      venue: (form.venue || "").trim(),
      startTime: start,
      status: "upcoming",
      odds: {
        winner: { A: Number(form.oddsWA), B: Number(form.oddsWB) },
        toss:   { A: Number(form.oddsTA), B: Number(form.oddsTB) },
        total:  { line: Number(form.totalLine), over: Number(form.oddsOver), under: Number(form.oddsUnder) },
        topBatsman: form.batsmen
          .filter((b) => b.name && b.name.trim())
          .map((b) => ({ name: b.name.trim(), odds: Number(b.odds) })),
      },
      result: { winner: null, tossWinner: null, totalRuns: null, topBatsman: null },
    };

    setSaving(true);
    try {
      if (initial?.id) {
        await updateDoc(doc(db, "matches", initial.id), payload);
        toast.success("Match updated.");
      } else {
        await addDoc(collection(db, "matches"), { ...payload, createdAt: serverTimestamp() });
        toast.success("Match created.");
      }
      onSaved();
    } catch (err) {
      console.error(err);
      toast.error("Save failed: " + err.message);
    } finally {
      setSaving(false);
    }
  };

  const L = "block text-xs font-semibold text-gray-600 mb-1";
  const I = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-xl my-8">
        <div className="border-b p-4 flex justify-between items-center sticky top-0 bg-white">
          <h3 className="font-bold text-lg">{initial?.id ? "Edit match" : "Create match"}</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>

        <div className="p-4 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={L}>Team A name</label>
              <input className={I} value={form.teamAName} onChange={(e) => set("teamAName", e.target.value)} placeholder="Mumbai Indians" />
            </div>
            <div>
              <label className={L}>Team A short</label>
              <input className={I} value={form.teamAShort} onChange={(e) => set("teamAShort", e.target.value)} placeholder="MI" />
            </div>
            <div>
              <label className={L}>Team B name</label>
              <input className={I} value={form.teamBName} onChange={(e) => set("teamBName", e.target.value)} placeholder="Chennai Super Kings" />
            </div>
            <div>
              <label className={L}>Team B short</label>
              <input className={I} value={form.teamBShort} onChange={(e) => set("teamBShort", e.target.value)} placeholder="CSK" />
            </div>
            <div>
              <label className={L}>Match type</label>
              <select className={I} value={form.matchType} onChange={(e) => set("matchType", e.target.value)}>
                {MATCH_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className={L}>Venue (optional)</label>
              <input className={I} value={form.venue} onChange={(e) => set("venue", e.target.value)} placeholder="Wankhede" />
            </div>
            <div className="col-span-2">
              <label className={L}>Start time (bets close at start)</label>
              <input type="datetime-local" className={I} value={form.startTime} onChange={(e) => set("startTime", e.target.value)} />
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Match Winner odds</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>{form.teamAShort || "Team A"} odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsWA} onChange={(e) => set("oddsWA", e.target.value)} />
              </div>
              <div>
                <label className={L}>{form.teamBShort || "Team B"} odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsWB} onChange={(e) => set("oddsWB", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Toss Winner odds</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className={L}>{form.teamAShort || "Team A"} odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsTA} onChange={(e) => set("oddsTA", e.target.value)} />
              </div>
              <div>
                <label className={L}>{form.teamBShort || "Team B"} odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsTB} onChange={(e) => set("oddsTB", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Total Runs Over / Under</p>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className={L}>Line</label>
                <input type="number" step="0.5" className={I} value={form.totalLine} onChange={(e) => set("totalLine", e.target.value)} />
              </div>
              <div>
                <label className={L}>Over odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsOver} onChange={(e) => set("oddsOver", e.target.value)} />
              </div>
              <div>
                <label className={L}>Under odds</label>
                <input type="number" step="0.05" className={I} value={form.oddsUnder} onChange={(e) => set("oddsUnder", e.target.value)} />
              </div>
            </div>
          </div>

          <div className="border rounded-lg p-3 bg-gray-50">
            <p className="text-xs font-bold uppercase text-gray-500 mb-2">Top Batsman (up to 4 players)</p>
            <div className="space-y-2">
              {form.batsmen.map((b, i) => (
                <div key={i} className="grid grid-cols-3 gap-3">
                  <input
                    className={`${I} col-span-2`}
                    placeholder={`Player ${i + 1} name`}
                    value={b.name}
                    onChange={(e) => setBatsman(i, "name", e.target.value)}
                  />
                  <input
                    type="number" step="0.1"
                    className={I}
                    placeholder="Odds"
                    value={b.odds}
                    onChange={(e) => setBatsman(i, "odds", e.target.value)}
                  />
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border-t p-4 flex justify-end gap-2 sticky bottom-0 bg-white">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={save} disabled={saving} className="px-4 py-2 bg-blue-600 text-white rounded disabled:opacity-40">
            {saving ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

function SettleModal({ match, onClose, onDone }) {
  const [winner, setWinner] = useState("");
  const [tossWinner, setTossWinner] = useState("");
  const [totalRuns, setTotalRuns] = useState("");
  const [topBatsman, setTopBatsman] = useState("");
  const [busy, setBusy] = useState(false);

  const batsmenOptions = match?.odds?.topBatsman || [];
  const hasTotal = match?.odds?.total?.line != null;

  const submit = async () => {
    if (!winner) return toast.error("Pick match winner (or Cancelled).");
    if (winner !== "cancelled") {
      if (!tossWinner && (match.odds?.toss?.A || match.odds?.toss?.B)) return toast.error("Pick toss winner.");
      if (hasTotal && totalRuns === "") return toast.error("Enter total runs.");
      if (batsmenOptions.length > 0 && !topBatsman) return toast.error("Pick top batsman.");
    }

    setBusy(true);
    try {
      const result = {
        winner,
        tossWinner: tossWinner || null,
        totalRuns: totalRuns === "" ? null : Number(totalRuns),
        topBatsman: topBatsman || null,
      };
      const out = await settleMatch(match.id, result);
      toast.success(`Settled. Paid ${out.paidUsers} users, refunded ${out.refundedUsers || 0}.`);
      onDone();
    } catch (err) {
      console.error(err);
      toast.error("Settle failed: " + err.message);
    } finally {
      setBusy(false);
    }
  };

  const L = "block text-xs font-semibold text-gray-600 mb-1";
  const I = "w-full border border-gray-300 rounded px-2 py-1.5 text-sm";

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-start justify-center p-4 overflow-y-auto">
      <div className="w-full max-w-md bg-white rounded-lg shadow-xl my-8">
        <div className="border-b p-4 flex justify-between items-center">
          <h3 className="font-bold text-lg">Settle match</h3>
          <button onClick={onClose} className="text-gray-500 text-2xl">×</button>
        </div>
        <div className="p-4 space-y-3">
          <p className="text-sm font-semibold">{match.teamA?.name} vs {match.teamB?.name}</p>

          <div>
            <label className={L}>Match winner</label>
            <select className={I} value={winner} onChange={(e) => setWinner(e.target.value)}>
              <option value="">— select —</option>
              <option value="A">{match.teamA?.short || match.teamA?.name} ({match.teamA?.name})</option>
              <option value="B">{match.teamB?.short || match.teamB?.name} ({match.teamB?.name})</option>
              <option value="cancelled">Cancelled / No result (refund all)</option>
            </select>
          </div>

          {winner !== "cancelled" && (
            <>
              {(match.odds?.toss?.A || match.odds?.toss?.B) && (
                <div>
                  <label className={L}>Toss winner</label>
                  <select className={I} value={tossWinner} onChange={(e) => setTossWinner(e.target.value)}>
                    <option value="">— select —</option>
                    <option value="A">{match.teamA?.short || match.teamA?.name}</option>
                    <option value="B">{match.teamB?.short || match.teamB?.name}</option>
                  </select>
                </div>
              )}

              {hasTotal && (
                <div>
                  <label className={L}>Total runs (line was {match.odds.total.line})</label>
                  <input type="number" className={I} value={totalRuns} onChange={(e) => setTotalRuns(e.target.value)} />
                </div>
              )}

              {batsmenOptions.length > 0 && (
                <div>
                  <label className={L}>Top batsman</label>
                  <select className={I} value={topBatsman} onChange={(e) => setTopBatsman(e.target.value)}>
                    <option value="">— select —</option>
                    {batsmenOptions.map((b) => (
                      <option key={b.name} value={b.name}>{b.name}</option>
                    ))}
                  </select>
                </div>
              )}
            </>
          )}
        </div>
        <div className="border-t p-4 flex justify-end gap-2">
          <button onClick={onClose} className="px-4 py-2 bg-gray-200 rounded">Cancel</button>
          <button onClick={submit} disabled={busy} className="px-4 py-2 bg-green-600 text-white rounded disabled:opacity-40">
            {busy ? "Settling..." : "Settle match"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function MatchManagement() {
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [settleFor, setSettleFor] = useState(null);

  useEffect(() => {
    const q = query(collection(db, "matches"), orderBy("startTime", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      setMatches(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      setLoading(false);
    }, (err) => { console.error(err); setLoading(false); });
    return () => unsub();
  }, []);

  const handleNew = () => {
    setEditing({ ...EMPTY_MATCH });
  };

  const handleEdit = (m) => {
    setEditing({
      id: m.id,
      teamAName: m.teamA?.name || "",
      teamAShort: m.teamA?.short || "",
      teamBName: m.teamB?.name || "",
      teamBShort: m.teamB?.short || "",
      matchType: m.matchType || "T20",
      venue: m.venue || "",
      startTime: timestampToInput(m.startTime),
      oddsWA: m.odds?.winner?.A ?? 1.85,
      oddsWB: m.odds?.winner?.B ?? 1.85,
      oddsTA: m.odds?.toss?.A ?? 1.9,
      oddsTB: m.odds?.toss?.B ?? 1.9,
      totalLine: m.odds?.total?.line ?? 180.5,
      oddsOver: m.odds?.total?.over ?? 1.85,
      oddsUnder: m.odds?.total?.under ?? 1.85,
      batsmen: (m.odds?.topBatsman && m.odds.topBatsman.length)
        ? [...m.odds.topBatsman, ...Array(Math.max(0, 4 - m.odds.topBatsman.length)).fill({ name: "", odds: 3.5 })].slice(0, 4)
        : EMPTY_MATCH.batsmen,
    });
  };

  const handleDelete = async (m) => {
    if (!window.confirm(`Delete match ${m.teamA?.name} vs ${m.teamB?.name}? Existing bets will NOT be refunded automatically.`)) return;
    try {
      await deleteDoc(doc(db, "matches", m.id));
      toast.success("Match deleted.");
    } catch (err) {
      toast.error("Delete failed: " + err.message);
    }
  };

  const fmt = (ts) => {
    const d = ts?.toDate?.();
    return d ? d.toLocaleString("en-IN") : "";
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold text-gray-800">🏏 Cricket matches</h2>
        <button onClick={handleNew} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-4 py-2 rounded">
          + Create match
        </button>
      </div>

      {loading ? (
        <p className="text-gray-500">Loading…</p>
      ) : matches.length === 0 ? (
        <div className="bg-white border rounded p-6 text-center text-gray-500">
          No matches yet. Click “Create match” to add one.
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-x-auto">
          <table className="w-full min-w-[900px]">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="p-3 text-left text-xs font-semibold text-gray-600">Match</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600">Type</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600">Start</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600">Winner Odds</th>
                <th className="p-3 text-left text-xs font-semibold text-gray-600">Status</th>
                <th className="p-3 text-right text-xs font-semibold text-gray-600">Actions</th>
              </tr>
            </thead>
            <tbody>
              {matches.map((m) => (
                <tr key={m.id} className="border-b last:border-0 hover:bg-gray-50">
                  <td className="p-3 text-sm font-semibold">
                    {m.teamA?.short || m.teamA?.name} vs {m.teamB?.short || m.teamB?.name}
                  </td>
                  <td className="p-3 text-xs text-gray-600">{m.matchType || "T20"}</td>
                  <td className="p-3 text-xs text-gray-600">{fmt(m.startTime)}</td>
                  <td className="p-3 text-xs">
                    {Number(m.odds?.winner?.A || 0).toFixed(2)} / {Number(m.odds?.winner?.B || 0).toFixed(2)}
                  </td>
                  <td className="p-3 text-xs">
                    <span className={`px-2 py-0.5 rounded-full font-semibold ${
                      m.status === "upcoming" ? "bg-yellow-100 text-yellow-700" :
                      m.status === "settled"  ? "bg-green-100 text-green-700" :
                      m.status === "cancelled" ? "bg-red-100 text-red-700" :
                      "bg-gray-100 text-gray-700"
                    }`}>
                      {m.status || "—"}
                      {m.result?.winner && m.status === "settled" &&
                        <> · {m.result.winner === "A" ? m.teamA?.short : m.result.winner === "B" ? m.teamB?.short : "X"}</>}
                    </span>
                  </td>
                  <td className="p-3 text-right space-x-2 whitespace-nowrap">
                    {m.status === "upcoming" && (
                      <>
                        <button onClick={() => handleEdit(m)} className="text-xs bg-gray-200 hover:bg-gray-300 px-2 py-1 rounded">Edit</button>
                        <button onClick={() => setSettleFor(m)} className="text-xs bg-green-600 hover:bg-green-700 text-white px-2 py-1 rounded">Settle</button>
                      </>
                    )}
                    <button onClick={() => handleDelete(m)} className="text-xs bg-red-500 hover:bg-red-700 text-white px-2 py-1 rounded">Delete</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <MatchFormModal
          initial={editing}
          onClose={() => setEditing(null)}
          onSaved={() => setEditing(null)}
        />
      )}
      {settleFor && (
        <SettleModal
          match={settleFor}
          onClose={() => setSettleFor(null)}
          onDone={() => setSettleFor(null)}
        />
      )}
    </div>
  );
}
