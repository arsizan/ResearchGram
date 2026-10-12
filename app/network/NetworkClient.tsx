"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import NetworkUI, {
  type NetworkPerson,
  type Profile,
  type UserConnection,
} from "./UI";
import { logDev } from "@/lib/log";
import { friendlyError, notify } from "@/lib/feedback";

export default function NetworkClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [startingConversationId, setStartingConversationId] = useState<
    string | null
  >(null);

  const [currentUserId, setCurrentUserId] = useState("");
  const [connections, setConnections] = useState<NetworkPerson[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  const loadNetwork = async () => {
   let authUser = null;

try {
  authUser = await getCurrentUserSafe();
} catch (error) {
  if (isAuthLockError(error)) {
    logDev("NETWORK AUTH LOCK ERROR:", error);
    setLoading(false);
    return;
  }

  logDev("NETWORK AUTH ERROR:", error);
  setLoading(false);
  return;
}

if (!authUser) {
  router.push("/auth/login");
  return;
}

const userId = authUser.id;
    setCurrentUserId(userId);

    const { data: connectionData, error: connectionError } = await supabase
      .from("user_connections")
      .select("id, user_one_id, user_two_id, created_at")
      .or(`user_one_id.eq.${userId},user_two_id.eq.${userId}`)
      .order("created_at", { ascending: false });

    if (connectionError) {
      logDev("FETCH NETWORK CONNECTIONS ERROR:", connectionError);
      setConnections([]);
      setLoading(false);
      return;
    }

    const rawConnections = (connectionData || []) as UserConnection[];

    if (rawConnections.length === 0) {
      setConnections([]);
      setLoading(false);
      return;
    }

    const otherUserIds = Array.from(
      new Set(
        rawConnections.map((connection) =>
          connection.user_one_id === userId
            ? connection.user_two_id
            : connection.user_one_id,
        ),
      ),
    );

    const { data: profilesData, error: profilesError } = await supabase
      .from("profiles")
      .select(
        "id, full_name, email, department, skills, interests, bio, profile_pic_url",
      )
      .in("id", otherUserIds);

    if (profilesError) {
      logDev("FETCH NETWORK PROFILES ERROR:", profilesError);
    }

    const profileMap = (profilesData || []).reduce(
      (acc, profile) => {
        acc[profile.id] = profile as Profile;
        return acc;
      },
      {} as Record<string, Profile>,
    );

    const normalized: NetworkPerson[] = rawConnections.map((connection) => {
      const otherUserId =
        connection.user_one_id === userId
          ? connection.user_two_id
          : connection.user_one_id;

      return {
        connection,
        profile: profileMap[otherUserId] || null,
      };
    });

    setConnections(normalized);
    setLoading(false);
  };

  const loadNetworkOnMount = useEffectEvent(() => {
    loadNetwork();
  });

  useEffect(() => {
    loadNetworkOnMount();
  }, []);

  const filteredConnections = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    if (!query) return connections;

    return connections.filter((item) => {
      const profile = item.profile;

      const searchableText = [
        profile?.full_name,
        profile?.email,
        profile?.department,
        profile?.skills,
        profile?.interests,
        profile?.bio,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchableText.includes(query);
    });
  }, [connections, searchQuery]);

  const handleStartDirectMessage = async (targetUserId: string) => {
    if (!currentUserId) {
      notify("You must be logged in to send messages.", "error");
      return;
    }

    if (targetUserId === currentUserId) {
      notify("You cannot message yourself.", "error");
      return;
    }

    setStartingConversationId(targetUserId);

    const { data: existingConversation, error: existingError } = await supabase
      .from("conversations")
      .select("id")
      .eq("conversation_type", "direct")
      .is("request_id", null)
      .is("content_id", null)
      .or(
        `and(participant_one_id.eq.${currentUserId},participant_two_id.eq.${targetUserId}),and(participant_one_id.eq.${targetUserId},participant_two_id.eq.${currentUserId})`,
      )
      .maybeSingle();

    if (existingError) {
      logDev("CHECK DIRECT CONVERSATION ERROR:", existingError);
      notify(friendlyError(existingError, "Could not open the chat."), "error");
      setStartingConversationId(null);
      return;
    }

    if (existingConversation) {
      await supabase
        .from("conversations")
        .update({
          updated_at: new Date().toISOString(),
        })
        .eq("id", existingConversation.id);

      router.push(`/messages?conversation=${existingConversation.id}`);
      return;
    }

    const [participantOneId, participantTwoId] =
      currentUserId < targetUserId
        ? [currentUserId, targetUserId]
        : [targetUserId, currentUserId];

    const { data: newConversation, error: createError } = await supabase
      .from("conversations")
      .insert({
        request_id: null,
        content_id: null,
        participant_one_id: participantOneId,
        participant_two_id: participantTwoId,
        conversation_type: "direct",
        created_by: currentUserId,
        updated_at: new Date().toISOString(),
      })
      .select("id")
      .single();

    if (createError || !newConversation) {
      logDev("CREATE DIRECT CONVERSATION ERROR:", createError);
      notify(friendlyError(createError, "Could not start conversation."), "error");
      setStartingConversationId(null);
      return;
    }

    // The Messages page lists conversations by membership, and message access
    // is checked against it, so both people need a member row (audit RG-10).
    const now = new Date().toISOString();
    const { error: memberError } = await supabase
      .from("conversation_members")
      .insert([
        {
          conversation_id: newConversation.id,
          user_id: currentUserId,
          role: "member",
          last_read_at: now,
        },
        {
          conversation_id: newConversation.id,
          user_id: targetUserId,
          role: "member",
          last_read_at: now,
        },
      ]);

    if (memberError) {
      logDev("CREATE DIRECT CONVERSATION MEMBERS ERROR:", memberError);
      notify(friendlyError(memberError, "Could not start the chat."), "error");
      setStartingConversationId(null);
      return;
    }

    router.push(`/messages?conversation=${newConversation.id}`);
  };

  return (
    <NetworkUI
      loading={loading}
      connections={connections}
      filteredConnections={filteredConnections}
      searchQuery={searchQuery}
      startingConversationId={startingConversationId}
      setSearchQuery={setSearchQuery}
      handleStartDirectMessage={handleStartDirectMessage}
      handleGoToResearchers={() => router.push("/researchers")}
      handleGoToProfile={(profileId) => router.push(`/researchers/${profileId}`)}
    />
  );
}