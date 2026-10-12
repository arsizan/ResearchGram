"use client";


import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/AppNav";
import {
  Search, Send, MessageSquare, ChevronLeft, MoreHorizontal,
  Video, ExternalLink, Plus, X, Mic, FileText, Building2,
  Users, Hash, ChevronDown,
} from "lucide-react";

// ─── Types (preserved verbatim) ──────────────────────────────────────────────

export type ConversationDivision =
  | "direct"
  | "collaboration"
  | "workspace_group";

export type ProfileLite = {
  id: string;
  full_name: string | null;
  email: string | null;
  department: string | null;
  profile_pic_url: string | null;
};

export type ConversationMemberView = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  last_read_at: string | null;
  muted: boolean | null;
  joined_at: string | null;
  profile: ProfileLite | null;
};

export type MessageRow = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string | null;
  read_at: string | null;
  is_deleted: boolean | null;
  created_at: string | null;
};

export type ConversationView = {
  id: string;
  participant_one_id: string | null;
  participant_two_id: string | null;
  conversation_type: ConversationDivision;
  title: string | null;
  content_id: string | null;
  request_id: string | null;
  workspace_id: string | null;
  created_by: string | null;
  last_message_at: string | null;
  created_at: string | null;
  display_title: string;
  members: ConversationMemberView[];
  workspace: {
    id: string;
    title: string | null;
    workspace_type: string | null;
  } | null;
  content: {
    id: string;
    title: string | null;
  } | null;
  last_message: MessageRow | null;
  unread_count: number;
};

export type TypingUser = {
  user_id: string;
  name: string;
};

type MessagesUIProps = {
  loading: boolean;
  userId: string;

  activeDivision: ConversationDivision;
  setActiveDivision: (division: ConversationDivision) => void;

  conversations: ConversationView[];
  filteredConversations: ConversationView[];
  selectedConversationId: string;
  selectedConversation: ConversationView | null;

  messages: MessageRow[];
  messageText: string;
  sending: boolean;

  connectedProfiles: ProfileLite[];
  selectedDirectUserId: string;
  creatingDirect: boolean;

  typingUsers: TypingUser[];

  setSelectedDirectUserId: (value: string) => void;
  handleCreateDirectChat: () => void;
  handleSelectConversation: (conversationId: string) => void;
  handleChangeMessageText: (value: string) => void;
  handleSendMessage: () => void;
  handleOpenWorkspace: (workspaceId: string) => void;
  handleOpenPost: (contentId: string) => void;

  // "Show more conversations" and "Load older messages" (audit RG-17).
  hasMoreConversations?: boolean;
  handleShowMoreConversations?: () => void;
  hasOlderMessages?: boolean;
  loadingOlderMessages?: boolean;
  handleLoadOlderMessages?: () => void;
};

// ─── Constants (preserved verbatim) ──────────────────────────────────────────

const DIVISIONS: {
  label: string;
  value: ConversationDivision;
  description: string;
}[] = [
  { label: "Direct", value: "direct", description: "Personal chat with connected researchers" },
  { label: "Collaborations", value: "collaboration", description: "Research-request based collaboration chats" },
  { label: "Workspaces", value: "workspace_group", description: "Group chats for shared workspace members" },
];

// ─── Helpers (preserved + extended) ──────────────────────────────────────────

function formatTime(dateString: string | null) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const now = new Date();
    const sameDay = date.toDateString() === now.toDateString();
    if (sameDay) {
      return new Intl.DateTimeFormat(undefined, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: true,
      }).format(date);
    }
    return new Intl.DateTimeFormat(undefined, {
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return "";
  }
}

function formatListTime(dateString: string | null) {
  if (!dateString) return "";
  try {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const m = Math.floor(diffMs / 60000);
    const h = Math.floor(m / 60);
    const d = Math.floor(h / 24);
    if (m < 1) return "now";
    if (m < 60) return `${m}m`;
    if (h < 24) return `${h}h`;
    if (d < 7) return `${d}d`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  } catch {
    return "";
  }
}

function dateSeparatorLabel(d: Date) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const startOfTarget = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const dayDiff = Math.round((startOfToday - startOfTarget) / (24 * 3600 * 1000));
  if (dayDiff === 0) return "Today";
  if (dayDiff === 1) return "Yesterday";
  if (dayDiff < 7) return new Intl.DateTimeFormat(undefined, { weekday: "long" }).format(d);
  return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric", year: "numeric" }).format(d);
}

function getMemberName(member: ConversationMemberView | undefined | null) {
  return (
    member?.profile?.full_name ||
    member?.profile?.email?.split("@")[0] ||
    "Researcher"
  );
}

function getSenderName(
  senderId: string,
  members: ConversationMemberView[],
  currentUserId: string,
) {
  if (senderId === currentUserId) return "You";
  const member = members.find((item) => item.user_id === senderId);
  return getMemberName(member);
}

function getAvatarInitial(title: string) {
  return (title || "?").charAt(0).toUpperCase();
}

function getInitials(name: string) {
  const parts = (name || "").trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "?";
}

function colorFromString(s: string) {
  const palette = ["#4f46e5", "#7c3aed", "#0891b2", "#059669", "#dc2626", "#d97706"];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function typeLabel(type: ConversationDivision) {
  if (type === "direct") return "Direct";
  if (type === "collaboration") return "Collaboration";
  return "Workspace";
}

function typeChipStyle(type: ConversationDivision) {
  if (type === "direct") return "bg-blue-50 text-blue-700 border border-blue-100";
  if (type === "collaboration") return "bg-violet-50 text-violet-700 border border-violet-100";
  return "bg-emerald-50 text-emerald-700 border border-emerald-100";
}

function lastMessagePreview(conversation: ConversationView) {
  const body = conversation.last_message?.body?.trim();
  if (!body) {
    if (conversation.conversation_type === "workspace_group") {
      return "Workspace group chat is ready.";
    }
    if (conversation.conversation_type === "collaboration") {
      return "Collaboration chat is ready.";
    }
    return "No messages yet.";
  }
  return body;
}

function getOtherMember(conversation: ConversationView | null, currentUserId: string): ConversationMemberView | null {
  if (!conversation) return null;
  return conversation.members.find((m) => m.user_id !== currentUserId) ?? null;
}

// ─── Avatar primitive ────────────────────────────────────────────────────────

function Avatar({
  name, picUrl, size = "md", online,
}: {
  name: string;
  picUrl?: string | null;
  size?: "sm" | "md" | "lg";
  online?: boolean;
}) {
  const s = { sm: "w-9 h-9 text-xs", md: "w-11 h-11 text-sm", lg: "w-12 h-12 text-base" }[size];
  const color = colorFromString(name || "?");
  const initials = getInitials(name);
  return (
    <div className="relative flex-shrink-0">
      <div
        className={`${s} rounded-full flex items-center justify-center text-white font-bold overflow-hidden`}
        style={{ backgroundColor: color }}
      >
        {picUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={picUrl} alt={name} className="w-full h-full object-cover" />
        ) : (
          initials
        )}
      </div>
      {typeof online === "boolean" && (
        <span
          className={`absolute bottom-0 right-0 w-2.5 h-2.5 rounded-full border-2 border-white ${
            online ? "bg-emerald-500" : "bg-slate-300"
          }`}
        />
      )}
    </div>
  );
}

// ─── Group icon tile (collab/workspace conversations) ───────────────────────

function GroupTile({
  initial, type, count,
}: { initial: string; type: ConversationDivision; count?: number }) {
  const color = type === "collaboration" ? "#7c3aed" : type === "workspace_group" ? "#0891b2" : "#4f46e5";
  return (
    <div className="relative flex-shrink-0">
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-bold text-sm"
        style={{ backgroundColor: color }}
      >
        {initial}
      </div>
      {count !== undefined && (
        <span className="absolute -bottom-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-card border border-border flex items-center justify-center">
          <span className="text-[8px] font-bold text-muted-foreground">{count}</span>
        </span>
      )}
    </div>
  );
}

// ─── Main UI ─────────────────────────────────────────────────────────────────

export default function MessagesUI({
  loading,
  userId,
  activeDivision,
  setActiveDivision,
  conversations,
  filteredConversations,
  selectedConversationId,
  selectedConversation,
  messages,
  messageText,
  sending,
  connectedProfiles,
  selectedDirectUserId,
  creatingDirect,
  typingUsers,
  setSelectedDirectUserId,
  handleCreateDirectChat,
  handleSelectConversation,
  handleChangeMessageText,
  handleSendMessage,
  handleOpenWorkspace,
  handleOpenPost,
  hasMoreConversations = false,
  handleShowMoreConversations,
  hasOlderMessages = false,
  loadingOlderMessages = false,
  handleLoadOlderMessages,
}: MessagesUIProps) {
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  // ── Unread counts per division ──────────────────────────────────────────
  const divisionUnread = useMemo(() => {
    const map: Record<ConversationDivision, number> = {
      direct: 0, collaboration: 0, workspace_group: 0,
    };
    conversations.forEach((c) => {
      map[c.conversation_type] += c.unread_count;
    });
    return map;
  }, [conversations]);

  // ── Filtered + search applied ───────────────────────────────────────────
  // A search looks through every chat in this division, not only the ones
  // shown so far.
  const visibleConversations = useMemo(() => {
    if (!search.trim()) return filteredConversations;
    const q = search.toLowerCase();
    return conversations.filter((c) => {
      if (c.conversation_type !== activeDivision) return false;
      const title = (c.display_title || "").toLowerCase();
      const lastBody = (c.last_message?.body || "").toLowerCase();
      const memberMatch = c.members.some((m) =>
        (m.profile?.full_name || m.profile?.email || "").toLowerCase().includes(q)
      );
      return title.includes(q) || lastBody.includes(q) || memberMatch;
    });
  }, [conversations, filteredConversations, activeDivision, search]);

  // ── Auto-scroll on new messages / conversation change ───────────────────
  // A new message, another chat or a reload scrolls to the newest message, as
  // before. Two exceptions (audit RG-17):
  //  - "Load older messages" adds messages at the top: keep the same distance
  //    from the bottom, so what you were reading stays where it was.
  //  - Someone typing only scrolls down if you are already near the bottom, so
  //    reading older messages is not interrupted.
  const chatPanelOpen = Boolean(selectedConversation);
  const firstMessageId = messages[0]?.id || "";
  const lastMessageId = messages[messages.length - 1]?.id || "";
  const scrollMemoryRef = useRef({
    conversationId: "",
    chatPanelOpen: false,
    firstId: "",
    lastId: "",
    count: 0,
    distanceFromBottom: 0,
  });
  const scrollFrameRef = useRef(0);

  const rememberScrollPosition = () => {
    const el = messagesScrollRef.current;
    if (el) {
      scrollMemoryRef.current.distanceFromBottom = el.scrollHeight - el.scrollTop;
    }
  };

  useLayoutEffect(() => {
    const el = messagesScrollRef.current;
    const memory = scrollMemoryRef.current;

    const sameChat =
      memory.conversationId === selectedConversationId &&
      memory.chatPanelOpen === chatPanelOpen;
    const olderMessagesAdded =
      sameChat &&
      memory.lastId === lastMessageId &&
      memory.firstId !== firstMessageId &&
      messages.length > memory.count;
    const onlyTypingChanged =
      sameChat &&
      memory.lastId === lastMessageId &&
      memory.firstId === firstMessageId &&
      messages.length === memory.count;

    memory.conversationId = selectedConversationId;
    memory.chatPanelOpen = chatPanelOpen;
    memory.firstId = firstMessageId;
    memory.lastId = lastMessageId;
    memory.count = messages.length;

    if (!el) return;

    if (olderMessagesAdded && memory.distanceFromBottom > 0) {
      cancelAnimationFrame(scrollFrameRef.current);
      el.scrollTop = el.scrollHeight - memory.distanceFromBottom;
      return;
    }

    if (
      onlyTypingChanged &&
      memory.distanceFromBottom - el.clientHeight > 150
    ) {
      return;
    }

    // Scroll to bottom (most recent message)
    cancelAnimationFrame(scrollFrameRef.current);
    scrollFrameRef.current = requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
    });
  }, [
    selectedConversationId,
    chatPanelOpen,
    firstMessageId,
    lastMessageId,
    messages.length,
    typingUsers.length,
  ]);

  // ── Reflect selection on mobile ─────────────────────────────────────────
  useEffect(() => {
    if (selectedConversationId) setMobileChatOpen(true);
  }, [selectedConversationId]);

// ── Build date-grouped message stream ───────────────────────────────────
type StreamItem =
  | { kind: "separator"; key: string; label: string }
  | { kind: "msg"; key: string; msg: MessageRow };

const messageStream: StreamItem[] = useMemo(() => {
  if (!selectedConversation) return [];

  const out: StreamItem[] = [];
  let lastDay = "";

  for (const message of messages) {
    const timestamp = message.created_at ? new Date(message.created_at) : null;

    if (timestamp) {
      const dayKey = `${timestamp.getFullYear()}-${timestamp.getMonth()}-${timestamp.getDate()}`;

      if (dayKey !== lastDay) {
        out.push({
          kind: "separator",
          key: `sep-${dayKey}`,
          label: dateSeparatorLabel(timestamp),
        });

        lastDay = dayKey;
      }
    }

    out.push({
      kind: "msg",
      key: message.id,
      msg: message,
    });
  }

  return out;
}, [messages, selectedConversation]);








  // ── Loading state ───────────────────────────────────────────────────────
 if (loading) {
  return <ResearchGramSkeleton activePage="messages" variant="messages" />;
}

  // ── Derived display data for selected chat header ───────────────────────
  const other = getOtherMember(selectedConversation, userId);
  const isDirect = selectedConversation?.conversation_type === "direct";
  const isCollab = selectedConversation?.conversation_type === "collaboration";
  const isWorkspace = selectedConversation?.conversation_type === "workspace_group";

  const headerTitle = (() => {
    if (!selectedConversation) return "";
    if (isDirect) return getMemberName(other);
    return selectedConversation.display_title || "Conversation";
  })();

  const headerSubtitle = (() => {
    if (!selectedConversation) return "";
    if (isDirect) {
      return other?.profile?.department || other?.profile?.email || "Direct chat";
    }
    if (isCollab) {
      return selectedConversation.content?.title
        ? `Research: ${selectedConversation.content.title}`
        : `${selectedConversation.members.length} collaborators`;
    }
    return `${selectedConversation.members.length} workspace member${selectedConversation.members.length === 1 ? "" : "s"}`;
  })();

  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="messages" />

      <div className="max-w-[1440px] mx-auto" style={{ height: "calc(100vh - 60px)" }}>
        <div className="flex h-full overflow-hidden">

          {/* ─────────────────── LEFT: conversation list ────────────────── */}
          <div
            className={`${
              mobileChatOpen ? "hidden lg:flex" : "flex"
            } flex-col w-full lg:w-[340px] border-r border-border bg-card flex-shrink-0`}
          >
            {/* Header */}
            <div className="px-4 pt-4 pb-3 border-b border-border flex-shrink-0">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-base font-extrabold text-foreground">Messages</h2>
                {activeDivision === "direct" && connectedProfiles.length > 0 && (
                  <button
                    onClick={() => setShowNewChat((c) => !c)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
                      showNewChat
                        ? "bg-accent text-primary"
                        : "bg-primary text-white hover:bg-primary/90"
                    }`}
                  >
                    {showNewChat ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                    {showNewChat ? "Close" : "New Chat"}
                  </button>
                )}
              </div>

              {/* Division tabs */}
              <div className="flex gap-1 bg-muted rounded-xl p-1 mb-3">
                {DIVISIONS.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setActiveDivision(d.value)}
                    className={`relative flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap ${
                      activeDivision === d.value
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d.label === "Collaborations" ? "Collab" : d.label === "Workspaces" ? "Workspaces" : "Direct"}
                    {divisionUnread[d.value] > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[9px] font-bold align-middle">
                        {divisionUnread[d.value] > 99 ? "99+" : divisionUnread[d.value]}
                      </span>
                    )}
                  </button>
                ))}
              </div>

              {/* Search */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={`Search ${typeLabel(activeDivision).toLowerCase()} conversations…`}
                  className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-xl border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all"
                />
              </div>

              {/* New direct chat panel */}
              {activeDivision === "direct" && showNewChat && (
                <div className="mt-3 p-3 bg-accent/60 rounded-xl border border-primary/15 space-y-2">
                  <p className="text-[11px] font-bold text-primary uppercase tracking-widest">
                    Start a direct chat
                  </p>
                  <div className="relative">
                    <select
                      value={selectedDirectUserId}
                      onChange={(e) => setSelectedDirectUserId(e.target.value)}
                      className="w-full appearance-none pl-3 pr-8 py-2 text-sm bg-white rounded-lg border border-border focus:border-primary focus:outline-none cursor-pointer"
                    >
                      <option value="">— Select researcher —</option>
                      {connectedProfiles.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.full_name || p.email || "ResearchGram user"}
                          {p.department ? ` · ${p.department}` : ""}
                        </option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                  </div>
                  <button
                    onClick={() => {
                      handleCreateDirectChat();
                      setShowNewChat(false);
                    }}
                    disabled={!selectedDirectUserId || creatingDirect}
                    className="w-full py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center justify-center gap-1.5"
                  >
                    {creatingDirect && (
                      <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                    )}
                    {creatingDirect ? "Opening…" : "Open Direct Chat"}
                  </button>
                </div>
              )}

              {activeDivision === "direct" && showNewChat && connectedProfiles.length === 0 && (
                <p className="mt-3 text-xs text-amber-700 bg-amber-50 border border-amber-100 rounded-lg p-2.5">
                  No connected researchers yet. Build your network from the Researchers page first.
                </p>
              )}
            </div>

            {/* Conversation list */}
            <div className="flex-1 overflow-y-auto py-1 [&::-webkit-scrollbar]:hidden">
              {visibleConversations.length === 0 ? (
                <div className="px-6 py-16 text-center">
                  <MessageSquare className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                  <p className="text-sm font-semibold text-foreground">
                    {search ? "No conversations match your search" : `No ${typeLabel(activeDivision).toLowerCase()} chats yet`}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {activeDivision === "direct"
                      ? "Start a new chat with a connected researcher."
                      : activeDivision === "collaboration"
                        ? "Accepted collaboration requests will appear here."
                        : "Shared workspaces will appear here automatically."}
                  </p>
                </div>
              ) : (
                <>
                {visibleConversations.map((conv) => {
                  const isActive = conv.id === selectedConversationId;
                  const isDirectConv = conv.conversation_type === "direct";
                  const otherMember = getOtherMember(conv, userId);
                  const titleForList = isDirectConv ? getMemberName(otherMember) : conv.display_title;
                  return (
                    <button
                      key={conv.id}
                      onClick={() => handleSelectConversation(conv.id)}
                      className={`w-full flex items-start gap-3 px-4 py-3 text-left transition-colors border-l-2 ${
                        isActive
                          ? "bg-accent border-primary"
                          : "border-transparent hover:bg-muted/60"
                      }`}
                    >
                      {isDirectConv ? (
                        <Avatar
                          name={titleForList}
                          picUrl={otherMember?.profile?.profile_pic_url}
                          size="md"
                        />
                      ) : (
                        <GroupTile
                          initial={getAvatarInitial(conv.display_title)}
                          type={conv.conversation_type}
                          count={conv.members.length}
                        />
                      )}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2">
                          <p className={`text-sm truncate ${conv.unread_count > 0 ? "font-extrabold text-foreground" : "font-semibold text-foreground"}`}>
                            {titleForList}
                          </p>
                          <span className="text-[10px] text-muted-foreground flex-shrink-0">
                            {formatListTime(conv.last_message_at)}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 mt-0.5">
                          <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${typeChipStyle(conv.conversation_type)}`}>
                            {typeLabel(conv.conversation_type)}
                          </span>
                        </div>

                        <p className={`text-xs truncate mt-1 ${conv.unread_count > 0 ? "text-foreground font-medium" : "text-muted-foreground"}`}>
                          {lastMessagePreview(conv)}
                        </p>
                      </div>

                      {conv.unread_count > 0 && (
                        <span className="flex-shrink-0 mt-1 min-w-[20px] h-5 px-1.5 rounded-full bg-primary text-white text-[10px] font-bold flex items-center justify-center">
                          {conv.unread_count > 99 ? "99+" : conv.unread_count}
                        </span>
                      )}
                    </button>
                  );
                })}
                {hasMoreConversations && !search.trim() && handleShowMoreConversations && (
                  <button
                    type="button"
                    onClick={handleShowMoreConversations}
                    className="w-full px-4 py-3 text-xs font-semibold text-primary hover:bg-muted/60 transition-colors"
                  >
                    Show more conversations
                  </button>
                )}
                </>
              )}
            </div>
          </div>

          {/* ─────────────────── RIGHT: chat panel ──────────────────────── */}
          <div className={`${mobileChatOpen ? "flex" : "hidden lg:flex"} flex-1 flex-col min-w-0 bg-background`}>
            {!selectedConversation ? (
              /* Empty state */
              <div className="flex-1 flex items-center justify-center p-10">
                <div className="text-center max-w-sm">
                  <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-accent flex items-center justify-center">
                    <MessageSquare className="w-10 h-10 text-primary" />
                  </div>
                  <h2 className="text-xl font-extrabold text-foreground">Select a conversation</h2>
                  <p className="text-sm text-muted-foreground mt-2 leading-relaxed">
                    Choose a direct chat, collaboration, or workspace conversation from the left panel to start messaging.
                  </p>
                </div>
              </div>
            ) : (
              <>
                {/* Chat header */}
                <div className="flex items-center gap-3 px-4 py-3 bg-card border-b border-border flex-shrink-0">
                  {/* Mobile back */}
                  <button
                    onClick={() => setMobileChatOpen(false)}
                    className="lg:hidden p-1.5 rounded-xl hover:bg-muted transition-colors mr-1 text-muted-foreground"
                  >
                    <ChevronLeft className="w-5 h-5" />
                  </button>

                  {isDirect ? (
                    <Avatar
                      name={headerTitle}
                      picUrl={other?.profile?.profile_pic_url}
                      size="md"
                    />
                  ) : (
                    <GroupTile
                      initial={getAvatarInitial(headerTitle)}
                      type={selectedConversation.conversation_type}
                      count={selectedConversation.members.length}
                    />
                  )}

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-bold text-foreground truncate">{headerTitle}</p>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${typeChipStyle(selectedConversation.conversation_type)}`}>
                        {typeLabel(selectedConversation.conversation_type)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground truncate">{headerSubtitle}</p>
                  </div>

                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    {selectedConversation.content_id && (
                      <button
                        onClick={() => handleOpenPost(selectedConversation.content_id!)}
                        className="text-xs font-semibold px-3 py-2 rounded-xl bg-violet-50 text-violet-700 border border-violet-100 hover:bg-violet-100 transition-colors whitespace-nowrap flex items-center gap-1.5"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Open Post</span>
                      </button>
                    )}
                    {selectedConversation.workspace_id && (
                      <button
                        onClick={() => handleOpenWorkspace(selectedConversation.workspace_id!)}
                        className="text-xs font-semibold px-3 py-2 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100 hover:bg-emerald-100 transition-colors whitespace-nowrap flex items-center gap-1.5"
                      >
                        <Building2 className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Open Workspace</span>
                      </button>
                    )}
                    <button className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground hidden sm:block">
                      <MoreHorizontal className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Messages area */}
                <div
                  ref={messagesScrollRef}
                  onScroll={rememberScrollPosition}
                  className="flex-1 overflow-y-auto p-4 space-y-4 [&::-webkit-scrollbar]:hidden"
                >
                  {hasOlderMessages && messageStream.length > 0 && handleLoadOlderMessages && (
                    <div className="flex justify-center">
                      <button
                        type="button"
                        onClick={() => {
                          rememberScrollPosition();
                          handleLoadOlderMessages();
                        }}
                        disabled={loadingOlderMessages}
                        className="text-xs font-semibold px-3 py-1.5 rounded-full border border-border bg-card text-muted-foreground hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                      >
                        {loadingOlderMessages ? "Loading…" : "Load older messages"}
                      </button>
                    </div>
                  )}
                  {messageStream.length === 0 ? (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-center">
                        <Hash className="w-10 h-10 mx-auto mb-3 text-muted-foreground/30" />
                        <p className="text-sm font-semibold text-foreground">No messages yet</p>
                        <p className="text-xs text-muted-foreground mt-1">Start the conversation below.</p>
                      </div>
                    </div>
                  ) : (
                    messageStream.map((item) => {
                      if (item.kind === "separator") {
                        return (
                          <div key={item.key} className="flex items-center gap-3">
                            <div className="flex-1 h-px bg-border" />
                            <span className="text-[11px] text-muted-foreground font-semibold px-3">
                              {item.label}
                            </span>
                            <div className="flex-1 h-px bg-border" />
                          </div>
                        );
                      }

                      const msg = item.msg;
                      const mine = msg.sender_id === userId;
                      const senderMember = selectedConversation.members.find(
                        (m) => m.user_id === msg.sender_id
                      );
                      const senderName = getSenderName(
                        msg.sender_id,
                        selectedConversation.members,
                        userId
                      );

                      return (
                        <div
                          key={item.key}
                          className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : "flex-row"}`}
                        >
                          {!mine && (
                            <Avatar
                              name={senderName}
                              picUrl={senderMember?.profile?.profile_pic_url}
                              size="sm"
                            />
                          )}

                          <div className={`max-w-[75%] flex flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                            {!mine && !isDirect && (
                              <p className="text-[11px] text-muted-foreground font-semibold px-1">
                                {senderName}
                              </p>
                            )}
                            <div
                              className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed shadow-sm break-words ${
                                mine
                                  ? "bg-primary text-white rounded-br-sm"
                                  : "bg-card border border-border text-foreground rounded-bl-sm"
                              }`}
                            >
                              <p className="whitespace-pre-wrap">{msg.body}</p>
                            </div>
                            <p className="text-[10px] text-muted-foreground px-1">
                              {formatTime(msg.created_at)}
                            </p>
                          </div>
                        </div>
                      );
                    })
                  )}

                  {/* Typing indicator */}
                  {typingUsers.length > 0 && (
                    <div className="flex items-end gap-2.5">
                      <Avatar name={typingUsers[0].name} size="sm" />
                      <div className="flex flex-col gap-1 items-start">
                        {!isDirect && (
                          <p className="text-[11px] text-muted-foreground font-semibold px-1">
                            {typingUsers.map((u) => u.name).join(", ")}
                          </p>
                        )}
                        <div className="bg-card border border-border rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-1 shadow-sm">
                          {[0, 1, 2].map((i) => (
                            <span
                              key={i}
                              className="w-2 h-2 rounded-full bg-muted-foreground/50 animate-bounce"
                              style={{ animationDelay: `${i * 0.15}s` }}
                            />
                          ))}
                        </div>
                      </div>
                    </div>
                  )}

                  <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="px-4 py-3 bg-card border-t border-border flex-shrink-0">
                  <div className="flex items-end gap-2">
                    <button
                      type="button"
                      className="p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground flex-shrink-0"
                      aria-label="Add attachment"
                    >
                      <Plus className="w-4 h-4" />
                    </button>

                    <div className="flex-1 relative">
                      <textarea
                        value={messageText}
                        onChange={(e) => handleChangeMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (messageText.trim() && !sending) handleSendMessage();
                          }
                        }}
                        placeholder="Write a message…"
                        rows={1}
                        className="w-full max-h-32 resize-none px-4 py-2.5 text-sm bg-muted rounded-2xl border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all pr-10 leading-relaxed"
                        style={{ minHeight: "44px" }}
                      />
                      <button
                        type="button"
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors"
                        aria-label="Voice message"
                      >
                        <Mic className="w-4 h-4" />
                      </button>
                    </div>

                    <button
                      onClick={handleSendMessage}
                      disabled={sending || !messageText.trim()}
                      className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0"
                      aria-label="Send message"
                    >
                      {sending ? (
                        <div className="w-3.5 h-3.5 rounded-full border-2 border-white/30 border-t-white animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5 px-2 hidden sm:block">
                    Enter to send · Shift+Enter for new line
                  </p>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}