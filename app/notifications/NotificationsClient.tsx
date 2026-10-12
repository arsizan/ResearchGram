"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { safeInternalPath } from "@/lib/notifications";
import NotificationsUI, { type NotificationRow } from "./UI";
import { logDev } from "@/lib/log";
import { notify } from "@/lib/feedback";

// The page shows the newest 15 and grows by 15 with "Load more" (audit RG-17).
const NOTIFICATION_PAGE_SIZE = 15;

export default function NotificationsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [notifications, setNotifications] = useState<NotificationRow[]>([]);
  // Totals come from the database, not from the rows on screen.
  const [totalCount, setTotalCount] = useState(0);
  const [unreadTotal, setUnreadTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // How many of the newest notifications every reload fetches, so the ones
  // loaded with "Load more" stay on screen.
  const notificationLimitRef = useRef(NOTIFICATION_PAGE_SIZE);
  const loadingMoreRef = useRef(false);
  // Reloads can finish out of order. A result is shown only if no newer
  // reload has been shown already.
  const requestCounterRef = useRef(0);
  const shownRequestRef = useRef(0);

  // The full-page loading screen is only for the first load. Reloads (new
  // notification, mark read, load more) update the list in place, so the
  // page does not flash or jump back to the top.
  const loadNotifications = async (currentUserId: string) => {
    const requestId = ++requestCounterRef.current;
    const limit = notificationLimitRef.current;

    const [listResult, unreadResult] = await Promise.all([
      supabase
        .from("notifications")
        .select(
          "id, recipient_id, actor_id, notification_type, title, body, link_url, content_id, request_id, request_kind, is_read, created_at, read_at",
          { count: "exact" },
        )
        .eq("recipient_id", currentUserId)
        .order("created_at", { ascending: false })
        .limit(limit),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("recipient_id", currentUserId)
        .eq("is_read", false),
    ]);

    if (requestId <= shownRequestRef.current) return;

    if (listResult.error) {
      // Keep what is on screen.
      logDev("LOAD NOTIFICATIONS PAGE ERROR:", listResult.error);
      setLoading(false);
      return;
    }

    shownRequestRef.current = requestId;

    const rows = (listResult.data || []) as NotificationRow[];
    setNotifications(rows);
    setTotalCount(listResult.count ?? rows.length);

    if (unreadResult.error) {
      logDev("COUNT UNREAD NOTIFICATIONS ERROR:", unreadResult.error);
      setUnreadTotal(rows.filter((item) => !item.is_read).length);
    } else {
      setUnreadTotal(unreadResult.count ?? 0);
    }

    setLoading(false);
  };

  const handleLoadMore = async () => {
    if (!userId || loadingMoreRef.current) return;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    notificationLimitRef.current += NOTIFICATION_PAGE_SIZE;

    try {
      await loadNotifications(userId);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
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
        logDev(
          isAuthLockError(error) ? "NOTIFICATIONS AUTH LOCK ERROR:" : "NOTIFICATIONS LOAD ERROR:",
          error,
        );
        if (!cancelled) {
          notify("Could not load your notifications. Reload the page to try again.", "error");
        }
      } finally {
        // The loading screen never stays up after a failed check (audit RG-37).
        if (!cancelled) setLoading(false);
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
      logDev("MARK READ PAGE ERROR:", error);
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
      logDev("MARK ALL READ PAGE ERROR:", error);
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
      totalCount={totalCount}
      unreadTotal={unreadTotal}
      hasMore={notifications.length < totalCount}
      loadingMore={loadingMore}
      handleLoadMore={handleLoadMore}
    />
  );
}