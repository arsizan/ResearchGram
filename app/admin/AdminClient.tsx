"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, FileText, History, ShieldCheck, Users } from "lucide-react";
import AppNav from "@/components/AppNav";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { supabase } from "@/lib/supabase";
import { confirmAction, friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";

/*
 * Admin console: numbers at a glance, the moderation queue (reported posts)
 * and the audit log. Everything here comes from admin-only database functions;
 * a person who is not in public.admins gets nothing back, whatever this page
 * does. Admins are added in the SQL editor (see supabase/README.md).
 */

type Overview = {
  users: number;
  new_users_7d: number;
  posts: number;
  posts_7d: number;
  messages_7d: number;
  pending_reports: number;
  reported_posts: number;
  admins: number;
};

type ReportedPost = {
  content_id: string;
  post_title: string | null;
  post_excerpt: string | null;
  post_author_id: string | null;
  post_author_name: string | null;
  post_visibility: string | null;
  post_created_at: string | null;
  report_count: number | string;
  reasons: string[] | null;
  details: string[] | null;
  first_reported_at: string | null;
  last_reported_at: string | null;
  resolved_at: string | null;
  resolution_note: string | null;
};

type AuditEntry = {
  id: number;
  occurred_at: string;
  actor_id: string | null;
  actor_name: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  details: Record<string, unknown> | null;
};

type QueueTab = "pending" | "resolved";

const QUEUE_PAGE = 20;
const AUDIT_PAGE = 30;

const ACTION_LABELS: Record<string, string> = {
  "admin.added": "Admin added",
  "admin.removed": "Admin removed",
  "post.removed": "Post removed",
  "reports.dismissed": "Reports dismissed",
  "account.deleted": "Account deleted",
  "account.exported": "Data downloaded",
  "orcid.verified": "ORCID iD verified",
  "paper_access.approved": "Paper access approved",
  "paper_access.rejected": "Paper access rejected",
  "workspace.member_added": "Workspace member added",
  "workspace.member_removed": "Workspace member removed",
};

function formatDate(value: string | null) {
  if (!value) return "";
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(value));
  } catch {
    return "";
  }
}

function describeDetails(entry: AuditEntry) {
  const details = entry.details || {};
  const parts: string[] = [];
  if (typeof details.title === "string" && details.title) parts.push(`“${details.title}”`);
  if (typeof details.reason === "string" && details.reason) parts.push(`reason: ${details.reason}`);
  if (typeof details.note === "string" && details.note) parts.push(`note: ${details.note}`);
  if (typeof details.reports === "number") parts.push(`${details.reports} report${details.reports === 1 ? "" : "s"}`);
  if (typeof details.posts === "number") parts.push(`${details.posts} post${details.posts === 1 ? "" : "s"}`);
  if (typeof details.orcid === "string") parts.push(details.orcid);
  return parts.join(" · ");
}

export default function AdminClient() {
  const router = useRouter();

  const [checking, setChecking] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);

  const [overview, setOverview] = useState<Overview | null>(null);
  const [queueTab, setQueueTab] = useState<QueueTab>("pending");
  const [queue, setQueue] = useState<ReportedPost[]>([]);
  const [queueHasMore, setQueueHasMore] = useState(false);
  const [loadingQueue, setLoadingQueue] = useState(false);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [auditHasMore, setAuditHasMore] = useState(false);
  const [loadingAudit, setLoadingAudit] = useState(false);

  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [busyPostId, setBusyPostId] = useState("");

  const loadOverview = useCallback(async () => {
    const { data, error } = await supabase.rpc("admin_overview");
    if (error) {
      logDev("ADMIN OVERVIEW ERROR:", error);
      return;
    }
    setOverview(data as Overview);
  }, []);

  const loadQueue = useCallback(async (tab: QueueTab, offset: number) => {
    setLoadingQueue(true);
    try {
      const { data, error } = await supabase.rpc("admin_report_queue", {
        p_status: tab,
        p_limit: QUEUE_PAGE + 1,
        p_offset: offset,
      });

      if (error) {
        logDev("ADMIN QUEUE ERROR:", error);
        notify(friendlyError(error, "Could not load the reports."), "error");
        return;
      }

      const rows = (data || []) as ReportedPost[];
      setQueueHasMore(rows.length > QUEUE_PAGE);
      const page = rows.slice(0, QUEUE_PAGE);
      setQueue((current) => (offset === 0 ? page : [...current, ...page]));
    } finally {
      setLoadingQueue(false);
    }
  }, []);

  const loadAudit = useCallback(async (before: number | null) => {
    setLoadingAudit(true);
    try {
      const { data, error } = await supabase.rpc("admin_audit_log", {
        p_limit: AUDIT_PAGE + 1,
        p_before: before,
      });

      if (error) {
        logDev("ADMIN AUDIT ERROR:", error);
        notify(friendlyError(error, "Could not load the audit log."), "error");
        return;
      }

      const rows = (data || []) as AuditEntry[];
      setAuditHasMore(rows.length > AUDIT_PAGE);
      const page = rows.slice(0, AUDIT_PAGE);
      setAudit((current) => (before === null ? page : [...current, ...page]));
    } finally {
      setLoadingAudit(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const user = await getCurrentUserSafe();
        if (!user) {
          router.push("/auth/login?next=/admin");
          return;
        }

        const { data, error } = await supabase.rpc("is_admin");
        if (cancelled) return;

        if (error) logDev("IS ADMIN ERROR:", error);
        const admin = data === true;
        setIsAdmin(admin);

        if (admin) {
          await Promise.all([loadOverview(), loadQueue("pending", 0), loadAudit(null)]);
        }
      } catch (error) {
        if (!isAuthLockError(error)) logDev("ADMIN LOAD ERROR:", error);
      } finally {
        if (!cancelled) setChecking(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router, loadOverview, loadQueue, loadAudit]);

  const switchQueueTab = (tab: QueueTab) => {
    if (tab === queueTab) return;
    setQueueTab(tab);
    setQueue([]);
    void loadQueue(tab, 0);
  };

  const refreshAfterAction = async () => {
    await Promise.all([loadOverview(), loadQueue(queueTab, 0), loadAudit(null)]);
  };

  const handleDismiss = async (post: ReportedPost) => {
    const confirmed = await confirmAction({
      title: "Dismiss these reports?",
      message: `The post stays up and its ${Number(post.report_count)} open report(s) are closed.`,
      confirmLabel: "Dismiss reports",
    });
    if (!confirmed) return;

    setBusyPostId(post.content_id);
    try {
      const { error } = await supabase.rpc("admin_dismiss_reports", {
        p_content_id: post.content_id,
        p_note: reasons[post.content_id]?.trim() || null,
      });

      if (error) {
        logDev("DISMISS REPORTS ERROR:", error);
        notify(friendlyError(error, "Could not dismiss the reports."), "error");
        return;
      }

      notify("Reports dismissed.", "success");
      await refreshAfterAction();
    } finally {
      setBusyPostId("");
    }
  };

  const handleRemove = async (post: ReportedPost) => {
    const reason = reasons[post.content_id]?.trim() || "";
    if (!reason) {
      notify("Write the reason first. The author will see it.", "info");
      return;
    }

    const confirmed = await confirmAction({
      title: "Remove this post?",
      message: "The post, its comments and its files are deleted for everyone. The author is told why. This cannot be undone.",
      confirmLabel: "Remove post",
      tone: "danger",
    });
    if (!confirmed) return;

    setBusyPostId(post.content_id);
    try {
      const { data, error } = await supabase.rpc("admin_remove_post", {
        p_content_id: post.content_id,
        p_reason: reason,
      });

      if (error) {
        logDev("REMOVE POST ERROR:", error);
        notify(friendlyError(error, "Could not remove the post."), "error");
        return;
      }

      // The database cannot delete stored files; do it here.
      const files = ((data as { files?: { bucket: string; path: string }[] } | null)?.files || []);
      const byBucket = new Map<string, string[]>();
      files.forEach((file) => byBucket.set(file.bucket, [...(byBucket.get(file.bucket) || []), file.path]));

      let filesLeft = 0;
      for (const [bucket, paths] of byBucket) {
        const { error: removeError } = await supabase.storage.from(bucket).remove(paths);
        if (removeError) {
          logDev("REMOVE POST FILES ERROR:", removeError);
          filesLeft += paths.length;
        }
      }

      notify(
        filesLeft > 0
          ? `Post removed, but ${filesLeft} file(s) could not be deleted. Delete them in Supabase Storage.`
          : "Post removed. The author was told why.",
        filesLeft > 0 ? "error" : "success",
      );
      setReasons((current) => {
        const next = { ...current };
        delete next[post.content_id];
        return next;
      });
      await refreshAfterAction();
    } finally {
      setBusyPostId("");
    }
  };

  if (checking) {
    return (
      <main className="min-h-screen bg-background">
        <AppNav activePage="admin" />
        <p className="mx-auto max-w-5xl px-4 py-10 text-sm text-muted-foreground" role="status">
          Loading the admin console…
        </p>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="min-h-screen bg-background">
        <AppNav activePage="admin" />
        <section className="mx-auto max-w-xl px-4 py-16 text-center">
          <ShieldCheck className="mx-auto h-10 w-10 text-muted-foreground" aria-hidden="true" />
          <h1 className="mt-4 text-2xl font-extrabold text-foreground">Admins only</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This page is for ResearchGram moderators. If you should have access, ask the project owner.
          </p>
          <Link href="/feed" className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90">
            Back to the feed
          </Link>
        </section>
      </main>
    );
  }

  const stats: { label: string; value: number | string; hint?: string; icon: typeof Users }[] = overview
    ? [
        { label: "Researchers", value: overview.users, hint: `+${overview.new_users_7d} this week`, icon: Users },
        { label: "Posts", value: overview.posts, hint: `+${overview.posts_7d} this week`, icon: FileText },
        { label: "Messages this week", value: overview.messages_7d, icon: History },
        { label: "Open reports", value: overview.pending_reports, hint: `${overview.reported_posts} post(s)`, icon: AlertTriangle },
      ]
    : [];

  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="admin" />

      <div className="mx-auto max-w-5xl space-y-6 px-4 py-6">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">Admin console</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Moderation and the audit log. Every action here is recorded.
            </p>
          </div>
          {overview && (
            <p className="text-xs text-muted-foreground">
              {overview.admins} admin{overview.admins === 1 ? "" : "s"}
            </p>
          )}
        </header>

        {stats.length > 0 && (
          <section aria-labelledby="admin-stats" className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <h2 id="admin-stats" className="sr-only">Overview</h2>
            {stats.map((stat) => (
              <div key={stat.label} className="rounded-2xl border border-border bg-card p-4">
                <stat.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                <p className="mt-2 text-2xl font-extrabold text-foreground">{stat.value}</p>
                <p className="text-xs font-semibold text-foreground">{stat.label}</p>
                {stat.hint && <p className="text-xs text-muted-foreground">{stat.hint}</p>}
              </div>
            ))}
          </section>
        )}

        <section aria-labelledby="admin-queue" className="rounded-2xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 id="admin-queue" className="text-lg font-bold text-foreground">Reported posts</h2>
            <div className="flex gap-1 rounded-xl bg-muted p-1">
              {(["pending", "resolved"] as QueueTab[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  aria-pressed={queueTab === tab}
                  onClick={() => switchQueueTab(tab)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                    queueTab === tab ? "bg-white text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "pending" ? "Open" : "Closed"}
                </button>
              ))}
            </div>
          </div>

          {queue.length === 0 && !loadingQueue && (
            <p className="mt-6 text-sm text-muted-foreground">
              {queueTab === "pending" ? "No open reports. Nice." : "No closed reports yet."}
            </p>
          )}

          <ul className="mt-4 space-y-4">
            {queue.map((post) => {
              const busy = busyPostId === post.content_id;
              const reasonId = `remove-reason-${post.content_id}`;
              return (
                <li key={post.content_id} className="rounded-xl border border-border p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm font-bold text-foreground">
                        {post.post_title || "Untitled post"}
                      </h3>
                      <p className="text-xs text-muted-foreground">
                        by {post.post_author_name || "Unknown"} · {post.post_visibility || "public"} ·
                        posted {formatDate(post.post_created_at)}
                      </p>
                    </div>
                    <span className="rounded-full bg-red-50 px-2.5 py-1 text-xs font-bold text-red-700">
                      {Number(post.report_count)} report{Number(post.report_count) === 1 ? "" : "s"}
                    </span>
                  </div>

                  {post.post_excerpt && (
                    <p className="mt-2 line-clamp-3 text-sm text-foreground/80">{post.post_excerpt}</p>
                  )}

                  <p className="mt-2 text-xs text-foreground">
                    <span className="font-semibold">Reasons:</span> {(post.reasons || []).join(", ") || "—"}
                  </p>
                  {(post.details || []).length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-xs text-muted-foreground">
                      {(post.details || []).slice(0, 5).map((detail, index) => (
                        <li key={index}>{detail}</li>
                      ))}
                    </ul>
                  )}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Last report {formatDate(post.last_reported_at)}
                    {post.resolved_at ? ` · closed ${formatDate(post.resolved_at)}` : ""}
                    {post.resolution_note ? ` · ${post.resolution_note}` : ""}
                  </p>

                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Link
                      href={`/feed?post=${post.content_id}`}
                      className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted"
                    >
                      Open post
                    </Link>
                  </div>

                  {queueTab === "pending" && (
                    <div className="mt-3 space-y-2">
                      <label htmlFor={reasonId} className="block text-xs font-semibold text-foreground">
                        Reason or note (the author sees the reason if the post is removed)
                      </label>
                      <textarea
                        id={reasonId}
                        rows={2}
                        maxLength={500}
                        value={reasons[post.content_id] || ""}
                        onChange={(event) =>
                          setReasons((current) => ({ ...current, [post.content_id]: event.target.value }))
                        }
                        className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none"
                      />
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleDismiss(post)}
                          className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
                        >
                          Dismiss reports
                        </button>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => handleRemove(post)}
                          className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                        >
                          Remove post
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          {queueHasMore && (
            <button
              type="button"
              disabled={loadingQueue}
              onClick={() => loadQueue(queueTab, queue.length)}
              className="mt-4 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loadingQueue ? "Loading…" : "Load more"}
            </button>
          )}
        </section>

        <section aria-labelledby="admin-audit" className="rounded-2xl border border-border bg-card p-5">
          <h2 id="admin-audit" className="text-lg font-bold text-foreground">Audit log</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Admin actions, account deletions and data downloads, ORCID verifications, paper-access
            decisions and workspace membership changes.
          </p>

          {audit.length === 0 && !loadingAudit ? (
            <p className="mt-4 text-sm text-muted-foreground">Nothing recorded yet.</p>
          ) : (
            <ul className="mt-4 divide-y divide-border">
              {audit.map((entry) => (
                <li key={entry.id} className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2 text-sm">
                  <span className="w-40 flex-shrink-0 text-xs text-muted-foreground">{formatDate(entry.occurred_at)}</span>
                  <span className="font-semibold text-foreground">{ACTION_LABELS[entry.action] || entry.action}</span>
                  <span className="text-xs text-muted-foreground">
                    {entry.actor_name ? `by ${entry.actor_name}` : entry.actor_id ? "by a deleted account" : "by the system"}
                  </span>
                  {describeDetails(entry) && (
                    <span className="w-full text-xs text-foreground/80 sm:w-auto">{describeDetails(entry)}</span>
                  )}
                </li>
              ))}
            </ul>
          )}

          {auditHasMore && (
            <button
              type="button"
              disabled={loadingAudit}
              onClick={() => loadAudit(audit[audit.length - 1]?.id ?? null)}
              className="mt-4 rounded-xl border border-border px-4 py-2 text-xs font-semibold text-foreground hover:bg-muted disabled:opacity-50"
            >
              {loadingAudit ? "Loading…" : "Load older entries"}
            </button>
          )}
        </section>
      </div>
    </main>
  );
}
