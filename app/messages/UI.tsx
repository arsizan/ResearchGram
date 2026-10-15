"use client";


import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import AppNav from "@/components/AppNav";
import {
  Search,
  Send,
  MessageSquare,
  ChevronLeft,
  MoreHorizontal,
  Plus,
  X,
  Mic,
  FileText,
  Building2,
  Hash,
  ChevronDown,
  Bell,
  BellOff,
  Paperclip,
  Square,
  UserRound,
} from "lucide-react";
import type { VoiceNote } from "./useVoiceRecorder";
import { MAX_VOICE_SECONDS } from "./useVoiceRecorder";

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
  attachment_path?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
  attachment_kind?: "file" | "image" | "voice" | null;
  attachment_duration_seconds?: number | null;
  /** Short-lived signed link to the attachment (private bucket). */
  attachment_url?: string | null;
};

/** A file chosen for the next message (voice messages come from useVoiceRecorder). */
export type PendingFile = {
  file: File;
  kind: "file" | "image";
  /** Local preview for images. */
  previewUrl: string;
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
  /** Muted by me: not counted in the unread badges. */
  muted?: boolean;
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

  // Attachments, voice messages and the "More options" menu (Phase 4).
  pendingFile?: PendingFile | null;
  voiceRecording?: boolean;
  /** Waiting for the browser's microphone permission. */
  voiceStarting?: boolean;
  voiceSeconds?: number;
  voiceNote?: VoiceNote | null;
  /** The last recording stopped at the time limit. */
  voiceLimitReached?: boolean;
  handlePickAttachment?: (file: File | null) => void;
  handleRemoveAttachment?: () => void;
  handleStartVoice?: () => void;
  handleStopVoice?: () => void;
  handleCancelVoice?: () => void;
  handleDiscardVoice?: () => void;
  /** A file's link stopped working on screen (expired): get a new one. */
  handleAttachmentLinkFailed?: (path: string) => void;
  handleToggleMute?: (conversationId: string) => void;
  handleOpenProfile?: (profileId: string) => void;
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

// The research assistant's round button floats over the bottom right corner
// of this page (components/assistant/ResearchAssistant.tsx: 56 px wide, 16 px
// from the edge, 24 px on large screens). The rows above the message box (a
// chosen file, a recording) keep their buttons out from under it.
const CLEAR_OF_ASSISTANT = "mr-16 lg:mr-[4.5rem]";

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
  const palette = ["#4f46e5", "#7c3aed", "#0e7490", "#047857", "#dc2626", "#b45309"];
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

function formatBytes(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(totalSeconds: number | null | undefined) {
  const value = Math.max(0, Math.round(totalSeconds || 0));
  return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`;
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
          <img src={picUrl} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
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
  const color = type === "collaboration" ? "#7c3aed" : type === "workspace_group" ? "#0e7490" : "#4f46e5";
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

// ─── Attachment inside a message ─────────────────────────────────────────────

function MessageAttachment({
  message,
  mine,
  onLinkFailed,
}: {
  message: MessageRow;
  mine: boolean;
  onLinkFailed?: (path: string) => void;
}) {
  const name = message.attachment_name || "Attachment";
  const url = message.attachment_url || "";
  const linkFailed = () => {
    if (message.attachment_path) onLinkFailed?.(message.attachment_path);
  };

  if (!url) {
    return (
      <p className={`text-xs italic ${mine ? "text-white/90" : "text-muted-foreground"}`}>
        {message.attachment_kind === "voice" ? "Voice message" : name} (not available right now)
      </p>
    );
  }

  if (message.attachment_kind === "voice") {
    return (
      <div className="flex flex-col gap-1">
        <audio
          controls
          preload="none"
          src={url}
          onError={linkFailed}
          className="h-10 w-60 max-w-full"
          aria-label={`Voice message, ${formatDuration(message.attachment_duration_seconds)}`}
        />
        <span className={`text-[11px] ${mine ? "text-white/90" : "text-muted-foreground"}`}>
          Voice message · {formatDuration(message.attachment_duration_seconds)}
        </span>
      </div>
    );
  }

  if (message.attachment_kind === "image") {
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block">
        {/* A signed link from private storage; next/image cannot resize those.
            The box has a fixed size, so a picture that loads later does not
            push the newest messages out of view. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt={name}
          loading="lazy"
          width={240}
          height={240}
          onError={linkFailed}
          className="h-60 w-60 max-w-full rounded-xl object-contain bg-white"
        />
      </a>
    );
  }

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold underline-offset-2 hover:underline ${
        mine ? "bg-white/15 text-white" : "bg-muted text-foreground"
      }`}
    >
      <Paperclip className="h-4 w-4 flex-shrink-0" aria-hidden="true" />
      <span className="min-w-0 truncate">{name}</span>
      {message.attachment_size ? (
        <span className={`flex-shrink-0 text-[11px] font-normal ${mine ? "text-white/90" : "text-muted-foreground"}`}>
          {formatBytes(message.attachment_size)}
        </span>
      ) : null}
    </a>
  );
}

// ─── "More options" menu of the open chat ───────────────────────────────────

function ChatMoreMenu({
  conversation,
  otherMember,
  onToggleMute,
  onOpenProfile,
}: {
  conversation: ConversationView;
  otherMember: ConversationMemberView | null;
  onToggleMute?: (conversationId: string) => void;
  onOpenProfile?: (profileId: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const items: { key: string; label: string; icon: typeof Bell; run: () => void }[] = [];

  if (onToggleMute) {
    items.push({
      key: "mute",
      label: conversation.muted ? "Unmute chat" : "Mute chat",
      icon: conversation.muted ? Bell : BellOff,
      run: () => onToggleMute(conversation.id),
    });
  }

  if (conversation.conversation_type === "direct" && otherMember && onOpenProfile) {
    items.push({
      key: "profile",
      label: "View profile",
      icon: UserRound,
      run: () => onOpenProfile(otherMember.user_id),
    });
  }

  // Focus the first item when the menu opens; close on a click elsewhere.
  useEffect(() => {
    if (!open) return;
    menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) {
        setOpen(false);
      }
    };
    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  if (items.length === 0) return null;

  const close = (returnFocus: boolean) => {
    setOpen(false);
    if (returnFocus) buttonRef.current?.focus();
  };

  const onMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const entries = Array.from(
      menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') || [],
    );
    const index = entries.indexOf(document.activeElement as HTMLElement);

    if (event.key === "Escape") {
      event.preventDefault();
      close(true);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      entries[(index + 1) % entries.length]?.focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      entries[(index - 1 + entries.length) % entries.length]?.focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      entries[0]?.focus();
    } else if (event.key === "End") {
      event.preventDefault();
      entries[entries.length - 1]?.focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div className="relative">
      <button
        ref={buttonRef}
        type="button"
        aria-label="More options"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="p-2 rounded-xl hover:bg-muted transition-colors text-muted-foreground"
      >
        <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={menuRef}
          role="menu"
          aria-label="Chat options"
          onKeyDown={onMenuKeyDown}
          className="absolute right-0 top-full z-30 mt-1 w-48 rounded-xl border border-border bg-card p-1 shadow-lg"
        >
          {items.map((item) => (
            <button
              key={item.key}
              type="button"
              role="menuitem"
              tabIndex={-1}
              onClick={() => {
                close(true);
                item.run();
              }}
              className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-foreground hover:bg-muted focus:bg-muted focus:outline-none"
            >
              <item.icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              {item.label}
            </button>
          ))}
        </div>
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
  pendingFile = null,
  voiceRecording = false,
  voiceStarting = false,
  voiceSeconds = 0,
  voiceNote = null,
  voiceLimitReached = false,
  handlePickAttachment,
  handleRemoveAttachment,
  handleStartVoice,
  handleStopVoice,
  handleCancelVoice,
  handleDiscardVoice,
  handleAttachmentLinkFailed,
  handleToggleMute,
  handleOpenProfile,
}: MessagesUIProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hasAttachment = Boolean(pendingFile || voiceNote);
  const voiceBusy = voiceRecording || voiceStarting;
  const canSend = !sending && !voiceBusy && (Boolean(messageText.trim()) || hasAttachment);

  // ── Composer: focus and what screen readers hear ─────────────────────────
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const micButtonRef = useRef<HTMLButtonElement>(null);
  const stopButtonRef = useRef<HTMLButtonElement>(null);
  const sendButtonRef = useRef<HTMLButtonElement>(null);
  const wasRecordingRef = useRef(false);
  const wasStartingRef = useRef(false);

  // Buttons that disappear or turn off while recording would leave keyboard
  // focus nowhere: move it to the next useful control instead. Focus that is
  // somewhere else (another chat, the text box) is left alone.
  useEffect(() => {
    const active = document.activeElement;
    const focusLost = !active || active === document.body || active === micButtonRef.current;

    if (voiceRecording && !wasRecordingRef.current) {
      if (focusLost) stopButtonRef.current?.focus();
    } else if (!voiceRecording && wasRecordingRef.current) {
      if (focusLost) (voiceNote ? sendButtonRef.current : textareaRef.current)?.focus();
    } else if (!voiceStarting && wasStartingRef.current && !voiceRecording) {
      // The microphone was refused: back to the microphone button.
      if (focusLost) micButtonRef.current?.focus();
    }

    wasRecordingRef.current = voiceRecording;
    wasStartingRef.current = voiceStarting;
  }, [voiceRecording, voiceStarting, voiceNote]);

  // One polite announcement per change, not a ticking clock.
  const composerStatus =
    sending && hasAttachment
      ? "Sending…"
      : voiceStarting
        ? "Waiting for microphone access…"
        : voiceRecording
          ? `Recording a voice message, up to ${MAX_VOICE_SECONDS / 60} minutes.`
          : voiceNote
            ? voiceLimitReached
              ? `Recording stopped at the ${MAX_VOICE_SECONDS / 60}-minute limit. Voice message ready to send.`
              : "Voice message ready to send."
            : pendingFile
              ? `Attached ${pendingFile.file.name}, ${formatBytes(pendingFile.file.size)}.`
              : "";

  const removeAndRefocus = (remove?: () => void) => {
    remove?.();
    textareaRef.current?.focus();
  };
  const [search, setSearch] = useState("");
  const [showNewChat, setShowNewChat] = useState(false);
  const [mobileChatOpen, setMobileChatOpen] = useState(Boolean(selectedConversationId));
  // On a phone, choosing a chat opens it (set while rendering instead of in an
  // effect, so there is no extra render).
  const [chatShownFor, setChatShownFor] = useState(selectedConversationId);
  if (chatShownFor !== selectedConversationId) {
    setChatShownFor(selectedConversationId);
    if (selectedConversationId) setMobileChatOpen(true);
  }

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesScrollRef = useRef<HTMLDivElement>(null);

  // ── Unread counts per division ──────────────────────────────────────────
  const divisionUnread = useMemo(() => {
    const map: Record<ConversationDivision, number> = {
      direct: 0, collaboration: 0, workspace_group: 0,
    };
    conversations.forEach((c) => {
      if (!c.muted) map[c.conversation_type] += c.unread_count;
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
      {/* Page title for screen readers; the design has no visible one (RG-32). */}
      <h1 className="sr-only">Messages</h1>

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
                    type="button"
                    aria-pressed={activeDivision === d.value}
                    onClick={() => setActiveDivision(d.value)}
                    className={`relative flex-1 py-1.5 text-[11px] font-semibold rounded-lg transition-all whitespace-nowrap ${
                      activeDivision === d.value
                        ? "bg-white text-primary shadow-sm"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {d.label === "Collaborations" ? "Collab" : d.label === "Workspaces" ? "Workspaces" : "Direct"}
                    {divisionUnread[d.value] > 0 && (
                      <span className="ml-1 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-600 text-white text-[9px] font-bold align-middle">
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
                  aria-label={`Search ${typeLabel(activeDivision).toLowerCase()} conversations`}
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
                      aria-label="Researcher to message"
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
                      type="button"
                      aria-current={isActive ? "true" : undefined}
                      onClick={() => {
                        handleSelectConversation(conv.id);
                        // On phones, tapping the chat that was open before
                        // Back must open it again (the selection does not change).
                        setMobileChatOpen(true);
                      }}
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
                          <p className={`text-sm truncate ${conv.unread_count > 0 && !conv.muted ? "font-extrabold text-foreground" : "font-semibold text-foreground"}`}>
                            {titleForList}
                            {conv.muted && (
                              <>
                                <BellOff
                                  className="ml-1 inline h-3 w-3 align-[-1px] text-muted-foreground"
                                  aria-hidden="true"
                                />
                                <span className="sr-only"> (muted)</span>
                              </>
                            )}
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
                        <span
                          className={`flex-shrink-0 mt-1 min-w-[20px] h-5 px-1.5 rounded-full text-white text-[10px] font-bold flex items-center justify-center ${
                            conv.muted ? "bg-slate-500" : "bg-primary"
                          }`}
                        >
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
                    type="button"
                    onClick={() => {
                      // The recording bar is about to be hidden: do not keep
                      // the microphone on out of sight. What was recorded so
                      // far stays ready in this chat.
                      if (voiceRecording) handleStopVoice?.();
                      else if (voiceStarting) handleCancelVoice?.();
                      setMobileChatOpen(false);
                    }}
                    aria-label="Back to conversations"
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
                    <ChatMoreMenu
                      key={selectedConversation.id}
                      conversation={selectedConversation}
                      otherMember={other}
                      onToggleMute={handleToggleMute}
                      onOpenProfile={handleOpenProfile}
                    />
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
                              {msg.attachment_path && (
                                <div className={msg.body ? "mb-2" : ""}>
                                  <MessageAttachment message={msg} mine={mine} onLinkFailed={handleAttachmentLinkFailed} />
                                </div>
                              )}
                              {msg.body && <p className="whitespace-pre-wrap">{msg.body}</p>}
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
                  <p role="status" className="sr-only">{composerStatus}</p>

                  {/* What will be sent with the message */}
                  {voiceRecording && (
                    <div className={`${CLEAR_OF_ASSISTANT} mb-2 flex items-center gap-3 rounded-xl border border-red-100 bg-red-50 px-3 py-2 text-sm text-red-800`}>
                      <span className="h-2.5 w-2.5 flex-shrink-0 animate-pulse rounded-full bg-red-600" aria-hidden="true" />
                      {/* A timer is not read out on every tick; it can be read on demand. */}
                      <span role="timer" className="flex-1 font-semibold">
                        Recording {formatDuration(voiceSeconds)} / {formatDuration(MAX_VOICE_SECONDS)}
                      </span>
                      <button
                        ref={stopButtonRef}
                        type="button"
                        onClick={handleStopVoice}
                        aria-label="Stop recording"
                        className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-700"
                      >
                        <Square className="h-3 w-3" aria-hidden="true" />
                        Stop
                      </button>
                      <button
                        type="button"
                        onClick={handleCancelVoice}
                        aria-label="Cancel recording"
                        className="rounded-lg px-2 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100"
                      >
                        Cancel
                      </button>
                    </div>
                  )}

                  {voiceNote && !voiceRecording && (
                    <div className={`${CLEAR_OF_ASSISTANT} mb-2 flex items-center gap-3 rounded-xl border border-border bg-muted/60 px-3 py-2`}>
                      <Mic className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                      <audio
                        controls
                        src={voiceNote.url}
                        className="h-9 min-w-0 flex-1"
                        aria-label={`Recorded voice message, ${formatDuration(voiceNote.seconds)}`}
                      />
                      <span className="text-xs text-muted-foreground">{formatDuration(voiceNote.seconds)}</span>
                      <button
                        type="button"
                        onClick={() => removeAndRefocus(handleDiscardVoice)}
                        disabled={sending}
                        aria-label="Remove voice message"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  {pendingFile && (
                    <div className={`${CLEAR_OF_ASSISTANT} mb-2 flex items-center gap-3 rounded-xl border border-border bg-muted/60 px-3 py-2`}>
                      {pendingFile.kind === "image" && pendingFile.previewUrl ? (
                        // A local preview of the chosen picture.
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={pendingFile.previewUrl}
                          alt=""
                          className="h-10 w-10 flex-shrink-0 rounded-lg object-cover"
                        />
                      ) : (
                        <Paperclip className="h-4 w-4 flex-shrink-0 text-primary" aria-hidden="true" />
                      )}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-foreground">
                        {pendingFile.file.name}
                      </span>
                      <span className="text-xs text-muted-foreground">{formatBytes(pendingFile.file.size)}</span>
                      <button
                        type="button"
                        onClick={() => removeAndRefocus(handleRemoveAttachment)}
                        disabled={sending}
                        aria-label="Remove attachment"
                        className="rounded-lg p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-40"
                      >
                        <X className="h-4 w-4" aria-hidden="true" />
                      </button>
                    </div>
                  )}

                  <div className="flex items-end gap-2">
                    <input
                      ref={fileInputRef}
                      type="file"
                      className="hidden"
                      tabIndex={-1}
                      aria-hidden="true"
                      onChange={(event) => {
                        handlePickAttachment?.(event.target.files?.[0] || null);
                        // Choosing the same file again must work too.
                        event.target.value = "";
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={!handlePickAttachment || voiceBusy || sending}
                      className="p-2.5 rounded-xl hover:bg-muted transition-colors text-muted-foreground flex-shrink-0 disabled:opacity-40"
                      aria-label="Add attachment"
                    >
                      <Plus className="w-4 h-4" aria-hidden="true" />
                    </button>

                    <div className="flex-1 relative">
                      <textarea
                        ref={textareaRef}
                        aria-label="Message"
                        value={messageText}
                        onChange={(e) => handleChangeMessageText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            if (canSend) handleSendMessage();
                          }
                        }}
                        placeholder={hasAttachment ? "Add a message (optional)…" : "Write a message…"}
                        rows={1}
                        className="w-full max-h-32 resize-none px-4 py-2.5 text-sm bg-muted rounded-2xl border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all pr-10 leading-relaxed"
                        style={{ minHeight: "44px" }}
                      />
                      <button
                        ref={micButtonRef}
                        type="button"
                        onClick={handleStartVoice}
                        disabled={!handleStartVoice || voiceBusy || sending}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary transition-colors disabled:opacity-40"
                        aria-label="Record a voice message"
                      >
                        <Mic className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <button
                      ref={sendButtonRef}
                      onClick={() => {
                        handleSendMessage();
                        // The button turns off while sending; keep typing where you were.
                        textareaRef.current?.focus();
                      }}
                      disabled={!canSend}
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
                  <p className="text-[10px] text-muted-foreground mt-1.5 px-2 hidden sm:block">
                    Enter to send · Shift+Enter for new line · Files up to 25 MB
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