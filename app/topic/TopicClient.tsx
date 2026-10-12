"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { supabase } from "@/lib/supabase";
import { logDev } from "@/lib/log";
import { friendlyError, notify } from "@/lib/feedback";
import {
  POST_COLUMNS,
  hydratePosts,
  withoutHiddenPosts,
  type PostRow,
} from "@/lib/posts/loadPosts";
import { usePostActions } from "@/lib/posts/usePostActions";
import type { Post } from "@/lib/posts/types";
import TopicUI from "./UI";

const TOPIC_FETCH_LIMIT = 100;

// Posts tagged with one keyword. Loading and the post actions are shared with
// the Feed (lib/posts, audit RG-24).
export default function TopicClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = (searchParams.get("tag") || "").trim();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);

  // Clicking another keyword keeps this page mounted: show the loading view
  // instead of the previous topic's posts under the new heading.
  const [shownTopic, setShownTopic] = useState(topic);
  if (shownTopic !== topic) {
    setShownTopic(topic);
    setLoading(true);
    setPosts([]);
  }

  // The topic can change while a load is running; only the newest one may
  // update the list.
  const requestCounterRef = useRef(0);

  const fetchPosts = useCallback(async (activeUserId: string | undefined, tag: string) => {
    const requestId = ++requestCounterRef.current;
    const isCurrent = () => requestId === requestCounterRef.current;

    if (!tag) {
      setPosts([]);
      return;
    }

    const { data: contents, error: contentError } = await supabase
      .from("contents")
      .select(POST_COLUMNS)
      .ilike("keywords", `%${tag}%`)
      .order("created_at", { ascending: false })
      .limit(TOPIC_FETCH_LIMIT);

    if (contentError) {
      logDev("TOPIC FETCH CONTENTS ERROR:", contentError);
      if (isCurrent()) notify(friendlyError(contentError, "Could not load the posts for this topic."), "error");
      return;
    }

    // Keep only posts that actually contain the exact keyword token.
    const normalizedTag = tag.toLowerCase();
    const tagged = ((contents || []) as PostRow[]).filter((item) =>
      (item.keywords || "")
        .split(/[,;]/)
        .map((k) => k.trim().toLowerCase())
        .includes(normalizedTag),
    );

    const visibleRows = await withoutHiddenPosts(tagged, activeUserId);

    if (visibleRows.length === 0) {
      if (isCurrent()) setPosts([]);
      return;
    }

    const hydrated = await hydratePosts(visibleRows, activeUserId);

    // Files or texts could not be loaded, or a newer load started: keep what is shown.
    if (!hydrated || !isCurrent()) return;

    setPosts(hydrated);
  }, []);

  const postActions = usePostActions({
    userId,
    fullName,
    posts,
    refresh: () => fetchPosts(userId, topic),
  });

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

        const currentUserId = authUser.id;
        setUserId(currentUserId);

        const { data: profileData, error: profileError } = await supabase
          .from("profiles")
          .select("full_name, profile_pic_url")
          .eq("id", currentUserId)
          .maybeSingle();

        if (profileError) {
          logDev("TOPIC PROFILE ERROR:", profileError);
        }

        if (cancelled) return;

        setFullName(profileData?.full_name || "");
        setProfilePicUrl(profileData?.profile_pic_url || "");

        await fetchPosts(currentUserId, topic);
      } catch (error) {
        if (isAuthLockError(error)) {
          logDev("TOPIC AUTH LOCK ERROR:", error);
          return;
        }

        logDev("TOPIC LOAD ERROR:", error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [router, topic, fetchPosts]);

  return (
    <TopicUI
      loading={loading}
      topic={topic}
      userId={userId}
      fullName={fullName}
      profilePicUrl={profilePicUrl}
      posts={posts}
      postActions={postActions}
      handleGoBack={() => router.push("/feed")}
      handleGoToResearcher={(profileId) => router.push(`/researchers/${profileId}`)}
      handleGoToRecommendations={(postId) => router.push(`/recommendations?postId=${postId}`)}
    />
  );
}
