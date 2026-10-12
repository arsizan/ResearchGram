"use client";

import AppNav from "@/components/AppNav";


export type NotificationRow = {
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
  read_at: string | null;
};

type NotificationsUIProps = {
  loading: boolean;
  filter: "all" | "unread";
  notifications: NotificationRow[];
  setFilter: (filter: "all" | "unread") => void;
  handleMarkRead: (notificationId: string) => void;
  handleMarkAllRead: () => void;
  handleOpenNotification: (notification: NotificationRow) => void;

  // Totals from the database and "Load more" (audit RG-17).
  totalCount?: number;
  unreadTotal?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  handleLoadMore?: () => void;
};

function formatTime(dateString: string | null) {
  if (!dateString) return "Unknown time";

  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    }).format(new Date(dateString));
  } catch {
    return "Unknown time";
  }
}

function typeEmoji(type: string) {
  switch (type) {
    case "collaboration_request":
      return "🤝";
    case "profile_request":
      return "👤";
    case "paper_access_request":
      return "📘";
    case "paper_access_approved":
      return "✅";
    case "paper_access_rejected":
      return "🚫";
    case "request_accepted":
      return "✅";
    case "request_declined":
      return "❌";
    case "comment":
      return "💬";
    default:
      return "🔔";
  }
}

function formatType(type: string) {
  return type.replaceAll("_", " ");
}

export default function NotificationsUI({
  loading,
  filter,
  notifications,
  setFilter,
  handleMarkRead,
  handleMarkAllRead,
  handleOpenNotification,
  totalCount,
  unreadTotal,
  hasMore = false,
  loadingMore = false,
  handleLoadMore,
}: NotificationsUIProps) {
  const unreadCount =
    unreadTotal ?? notifications.filter((item) => !item.is_read).length;

  const visibleNotifications =
    filter === "unread"
      ? notifications.filter((item) => !item.is_read)
      : notifications;

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-gray-100">
        <p className="text-lg text-gray-600">Loading notifications...</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100">
      <AppNav activePage="notifications" />

      <section className="mx-auto max-w-4xl px-4 py-8">
        <div className="rounded-3xl bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-950">
                Notifications
              </h1>

              <p className="mt-2 text-sm text-gray-500">
                You have {unreadCount} unread notification
                {unreadCount === 1 ? "" : "s"}.
              </p>
            </div>

            {unreadCount > 0 && (
              <button
                onClick={handleMarkAllRead}
                className="rounded-full bg-blue-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
              >
                Mark all read
              </button>
            )}
          </div>

          <div className="mt-6 flex rounded-2xl bg-gray-50 p-1">
            <button
              type="button"
              aria-pressed={filter === "all"}
              onClick={() => setFilter("all")}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                filter === "all"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              All ({totalCount ?? notifications.length})
            </button>

            <button
              type="button"
              aria-pressed={filter === "unread"}
              onClick={() => setFilter("unread")}
              className={`flex-1 rounded-xl px-4 py-3 text-sm font-semibold transition ${
                filter === "unread"
                  ? "bg-white text-blue-700 shadow-sm"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Unread ({unreadCount})
            </button>
          </div>
        </div>

        <div className="mt-6 space-y-4">
          {visibleNotifications.length === 0 ? (
            <div className="rounded-3xl border border-dashed border-gray-200 bg-white p-12 text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-50 text-2xl">
                🔔
              </div>

              <h2 className="text-xl font-bold text-gray-950">
                No notifications
              </h2>

              <p className="mt-2 text-sm text-gray-500">
                Your research requests, paper access updates, comments, and
                system alerts will appear here.
              </p>
            </div>
          ) : (
            visibleNotifications.map((notification) => (
              <div
                key={notification.id}
                className={`rounded-3xl border p-5 shadow-sm transition ${
                  notification.is_read
                    ? "border-gray-100 bg-white"
                    : "border-blue-100 bg-blue-50"
                }`}
              >
                <div className="flex items-start gap-4">
                  <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white text-2xl shadow-sm">
                    {typeEmoji(notification.notification_type)}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-white px-3 py-1 text-xs font-bold capitalize text-blue-700">
                        {formatType(notification.notification_type)}
                      </span>

                      {!notification.is_read && (
                        <span className="rounded-full bg-blue-600 px-3 py-1 text-xs font-bold text-white">
                          New
                        </span>
                      )}
                    </div>

                    <h2 className="mt-3 text-lg font-bold text-gray-950">
                      {notification.title}
                    </h2>

                    {notification.body && (
                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-600">
                        {notification.body}
                      </p>
                    )}

                    <p className="mt-3 text-xs text-gray-600">
                      {formatTime(notification.created_at)}
                    </p>

                    <div className="mt-4 flex flex-wrap gap-3">
                      <button
                        onClick={() => handleOpenNotification(notification)}
                        className="rounded-full bg-blue-600 px-5 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
                      >
                        Open
                      </button>

                      {!notification.is_read && (
                        <button
                          onClick={() => handleMarkRead(notification.id)}
                          className="rounded-full bg-white px-5 py-2 text-sm font-semibold text-gray-700 transition hover:bg-gray-100"
                        >
                          Mark read
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {hasMore && handleLoadMore && (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={loadingMore}
              className="rounded-full bg-white px-6 py-3 text-sm font-semibold text-gray-700 shadow-sm transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {loadingMore ? "Loading..." : "Load more"}
            </button>
          </div>
        )}
      </section>
    </main>
  );
}