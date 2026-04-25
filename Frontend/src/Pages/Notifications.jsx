import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Check, Trophy, IndianRupee, UserPlus, AlertCircle, Volume2, VolumeX, X } from "lucide-react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import useAuthStore from "../store/authStore";
import { markNotificationRead, markAllNotificationsRead } from "../utils/notifications";
import { useUserSoundContext } from "../contexts/UserSoundContext";

const ICONS = {
  win: Trophy,
  deposit: IndianRupee,
  withdrawal: IndianRupee,
  referral: UserPlus,
  system: AlertCircle,
};

const ICON_COLORS = {
  win: "text-yellow-400 bg-yellow-500/10",
  deposit: "text-green-400 bg-green-500/10",
  withdrawal: "text-blue-400 bg-blue-500/10",
  referral: "text-purple-400 bg-purple-500/10",
  system: "text-gray-300 bg-gray-500/10",
};

export default function Notifications() {
  const user = useAuthStore((s) => s.user);
  const navigate = useNavigate();
  const [notifs, setNotifs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showSoundSettings, setShowSoundSettings] = useState(false);
  const sound = useUserSoundContext();
  const [customLabel, setCustomLabel] = useState('');
  const [customUrl, setCustomUrl] = useState('');
  const [customError, setCustomError] = useState('');

  useEffect(() => {
    if (!user?.uid) { setLoading(false); return; }
    const q = query(
      collection(db, "users", user.uid, "notifications"),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setNotifs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        setLoading(false);
      },
      (err) => {
        console.error("Notifications load failed:", err);
        setLoading(false);
      }
    );
    return () => unsub();
  }, [user?.uid]);

  const handleClick = async (n) => {
    if (!n.read) await markNotificationRead(user.uid, n.id);
    if (n.link) navigate(n.link);
  };

  const handleMarkAll = () => {
    if (user?.uid) markAllNotificationsRead(user.uid, notifs);
  };

  const formatTime = (ts) => {
    if (!ts?.toDate) return "";
    const d = ts.toDate();
    const diffMin = (Date.now() - d.getTime()) / 60000;
    if (diffMin < 1) return "just now";
    if (diffMin < 60) return `${Math.floor(diffMin)} min ago`;
    if (diffMin < 24 * 60) return `${Math.floor(diffMin / 60)} h ago`;
    return d.toLocaleDateString("en-IN");
  };

  const unread = notifs.filter((n) => !n.read).length;

  return (
    <div className="min-h-screen bg-[#042346] text-white pt-20 pb-10">
      <div className="max-w-2xl mx-auto px-4">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="p-2 rounded-full hover:bg-white/10"
            >
              <ArrowLeft size={22} className="text-yellow-500" />
            </button>
            <h1 className="text-2xl font-bold">Notifications</h1>
          </div>
          <div className="flex items-center gap-3">
            {unread > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
              >
                <Check size={14} /> Mark all read
              </button>
            )}
            <button
              onClick={() => setShowSoundSettings((s) => !s)}
              title="Sound settings"
              className={`p-2 rounded-lg border transition-colors ${
                sound.enabled
                  ? 'bg-yellow-500/10 border-yellow-400/30 text-yellow-300 hover:bg-yellow-500/20'
                  : 'bg-white/5 border-white/10 text-gray-400 hover:bg-white/10'
              }`}
            >
              {sound.enabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
            </button>
          </div>
        </div>

        {showSoundSettings && (
          <div className="mb-6 rounded-2xl border border-white/10 bg-[#0a2d55] p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-bold text-yellow-400">Sound Settings</h3>
              <button onClick={() => setShowSoundSettings(false)} className="text-gray-400 hover:text-white">
                <X size={18} />
              </button>
            </div>

            <label className="flex items-center justify-between text-sm">
              <span className="font-medium">Sounds enabled</span>
              <input
                type="checkbox"
                checked={sound.enabled}
                onChange={(e) => {
                  sound.setEnabled(e.target.checked);
                  if (e.target.checked) sound.playApproval();
                }}
                className="h-4 w-4 accent-yellow-500"
              />
            </label>

            <div className={sound.enabled ? '' : 'opacity-50 pointer-events-none'}>
              <div className="flex items-center justify-between text-sm mb-1">
                <span className="font-medium">Volume</span>
                <span className="text-xs text-gray-400">{Math.round(sound.volume * 100)}%</span>
              </div>
              <input
                type="range" min="0" max="1" step="0.05"
                value={sound.volume}
                onChange={(e) => sound.setVolume(e.target.value)}
                className="w-full accent-yellow-500"
              />
            </div>

            {/* Approval sound */}
            <div className={sound.enabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-sm font-medium mb-1">When deposit/withdrawal is APPROVED</label>
              <div className="flex items-center gap-2">
                <select
                  value={sound.approvalChoice}
                  onChange={(e) => sound.setApprovalChoice(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-[#042346] border border-white/10 text-sm"
                >
                  {sound.approvalOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => sound.playApproval()}
                  className="px-3 py-2 text-xs font-semibold bg-green-500 text-black rounded-lg hover:bg-green-400"
                >Test</button>
              </div>
            </div>

            {/* Rejection sound */}
            <div className={sound.enabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-sm font-medium mb-1">When deposit/withdrawal is REJECTED</label>
              <div className="flex items-center gap-2">
                <select
                  value={sound.rejectionChoice}
                  onChange={(e) => sound.setRejectionChoice(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-[#042346] border border-white/10 text-sm"
                >
                  {sound.rejectionOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => sound.playRejection()}
                  className="px-3 py-2 text-xs font-semibold bg-red-500 text-white rounded-lg hover:bg-red-400"
                >Test</button>
              </div>
            </div>

            {/* Click sound (cricket +bet buttons etc) */}
            <div className={sound.enabled ? '' : 'opacity-50 pointer-events-none'}>
              <label className="block text-sm font-medium mb-1">Click feedback (cricket bet +₹100 etc.)</label>
              <div className="flex items-center gap-2">
                <select
                  value={sound.clickChoice}
                  onChange={(e) => sound.setClickChoice(e.target.value)}
                  className="flex-1 p-2 rounded-lg bg-[#042346] border border-white/10 text-sm"
                >
                  {sound.clickOptions.map((o) => (
                    <option key={o.id} value={o.id}>{o.label}</option>
                  ))}
                </select>
                <button
                  onClick={() => sound.playClick()}
                  className="px-3 py-2 text-xs font-semibold bg-yellow-500 text-black rounded-lg hover:bg-yellow-400"
                >Test</button>
              </div>
            </div>

            <label className="flex items-center justify-between text-sm pt-3 border-t border-white/10">
              <span className="font-medium">
                Vibrate on mobile
                {typeof navigator !== 'undefined' && typeof navigator.vibrate !== 'function' && (
                  <span className="block text-xs text-gray-500 font-normal">(not supported on this device)</span>
                )}
              </span>
              <input
                type="checkbox"
                checked={sound.vibrate}
                onChange={(e) => sound.setVibrate(e.target.checked)}
                className="h-4 w-4 accent-yellow-500"
              />
            </label>

            {/* Custom sounds */}
            <div className="pt-3 border-t border-white/10">
              <p className="text-sm font-semibold mb-2">Your custom sounds</p>
              {sound.customSounds.length > 0 ? (
                <ul className="mb-2 space-y-1 max-h-32 overflow-y-auto">
                  {sound.customSounds.map((s) => (
                    <li key={s.id} className="flex items-center justify-between text-xs bg-[#042346] rounded-md px-2 py-1.5">
                      <span className="truncate">{s.label}</span>
                      <button
                        onClick={() => sound.removeCustomSound(s.id)}
                        className="ml-2 text-red-400 hover:text-red-300"
                      >
                        <X size={14} />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-xs text-gray-400 mb-2">Upload an MP3/WAV (max 1 MB) or paste a public URL.</p>
              )}
              <input
                type="text"
                value={customLabel}
                onChange={(e) => { setCustomLabel(e.target.value); setCustomError(''); }}
                placeholder="Label (e.g. My ringtone)"
                className="w-full mb-2 p-2 rounded-lg bg-[#042346] border border-white/10 text-sm"
              />
              <input
                type="text"
                value={customUrl}
                onChange={(e) => { setCustomUrl(e.target.value); setCustomError(''); }}
                placeholder="https://...mp3 (optional)"
                className="w-full mb-2 p-2 rounded-lg bg-[#042346] border border-white/10 text-sm"
              />
              <div className="flex items-center gap-2">
                <label className="flex-1 cursor-pointer text-center px-3 py-2 text-xs font-medium border border-white/10 rounded-md bg-[#042346] hover:bg-[#053163]">
                  Upload file
                  <input
                    type="file"
                    accept="audio/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      try {
                        await sound.addCustomSound({ label: customLabel || file.name, file });
                        setCustomLabel('');
                        setCustomUrl('');
                        setCustomError('');
                      } catch (err) {
                        setCustomError(err.message || 'Failed to add sound');
                      } finally {
                        e.target.value = '';
                      }
                    }}
                  />
                </label>
                <button
                  onClick={async () => {
                    if (!customUrl.trim()) { setCustomError('Paste a URL or use Upload file'); return; }
                    try {
                      await sound.addCustomSound({ label: customLabel || 'Custom URL', url: customUrl.trim() });
                      setCustomLabel('');
                      setCustomUrl('');
                      setCustomError('');
                    } catch (err) {
                      setCustomError(err.message || 'Failed to add sound');
                    }
                  }}
                  className="flex-1 px-3 py-2 text-xs font-medium bg-yellow-500 text-black rounded-md hover:bg-yellow-400"
                >Add URL</button>
              </div>
              {customError && <p className="text-xs text-red-400 mt-1.5">{customError}</p>}
            </div>
          </div>
        )}

        {loading ? (
          <p className="text-center text-gray-400 py-10">Loading…</p>
        ) : notifs.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="mx-auto text-gray-600 mb-3" size={48} />
            <p className="text-gray-400">No notifications yet.</p>
            <p className="text-gray-500 text-sm mt-1">Wins, withdrawals, and referral bonuses show up here.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifs.map((n) => {
              const Icon = ICONS[n.type] || ICONS.system;
              const iconColor = ICON_COLORS[n.type] || ICON_COLORS.system;
              return (
                <button
                  key={n.id}
                  onClick={() => handleClick(n)}
                  className={`w-full text-left flex gap-3 p-3 rounded-xl transition-colors ${
                    n.read ? "bg-[#0a2d55]/60" : "bg-[#0a2d55] border-l-4 border-yellow-400"
                  } hover:bg-[#0a2d55]`}
                >
                  <div className={`shrink-0 w-10 h-10 rounded-full flex items-center justify-center ${iconColor}`}>
                    <Icon size={18} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-semibold text-sm">{n.title}</p>
                      <span className="text-[10px] text-gray-400 shrink-0">{formatTime(n.createdAt)}</span>
                    </div>
                    {n.body && <p className="text-xs text-gray-300 mt-0.5">{n.body}</p>}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
