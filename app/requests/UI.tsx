"use client";

import { useState } from "react";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import { useRouter } from "next/navigation";
import {
  GitBranch,
  UserPlus,
  Lock,
  Check,
  X,
  MessageSquare,
  ExternalLink,
  Clock,
  type LucideIcon,
} from "lucide-react";
import AppNav from "@/components/AppNav";

export type Profile = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  profile_pic_url: string | null;
};

export type ContentPost = {
  id: string;
  user_id: string | null;
  title: string | null;
  abstract: string | null;
  post_type: string | null;
  content_category: string | null;
  visibility_mode: string | null;
  full_paper_access_mode: string | null;
  allow_full_paper_request: boolean | null;
  created_at: string | null;
};

export type RequestKind = "research" | "profile" | "paper_access";
export type RequestDirection = "received" | "sent";

export type RequestStatus =
  | "pending"
  | "accepted"
  | "declined"
  | "approved"
  | "rejected";

export type UnifiedRequestView = {
  id: string;
  kind: RequestKind;
  direction: RequestDirection;
  request_type: string;
  status: RequestStatus;
  message: string | null;
  created_at: string | null;
  updated_at: string | null;

  requester_id: string | null;
  receiver_id: string | null;
  owner_id: string | null;
  content_id: string | null;

  otherProfile: Profile | null;
  requesterProfile: Profile | null;
  receiverProfile: Profile | null;
  contentPost: ContentPost | null;
};

type RequestsUIProps = {
  loading: boolean;
  userId: string;
  activeTab: "received" | "sent";
  receivedRequests: UnifiedRequestView[];
  sentRequests: UnifiedRequestView[];
  updatingId: string | null;
  openingConversationId: string | null;

  setActiveTab: (tab: "received" | "sent") => void;
  handleUpdateStatus: (
    request: UnifiedRequestView,
    nextStatus: RequestStatus,
  ) => void;
  handleOpenMessages: (request: UnifiedRequestView) => void;
  handleGoToFeed: () => void;
  handleGoToProfile: (profileId: string) => void;
  getProfileName: (profile: Profile | null | undefined) => string;
};

type FilterChip =
  | "all"
  | "pending"
  | "accepted"
  | "research"
  | "profile"
  | "paper_access";

function formatTime(dateString: string | null) {
  if (!dateString) return "";

  try {
    const date = new Date(dateString);
    const now = new Date();

    const diffMs = now.getTime() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;

    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function getInitials(name: string) {
  return (name || "R").charAt(0).toUpperCase();
}

function Avatar({
  name,
  url,
}: {
  name: string;
  url?: string | null;
}) {
  const colors = [
    "#4f46e5",
    "#dc2626",
    "#7c3aed",
    "#0e7490",
    "#047857",
    "#b45309",
  ];

  const safeName = name || "Researcher";
  const color = colors[safeName.charCodeAt(0) % colors.length];

  if (url) {
    return (
      // Avatar from Supabase Storage: a plain <img> so it does not use
      // Vercel's image-optimization quota.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={safeName}
        loading="lazy"
        decoding="async"
        className="h-12 w-12 flex-shrink-0 rounded-full object-cover"
      />
    );
  }

  return (
    <div
      className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full text-base font-bold text-white"
      style={{ backgroundColor: color }}
    >
      {getInitials(safeName)}
    </div>
  );
}

function statusStyle(status: RequestStatus) {
  if (status === "pending") {
    return "border border-amber-200 bg-amber-50 text-amber-700";
  }

  if (status === "accepted" || status === "approved") {
    return "border border-emerald-200 bg-emerald-50 text-emerald-700";
  }

  return "border border-red-200 bg-red-50 text-red-700";
}

function kindMeta(request: UnifiedRequestView): {
  icon: LucideIcon;
  label: string;
  color: string;
} {
  if (request.kind === "paper_access") {
    return {
      icon: Lock,
      label: "PAPER ACCESS",
      color: "text-amber-600",
    };
  }

  if (request.kind === "research") {
    return {
      icon: GitBranch,
      label: "COLLABORATION",
      color: "text-indigo-600",
    };
  }

  if (request.request_type === "mentorship") {
    return {
      icon: UserPlus,
      label: "MENTORSHIP",
      color: "text-emerald-600",
    };
  }

  return {
    icon: UserPlus,
    label: "CONNECTION",
    color: "text-blue-600",
  };
}

function requestTitle(request: UnifiedRequestView) {
  if (request.kind === "paper_access") {
    return request.contentPost?.title
      ? `Paper Access: ${request.contentPost.title}`
      : "Full Paper Access Request";
  }

  if (request.kind === "research") {
    return request.contentPost?.title || "Research Collaboration";
  }

  if (request.request_type === "mentorship") {
    return "Mentorship Request";
  }

  return "Research Connection Request";
}

function requestBody(
  request: UnifiedRequestView,
  otherName: string,
  activeTab: "received" | "sent",
) {
  if (request.message) return request.message;

  if (request.kind === "paper_access") {
    return activeTab === "received"
      ? `${otherName} requested full paper access.`
      : `You requested full paper access from ${otherName}.`;
  }

  if (request.kind === "research") {
    return activeTab === "received"
      ? `${otherName} wants to collaborate on your research post.`
      : `You sent a collaboration request to ${otherName}.`;
  }

  if (request.request_type === "mentorship") {
    return activeTab === "received"
      ? `${otherName} requested mentorship from you.`
      : `You requested mentorship from ${otherName}.`;
  }

  return activeTab === "received"
    ? `${otherName} wants to connect with you.`
    : `You sent a connection request to ${otherName}.`;
}

function filterRequests(request: UnifiedRequestView, filterChip: FilterChip) {
  if (filterChip === "all") return true;

  if (filterChip === "pending") {
    return request.status === "pending";
  }

  if (filterChip === "accepted") {
    return request.status === "accepted" || request.status === "approved";
  }

  return request.kind === filterChip;
}

function EmptyState({
  activeTab,
  filterChip,
  handleGoToFeed,
}: {
  activeTab: "received" | "sent";
  filterChip: FilterChip;
  handleGoToFeed: () => void;
}) {
  const label =
    filterChip === "all" ? activeTab : filterChip.replaceAll("_", " ");

  return (
    <div className="rounded-2xl border border-border bg-card py-16 text-center">
      <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-accent text-2xl">
        📩
      </div>

      <p className="text-sm font-bold capitalize text-foreground">
        No {label} requests
      </p>

      <p className="mx-auto mt-1 max-w-xs text-xs text-muted-foreground">
        {activeTab === "received"
          ? "When someone sends you a collaboration, connection, mentorship, or full paper access request, it will appear here."
          : "Requests you send to other researchers will appear here."}
      </p>

      <button
        type="button"
        onClick={handleGoToFeed}
        className="mt-4 rounded-xl bg-primary px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90"
      >
        Go to Feed
      </button>
    </div>
  );
}

function RequestCard({
  request,
  activeTab,
  updatingId,
  openingConversationId,
  handleUpdateStatus,
  handleOpenMessages,
  handleGoToFeed,
  handleGoToProfile,
  getProfileName,
}: {
  request: UnifiedRequestView;
  activeTab: "received" | "sent";
  updatingId: string | null;
  openingConversationId: string | null;
  handleUpdateStatus: (
    request: UnifiedRequestView,
    nextStatus: RequestStatus,
  ) => void;
  handleOpenMessages: (request: UnifiedRequestView) => void;
  handleGoToFeed: () => void;
  handleGoToProfile: (profileId: string) => void;
  getProfileName: (profile: Profile | null | undefined) => string;
}) {
  const router = useRouter();

  const otherProfile = request.otherProfile;
  const otherName = getProfileName(otherProfile);
  const isUpdating = updatingId === request.id;
  const isOpeningConversation = openingConversationId === request.id;

  const canRespond = activeTab === "received" && request.status === "pending";

  const isAcceptedResearch =
    request.kind === "research" && request.status === "accepted";

  const isApprovedPaperAccess =
    request.kind === "paper_access" && request.status === "approved";

  const meta = kindMeta(request);
  const Icon = meta.icon;

  const openSpecificPost = () => {
    if (request.content_id) {
      router.push(`/feed?post=${request.content_id}`);
      return;
    }

    handleGoToFeed();
  };

  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start gap-4">
        <Avatar name={otherName} url={otherProfile?.profile_pic_url} />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              <Icon className={`h-3.5 w-3.5 ${meta.color}`} />

              <span
                className={`text-[11px] font-bold tracking-wide ${meta.color}`}
              >
                {meta.label}
              </span>

              <span
                className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold capitalize ${statusStyle(
                  request.status,
                )}`}
              >
                {request.status}
              </span>
            </div>

            <span className="flex flex-shrink-0 items-center gap-1 text-xs text-muted-foreground">
              <Clock className="h-3 w-3" />
              {formatTime(request.created_at)}
            </span>
          </div>

          <h3 className="mt-2 text-[15px] font-bold text-foreground">
            {requestTitle(request)}
          </h3>

          {otherProfile?.id ? (
            <button
              type="button"
              onClick={() => handleGoToProfile(otherProfile.id)}
              className="mt-0.5 text-sm font-semibold text-primary hover:underline"
            >
              {otherName}
              {otherProfile?.department ? ` · ${otherProfile.department}` : ""}
            </button>
          ) : (
            <p className="mt-0.5 text-sm text-muted-foreground">
              {otherName}
              {otherProfile?.department ? ` · ${otherProfile.department}` : ""}
            </p>
          )}

          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {requestBody(request, otherName, activeTab)}
          </p>

          {request.contentPost && (
            <div className="mt-3 flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3.5 py-2.5">
              <GitBranch className="h-3.5 w-3.5 flex-shrink-0 text-primary" />

              <span className="truncate text-sm font-semibold text-foreground">
                {request.contentPost.title || "Untitled post"}
              </span>

              <button
                type="button"
                onClick={openSpecificPost}
                className="ml-auto whitespace-nowrap text-xs font-semibold text-primary hover:underline"
              >
                Open Post
              </button>
            </div>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {canRespond && request.kind === "paper_access" && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(request, "approved")}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isUpdating ? "Updating…" : "Approve"}
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateStatus(request, "rejected")}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </button>
              </>
            )}

            {canRespond && request.kind !== "paper_access" && (
              <>
                <button
                  type="button"
                  onClick={() => handleUpdateStatus(request, "accepted")}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary/90 disabled:opacity-50"
                >
                  <Check className="h-3.5 w-3.5" />
                  {isUpdating ? "Updating…" : "Accept"}
                </button>

                <button
                  type="button"
                  onClick={() => handleUpdateStatus(request, "declined")}
                  disabled={isUpdating}
                  className="flex items-center gap-1.5 rounded-xl bg-muted px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted/70 disabled:opacity-50"
                >
                  <X className="h-3.5 w-3.5" />
                  Decline
                </button>
              </>
            )}

            {canRespond && request.kind === "research" && (
              <button
                type="button"
                onClick={() => handleOpenMessages(request)}
                disabled={isOpeningConversation}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
              >
                <MessageSquare className="h-3.5 w-3.5" />
                {isOpeningConversation ? "Opening…" : "Message"}
              </button>
            )}

            {isAcceptedResearch && (
              <button
                type="button"
                onClick={() => handleOpenMessages(request)}
                disabled={isOpeningConversation}
                className="flex items-center gap-1.5 rounded-xl border border-primary/20 bg-accent px-4 py-2 text-sm font-semibold text-primary transition-colors hover:bg-indigo-100 disabled:opacity-50"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                {isOpeningConversation ? "Opening…" : "Open Messages"}
              </button>
            )}

            {request.contentPost && (
              <button
                type="button"
                onClick={openSpecificPost}
                className="flex items-center gap-1.5 rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                Open Post
              </button>
            )}

            {activeTab === "sent" && isApprovedPaperAccess && (
              <button
                type="button"
                onClick={openSpecificPost}
                className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700 transition hover:bg-emerald-100"
              >
                Approved — open Feed to access the full paper
              </button>
            )}

            {activeTab === "sent" && request.status === "pending" && (
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-700">
                Waiting for response
              </span>
            )}

            {activeTab === "sent" &&
              (request.status === "declined" ||
                request.status === "rejected") && (
                <span className="rounded-xl border border-red-200 bg-red-50 px-3 py-1.5 text-xs font-semibold text-red-700">
                  Request was not approved
                </span>
              )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function RequestsUI({
  loading,
  activeTab,
  receivedRequests,
  sentRequests,
  updatingId,
  openingConversationId,
  setActiveTab,
  handleUpdateStatus,
  handleOpenMessages,
  handleGoToFeed,
  handleGoToProfile,
  getProfileName,
}: RequestsUIProps) {
  const [filterChip, setFilterChip] = useState<FilterChip>("all");

  const activeRequests =
    activeTab === "received" ? receivedRequests : sentRequests;

  const filteredRequests = activeRequests.filter((request) =>
    filterRequests(request, filterChip),
  );

  const pendingCount = receivedRequests.filter(
    (request) => request.status === "pending",
  ).length;

  const chipOptions: {
    value: FilterChip;
    label: string;
    count: number;
  }[] = [
    {
      value: "all",
      label: "All",
      count: activeRequests.length,
    },
    {
      value: "pending",
      label: "Pending",
      count: activeRequests.filter((request) => request.status === "pending")
        .length,
    },
    {
      value: "accepted",
      label: "Accepted",
      count: activeRequests.filter(
        (request) =>
          request.status === "accepted" || request.status === "approved",
      ).length,
    },
    {
      value: "research",
      label: "Collaboration",
      count: activeRequests.filter((request) => request.kind === "research")
        .length,
    },
    {
      value: "profile",
      label: "Connection",
      count: activeRequests.filter((request) => request.kind === "profile")
        .length,
    },
    {
      value: "paper_access",
      label: "Paper Access",
      count: activeRequests.filter(
        (request) => request.kind === "paper_access",
      ).length,
    },
  ];

if (loading) {
  return <ResearchGramSkeleton activePage="requests" variant="requests" />;
}

  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="requests" />

      <div className="mx-auto max-w-[800px] px-4 py-6 pb-24 lg:px-6 lg:pb-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold text-foreground">
              Requests
            </h1>

            <p className="mt-1 text-sm text-muted-foreground">
              Manage collaboration, connection, and paper access requests
            </p>
          </div>

          {pendingCount > 0 && (
            <span className="mt-1 flex-shrink-0 rounded-full bg-primary px-3.5 py-1.5 text-xs font-bold text-white">
              {pendingCount} pending
            </span>
          )}
        </div>

        <div className="mb-4 inline-flex rounded-2xl border border-border bg-card p-1 shadow-sm">
          <button
            type="button"
            aria-pressed={activeTab === "received"}
            onClick={() => {
              setActiveTab("received");
              setFilterChip("all");
            }}
            className={`rounded-xl px-5 py-2 text-sm font-bold transition-all ${
              activeTab === "received"
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Received ({receivedRequests.length})
          </button>

          <button
            type="button"
            aria-pressed={activeTab === "sent"}
            onClick={() => {
              setActiveTab("sent");
              setFilterChip("all");
            }}
            className={`rounded-xl px-5 py-2 text-sm font-bold transition-all ${
              activeTab === "sent"
                ? "bg-primary text-white shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Sent ({sentRequests.length})
          </button>
        </div>

        <div className="mb-5 flex gap-2 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          {chipOptions.map((chip) => (
            <button
              key={chip.value}
              type="button"
              aria-pressed={filterChip === chip.value}
              onClick={() => setFilterChip(chip.value)}
              className={`flex-shrink-0 whitespace-nowrap rounded-full px-4 py-2 text-sm font-semibold transition-all ${
                filterChip === chip.value
                  ? "bg-primary text-white"
                  : "border border-border bg-card text-muted-foreground hover:border-primary/30 hover:text-foreground"
              }`}
            >
              {chip.label}
              <span className="ml-1 text-xs">({chip.count})</span>
            </button>
          ))}
        </div>

        <div className="space-y-3">
          {filteredRequests.length === 0 ? (
            <EmptyState
              activeTab={activeTab}
              filterChip={filterChip}
              handleGoToFeed={handleGoToFeed}
            />
          ) : (
            filteredRequests.map((request) => (
              <RequestCard
                key={`${request.kind}-${request.id}`}
                request={request}
                activeTab={activeTab}
                updatingId={updatingId}
                openingConversationId={openingConversationId}
                handleUpdateStatus={handleUpdateStatus}
                handleOpenMessages={handleOpenMessages}
                handleGoToFeed={handleGoToFeed}
                handleGoToProfile={handleGoToProfile}
                getProfileName={getProfileName}
              />
            ))
          )}
        </div>
      </div>
    </main>
  );
}