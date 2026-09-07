"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  Bell,
  UserPlus,
  MessageCircle,
  FileText,
  CheckCircle,
  XCircle,
  Check,
  ChevronRight,
} from "lucide-react";

type NotificationRow = {
  id: string;
  recipient_id: string;
  actor_id: string | null;
  notification_type: string;
  title: string;
  body: string | null;
  link_url: string | null;
  content_id: string | null;
  request_id: string | null;
  request_kind: string | null;
  is_read: boolean;
  created_at: string | null;
};

function formatTime(dateString: string | null) {
  if (!dateString) return "Unknown time";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "Unknown time";
  }
}

function notificationStyle(type: string) {
  switch (type) {
    case "collaboration_request":
      return { Icon: UserPlus, iconColor: "#4f46e5", bg: "bg-indigo-50" };
    case "profile_request":
      return { Icon: UserPlus, iconColor: "#0891b2", bg: "bg-cyan-50" };
    case "paper_access_request":
      return { Icon: FileText, iconColor: "#d97706", bg: "bg-amber-50" };
    case "paper_access_approved":
    case "request_accepted":
      return { Icon: CheckCircle, iconColor: "#059669", bg: "bg-emerald-50" };
    case "paper_access_rejected":
    case "request_declined":
      return { Icon: XCircle, iconColor: "#dc2626", bg: "bg-red-50" };
    case "comment":
      return { Icon: MessageCircle, iconColor: "#7c3aed", bg: "bg-violet-50" };
    default:
      return { Icon: Bell, iconColor: "#4f46e5", bg: "bg-indigo-50" };
  }
}

export default function NotificationBell() {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [open, setOpen] = useState(false);
  const [loadingList, setLoadingList] = useState(false);
  const [updating, setUpdating] = useState(false);

  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(async (currentUserId: string) => {
    if (!currentUserId) {
      setUnreadCount(0);
      return;
    }
    const { count, error } = await supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("recipient_id", currentUserId)
      .eq("is_read", false);
    if (error) {
      console.log("NOTIFICATION COUNT ERROR:", error);
      setUnreadCount(0);
      return;
    }
    setUnreadCount(count || 0);
  }, []);

  const loadLatestNotifications = useCallback(async (currentUserId: string) => {
    if (!currentUserId) return;
    setLoadingList(true);
    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, recipient_id, actor_id, notification_type, title, body, link_url, content_id, request_id, request_kind, is_read, created_at",
      )
      .eq("recipient_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(15);
    if (error) {
      console.log("NOTIFICATION LIST ERROR:", error);
      setLoadingList(false);
      return;
    }
    setNotifications((data || []) as NotificationRow[]);
    setLoadingList(false);
  }, []);

  const refreshNotificationData = useCallback(
    async (currentUserId: string) => {
      await loadUnreadCount(currentUserId);
      if (open) await loadLatestNotifications(currentUserId);
    },
    [loadUnreadCount, loadLatestNotifications, open],
  );

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await getCurrentUserSafe();

        if (!user) {
          setUserId("");
          setNotifications([]);
          setUnreadCount(0);
          return;
        }

        setUserId(user.id);
        await loadUnreadCount(user.id);
      } catch (error) {
        if (isAuthLockError(error)) {
          console.log("NOTIFICATION AUTH LOCK ERROR:", error);
          return;
        }

        console.log("NOTIFICATION AUTH ERROR:", error);
      }
    };
    loadUser();
  }, [loadUnreadCount]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notification-bell-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        async () => {
          await refreshNotificationData(userId);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, refreshNotificationData]);

  useEffect(() => {
    if (!open || !userId) return;
    loadLatestNotifications(userId);
  }, [open, userId, loadLatestNotifications]);

  const markOneRead = async (notificationId: string) => {
    if (!userId || updating) return;
    setUpdating(true);
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;
    const target = notifications.find((item) => item.id === notificationId);
    const wasUnread = target ? !target.is_read : false;
    setNotifications((prev) =>
      prev.map((item) =>
        item.id === notificationId ? { ...item, is_read: true } : item,
      ),
    );
    if (wasUnread) setUnreadCount((c) => Math.max(0, c - 1));

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("id", notificationId)
      .eq("recipient_id", userId);

    if (error) {
      console.log("MARK NOTIFICATION READ ERROR:", error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
    setUpdating(false);
  };

  const markAllRead = async () => {
    if (!userId || updating) return;
    setUpdating(true);
    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setNotifications((prev) =>
      prev.map((item) => ({ ...item, is_read: true })),
    );
    setUnreadCount(0);

    const { error } = await supabase
      .from("notifications")
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (error) {
      console.log("MARK ALL NOTIFICATIONS READ ERROR:", error);
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
    }
    setUpdating(false);
  };

  const handleOpenNotification = async (notification: NotificationRow) => {
    if (!notification.is_read) await markOneRead(notification.id);
    setOpen(false);
    router.push(notification.link_url || "/notifications");
  };

  if (!userId) return null;

  return (
    <>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((c) => !c)}
          className="relative p-2 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
          aria-label="Notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 ring-2 ring-white flex items-center justify-center text-[9px] font-bold text-white">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
          )}
        </button>

        {open && (
          <div className="absolute right-0 top-full mt-2 w-[360px] bg-card border border-border rounded-2xl shadow-xl z-50 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <div>
                <p className="text-sm font-bold text-foreground">
                  Notifications
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {unreadCount} unread
                </p>
              </div>
              {unreadCount > 0 && (
                <button
                  type="button"
                  onClick={markAllRead}
                  disabled={updating}
                  className="text-xs font-semibold text-primary hover:underline disabled:opacity-50 flex items-center gap-1"
                >
                  <Check className="w-3 h-3" /> Mark all read
                </button>
              )}
            </div>

            {/* List */}
            <div className="max-h-[420px] overflow-y-auto divide-y divide-border">
              {loadingList ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  Loading…
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-sm text-muted-foreground">
                  <Bell className="w-8 h-8 mx-auto mb-2 opacity-30" />
                  No notifications yet.
                </div>
              ) : (
                notifications.map((n) => {
                  const { Icon, iconColor, bg } = notificationStyle(
                    n.notification_type,
                  );
                  return (
                    <button
                      key={n.id}
                      type="button"
                      onClick={() => handleOpenNotification(n)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/50 ${
                        !n.is_read ? "bg-accent/40" : ""
                      }`}
                    >
                      <div
                        className={`w-8 h-8 rounded-xl ${bg} flex items-center justify-center flex-shrink-0 mt-0.5`}
                      >
                        <Icon
                          className="w-4 h-4"
                          style={{ color: iconColor }}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-xs font-bold text-foreground leading-tight">
                            {n.title}
                          </p>
                          <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">
                            {formatTime(n.created_at)}
                          </span>
                        </div>
                        {n.body && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-tight line-clamp-2">
                            {n.body}
                          </p>
                        )}
                      </div>
                      {!n.is_read && (
                        <span className="w-2 h-2 bg-primary rounded-full flex-shrink-0 mt-2" />
                      )}
                    </button>
                  );
                })
              )}
            </div>

            {/* Footer */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                router.push("/notifications");
              }}
              className="w-full px-4 py-2.5 text-xs font-semibold text-primary hover:bg-muted transition-colors border-t border-border flex items-center justify-center gap-1"
            >
              View all notifications <ChevronRight className="w-3 h-3" />
            </button>
          </div>
        )}
      </div>

      {/* Click-outside overlay */}
      {open && (
        <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
      )}
    </>
  );
}
