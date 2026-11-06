"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Bell, Check, ExternalLink, ShieldAlert, Sparkles, CheckCircle2, Settings } from "lucide-react";
import { OrgSwitcher } from "@/components/tenant/OrgSwitcher";

interface NotificationItem {
  id: string;
  user_id: string;
  organization_id: string;
  alert_id: string;
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  body: string;
  link: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationCenterBell() {
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      const res = await fetch("/api/alerts");
      if (res.ok) {
        const json = await res.json();
        setNotifications(json.notifications || []);
        setUnreadCount(json.unreadCount || 0);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const markRead = async (id: string) => {
    try {
      await fetch("/api/alerts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "mark_read", notificationId: id }),
      });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="relative inline-block text-left">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="notification-bell relative p-2 rounded-xl bg-neutral-900 border border-neutral-800 hover:border-neutral-700 text-neutral-300 transition cursor-pointer"
        aria-label="Open notification center"
        title="Notification Center"
      >
        <Bell className="w-5 h-5 text-neutral-200" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[#FF2D2D] text-white text-[10px] font-bold flex items-center justify-center border-2 border-[#050505] animate-pulse">
            {unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="notification-menu absolute right-0 mt-3 w-80 sm:w-96 rounded-3xl bg-neutral-900 border border-neutral-800 shadow-2xl z-50 overflow-hidden font-sans">
          <div className="px-5 py-4 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-[#FF2D2D]" />
              <span className="font-bold text-sm text-white font-mono uppercase tracking-wider">
                Notifications ({unreadCount})
              </span>
            </div>
            <Link
              href="/settings/notifications"
              className="text-xs text-neutral-400 hover:text-white flex items-center gap-1 font-mono"
              onClick={() => setIsOpen(false)}
            >
              <Settings className="w-3 h-3" /> Preferences
            </Link>
          </div>

          <div className="max-h-96 overflow-y-auto divide-y divide-neutral-800/60 font-mono text-xs">
            {notifications.length === 0 ? (
              <div className="p-8 text-center text-neutral-500">No recent notifications.</div>
            ) : (
              notifications.map((item) => (
                <div
                  key={item.id}
                  className={`p-4 transition ${
                    item.is_read ? "bg-neutral-950/40 opacity-70" : "bg-neutral-900"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="flex items-center gap-1.5">
                      {/* Layer 15 Exact Severity Colors: critical = #FF2D2D, high = amber-400 */}
                      <span
                        className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${
                          item.severity === "critical"
                            ? "bg-red-950/80 text-[#FF2D2D] border border-red-800/80"
                            : item.severity === "high"
                            ? "bg-amber-950/80 text-amber-400 border border-amber-800/80"
                            : "bg-emerald-950/80 text-emerald-400 border border-emerald-800/80"
                        }`}
                      >
                        {item.severity}
                      </span>
                      <span className="font-bold text-white text-xs leading-snug">{item.title}</span>
                    </div>

                    {!item.is_read && (
                      <button
                        onClick={() => markRead(item.id)}
                        className="text-neutral-400 hover:text-white text-[10px] flex items-center gap-0.5 cursor-pointer shrink-0"
                        title="Mark as read"
                      >
                        <Check className="w-3 h-3 text-emerald-400" />
                      </button>
                    )}
                  </div>

                  <p className="text-[11px] text-neutral-300 font-sans mt-1 line-clamp-2">{item.body}</p>

                  <div className="mt-2.5 flex items-center justify-between text-[10px]">
                    <span className="text-neutral-500">{new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <Link
                      href={item.link}
                      onClick={() => {
                        markRead(item.id);
                        setIsOpen(false);
                      }}
                      className="text-emerald-400 hover:underline flex items-center gap-1 font-bold"
                    >
                      <span>View Details</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
