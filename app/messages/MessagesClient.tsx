"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import MessagesUI, {
  type ConversationDivision,
  type ConversationView,
  type MessageRow,
  type ProfileLite,
  type TypingUser,
} from "./UI";

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

const CONVERSATION_LIST_LIMIT = 10;
const RECENT_MESSAGE_PREVIEW_LIMIT = 120;
const MESSAGE_PAGE_SIZE = 30;

function isSupabaseLockError(error: any) {
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

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [myProfile, setMyProfile] = useState<ProfileLite | null>(null);

  const [activeDivision, setActiveDivision] =
    useState<ConversationDivision>("direct");

  const [conversations, setConversations] = useState<ConversationView[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [messages, setMessages] = useState<MessageRow[]>([]);

  const [messageText, setMessageText] = useState("");
  const [sending, setSending] = useState(false);

  const [connectedProfiles, setConnectedProfiles] = useState<ProfileLite[]>([]);
  const [selectedDirectUserId, setSelectedDirectUserId] = useState("");
  const [creatingDirect, setCreatingDirect] = useState(false);

  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);

  const typingChannelRef = useRef<any>(null);
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
        .slice(0, CONVERSATION_LIST_LIMIT),
    [conversations, activeDivision],
  );

  // Switching division tabs must also move the selection. Without this,
  // selectedConversationId still points at the previous division's conversation
  // and the chat panel keeps showing it.
  const handleSetActiveDivision = useCallback(
    (division: ConversationDivision) => {
      activeDivisionRef.current = division;
      setActiveDivision(division);

      // Find the first conversation belonging to the new division
      const firstInDivision = conversations.find(
        (c) => c.conversation_type === division,
      );
      const nextId = firstInDivision?.id || "";
      selectedConversationIdRef.current = nextId;
      setSelectedConversationId(nextId);
    },
    [conversations],
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

    (connections || []).forEach((item: any) => {
      addPair(item.user_one_id, item.user_two_id);
    });

    const { data: profileRequests } = await supabase
      .from("profile_requests")
      .select("requester_id, receiver_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    (profileRequests || []).forEach((item: any) => {
      addPair(item.requester_id, item.receiver_id);
    });

    const { data: researchRequests } = await supabase
      .from("research_requests")
      .select("requester_id, receiver_id, status")
      .eq("status", "accepted")
      .or(`requester_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`);

    (researchRequests || []).forEach((item: any) => {
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
      console.log("LOAD CONNECTED PROFILES ERROR:", error);
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
          console.log("LOAD MY CONVERSATION MEMBERS ERROR:", memberError);

          if (isSupabaseLockError(memberError)) {
            // Lock errors happen during React Strict Mode double-mount or rapid
            // re-subscriptions. Don't wipe existing conversations — schedule a
            // single retry once the lock clears (~600ms is usually enough).
            if (isMountedRef.current && !loadConversationsRetryRef.current) {
              loadConversationsRetryRef.current = setTimeout(() => {
                loadConversationsRetryRef.current = null;
                if (isMountedRef.current) {
                  loadConversations(currentUserId, keepSelected);
                }
              }, 600);
            }
          } else {
            alert(memberError.message);
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
            setSelectedConversationId("");
            selectedConversationIdRef.current = "";
          }
          return;
        }

        // Fetch conversations from every division here, unpaginated, so that one
        // busy division cannot crowd out another.
        // NOTE: CONVERSATION_LIST_LIMIT still slices this to 10 per division in
        // filteredConversations below, so conversation 11 remains unreachable.
        // Pending fix: cursor pagination (audit RG-17).
        const { data: conversationRows, error: conversationError } =
          await supabase
            .from("conversations")
            .select(
              "id, participant_one_id, participant_two_id, conversation_type, title, content_id, request_id, workspace_id, created_by, last_message_at, created_at",
            )
            .in("id", conversationIds)
            .order("last_message_at", { ascending: false });

        if (conversationError) {
          console.log("LOAD CONVERSATIONS ERROR:", conversationError);
          alert(conversationError.message);
          return;
        }

        const safeConversations = (conversationRows || []) as ConversationRow[];
        const selectedConversationIds = safeConversations.map(
          (conversation) => conversation.id,
        );

        if (selectedConversationIds.length === 0) {
          if (isMountedRef.current) {
            setConversations([]);
            setSelectedConversationId("");
            selectedConversationIdRef.current = "";
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
          console.log("LOAD ALL CONVERSATION MEMBERS ERROR:", allMemberError);
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
            console.log("LOAD MESSAGE PROFILES ERROR:", profileError);
          }

          (profiles || []).forEach((profile: any) => {
            profileMap[profile.id] = profile as ProfileLite;
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

          (workspaces || []).forEach((workspace: any) => {
            workspaceMap[workspace.id] = workspace as WorkspaceLite;
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

          (contents || []).forEach((content: any) => {
            contentMap[content.id] = content as ContentLite;
          });
        }

        const { data: recentMessages, error: recentMessageError } =
          await supabase
            .from("messages")
            .select(
              "id, conversation_id, sender_id, body, read_at, is_deleted, created_at",
            )
            .in("conversation_id", selectedConversationIds)
            .eq("is_deleted", false)
            .order("created_at", { ascending: false })
            .limit(RECENT_MESSAGE_PREVIEW_LIMIT);

        if (recentMessageError) {
          console.log("LOAD RECENT MESSAGES ERROR:", recentMessageError);
        }

        const recent = ((recentMessages || []) as MessageRow[]).filter(
          (message) => !message.is_deleted,
        );

        const lastMessageMap: Record<string, MessageRow> = {};
        const unreadMap: Record<string, number> = {};

        const membershipMap: Record<string, ConversationMemberRow> = {};

        myMemberships.forEach((membership) => {
          membershipMap[membership.conversation_id] = membership;
        });

        recent.forEach((message) => {
          if (!lastMessageMap[message.conversation_id]) {
            lastMessageMap[message.conversation_id] = message;
          }

          const membership = membershipMap[message.conversation_id];
          const lastReadTime = membership?.last_read_at
            ? new Date(membership.last_read_at).getTime()
            : 0;

          const messageTime = message.created_at
            ? new Date(message.created_at).getTime()
            : 0;

          if (
            message.sender_id !== currentUserId &&
            messageTime > lastReadTime
          ) {
            unreadMap[message.conversation_id] =
              (unreadMap[message.conversation_id] || 0) + 1;
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
            };
          },
        );

        if (!isMountedRef.current) return;

        setConversations(normalized);

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

        const nextId = next?.id || "";

        selectedConversationIdRef.current = nextId;
        setSelectedConversationId(nextId);
      } finally {
        // Always release the in-flight guard, including on the early returns above.
        loadConversationsInFlightRef.current = false;
      }
    },
    [],
  );

  const loadMessages = useCallback(
    async (conversationId: string, currentUserId: string) => {
      if (!conversationId || !currentUserId) {
        if (isMountedRef.current) setMessages([]);
        return;
      }

      const { data, error } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, read_at, is_deleted, created_at",
        )
        .eq("conversation_id", conversationId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false })
        .limit(MESSAGE_PAGE_SIZE);

      if (error) {
        console.log("LOAD MESSAGES ERROR:", error);

        if (!isSupabaseLockError(error)) {
          alert(error.message);
        }

        if (isMountedRef.current) setMessages([]);
        return;
      }

      const safeMessages = ((data || []) as MessageRow[]).reverse();

      if (isMountedRef.current) {
        setMessages(safeMessages);
      }

      await markConversationRead(conversationId, currentUserId);
    },
    [markConversationRead],
  );

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
      console.log("MESSAGES AUTH LOCK ERROR:", error);
      return;
    }

    console.log("MESSAGES LOAD ERROR:", error);
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
          const changedRow = (payload.new || payload.old) as any;
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

    setTypingUsers([]);

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
    selectedConversationIdRef.current = conversationId;
    setSelectedConversationId(conversationId);
    setTypingUsers([]);
  };

  const handleSendMessage = async () => {
    if (!selectedConversationId || !userId) {
      alert("Select a conversation first.");
      return;
    }

    const body = messageText.trim();

    if (!body) return;

    const tempMessage: MessageRow = {
      id: `temp-${Date.now()}`,
      conversation_id: selectedConversationId,
      sender_id: userId,
      body,
      read_at: null,
      is_deleted: false,
      created_at: new Date().toISOString(),
    };

    setMessages((prev) => [...prev, tempMessage]);
    setMessageText("");
    setSending(true);

    try {
      const { error } = await supabase.from("messages").insert({
        conversation_id: selectedConversationId,
        sender_id: userId,
        body,
        message_text: body,
        is_deleted: false,
      });

      if (error) {
        console.log("SEND MESSAGE ERROR:", error);
        alert(error.message);

        setMessages((prev) =>
          prev.filter((message) => message.id !== tempMessage.id),
        );

        setMessageText(body);
        return;
      }

      await supabase
        .from("conversations")
        .update({
          last_message_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", selectedConversationId);

      await loadMessages(selectedConversationId, userId);
      await loadConversations(userId, true);
    } finally {
      setSending(false);
    }
  };

  const handleCreateDirectChat = async () => {
    if (!userId) return;

    if (!selectedDirectUserId) {
      alert("Select a connected researcher first.");
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
      selectedConversationIdRef.current = existing.id;
      setSelectedConversationId(existing.id);
      setSelectedDirectUserId("");
      return;
    }

    setCreatingDirect(true);

    const otherProfile = connectedProfiles.find(
      (profile) => profile.id === selectedDirectUserId,
    );

    const { data: conversation, error } = await supabase
      .from("conversations")
      .insert({
        participant_one_id: userId,
        participant_two_id: selectedDirectUserId,
        conversation_type: "direct",
        title: getProfileNameForTitle(otherProfile),
        created_by: userId,
        last_message_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (error || !conversation) {
      console.log("CREATE DIRECT CONVERSATION ERROR:", error);
      alert(error?.message || "Could not create direct chat.");
      setCreatingDirect(false);
      return;
    }

    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert([
        {
          conversation_id: conversation.id,
          user_id: userId,
          role: "member",
          last_read_at: new Date().toISOString(),
        },
        {
          conversation_id: conversation.id,
          user_id: selectedDirectUserId,
          role: "member",
          last_read_at: new Date().toISOString(),
        },
      ]);

    if (memberError) {
      console.log("CREATE DIRECT MEMBERS ERROR:", memberError);
      alert(memberError.message);
      setCreatingDirect(false);
      return;
    }

    setSelectedDirectUserId("");
    activeDivisionRef.current = "direct";
    setActiveDivision("direct");
    selectedConversationIdRef.current = conversation.id;
    setSelectedConversationId(conversation.id);

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
    />
  );
}

function getProfileNameForTitle(profile: ProfileLite | undefined) {
  return profile?.full_name || profile?.email || "Direct chat";
}
