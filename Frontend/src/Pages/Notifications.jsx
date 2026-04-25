import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Bell, Check, Trophy, IndianRupee, UserPlus, AlertCircle } from "lucide-react";
import { collection, onSnapshot, query, orderBy, limit } from "firebase/firestore";
import { db } from "../firebase";
import useAuthStore from "../store/authStore";
import { markNotificationRead, markAllNotificationsRead } from "../utils/notifications";

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
          {unread > 0 && (
            <button
              onClick={handleMarkAll}
              className="text-xs font-semibold text-yellow-400 hover:text-yellow-300 flex items-center gap-1"
            >
              <Check size={14} /> Mark all read
            </button>
          )}
        </div>

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
