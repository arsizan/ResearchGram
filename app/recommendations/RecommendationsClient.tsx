"use client";

import { useEffect, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import { fetchReadableTexts } from "@/lib/posts/loadPosts";
import RecommendationsUI, {
  type ExistingRequest,
  type Profile,
  type Recommendation,
  type ResearchPost,
} from "./UI";

// Scoring runs in the database (recommend_collaborators, audit RG-06): before,
// this page downloaded every profile and scored them here. Same rules; the
// reasons below keep their old wording.
type RecommendationRow = Profile & {
  score: number;
  matched_keywords: string[] | null;
  skill_keywords: string[] | null;
  same_department: boolean;
  detailed_bio: boolean;
};

function toRecommendation(row: RecommendationRow, existingRequest: ExistingRequest | null): Recommendation {
  const matchedKeywords = row.matched_keywords || [];
  const skillKeywords = row.skill_keywords || [];
  const reasons: string[] = [];

  if (matchedKeywords.length > 0) {
    reasons.push(`Matches research keywords: ${matchedKeywords.slice(0, 5).join(", ")}`);
  }

  if (skillKeywords.length > 0) {
    reasons.push(`Relevant skills/interests: ${skillKeywords.slice(0, 4).join(", ")}`);
  }

  if (row.same_department) {
    reasons.push(`Same department: ${row.department}`);
  }

  if (row.detailed_bio) {
    reasons.push("Has a detailed research profile");
  }

  if (reasons.length === 0) {
    reasons.push("General researcher profile; add more skills/interests for better matching");
  }

  return {
    profile: {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      department: row.department,
      skills: row.skills,
      interests: row.interests,
      bio: row.bio,
      profile_pic_url: row.profile_pic_url,
    },
    score: Number(row.score) || 0,
    reasons,
    matchedKeywords,
    existingRequest,
  };
}

const NO_ROWS: RecommendationRow[] = [];
const NO_REQUESTS: ExistingRequest[] = [];

export default function RecommendationsClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [myPosts, setMyPosts] = useState<ResearchPost[]>([]);
  const [selectedPostId, setSelectedPostId] = useState("");
  const [profileCount, setProfileCount] = useState(0);
  // Results are kept together with the post they belong to, so switching to
  // another idea never shows (or sends requests from) the previous idea's list.
  const [recommendationState, setRecommendationState] = useState<{
    postId: string;
    rows: RecommendationRow[];
  }>({ postId: "", rows: NO_ROWS });
  const [requestState, setRequestState] = useState<{
    postId: string;
    requests: ExistingRequest[];
  }>({ postId: "", requests: NO_REQUESTS });
  const [requestingId, setRequestingId] = useState<string | null>(null);

  const recommendationRows =
    recommendationState.postId === selectedPostId ? recommendationState.rows : NO_ROWS;
  const existingRequests =
    requestState.postId === selectedPostId ? requestState.requests : NO_REQUESTS;
  const findingMatches =
    Boolean(userId && selectedPostId) && recommendationState.postId !== selectedPostId;

  const rememberRequest = (postId: string, request: ExistingRequest) => {
    setRequestState((prev) => {
      if (prev.postId !== postId) return prev;
      if (prev.requests.some((item) => item.id === request.id)) return prev;
      return { postId, requests: [...prev.requests, request] };
    });
  };

  const selectedPost = useMemo(
    () => myPosts.find((post) => post.id === selectedPostId) || null,
    [myPosts, selectedPostId],
  );

  const existingRequestMap = useMemo(() => {
    const map = new Map<string, ExistingRequest>();

    existingRequests.forEach((request) => {
      map.set(request.receiver_id, request);
    });

    return map;
  }, [existingRequests]);

  const recommendations = useMemo(
    () =>
      selectedPost
        ? recommendationRows.map((row) =>
            toRecommendation(row, existingRequestMap.get(row.id) || null),
          )
        : [],
    [recommendationRows, selectedPost, existingRequestMap],
  );

  useEffect(() => {
  let cancelled = false;

  const load = async () => {
    try {
      const authUser = await getCurrentUserSafe();

      if (!authUser) {
        router.push("/auth/login");
        return;
      }

      if (cancelled) return;

      const activeUserId = authUser.id;
      setUserId(activeUserId);

      const urlPostId =
        typeof window !== "undefined"
          ? new URLSearchParams(window.location.search).get("postId")
          : null;

      const { data: postData, error: postError } = await supabase
        .from("contents")
        .select("id, user_id, title, post_type, created_at")
        .eq("user_id", activeUserId)
        .order("created_at", { ascending: false });

      if (postError) {
        logDev("MY POSTS ERROR:", postError);
        notify(friendlyError(postError, "Could not load your posts."), "error");
        return;
      }

      const postRows = (postData || []) as Omit<ResearchPost, "content">[];
      // If the texts cannot be loaded, the titles still show.
      const texts = (await fetchReadableTexts(postRows.map((post) => post.id))) ?? {};

      if (cancelled) return;

      const safePosts: ResearchPost[] = postRows.map((post) => ({
        ...post,
        content: texts[post.id] ?? null,
      }));
      setMyPosts(safePosts);

      if (safePosts.length > 0) {
        const matchingPost = urlPostId
          ? safePosts.find((post) => post.id === urlPostId)
          : null;

        setSelectedPostId(matchingPost?.id || safePosts[0].id);
      }

      // Only the number of profiles is needed here; matching happens in the database.
      const { count: otherProfileCount, error: countError } = await supabase
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .neq("id", activeUserId);

      if (countError) {
        logDev("PROFILE COUNT ERROR:", countError);
      }

      if (cancelled) return;

      setProfileCount(otherProfileCount || 0);
    } catch (error) {
      if (isAuthLockError(error)) {
        logDev("RECOMMENDATIONS AUTH LOCK ERROR:", error);
        return;
      }

      logDev("RECOMMENDATIONS LOAD ERROR:", error);
    } finally {
      if (!cancelled) {
        setLoading(false);
      }
    }
  };

  load();

  return () => {
    cancelled = true;
  };
}, [router]);

  useEffect(() => {
    if (!userId || !selectedPostId) return;

    let cancelled = false;
    const postId = selectedPostId;

    const loadRecommendations = async () => {
      const { data, error } = await supabase.rpc("recommend_collaborators", {
        post_id: postId,
        max_results: 12,
      });

      if (cancelled) return;

      if (error) {
        logDev("RECOMMENDATIONS ERROR:", error);
        notify(friendlyError(error, "Could not load recommendations."), "error");
      }

      setRecommendationState({ postId, rows: (data || []) as RecommendationRow[] });
    };

    loadRecommendations();

    return () => {
      cancelled = true;
    };
  }, [userId, selectedPostId]);

  useEffect(() => {
    if (!userId || !selectedPostId) return;

    let cancelled = false;
    const postId = selectedPostId;

    const loadRequests = async () => {
      const { data, error } = await supabase
        .from("research_requests")
        .select("id, receiver_id, status")
        .eq("content_id", postId)
        .eq("requester_id", userId)
        .eq("request_type", "collaboration");

      if (cancelled) return;

      if (error) {
        logDev("REQUEST LOAD ERROR:", error);
        return;
      }

      setRequestState({ postId, requests: (data || []) as ExistingRequest[] });
    };

    loadRequests();

    return () => {
      cancelled = true;
    };
  }, [userId, selectedPostId]);

const handleSendCollaborationRequest = async (receiver: Profile) => {
  if (!selectedPost) {
    notify("Select a research idea first.", "info");
    return;
  }

  if (!userId) {
    notify("Log in to send collaboration requests.", "error");
    return;
  }

  if (receiver.id === userId) {
    notify("You cannot send a request to yourself.", "info");
    return;
  }

  const existing = existingRequestMap.get(receiver.id);

  if (existing) {
    notify(
      existing.status === "pending"
        ? "You already sent a request to this researcher."
        : `You already have a ${existing.status} request with this researcher.`,
      "info",
    );
    return;
  }

  setRequestingId(receiver.id);

  const postTitle = selectedPost.title || "your research idea";

  const message = `Hi ${
    receiver.full_name || "Researcher"
  }, I found your profile relevant to my research post "${postTitle}". I would like to collaborate or discuss possible contribution areas.`;

  const { data: alreadyExists, error: existingCheckError } = await supabase
    .from("research_requests")
    .select("id, receiver_id, status")
    .eq("content_id", selectedPost.id)
    .eq("requester_id", userId)
    .eq("receiver_id", receiver.id)
    .eq("request_type", "collaboration")
    .maybeSingle();

  if (existingCheckError) {
    logDev("CHECK EXISTING RECOMMENDATION REQUEST ERROR:", existingCheckError);
  }

  if (alreadyExists) {
    rememberRequest(selectedPost.id, alreadyExists as ExistingRequest);

    setRequestingId(null);

    notify(
      alreadyExists.status === "pending"
        ? "You already sent a request to this researcher."
        : `You already have a ${alreadyExists.status} request with this researcher.`,
      "info",
    );

    return;
  }

  const { data: insertedRequest, error } = await supabase
    .from("research_requests")
    .insert({
      content_id: selectedPost.id,
      requester_id: userId,
      receiver_id: receiver.id,
      request_type: "collaboration",
      message,
      status: "pending",
    })
    .select("id, receiver_id, status")
    .single();

  if (error) {
    logDev("SEND REQUEST ERROR:", error);

    if (error.code === "23505") {
      notify("You already sent a request to this researcher for this post.", "info");
    } else {
      notify(friendlyError(error, "Could not send the request."), "error");
    }

    setRequestingId(null);
    return;
  }

  await createNotification({
    recipientId: receiver.id,
    actorId: userId,
    notificationType: "collaboration_request",
    title: "New collaboration request",
    body: `A researcher requested to collaborate with you on: ${postTitle}`,
    linkUrl: "/requests",
    contentId: selectedPost.id,
    requestId: insertedRequest?.id,
    requestKind: "research",
  });

  if (insertedRequest) rememberRequest(selectedPost.id, insertedRequest as ExistingRequest);

  setRequestingId(null);
  notify("Collaboration request sent.", "success");
};

  return (
    <RecommendationsUI
      loading={loading}
      myPosts={myPosts}
      profileCount={profileCount}
      selectedPostId={selectedPostId}
      selectedPost={selectedPost}
      recommendations={recommendations}
      findingMatches={findingMatches}
      requestingId={requestingId}
      setSelectedPostId={setSelectedPostId}
      handleSendCollaborationRequest={handleSendCollaborationRequest}
      handleGoToFeed={() => router.push("/feed")}
    />
  );
}