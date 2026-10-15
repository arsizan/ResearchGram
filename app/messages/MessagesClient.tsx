"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { RealtimeChannel } from "@supabase/supabase-js";
import MessagesUI, {
  type ConversationDivision,
  type ConversationView,
  type MessageRow,
  type PendingFile,
  type ProfileLite,
  type TypingUser,
} from "./UI";
import { logDev } from "@/lib/log";
import { friendlyError, isUnclearFailure, notify } from "@/lib/feedback";
import { asUploadBody, chatUploadProblem, IMAGE_TYPES } from "@/lib/uploadRules";
import { useVoiceRecorder } from "./useVoiceRecorder";

type ConversationRow = {
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
};

type ConversationMemberRow = {
  id: string;
  conversation_id: string;
  user_id: string;
  role: string;
  last_read_at: string | null;
  muted: boolean | null;
  joined_at: string | null;
};

type WorkspaceLite = {
  id: string;
  title: string | null;
  workspace_type: string | null;
};

type ContentLite = {
  id: string;
  title: string | null;
};

function getDisplayName(profile: ProfileLite | null | undefined) {
  return profile?.full_name || profile?.email?.split("@")[0] || "Researcher";
}

const CONVERSATION_PAGE_SIZE = 10;
const MESSAGE_PAGE_SIZE = 30;

// Files and voice messages in chats: a private bucket, readable only by the
// people in the chat, through short-lived signed links.
const CHAT_BUCKET = "chat-attachments";
const SIGNED_URL_SECONDS = 60 * 60;
// A signed link is reused until 5 minutes before it expires, so a file or
// voice message on screen keeps the same link (a new link would restart a
// voice message that is playing). One that expires on screen is renewed when
// it fails to load (refreshAttachmentUrl).
const SIGNED_URL_REUSE_MS = (SIGNED_URL_SECONDS - 5 * 60) * 1000;

const MESSAGE_FIELDS =
  "id, conversation_id, sender_id, body, read_at, is_deleted, created_at, attachment_path, attachment_name, attachment_type, attachment_size, attachment_kind, attachment_duration_seconds";

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-120) || "file";
}

function voiceExtension(mimeType: string) {
  if (mimeType === "audio/mp4") return "m4a";
  if (mimeType === "audio/ogg") return "ogg";
  return "webm";
}

// One row per chat I am in, from the my_conversation_summaries() database
// function: unread count and last message (audit RG-18, RG-19).
type ConversationSummaryRow = {
  conversation_id: string;
  unread_count: number | string;
  last_message_id: string | null;
  last_message_body: string | null;
  last_message_sender_id: string | null;
  last_message_read_at: string | null;
  last_message_created_at: string | null;
  muted?: boolean | null;
};

function isSupabaseLockError(
  error: { name?: string; message?: string; details?: string; hint?: string } | null | undefined,
) {
  const message = `${error?.message || ""} ${error?.details || ""} ${
    error?.hint || ""
  }`;

  return (
    error?.name === "AbortError" ||
    message.toLowerCase().includes("lock broken") ||
    message.toLowerCase().includes("aborterror")
  );
}

export default function MessagesClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // /messages?conversation=… (from Network, Requests) opens that chat once (audit RG-11).
  const requestedConversationIdRef = useRef(searchParams.get("conversation") || "");

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null);

  const [activeDivision, setActiveDivision] =
    useState<ConversationDivision>("direct");

  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);

  // "Show more" in the chat list and "Load older messages" in a chat (audit RG-17).
  const [conversationListLimit, setConversationListLimit] = useState(
    CONVERSATION_PAGE_SIZE,
  );
  const [hasOlderMessages, setHasOlderMessages] = useState(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  // How many of the newest messages the open chat shows; grows by a page each
  // time older messages are requested, resets when another chat opens. Every
  // reload (new message, realtime) fetches this many, so history stays loaded.
  const messageLimitRef = useRef(MESSAGE_PAGE_SIZE);
  const messagesConversationIdRef = useRef("");
  // Replies can arrive out of order. A reply is shown only if no newer request
  // for the same chat has been shown already (tracked per chat, so loading one
  // chat never blocks another).
  const messagesRequestCounterRef = useRef(0);
  const shownMessagesRequestRef = useRef<Record<string, number>>({});
  const loadingOlderMessagesRef = useRef(false);

  const [messageText, setMessageText] = useState("");
  // Chats with a message still being sent. Sending is per chat: a slow upload
  // in one chat does not block the others.
  const [sendingConversationIds, setSendingConversationIds] = useState<string[]>([]);
  const sending = sendingConversationIds.includes(selectedConversationId);

  const [connectedProfiles, setConnectedProfiles] = useState<ProfileLite[]>([]);
  const [selectedDirectUserId, setSelectedDirectUserId] = useState("");
  const [creatingDirect, setCreatingDirect] = useState(false);

  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  // "… is typing" belongs to the open chat: cleared when another chat opens
  // (set while rendering instead of in an effect, so there is no extra render).
  const [typingShownFor, setTypingShownFor] = useState(selectedConversationId);
  if (typingShownFor !== selectedConversationId) {
    setTypingShownFor(selectedConversationId);
    setTypingUsers([]);
  }

  // The file or voice message waiting to be sent with the next message.
  const [pendingFile, setPendingFile] = useState<PendingFile | null>(null);
  const pendingFileRef = useRef<PendingFile | null>(null);
  const reportVoiceProblem = useCallback((message: string) => notify(message, "error"), []);
  const voice = useVoiceRecorder(reportVoiceProblem);
  const { cancel: cancelVoice, discard: discardVoice } = voice;
  const voiceNoteRef = useRef(voice.note);
  useEffect(() => {
    voiceNoteRef.current = voice.note;
  }, [voice.note]);

  // Signed links of attachments, reused while they are still valid (RG-31).
  const signedUrlCacheRef = useRef(new Map<string, { url: string; at: number }>());

  const typingChannelRef = useRef<RealtimeChannel | null>(null);
  const typingTimeoutsRef = useRef<
    Record<string, ReturnType<typeof setTimeout>>
  >({});
  const lastTypingSentRef = useRef(0);
  const selectedConversationIdRef = useRef("");
  const activeDivisionRef = useRef<ConversationDivision>("direct");

  // Guards against concurrent loadConversations calls: a slower earlier call must not
  // overwrite fresher data from a newer one.
  const loadConversationsInFlightRef = useRef(false);
  // When a lock error occurs mid-load, schedule one retry rather than dropping silently
  const loadConversationsRetryRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Debounce ref so rapid real-time events collapse into a single reload
  const loadConversationsDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // The latest loadConversations, for its own lock-error retry (a function
  // cannot list itself as a dependency).
  const loadConversationsRef = useRef<(currentUserId: string, keepSelected?: boolean) => Promise<void>>(
    async () => {},
  );

  // Prevents setState after unmount, which otherwise leaves a blank page on fast navigation.
  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      // Clear any pending retry/debounce timers so they don't fire after unmount
      if (loadConversationsRetryRef.current) {
        clearTimeout(loadConversationsRetryRef.current);
        loadConversationsRetryRef.current = null;
      }
      if (loadConversationsDebounceRef.current) {
        clearTimeout(loadConversationsDebounceRef.current);
        loadConversationsDebounceRef.current = null;
      }
    };
  }, []);

  const replacePendingFile = useCallback((next: PendingFile | null) => {
    if (pendingFileRef.current?.previewUrl) {
      URL.revokeObjectURL(pendingFileRef.current.previewUrl);
    }
    pendingFileRef.current = next;
    setPendingFile(next);
  }, []);

  // An attachment belongs to the chat it was chosen in: switching chats drops it.
  const resetComposerAttachments = useCallback(() => {
    replacePendingFile(null);
    cancelVoice();
    discardVoice();
  }, [replacePendingFile, cancelVoice, discardVoice]);

  // Every change of the open chat goes through here (a click, a tab, a new
  // chat, the list reloading), so a chosen file and a recording, finished or
  // still running, always stay behind with the chat they were made in.
  const openConversation = useCallback(
    (nextId: string) => {
      if (nextId !== selectedConversationIdRef.current) resetComposerAttachments();
      selectedConversationIdRef.current = nextId;
      setSelectedConversationId(nextId);
    },
    [resetComposerAttachments],
  );

  useEffect(() => {
    return () => {
      if (pendingFileRef.current?.previewUrl) {
        URL.revokeObjectURL(pendingFileRef.current.previewUrl);
      }
    };
  }, []);

  // Adds signed links to messages that carry a file or voice message.
  const withAttachmentUrls = useCallback(async (rows: MessageRow[]) => {
    const now = Date.now();
    const cache = signedUrlCacheRef.current;
    const missing = Array.from(
      new Set(
        rows
          .map((row) => row.attachment_path)
          .filter((path): path is string => {
            if (!path) return false;
            const cached = cache.get(path);
            return !cached || now - cached.at > SIGNED_URL_REUSE_MS;
          }),
      ),
    );

    if (missing.length > 0) {
      const { data, error } = await supabase.storage
        .from(CHAT_BUCKET)
        .createSignedUrls(missing, SIGNED_URL_SECONDS);

      if (error) logDev("CHAT ATTACHMENT LINK ERROR:", error);

      (data || []).forEach((item) => {
        if (item.path && item.signedUrl) cache.set(item.path, { url: item.signedUrl, at: now });
      });
    }

    return rows.map((row) =>
      row.attachment_path
        ? { ...row, attachment_url: cache.get(row.attachment_path)?.url ?? null }
        : row,
    );
  }, []);

  // A picture or voice message whose link stopped working while on screen
  // (it expired): get a new link, at most once every few minutes per file.
  const renewedLinksRef = useRef(new Map<string, number>());
  const refreshAttachmentUrl = useCallback(async (path: string) => {
    const now = Date.now();
    if (now - (renewedLinksRef.current.get(path) || 0) < 5 * 60 * 1000) return;
    renewedLinksRef.current.set(path, now);

    const { data, error } = await supabase.storage
      .from(CHAT_BUCKET)
      .createSignedUrl(path, SIGNED_URL_SECONDS);

    if (error || !data?.signedUrl) {
      logDev("CHAT ATTACHMENT LINK ERROR:", error);
      return;
    }

    signedUrlCacheRef.current.set(path, { url: data.signedUrl, at: now });
    if (!isMountedRef.current) return;
    setMessages((current) =>
      current.map((row) =>
        row.attachment_path === path ? { ...row, attachment_url: data.signedUrl } : row,
      ),
    );
  }, []);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.id === selectedConversationId,
      ) || null,
    [conversations, selectedConversationId],
  );

  const filteredConversations = useMemo(
    () =>
      conversations
        .filter(
          (conversation) =>
            conversation.conversation_type === activeDivision,
        )
        .slice(0, conversationListLimit),
    [conversations, activeDivision, conversationListLimit],
  );

  const hasMoreConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) => conversation.conversation_type === activeDivision,
      ).length > conversationListLimit,
    [conversations, activeDivision, conversationListLimit],
  );

  const handleShowMoreConversations = useCallback(() => {
    setConversationListLimit((limit) => limit + CONVERSATION_PAGE_SIZE);
  }, []);

  // Switching division tabs must also move the selection. Without this,
  // selectedConversationId still points at the previous division's conversation
  // and the chat panel keeps showing it.
  const handleSetActiveDivision = useCallback(
    (division: ConversationDivision) => {
      activeDivisionRef.current = division;
      setActiveDivision(division);
      setConversationListLimit(CONVERSATION_PAGE_SIZE);

      // Find the first conversation belonging to the new division
      const firstInDivision = conversations.find(
        (c) => c.conversation_type === division,
      );
      openConversation(firstInDivision?.id || "");
    },
    [conversations, openConversation],
  );

  const loadConnectedProfiles = useCallback(async (currentUserId: string) => {
    const candidateIds = new Set<string>();

    const addPair = (
      firstUserId: string | null | undefined,
      secondUserId: string | null | undefined,
    ) => {
      if (!firstUserId || !secondUserId) return;

      const otherId =
        firstUserId === currentUserId
          ? secondUserId
          : secondUserId === currentUserId
            ? firstUserId
            : null;

      if (!otherId || otherId === currentUserId) return;

      candidateIds.add(otherId);
    };

    const { data: connections } = await supabase
      .from("user_connections")
      .select("user_one_id, user_two_id")
      .or(`user_one_id.eq.${currentUserId},user_two_id.eq.${currentUserId}`);

    ((connections || []) as { user_one_id: string; user_two_id: string }[]).forEach((item) => {
      addPair(item.user_one_id, item.user_two_id);
    });

    const { data: profileRequests } = await supabase
      .from("profile_requests")
      .select("requester_id, receiver_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    ((profileRequests || []) as { requester_id: string; receiver_id: string }[]).forEach((item) => {
      addPair(item.requester_id, item.receiver_id);
    });

    const { data: researchRequests } = await supabase
      .from("research_requests")
      .select("requester_id, receiver_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    ((researchRequests || []) as { requester_id: string; receiver_id: string }[]).forEach((item) => {
      addPair(item.requester_id, item.receiver_id);
    });

    const ids = Array.from(candidateIds);

    if (ids.length === 0) {
      if (isMountedRef.current) setConnectedProfiles([]);
      return;
    }

    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, profile_pic_url")
      .in("id", ids);

    if (error) {
      logDev("LOAD CONNECTED PROFILES ERROR:", error);
      if (isMountedRef.current) setConnectedProfiles([]);
      return;
    }

    if (isMountedRef.current) {
      setConnectedProfiles((data || []) as ProfileLite[]);
    }
  }, []);

  const markConversationRead = useCallback(
    async (conversationId: string, currentUserId: string) => {
      if (!conversationId || !currentUserId) return;

      const now = new Date().toISOString();

      await supabase
        .from("conversation_members")
        .update({
          last_read_at: now,
        })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId);

      await supabase
        .from("messages")
        .update({
          read_at: now,
        })
        .eq("conversation_id", conversationId)
        .neq("sender_id", currentUserId)
        .is("read_at", null);
    },
    [],
  );

  const loadConversations = useCallback(
    async (currentUserId: string, keepSelected = true) => {
      if (!currentUserId) return;

      // Skip if a load is already in flight, so a slower earlier call cannot
      // overwrite fresher data from a newer one.
      // NOTE: this drops the newer request rather than queueing it, so a realtime
      // event arriving mid-load is lost and the list can go stale.
      if (loadConversationsInFlightRef.current) return;
      loadConversationsInFlightRef.current = true;

      try {
        const { data: memberRows, error: memberError } = await supabase
          .from("conversation_members")
          .select(
            "id, conversation_id, user_id, role, last_read_at, muted, joined_at",
          )
          .eq("user_id", currentUserId);

        if (memberError) {
          logDev("LOAD MY CONVERSATION MEMBERS ERROR:", memberError);

          if (isSupabaseLockError(memberError)) {
            // Lock errors happen during React Strict Mode double-mount or rapid
            // re-subscriptions. Don't wipe existing conversations — schedule a
            // single retry once the lock clears (~600ms is usually enough).
            if (isMountedRef.current && !loadConversationsRetryRef.current) {
              loadConversationsRetryRef.current = setTimeout(() => {
                loadConversationsRetryRef.current = null;
                if (isMountedRef.current) {
                  void loadConversationsRef.current(currentUserId, keepSelected);
                }
              }, 600);
            }
          } else {
            notify(friendlyError(memberError, "Could not load your conversations."), "error");
          }
          return;
        }

        const myMemberships = (memberRows || []) as ConversationMemberRow[];
        const conversationIds = myMemberships.map(
          (item) => item.conversation_id,
        );

        if (conversationIds.length === 0) {
          if (isMountedRef.current) {
            setConversations([]);
            openConversation("");
          }
          return;
        }

        // Fetch conversations from every division here, unpaginated, so that one
        // busy division cannot crowd out another. filteredConversations shows
        // them 10 at a time per division, with "Show more" for the rest (RG-17).
        const { data: conversationRows, error: conversationError } =
          await supabase
            .from("conversations")
            .select(
              "id, participant_one_id, participant_two_id, conversation_type, title, content_id, request_id, workspace_id, created_by, last_message_at, created_at",
            )
            .in("id", conversationIds)
            .order("last_message_at", { ascending: false });

        if (conversationError) {
          logDev("LOAD CONVERSATIONS ERROR:", conversationError);
          notify(friendlyError(conversationError, "Could not load your conversations."), "error");
          return;
        }

        const safeConversations = (conversationRows || []) as ConversationRow[];
        const selectedConversationIds = safeConversations.map(
          (conversation) => conversation.id,
        );

        if (selectedConversationIds.length === 0) {
          if (isMountedRef.current) {
            setConversations([]);
            openConversation("");
          }
          return;
        }

        const { data: allMemberRows, error: allMemberError } = await supabase
          .from("conversation_members")
          .select(
            "id, conversation_id, user_id, role, last_read_at, muted, joined_at",
          )
          .in("conversation_id", selectedConversationIds);

        if (allMemberError) {
          logDev("LOAD ALL CONVERSATION MEMBERS ERROR:", allMemberError);
        }

        const allMembers = (allMemberRows || []) as ConversationMemberRow[];

        const allProfileIds = Array.from(
          new Set(allMembers.map((member) => member.user_id).filter(Boolean)),
        );

        const profileMap: Record<string, ProfileLite> = {};

        if (allProfileIds.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name, email, department, profile_pic_url")
            .in("id", allProfileIds);

          if (profileError) {
            logDev("LOAD MESSAGE PROFILES ERROR:", profileError);
          }

          ((profiles || []) as ProfileLite[]).forEach((profile) => {
            profileMap[profile.id] = profile;
          });
        }

        const workspaceIds = Array.from(
          new Set(
            safeConversations
              .map((conversation) => conversation.workspace_id)
              .filter(Boolean) as string[],
          ),
        );

        const workspaceMap: Record<string, WorkspaceLite> = {};

        if (workspaceIds.length > 0) {
          const { data: workspaces } = await supabase
            .from("workspaces")
            .select("id, title, workspace_type")
            .in("id", workspaceIds);

          ((workspaces || []) as WorkspaceLite[]).forEach((workspace) => {
            workspaceMap[workspace.id] = workspace;
          });
        }

        const contentIds = Array.from(
          new Set(
            safeConversations
              .map((conversation) => conversation.content_id)
              .filter(Boolean) as string[],
          ),
        );

        const contentMap: Record<string, ContentLite> = {};

        if (contentIds.length > 0) {
          const { data: contents } = await supabase
            .from("contents")
            .select("id, title")
            .in("id", contentIds);

          ((contents || []) as ContentLite[]).forEach((content) => {
            contentMap[content.id] = content;
          });
        }

        const { data: summaryRows, error: summaryError } = await supabase.rpc(
          "my_conversation_summaries",
        );

        if (summaryError) {
          logDev("LOAD CONVERSATION SUMMARIES ERROR:", summaryError);
        }

        const lastMessageMap: Record<string, MessageRow> = {};
        const unreadMap: Record<string, number> = {};

        ((summaryRows || []) as ConversationSummaryRow[]).forEach((row) => {
          unreadMap[row.conversation_id] = Number(row.unread_count) || 0;

          if (row.last_message_id) {
            lastMessageMap[row.conversation_id] = {
              id: row.last_message_id,
              conversation_id: row.conversation_id,
              sender_id: row.last_message_sender_id || "",
              body: row.last_message_body,
              read_at: row.last_message_read_at,
              is_deleted: false,
              created_at: row.last_message_created_at,
            };
          }
        });

        const normalized: ConversationView[] = safeConversations.map(
          (conversation) => {
            const members = allMembers
              .filter((member) => member.conversation_id === conversation.id)
              .map((member) => ({
                ...member,
                profile: profileMap[member.user_id] || null,
              }));

            const otherMember = members.find(
              (member) => member.user_id !== currentUserId,
            );

            const workspace = conversation.workspace_id
              ? workspaceMap[conversation.workspace_id] || null
              : null;

            const content = conversation.content_id
              ? contentMap[conversation.content_id] || null
              : null;

            let displayTitle = conversation.title || "Conversation";

            if (conversation.conversation_type === "direct") {
              displayTitle = getDisplayName(otherMember?.profile);
            }

            if (conversation.conversation_type === "workspace_group") {
              displayTitle =
                workspace?.title || conversation.title || "Workspace group";
            }

            if (conversation.conversation_type === "collaboration") {
              displayTitle =
                content?.title ||
                conversation.title ||
                "Research collaboration";
            }

            return {
              ...conversation,
              display_title: displayTitle,
              members,
              workspace,
              content,
              last_message: lastMessageMap[conversation.id] || null,
              unread_count: unreadMap[conversation.id] || 0,
              muted: Boolean(
                myMemberships.find(
                  (membership) => membership.conversation_id === conversation.id,
                )?.muted,
              ),
            };
          },
        );

        if (!isMountedRef.current) return;

        setConversations(normalized);

        const requested = requestedConversationIdRef.current
          ? normalized.find(
              (conversation) =>
                conversation.id === requestedConversationIdRef.current,
            )
          : undefined;

        if (requested) {
          requestedConversationIdRef.current = "";
          activeDivisionRef.current = requested.conversation_type;
          setActiveDivision(requested.conversation_type);
          const position = normalized
            .filter(
              (conversation) =>
                conversation.conversation_type === requested.conversation_type,
            )
            .findIndex((conversation) => conversation.id === requested.id);
          setConversationListLimit(
            Math.max(
              CONVERSATION_PAGE_SIZE,
              Math.ceil((position + 1) / CONVERSATION_PAGE_SIZE) *
                CONVERSATION_PAGE_SIZE,
            ),
          );
          openConversation(requested.id);
          return;
        }

        const currentSelectedId = selectedConversationIdRef.current;
        const currentDivision = activeDivisionRef.current;

        const currentSelectedStillExists =
          currentSelectedId &&
          normalized.some(
            (conversation) => conversation.id === currentSelectedId,
          );

        // When keepSelected is true and the current selection still exists, leave it
        // alone — otherwise a realtime refresh would yank the user out of their thread.
        if (keepSelected && currentSelectedStillExists) {
          return;
        }

        // Auto-select the first conversation of the current division.
        // Fall back to the very first conversation if none match the division.
        const next =
          normalized.find(
            (conversation) =>
              conversation.conversation_type === currentDivision,
          ) || null;

        openConversation(next?.id || "");
      } finally {
        // Always release the in-flight guard, including on the early returns above.
        loadConversationsInFlightRef.current = false;
      }
    },
    [openConversation],
  );

  useEffect(() => {
    loadConversationsRef.current = loadConversations;
  }, [loadConversations]);

  const loadMessages = useCallback(
    async (
      conversationId: string,
      currentUserId: string,
      keepMessagesOnError = false,
    ) => {
      if (!conversationId || !currentUserId) {
        if (isMountedRef.current) setMessages([]);
        return;
      }

      const requestId = ++messagesRequestCounterRef.current;

      // The open chat keeps the number of messages it has loaded; any other
      // chat starts again from the newest page.
      const limit =
        messagesConversationIdRef.current === conversationId
          ? messageLimitRef.current
          : MESSAGE_PAGE_SIZE;

      // One extra row tells us whether anything older exists.
      const { data, error } = await supabase
        .from("messages")
        .select(MESSAGE_FIELDS)
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(limit + 1);

      const rows = (data || []) as MessageRow[];
      const safeMessages = error ? [] : await withAttachmentUrls(rows.slice(0, limit).reverse());

      // An older reply, or one for a chat that is no longer open, must not
      // replace what is on screen.
      const isCurrent =
        isMountedRef.current &&
        requestId > (shownMessagesRequestRef.current[conversationId] || 0) &&
        selectedConversationIdRef.current === conversationId;

      if (error) {
        logDev("LOAD MESSAGES ERROR:", error);

        if (!isSupabaseLockError(error)) {
          notify(friendlyError(error, "Could not load the messages."), "error");
        }

        if (isCurrent && !keepMessagesOnError) setMessages([]);
        return;
      }

      if (isCurrent) {
        shownMessagesRequestRef.current[conversationId] = requestId;
        if (messagesConversationIdRef.current !== conversationId) {
          messagesConversationIdRef.current = conversationId;
          messageLimitRef.current = limit;
        }
        setMessages(safeMessages);
        setHasOlderMessages(rows.length > limit);
      }

      await markConversationRead(conversationId, currentUserId);
    },
    [markConversationRead, withAttachmentUrls],
  );

  const handleLoadOlderMessages = async () => {
    const conversationId = selectedConversationIdRef.current;
    if (!conversationId || !userId || loadingOlderMessagesRef.current) return;
    // The open chat's messages have not arrived yet.
    if (messagesConversationIdRef.current !== conversationId) return;

    loadingOlderMessagesRef.current = true;
    setLoadingOlderMessages(true);
    messageLimitRef.current += MESSAGE_PAGE_SIZE;

    try {
      // If this fails, keep what is on screen; the button stays to try again.
      await loadMessages(conversationId, userId, true);
    } finally {
      loadingOlderMessagesRef.current = false;
      if (isMountedRef.current) setLoadingOlderMessages(false);
    }
  };

  // try/finally so setLoading(false) always runs, even when the auth check
  // redirects or throws. Every setState is guarded by isMountedRef for the same
  // reason: an update after unmount leaves the page blank.
  useEffect(() => {
  const load = async () => {
  try {
    const authUser = await getCurrentUserSafe();

    if (!authUser) {
      router.push("/auth/login");
      return;
    }

    if (!isMountedRef.current) return;

    const activeUserId = authUser.id;
    setUserId(activeUserId);

    const { data: profileData } = await supabase
      .from("profiles")
      .select("id, full_name, email, department, profile_pic_url")
      .eq("id", activeUserId)
      .maybeSingle();

    if (isMountedRef.current) {
      setMyProfile((profileData as ProfileLite) || null);
    }

    await loadConnectedProfiles(activeUserId);
    await loadConversations(activeUserId, false);
  } catch (error) {
    if (isAuthLockError(error)) {
      logDev("MESSAGES AUTH LOCK ERROR:", error);
      return;
    }

    logDev("MESSAGES LOAD ERROR:", error);
  } finally {
    if (isMountedRef.current) {
      setLoading(false);
    }
  }
};

    load();
  }, [router, loadConnectedProfiles, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId || !userId) return;

    loadMessages(selectedConversationId, userId);
  }, [selectedConversationId, userId, loadMessages]);

  useEffect(() => {
    selectedConversationIdRef.current = selectedConversationId;
  }, [selectedConversationId]);

  useEffect(() => {
    activeDivisionRef.current = activeDivision;
  }, [activeDivision]);

  useEffect(() => {
    if (!userId) return;

    const refreshMessages = async (conversationId: string) => {
      if (!conversationId) return;
      await loadMessages(conversationId, userId);
    };

    // Debounce conversation refreshes so rapid real-time events (e.g. multiple
    // message inserts in quick succession) collapse into a single reload instead
    // of hammering Supabase and triggering cascading lock errors.
    const refreshConversations = () => {
      if (loadConversationsDebounceRef.current) {
        clearTimeout(loadConversationsDebounceRef.current);
      }
      loadConversationsDebounceRef.current = setTimeout(async () => {
        loadConversationsDebounceRef.current = null;
        if (isMountedRef.current) {
          await loadConversations(userId, true);
        }
      }, 300);
    };

    const channel = supabase
      .channel(`messages-db-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
        },
        async (payload) => {
          const changedRow = (payload.new || payload.old) as { conversation_id?: string } | null;
          const currentConversationId = selectedConversationIdRef.current;

          if (
            changedRow?.conversation_id &&
            changedRow.conversation_id === currentConversationId
          ) {
            await refreshMessages(currentConversationId);
          }

          await refreshConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversations",
        },
        async () => {
          await refreshConversations();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "conversation_members",
        },
        async () => {
          await refreshConversations();
        },
      )
      .subscribe();

    const focusHandler = () => {
      const currentConversationId = selectedConversationIdRef.current;

      refreshConversations();

      if (currentConversationId) {
        refreshMessages(currentConversationId);
      }
    };

    window.addEventListener("focus", focusHandler);

    return () => {
      window.removeEventListener("focus", focusHandler);
      supabase.removeChannel(channel);
    };
  }, [userId, loadMessages, loadConversations]);

  useEffect(() => {
    if (!selectedConversationId || !userId) return;

    if (typingChannelRef.current) {
      supabase.removeChannel(typingChannelRef.current);
    }

    const channel = supabase
      .channel(`typing-${selectedConversationId}`)
      .on("broadcast", { event: "typing" }, ({ payload }) => {
        if (!payload || payload.user_id === userId) return;
        if (payload.conversation_id !== selectedConversationId) return;

        const typingUser: TypingUser = {
          user_id: payload.user_id,
          name: payload.name || "Someone",
        };

        setTypingUsers((prev) => {
          const withoutSame = prev.filter(
            (item) => item.user_id !== typingUser.user_id,
          );

          return [...withoutSame, typingUser];
        });

        if (typingTimeoutsRef.current[typingUser.user_id]) {
          clearTimeout(typingTimeoutsRef.current[typingUser.user_id]);
        }

        typingTimeoutsRef.current[typingUser.user_id] = setTimeout(() => {
          setTypingUsers((prev) =>
            prev.filter((item) => item.user_id !== typingUser.user_id),
          );
        }, 2200);
      })
      .subscribe();

    typingChannelRef.current = channel;

    return () => {
      Object.values(typingTimeoutsRef.current).forEach((timeout) =>
        clearTimeout(timeout),
      );
      typingTimeoutsRef.current = {};
      supabase.removeChannel(channel);
    };
  }, [selectedConversationId, userId]);

  const sendTypingSignal = () => {
    if (!typingChannelRef.current || !selectedConversationId || !userId) return;

    const now = Date.now();

    if (now - lastTypingSentRef.current < 900) return;

    lastTypingSentRef.current = now;

    typingChannelRef.current.send({
      type: "broadcast",
      event: "typing",
      payload: {
        conversation_id: selectedConversationId,
        user_id: userId,
        name: getDisplayName(myProfile),
      },
    });
  };

  const handleChangeMessageText = (value: string) => {
    setMessageText(value);
    sendTypingSignal();
  };

  const handleSelectConversation = async (conversationId: string) => {
    openConversation(conversationId);
  };

  const handlePickAttachment = (file: File | null) => {
    if (!file) return;

    const problem = chatUploadProblem(file);
    if (problem) {
      notify(problem, "error");
      return;
    }

    // One attachment per message.
    cancelVoice();
    discardVoice();

    const isImage = IMAGE_TYPES.includes(file.type);
    replacePendingFile({
      file,
      kind: isImage ? "image" : "file",
      previewUrl: isImage ? URL.createObjectURL(file) : "",
    });
  };

  // One attachment per message: a chosen file is dropped once the recording
  // has really started (not when the microphone is refused).
  const startVoice = voice.start;
  const handleStartVoice = async () => {
    if (await startVoice()) replacePendingFile(null);
  };

  const handleToggleMute = async (conversationId: string) => {
    const conversation = conversations.find((item) => item.id === conversationId);
    if (!conversation || !userId) return;

    const nextMuted = !conversation.muted;
    const setMuted = (muted: boolean) =>
      setConversations((current) =>
        current.map((item) => (item.id === conversationId ? { ...item, muted } : item)),
      );

    setMuted(nextMuted);

    const { error } = await supabase
      .from("conversation_members")
      .update({ muted: nextMuted })
      .eq("conversation_id", conversationId)
      .eq("user_id", userId);

    if (error) {
      logDev("MUTE CONVERSATION ERROR:", error);
      setMuted(!nextMuted);
      notify(friendlyError(error, "Could not change the chat's notifications."), "error");
      return;
    }

    notify(
      nextMuted
        ? "Chat muted. Its new messages no longer count in your unread badge."
        : "Chat unmuted.",
      "success",
    );
    window.dispatchEvent(new Event("researchgram:refresh-nav-counts"));
  };

  // Text, a file, a voice message, or text with one of them. The chat moves
  // to the top by itself: the database does that when the message is saved
  // (audit RG-20).
  const handleSendMessage = async () => {
    const conversationId = selectedConversationId;

    if (!conversationId || !userId) {
      notify("Select a conversation first.", "info");
      return;
    }

    if (sendingConversationIds.includes(conversationId)) return;

    if (voice.recording || voice.starting) {
      notify("Stop the recording first.", "info");
      return;
    }

    const text = messageText.trim();
    const fileToSend = pendingFile;
    const voiceToSend = voice.note;

    if (!text && !fileToSend && !voiceToSend) return;

    // A text-only message appears at once, as before.
    const tempMessage: MessageRow | null =
      fileToSend || voiceToSend
        ? null
        : {
            id: `temp-${Date.now()}`,
            conversation_id: conversationId,
            sender_id: userId,
            body: text,
            read_at: null,
            is_deleted: false,
            created_at: new Date().toISOString(),
          };

    if (tempMessage) setMessages((prev) => [...prev, tempMessage]);
    setMessageText("");
    setSendingConversationIds((ids) => [...ids, conversationId]);

    let uploadedPath = "";
    let failure: unknown = null;

    try {
      let attachment: Record<string, string | number> = {};

      if (fileToSend || voiceToSend) {
        const stamp = Date.now();

        if (fileToSend) {
          const uploadBody = asUploadBody(fileToSend.file, { allowAudio: true });
          const path = `${conversationId}/${userId}/${stamp}-${safeFileName(fileToSend.file.name)}`;
          const { error: uploadError } = await supabase.storage
            .from(CHAT_BUCKET)
            .upload(path, uploadBody, { cacheControl: "3600", upsert: false });

          if (uploadError) throw uploadError;
          uploadedPath = path;

          attachment = {
            attachment_path: path,
            attachment_name: fileToSend.file.name.slice(0, 255) || "file",
            attachment_type: uploadBody.type || "application/octet-stream",
            attachment_size: fileToSend.file.size,
            attachment_kind: fileToSend.kind,
          };
        } else if (voiceToSend) {
          const path = `${conversationId}/${userId}/${stamp}-voice.${voiceExtension(voiceToSend.mimeType)}`;
          const { error: uploadError } = await supabase.storage
            .from(CHAT_BUCKET)
            .upload(path, voiceToSend.blob, {
              cacheControl: "3600",
              upsert: false,
              contentType: voiceToSend.mimeType,
            });

          if (uploadError) throw uploadError;
          uploadedPath = path;

          attachment = {
            attachment_path: path,
            attachment_name: "Voice message",
            attachment_type: voiceToSend.mimeType,
            attachment_size: voiceToSend.blob.size,
            attachment_kind: "voice",
            attachment_duration_seconds: voiceToSend.seconds,
          };
        }
      }

      const { error } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        sender_id: userId,
        body: text || null,
        message_text: text || null,
        is_deleted: false,
        ...attachment,
      });

      if (error) throw error;
    } catch (error) {
      failure = error;
    }

    // No answer from the server: the message may have been saved anyway.
    // Its file is only removed when it certainly was not.
    let keepUpload = false;
    if (failure && uploadedPath && isUnclearFailure(failure)) {
      const { data: saved, error: checkError } = await supabase
        .from("messages")
        .select("id")
        .eq("attachment_path", uploadedPath)
        .limit(1);

      if (checkError) keepUpload = true;
      else if (saved && saved.length > 0) failure = null;
    }

    setSendingConversationIds((ids) => ids.filter((id) => id !== conversationId));

    if (failure) {
      logDev("SEND MESSAGE ERROR:", failure);
      const message = (failure as { message?: string } | null)?.message || "";
      const code = String((failure as { code?: unknown } | null)?.code ?? "");
      notify(
        code === "42501" || message.includes("row-level security")
          ? "You can no longer send messages in this chat."
          : friendlyError(failure, "Could not send the message."),
        "error",
      );

      if (tempMessage) {
        setMessages((prev) => prev.filter((row) => row.id !== tempMessage.id));
      }
      // The text comes back only into the same chat, and only into an empty box.
      if (selectedConversationIdRef.current === conversationId) {
        setMessageText((current) => (current.trim() ? current : text));
      }

      if (uploadedPath && !keepUpload) {
        await supabase.storage.from(CHAT_BUCKET).remove([uploadedPath]);
      }
      return;
    }

    // Sent: clear the attachment, unless another one was chosen meanwhile.
    if (fileToSend && pendingFileRef.current === fileToSend) replacePendingFile(null);
    if (voiceToSend && voiceNoteRef.current === voiceToSend) discardVoice();

    await loadMessages(conversationId, userId);
    await loadConversations(userId, true);
  };

  const handleCreateDirectChat = async () => {
    if (!userId) return;

    if (!selectedDirectUserId) {
      notify("Select a connected researcher first.", "info");
      return;
    }

    const existing = conversations.find(
      (conversation) =>
        conversation.conversation_type === "direct" &&
        conversation.members.some(
          (member) => member.user_id === selectedDirectUserId,
        ),
    );

    if (existing) {
      activeDivisionRef.current = "direct";
      setActiveDivision("direct");
      openConversation(existing.id);
      setSelectedDirectUserId("");
      return;
    }

    setCreatingDirect(true);

    // The database finds the existing chat or starts one with both people in
    // it, in one step (audit RG-20).
    const { data: conversationId, error } = await supabase.rpc("start_direct_conversation", {
      p_other_user: selectedDirectUserId,
    });

    if (error || !conversationId) {
      logDev("START DIRECT CONVERSATION ERROR:", error);
      notify(friendlyError(error, "Could not create direct chat."), "error");
      setCreatingDirect(false);
      return;
    }

    setSelectedDirectUserId("");
    activeDivisionRef.current = "direct";
    setActiveDivision("direct");
    openConversation(String(conversationId));

    await loadConversations(userId, true);
    setCreatingDirect(false);
  };

  const handleOpenWorkspace = (workspaceId: string) => {
    router.push(`/workspace?workspaceId=${workspaceId}`);
  };

  const handleOpenPost = (contentId: string) => {
    router.push(`/feed?post=${contentId}`);
  };

  return (
    <MessagesUI
      loading={loading}
      userId={userId}
      activeDivision={activeDivision}
      setActiveDivision={handleSetActiveDivision}
      conversations={conversations}
      filteredConversations={filteredConversations}
      selectedConversationId={selectedConversationId}
      selectedConversation={selectedConversation}
      messages={messages}
      messageText={messageText}
      sending={sending}
      connectedProfiles={connectedProfiles}
      selectedDirectUserId={selectedDirectUserId}
      creatingDirect={creatingDirect}
      typingUsers={typingUsers}
      setSelectedDirectUserId={setSelectedDirectUserId}
      handleCreateDirectChat={handleCreateDirectChat}
      handleSelectConversation={handleSelectConversation}
      handleChangeMessageText={handleChangeMessageText}
      handleSendMessage={handleSendMessage}
      handleOpenWorkspace={handleOpenWorkspace}
      handleOpenPost={handleOpenPost}
      hasMoreConversations={hasMoreConversations}
      handleShowMoreConversations={handleShowMoreConversations}
      hasOlderMessages={hasOlderMessages}
      loadingOlderMessages={loadingOlderMessages}
      handleLoadOlderMessages={handleLoadOlderMessages}
      pendingFile={pendingFile}
      voiceRecording={voice.recording}
      voiceStarting={voice.starting}
      voiceSeconds={voice.seconds}
      voiceNote={voice.note}
      voiceLimitReached={voice.limitReached}
      handlePickAttachment={handlePickAttachment}
      handleRemoveAttachment={() => replacePendingFile(null)}
      handleStartVoice={handleStartVoice}
      handleStopVoice={voice.stop}
      handleCancelVoice={voice.cancel}
      handleDiscardVoice={discardVoice}
      handleAttachmentLinkFailed={refreshAttachmentUrl}
      handleToggleMute={handleToggleMute}
      handleOpenProfile={(profileId) => router.push(`/researchers/${profileId}`)}
    />
  );
}
