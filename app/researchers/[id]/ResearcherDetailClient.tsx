"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import { fetchReadableTexts } from "@/lib/posts/loadPosts";
import ResearcherDetailUI, {
  type ConnectionStatus,
  type ResearcherProfile,
  type ResearchPost,
} from "./UI";

export default function ResearcherDetailClient() {
  const router = useRouter();
  const params = useParams();

  const researcherId = params.id as string;

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [profile, setProfile] = useState<ResearcherProfile | null>(null);
  const [posts, setPosts] = useState<ResearchPost[]>([]);
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("none");
  const [connecting, setConnecting] = useState(false);

  const loadConnectionStatus = async (
    currentUserId: string,
    targetUserId: string,
  ) => {
    if (currentUserId === targetUserId) {
      setConnectionStatus("self");
      return;
    }

    const { data: connections } = await supabase
      .from("user_connections")
      .select("id")
      .or(
        `and(user_one_id.eq.${currentUserId},user_two_id.eq.${targetUserId}),and(user_one_id.eq.${targetUserId},user_two_id.eq.${currentUserId})`,
      )
      .maybeSingle();

    if (connections) {
      setConnectionStatus("connected");
      return;
    }

    const { data: requestData } = await supabase
      .from("profile_requests")
      .select("requester_id, receiver_id, status")
      .eq("request_type", "connection")
      .eq("status", "pending")
      .or(
        `and(requester_id.eq.${currentUserId},receiver_id.eq.${targetUserId}),and(requester_id.eq.${targetUserId},receiver_id.eq.${currentUserId})`,
      )
      .maybeSingle();

    if (requestData) {
      if (requestData.requester_id === currentUserId) {
        setConnectionStatus("requested");
      } else {
        setConnectionStatus("received");
      }

      return;
    }

    setConnectionStatus("none");
  };

  useEffect(() => {
    let cancelled = false;

    const loadResearcherProfile = async () => {
      try {
        const authUser = await getCurrentUserSafe();

        if (!authUser) {
          router.push("/auth/login");
          return;
        }

        if (cancelled) return;

        setCurrentUserId(authUser.id);
        await loadConnectionStatus(authUser.id, researcherId);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select(
            "id, email, full_name, department, skills, interests, bio, profile_pic_url, cover_photo_url",
          )
          .eq("id", researcherId)
          .single();

        if (cancelled) return;

        if (profileError) {
          logDev("FETCH RESEARCHER PROFILE ERROR:", profileError);
          setProfile(null);
          return;
        }

        setProfile(profileData as ResearcherProfile);

        // The full text comes only for posts this reader may see (RG-07).
        const { data: postData, error: postError } = await supabase
          .from("contents")
          .select("id, title, abstract, post_type, created_at")
          .eq("user_id", researcherId)
          .order("created_at", { ascending: false })
          .limit(10);

        if (postError) {
          logDev("FETCH RESEARCHER POSTS ERROR:", postError);
          if (!cancelled) setPosts([]);
          return;
        }

        const rows = (postData || []) as Omit<ResearchPost, "content">[];
        // If the texts cannot be loaded, the titles and abstracts still show.
        const texts = (await fetchReadableTexts(rows.map((row) => row.id))) ?? {};

        if (!cancelled) {
          setPosts(rows.map((row) => ({ ...row, content: texts[row.id] ?? null })));
        }
      } catch (error) {
        if (isAuthLockError(error)) {
          logDev("RESEARCHER AUTH LOCK ERROR:", error);
          return;
        }

        logDev("RESEARCHER LOAD ERROR:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    if (researcherId) {
      loadResearcherProfile();
    }

    return () => {
      cancelled = true;
    };
  }, [researcherId, router]);

  const handleSendConnectionRequest = async () => {
    if (!currentUserId || !profile) return;

    if (currentUserId === profile.id) {
      notify("You cannot connect with yourself.", "info");
      return;
    }

    setConnecting(true);

    const { error } = await supabase.from("profile_requests").insert({
      requester_id: currentUserId,
      receiver_id: profile.id,
      request_type: "connection",
      message: "I would like to connect with you on ResearchGram.",
      status: "pending",
    });

    if (error) {
      logDev("SEND PROFILE CONNECTION REQUEST ERROR:", error);
      notify(
        error.code === "23505"
          ? "You already sent a connection request."
          : friendlyError(error, "Could not send the connection request."),
        "error",
      );
      setConnecting(false);
      return;
    }

    setConnectionStatus("requested");
    setConnecting(false);
    notify("Connection request sent.", "success");
  };

  return (
    <ResearcherDetailUI
      loading={loading}
      currentUserId={currentUserId}
      profile={profile}
      posts={posts}
      connectionStatus={connectionStatus}
      connecting={connecting}
      handleSendConnectionRequest={handleSendConnectionRequest}
      handleBackToResearchers={() => router.push("/researchers")}
      handleGoToProfile={() => router.push("/profile")}
      handleGoToFeed={() => router.push("/feed")}
    />
  );
}