"use client";

import { useEffect, useEffectEvent, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import RequestsUI, {
  type ContentPost,
  type Profile,
  type RequestStatus,
  type UnifiedRequestView,
} from "./UI";
import { logDev } from "@/lib/log";
import { friendlyError, notify } from "@/lib/feedback";

// Rows as loaded below.
type ResearchRequestRow = {
  id: string;
  content_id: string | null;
  requester_id: string;
  receiver_id: string;
  request_type: string | null;
  message: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
};

type ProfileRequestRow = Omit<ResearchRequestRow, "content_id">;

type PaperAccessRequestRow = {
  id: string;
  content_id: string;
  requester_id: string;
  owner_id: string;
  reason: string | null;
  status: string;
  created_at: string | null;
  updated_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
};

function sortByNewest(requests: UnifiedRequestView[]) {
  return [...requests].sort((a, b) => {
    const aTime = a.created_at ? new Date(a.created_at).getTime() : 0;
    const bTime = b.created_at ? new Date(b.created_at).getTime() : 0;

    return bTime - aTime;
  });
}

function getProfileName(profile: Profile | null | undefined) {
  return (
    profile?.full_name || profile?.email?.split("@")[0] || "ResearchGram User"
  );
}

export default function RequestsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [openingConversationId, setOpeningConversationId] = useState<
    string | null
  >(null);

  const [userId, setUserId] = useState("");
  const [activeTab, setActiveTab] = useState<"received" | "sent">("received");

  const [receivedRequests, setReceivedRequests] = useState<
    UnifiedRequestView[]
  >([]);
  const [sentRequests, setSentRequests] = useState<UnifiedRequestView[]>([]);

const loadRequests = async () => {
  try {
    const authUser = await getCurrentUserSafe();

    if (!authUser) {
      router.push("/auth/login");
      return;
    }

    const currentUserId = authUser.id;
    setUserId(currentUserId);

    const [
      researchReceivedResult,
      researchSentResult,
      profileReceivedResult,
      profileSentResult,
      paperReceivedResult,
      paperSentResult,
    ] = await Promise.all([
      supabase
        .from("research_requests")
        .select(
          "id, content_id, requester_id, receiver_id, request_type, message, status, created_at, updated_at",
        )
        .eq("receiver_id", currentUserId),

      supabase
        .from("research_requests")
        .select(
          "id, content_id, requester_id, receiver_id, request_type, message, status, created_at, updated_at",
        )
        .eq("requester_id", currentUserId),

      supabase
        .from("profile_requests")
        .select(
          "id, requester_id, receiver_id, request_type, message, status, created_at, updated_at",
        )
        .eq("receiver_id", currentUserId),

      supabase
        .from("profile_requests")
        .select(
          "id, requester_id, receiver_id, request_type, message, status, created_at, updated_at",
        )
        .eq("requester_id", currentUserId),

      supabase
        .from("paper_access_requests")
        .select(
          "id, content_id, requester_id, owner_id, reason, status, created_at, updated_at, approved_at, rejected_at",
        )
        .eq("owner_id", currentUserId),

      supabase
        .from("paper_access_requests")
        .select(
          "id, content_id, requester_id, owner_id, reason, status, created_at, updated_at, approved_at, rejected_at",
        )
        .eq("requester_id", currentUserId),
    ]);

    if (researchReceivedResult.error) {
      logDev(
        "FETCH RECEIVED RESEARCH REQUESTS ERROR:",
        researchReceivedResult.error,
      );
    }

    if (researchSentResult.error) {
      logDev(
        "FETCH SENT RESEARCH REQUESTS ERROR:",
        researchSentResult.error,
      );
    }

    if (profileReceivedResult.error) {
      logDev(
        "FETCH RECEIVED PROFILE REQUESTS ERROR:",
        profileReceivedResult.error,
      );
    }

    if (profileSentResult.error) {
      logDev(
        "FETCH SENT PROFILE REQUESTS ERROR:",
        profileSentResult.error,
      );
    }

    if (paperReceivedResult.error) {
      logDev(
        "FETCH RECEIVED PAPER ACCESS REQUESTS ERROR:",
        paperReceivedResult.error,
      );
    }

    if (paperSentResult.error) {
      logDev(
        "FETCH SENT PAPER ACCESS REQUESTS ERROR:",
        paperSentResult.error,
      );
    }

    const researchReceived = (researchReceivedResult.data || []) as ResearchRequestRow[];
    const researchSent = (researchSentResult.data || []) as ResearchRequestRow[];
    const profileReceived = (profileReceivedResult.data || []) as ProfileRequestRow[];
    const profileSent = (profileSentResult.data || []) as ProfileRequestRow[];
    const paperReceived = (paperReceivedResult.data || []) as PaperAccessRequestRow[];
    const paperSent = (paperSentResult.data || []) as PaperAccessRequestRow[];

    const profileIds = new Set<string>();
    const contentIds = new Set<string>();

    [...researchReceived, ...researchSent].forEach((request) => {
      if (request.requester_id) profileIds.add(request.requester_id);
      if (request.receiver_id) profileIds.add(request.receiver_id);
      if (request.content_id) contentIds.add(request.content_id);
    });

    [...profileReceived, ...profileSent].forEach((request) => {
      if (request.requester_id) profileIds.add(request.requester_id);
      if (request.receiver_id) profileIds.add(request.receiver_id);
    });

    [...paperReceived, ...paperSent].forEach((request) => {
      if (request.requester_id) profileIds.add(request.requester_id);
      if (request.owner_id) profileIds.add(request.owner_id);
      if (request.content_id) contentIds.add(request.content_id);
    });

    const profileMap: Record<string, Profile> = {};
    const contentMap: Record<string, ContentPost> = {};

    if (profileIds.size > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name, email, department, profile_pic_url")
        .in("id", Array.from(profileIds));

      if (profileError) {
        logDev("FETCH REQUEST PROFILES ERROR:", profileError);
      }

      ((profiles || []) as Profile[]).forEach((profile) => {
        profileMap[profile.id] = profile;
      });
    }

    if (contentIds.size > 0) {
      const { data: contents, error: contentError } = await supabase
        .from("contents")
        .select(
          "id, user_id, title, abstract, post_type, content_category, visibility_mode, full_paper_access_mode, allow_full_paper_request, created_at",
        )
        .in("id", Array.from(contentIds));

      if (contentError) {
        logDev("FETCH REQUEST CONTENTS ERROR:", contentError);
      }

      ((contents || []) as ContentPost[]).forEach((content) => {
        contentMap[content.id] = content;
      });
    }

    const normalizedReceived: UnifiedRequestView[] = [
      ...researchReceived.map((request) => ({
        id: request.id,
        kind: "research" as const,
        direction: "received" as const,
        request_type: request.request_type || "collaboration",
        status: request.status as RequestStatus,
        message: request.message,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.receiver_id,
        owner_id: request.receiver_id,
        content_id: request.content_id,
        otherProfile: profileMap[request.requester_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.receiver_id] || null,
        contentPost: (request.content_id && contentMap[request.content_id]) || null,
      })),

      ...profileReceived.map((request) => ({
        id: request.id,
        kind: "profile" as const,
        direction: "received" as const,
        request_type: request.request_type || "connection",
        status: request.status as RequestStatus,
        message: request.message,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.receiver_id,
        owner_id: request.receiver_id,
        content_id: null,
        otherProfile: profileMap[request.requester_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.receiver_id] || null,
        contentPost: null,
      })),

      ...paperReceived.map((request) => ({
        id: request.id,
        kind: "paper_access" as const,
        direction: "received" as const,
        request_type: "paper_access",
        status: request.status as RequestStatus,
        message: request.reason,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.owner_id,
        owner_id: request.owner_id,
        content_id: request.content_id,
        otherProfile: profileMap[request.requester_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.owner_id] || null,
        contentPost: (request.content_id && contentMap[request.content_id]) || null,
      })),
    ];

    const normalizedSent: UnifiedRequestView[] = [
      ...researchSent.map((request) => ({
        id: request.id,
        kind: "research" as const,
        direction: "sent" as const,
        request_type: request.request_type || "collaboration",
        status: request.status as RequestStatus,
        message: request.message,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.receiver_id,
        owner_id: request.receiver_id,
        content_id: request.content_id,
        otherProfile: profileMap[request.receiver_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.receiver_id] || null,
        contentPost: (request.content_id && contentMap[request.content_id]) || null,
      })),

      ...profileSent.map((request) => ({
        id: request.id,
        kind: "profile" as const,
        direction: "sent" as const,
        request_type: request.request_type || "connection",
        status: request.status as RequestStatus,
        message: request.message,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.receiver_id,
        owner_id: request.receiver_id,
        content_id: null,
        otherProfile: profileMap[request.receiver_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.receiver_id] || null,
        contentPost: null,
      })),

      ...paperSent.map((request) => ({
        id: request.id,
        kind: "paper_access" as const,
        direction: "sent" as const,
        request_type: "paper_access",
        status: request.status as RequestStatus,
        message: request.reason,
        created_at: request.created_at,
        updated_at: request.updated_at,
        requester_id: request.requester_id,
        receiver_id: request.owner_id,
        owner_id: request.owner_id,
        content_id: request.content_id,
        otherProfile: profileMap[request.owner_id] || null,
        requesterProfile: profileMap[request.requester_id] || null,
        receiverProfile: profileMap[request.owner_id] || null,
        contentPost: (request.content_id && contentMap[request.content_id]) || null,
      })),
    ];

    setReceivedRequests(sortByNewest(normalizedReceived));
    setSentRequests(sortByNewest(normalizedSent));
  } catch (error) {
    if (isAuthLockError(error)) {
      logDev("REQUESTS AUTH LOCK ERROR:", error);
      return;
    }

    logDev("REQUESTS LOAD ERROR:", error);
  } finally {
    setLoading(false);
  }
};

  const loadRequestsOnMount = useEffectEvent(() => {
    loadRequests();
  });

  useEffect(() => {
    loadRequestsOnMount();
  }, []);

  const ensureResearchConversation = async (request: UnifiedRequestView) => {
    if (
      request.kind !== "research" ||
      !request.content_id ||
      !request.requester_id ||
      !request.receiver_id
    ) {
      return null;
    }

    const { data: existingConversation, error: existingError } = await supabase
      .from("conversations")
      .select("id")
      .eq("request_id", request.id)
      .maybeSingle();

    if (existingError) {
      logDev("CHECK CONVERSATION ERROR:", existingError);
    }

    // Both people need a member row: the Messages page lists conversations by
    // membership and message access is checked against it (audit RG-10).
    // ignoreDuplicates makes this safe to repeat for an existing conversation.
    const addBothMembers = async (conversationId: string) => {
      const now = new Date().toISOString();
      const { error: memberError } = await supabase
        .from("conversation_members")
        .upsert(
          [
            {
              conversation_id: conversationId,
              user_id: request.requester_id,
              role: "member",
              last_read_at: now,
            },
            {
              conversation_id: conversationId,
              user_id: request.receiver_id,
              role: "member",
              last_read_at: now,
            },
          ],
          { onConflict: "conversation_id,user_id", ignoreDuplicates: true },
        );

      if (memberError) {
        logDev("ADD CONVERSATION MEMBERS ERROR:", memberError);
      }
    };

    if (existingConversation?.id) {
      await addBothMembers(existingConversation.id as string);
      return existingConversation.id as string;
    }

    const { data: insertedConversation, error: insertError } = await supabase
      .from("conversations")
      .insert({
        request_id: request.id,
        content_id: request.content_id,
        participant_one_id: request.requester_id,
        participant_two_id: request.receiver_id,
        conversation_type: "collaboration",
        created_by: userId || null,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (insertError || !insertedConversation) {
      logDev("CREATE CONVERSATION ERROR:", insertError);
      notify(friendlyError(insertError, "Could not open the conversation."), "error");
      return null;
    }

    await addBothMembers(insertedConversation.id as string);

    return insertedConversation.id as string;
  };

  const handleUpdateStatus = async (
    request: UnifiedRequestView,
    nextStatus: RequestStatus,
  ) => {
    setUpdatingId(request.id);

    if (request.kind === "research") {
      const { error } = await supabase
        .from("research_requests")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (error) {
        logDev("UPDATE RESEARCH REQUEST ERROR:", error);
        notify(friendlyError(error, "Could not update the request."), "error");
        setUpdatingId(null);
        return;
      }

      if (nextStatus === "accepted") {
        await ensureResearchConversation(request);
      }
      if (request.requester_id) {
        await createNotification({
          recipientId: request.requester_id,
          actorId: userId,
          notificationType:
            nextStatus === "accepted" ? "request_accepted" : "request_declined",
          title:
            nextStatus === "accepted"
              ? "Collaboration request accepted"
              : "Collaboration request declined",
          body:
            nextStatus === "accepted"
              ? "Your collaboration request was accepted."
              : "Your collaboration request was declined.",
          linkUrl: nextStatus === "accepted" ? "/messages" : "/requests",
          contentId: request.content_id,
          requestId: request.id,
          requestKind: "research",
        });
      }
    }

    if (request.kind === "profile") {
      const { error } = await supabase
        .from("profile_requests")
        .update({
          status: nextStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", request.id);

      if (error) {
        logDev("UPDATE PROFILE REQUEST ERROR:", error);
        notify(friendlyError(error, "Could not update the request."), "error");
        setUpdatingId(null);
        return;
      }

      if (
        nextStatus === "accepted" &&
        request.requester_id &&
        request.receiver_id
      ) {
        const sortedIds = [request.requester_id, request.receiver_id].sort();

        const { error: connectionError } = await supabase
          .from("user_connections")
          .upsert(
            {
              user_one_id: sortedIds[0],
              user_two_id: sortedIds[1],
            },
            {
              onConflict: "user_one_id,user_two_id",
            },
          );

        if (connectionError) {
          logDev("CREATE CONNECTION ERROR:", connectionError);
          notify(friendlyError(connectionError, "Could not add the connection."), "error");
          setUpdatingId(null);
          return;
        }
      }
      if (request.requester_id) {
        await createNotification({
          recipientId: request.requester_id,
          actorId: userId,
          notificationType:
            nextStatus === "accepted" ? "request_accepted" : "request_declined",
          title:
            nextStatus === "accepted"
              ? "Profile request accepted"
              : "Profile request declined",
          body:
            nextStatus === "accepted"
              ? "Your profile request was accepted."
              : "Your profile request was declined.",
          linkUrl: "/requests",
          requestId: request.id,
          requestKind: "profile",
        });
      }
    }

    if (request.kind === "paper_access") {
      const now = new Date().toISOString();

      const updatePayload =
        nextStatus === "approved"
          ? {
              status: "approved",
              approved_at: now,
              rejected_at: null,
              updated_at: now,
            }
          : {
              status: "rejected",
              approved_at: null,
              rejected_at: now,
              updated_at: now,
            };

      const { error } = await supabase
        .from("paper_access_requests")
        .update(updatePayload)
        .eq("id", request.id);

      if (error) {
        logDev("UPDATE PAPER ACCESS REQUEST ERROR:", error);
        notify(friendlyError(error, "Could not update the request."), "error");
        setUpdatingId(null);
        return;
      }
      if (request.requester_id) {
        await createNotification({
          recipientId: request.requester_id,
          actorId: userId,
          notificationType:
            nextStatus === "approved"
              ? "paper_access_approved"
              : "paper_access_rejected",
          title:
            nextStatus === "approved"
              ? "Full paper access approved"
              : "Full paper access rejected",
          body:
            nextStatus === "approved"
              ? "Your full paper access request was approved. You can now open the paper from Feed."
              : "Your full paper access request was rejected.",
          linkUrl:
            nextStatus === "approved" && request.content_id
              ? `/feed?post=${request.content_id}`
              : "/requests",
          contentId: request.content_id,
          requestId: request.id,
          requestKind: "paper_access",
        });
      }
    }

    await loadRequests();

    if (typeof window !== "undefined") {
      window.dispatchEvent(new Event("researchgram:refresh-nav-counts"));
    }

    setUpdatingId(null);
  };

  const handleOpenMessages = async (request: UnifiedRequestView) => {
    if (request.kind !== "research") return;

    setOpeningConversationId(request.id);

    const conversationId = await ensureResearchConversation(request);

    setOpeningConversationId(null);

    if (conversationId) {
      router.push(`/messages?conversation=${conversationId}`);
    }
  };

  return (
    <RequestsUI
      loading={loading}
      userId={userId}
      activeTab={activeTab}
      receivedRequests={receivedRequests}
      sentRequests={sentRequests}
      updatingId={updatingId}
      openingConversationId={openingConversationId}
      setActiveTab={setActiveTab}
      handleUpdateStatus={handleUpdateStatus}
      handleOpenMessages={handleOpenMessages}
      handleGoToFeed={() => router.push("/feed")}
      handleGoToProfile={(profileId) =>
        router.push(`/researchers/${profileId}`)
      }
      getProfileName={getProfileName}
    />
  );
}
