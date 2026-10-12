"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logDev } from "@/lib/log";
import SearchUI, {
  type ContentSearchResult,
  type ProfileSearchResult,
  type SuggestedResearcher,
} from "./UI";

/*
 * Matching and ranking run in the database (search_researchers, search_posts,
 * suggest_researchers; audit RG-06). Before, this page downloaded 300 profiles
 * and 300 posts and filtered them here. The rules are the same.
 */

const PROFILE_SELECT =
  "id, full_name, email, department, profile_pic_url, bio, skills, interests, user_role, academic_level, batch, session, graduation_year, current_position, company_or_institution, research_area, expertise, mentorship_available, profile_completion_score";

type SuggestionRow = ProfileSearchResult & {
  suggestion_score: number;
  shared_interest_count: number;
  search_match_count: number;
  same_department: boolean;
};

type PostResultRow = Omit<ContentSearchResult, "owner">;

// Same wording as before the move to the database.
function suggestionReason(row: SuggestionRow) {
  const reasons: string[] = [];

  if (row.same_department) reasons.push("same department");
  if (row.user_role === "alumni") reasons.push("alumni");
  if (row.user_role === "faculty") reasons.push("faculty");
  if (row.mentorship_available) reasons.push("available for mentorship");

  const shared = Number(row.shared_interest_count) || 0;
  if (shared > 0) {
    reasons.push(`${shared} shared academic interest${shared > 1 ? "s" : ""}`);
  }

  if ((Number(row.search_match_count) || 0) > 0) {
    reasons.push("matches your recent searches");
  }

  if (reasons.length === 0) reasons.push("active research profile");

  return reasons.slice(0, 3).join(" · ");
}

export default function SearchClient() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const urlQuery = searchParams.get("q") || "";

  const [userId, setUserId] = useState("");
  const [query, setQuery] = useState(urlQuery);
  // The search box follows the address when it changes (back/forward, new search).
  const [queryFromUrl, setQueryFromUrl] = useState(urlQuery);
  if (queryFromUrl !== urlQuery) {
    setQueryFromUrl(urlQuery);
    setQuery(urlQuery);
  }

  const [profiles, setProfiles] = useState<ProfileSearchResult[]>([]);
  const [contents, setContents] = useState<ContentSearchResult[]>([]);
  const [suggestions, setSuggestions] = useState<SuggestedResearcher[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // Results shown are for this query; loading until it matches the address.
  const [loadedQuery, setLoadedQuery] = useState<string | null>(null);
  const loading = loadedQuery !== urlQuery;

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const loadSearch = useCallback(
    async (currentQuery: string, isCancelled: () => boolean) => {
      try {
        const authUser = await getCurrentUserSafe();

        if (!authUser) {
          router.push("/auth/login");
          return;
        }

        if (isCancelled()) return;

        const currentUserId = authUser.id;
        setUserId(currentUserId);

        // Suggestions use the searches made before this one, as before.
        const [recentSearchResult, suggestionResult] = await Promise.all([
          supabase
            .from("search_events")
            .select("query")
            .eq("user_id", currentUserId)
            .order("created_at", { ascending: false })
            .limit(10),
          supabase.rpc("suggest_researchers", { max_results: 8 }),
        ]);

        if (recentSearchResult.error) {
          logDev("SEARCH HISTORY ERROR:", recentSearchResult.error);
        }

        if (suggestionResult.error) {
          logDev("SEARCH SUGGESTIONS ERROR:", suggestionResult.error);
        }

        if (isCancelled()) return;

        setRecentSearches(
          ((recentSearchResult.data || []) as { query: string | null }[])
            .map((item) => item.query || "")
            .filter(Boolean),
        );

        setSuggestions(
          ((suggestionResult.data || []) as SuggestionRow[]).map((row) => ({
            ...row,
            suggestion_score: Number(row.suggestion_score) || 0,
            suggestion_reason: suggestionReason(row),
          })),
        );

        const q = currentQuery.trim();

        if (!q) {
          setProfiles([]);
          setContents([]);
          return;
        }

        const { error: searchEventError } = await supabase.from("search_events").insert({
          user_id: currentUserId,
          query: q,
          search_type: "global",
        });

        if (searchEventError) {
          logDev("SAVE SEARCH EVENT ERROR:", searchEventError);
        }

        const [profileResult, postResult] = await Promise.all([
          supabase.rpc("search_researchers", { search_text: q, max_results: 40 }),
          supabase.rpc("search_posts", { search_text: q, max_results: 40 }),
        ]);

        if (profileResult.error) {
          logDev("SEARCH PROFILES ERROR:", profileResult.error);
        }

        if (postResult.error) {
          logDev("SEARCH POSTS ERROR:", postResult.error);
        }

        const matchedPosts = (postResult.data || []) as PostResultRow[];
        const ownerIds = Array.from(
          new Set(
            matchedPosts
              .map((item) => item.user_id)
              .filter((item): item is string => Boolean(item)),
          ),
        );

        const ownerMap: Record<string, ProfileSearchResult> = {};

        if (ownerIds.length > 0) {
          const { data: ownerProfiles, error: ownerError } = await supabase
            .from("profiles")
            .select(PROFILE_SELECT)
            .in("id", ownerIds);

          if (ownerError) {
            logDev("SEARCH CONTENT OWNER ERROR:", ownerError);
          }

          ((ownerProfiles || []) as ProfileSearchResult[]).forEach((profile) => {
            ownerMap[profile.id] = profile;
          });
        }

        if (isCancelled()) return;

        setProfiles((profileResult.data || []) as ProfileSearchResult[]);
        setContents(
          matchedPosts.map((item) => ({
            ...item,
            owner: item.user_id ? ownerMap[item.user_id] || null : null,
          })),
        );
      } catch (error) {
        if (isAuthLockError(error)) {
          logDev("SEARCH AUTH LOCK ERROR:", error);
          return;
        }

        logDev("SEARCH LOAD ERROR:", error);
      } finally {
        if (!isCancelled()) setLoadedQuery(currentQuery);
      }
    },
    [router],
  );

  useEffect(() => {
    let cancelled = false;
    loadSearch(urlQuery, () => cancelled);
    return () => {
      cancelled = true;
    };
  }, [urlQuery, loadSearch]);

  const handleSearchSubmit = () => {
    const nextQuery = trimmedQuery;

    if (!nextQuery) {
      router.push("/search");
      return;
    }

    router.push(`/search?q=${encodeURIComponent(nextQuery)}`);
  };

  const handleOpenProfile = async (profileId: string, source = "search") => {
    if (userId && profileId !== userId) {
      await supabase.from("profile_view_events").insert({
        viewer_id: userId,
        viewed_profile_id: profileId,
        source,
      });
    }

    router.push(`/researchers/${profileId}`);
  };

  const handleOpenPost = (postId: string) => {
    router.push(`/feed?post=${postId}`);
  };

  return (
    <SearchUI
      loading={loading}
      query={query}
      profiles={profiles}
      contents={contents}
      suggestions={suggestions}
      recentSearches={recentSearches}
      setQuery={setQuery}
      handleSearchSubmit={handleSearchSubmit}
      handleOpenProfile={handleOpenProfile}
      handleOpenPost={handleOpenPost}
    />
  );
}
