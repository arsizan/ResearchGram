"use client";

import { useEffect, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeInternalPath } from "@/lib/notifications";
import NotificationsUI, { type NotificationRow } from "./UI";

export default function NotificationsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);

  const loadNotifications = async (currentUserId: string) => {
    setLoading(true);

    const { data, error } = await supabase
      .from("notifications")
      .select(
        "id, recipient_id, actor_id, notification_type, title, body, link_url, content_id, request_id, request_kind, is_read, created_at, read_at",
      )
      .eq("recipient_id", currentUserId)
      .order("created_at", { ascending: false })
      .limit(15);

    if (error) {
      console.log("LOAD NOTIFICATIONS PAGE ERROR:", error);
    }

    setNotifications((data || []) as NotificationRow[]);
    setLoading(false);
  };

 useEffect(() => {
  let cancelled = false;

  const load = async () => {
    try {
      const authUser = await getCurrentUserSafe();

      if (!authUser) {
        router.push("/auth/login");
        return;
      }

      if (cancelled) return;

      setUserId(authUser.id);
      await loadNotifications(authUser.id);
    } catch (error) {
      if (isAuthLockError(error)) {
        console.log("NOTIFICATIONS AUTH LOCK ERROR:", error);
        return;
      }

      console.log("NOTIFICATIONS LOAD ERROR:", error);
    }
  };

  load();

  return () => {
    cancelled = true;
  };
}, [router]);

  useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`notifications-page-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "notifications",
          filter: `recipient_id=eq.${userId}`,
        },
        async () => {
          await loadNotifications(userId);
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleMarkRead = async (notificationId: string) => {
    if (!userId) return;

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("id", notificationId)
      .eq("recipient_id", userId);

    if (error) {
      console.log("MARK READ PAGE ERROR:", error);
      return;
    }

    await loadNotifications(userId);
  };

  const handleMarkAllRead = async () => {
    if (!userId) return;

    const { error } = await supabase
      .from("notifications")
      .update({
        is_read: true,
        read_at: new Date().toISOString(),
      })
      .eq("recipient_id", userId)
      .eq("is_read", false);

    if (error) {
      console.log("MARK ALL READ PAGE ERROR:", error);
      return;
    }

    await loadNotifications(userId);
  };

  const handleOpenNotification = async (notification: NotificationRow) => {
    if (!notification.is_read) {
      await handleMarkRead(notification.id);
    }

    router.push(safeInternalPath(notification.link_url, "/feed"));
  };

  return (
    <NotificationsUI
      loading={loading}
      filter={filter}
      notifications={notifications}
      setFilter={setFilter}
      handleMarkRead={handleMarkRead}
      handleMarkAllRead={handleMarkAllRead}
      handleOpenNotification={handleOpenNotification}
    />
  );
}