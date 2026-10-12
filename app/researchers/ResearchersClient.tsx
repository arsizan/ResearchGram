"use client";

import { useEffect, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import ResearchersUI, {
  type ConnectionStatus,
  type ResearcherProfile,
} from "./UI";

// The directory loads 30 people at a time and searches in the database
// (browse_researchers, audit RG-06); before, it downloaded every profile.
// Each "Load more" asks only for the next 30, so there is no upper limit.
const PAGE_SIZE = 30;

type ConnectionRow = { user_one_id: string; user_two_id: string };
type RequestRow = { requester_id: string; receiver_id: string };

export default function ResearchersClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [currentUserId, setCurrentUserId] = useState("");
  const [profiles, setProfiles] = useState<ResearcherProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [appliedQuery, setAppliedQuery] = useState("");
  // The search the list on screen belongs to. While a new search is loading
  // it differs from appliedQuery, and "Load more" waits.
  const [listQuery, setListQuery] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const loadingMoreRef = useRef(false);
  const [connectionStatusMap, setConnectionStatusMap] = useState<
    Record<string, ConnectionStatus>
  >({});
  const [connectingId, setConnectingId] = useState<string | null>(null);
  const requestCounterRef = useRef(0);

  // Who I am, and my connections and pending requests (for the buttons).
  useEffect(() => {
    let cancelled = false;

    const loadMe = async () => {
      try {
        const authUser = await getCurrentUserSafe();

        if (!authUser) {
          router.push("/auth/login");
          return;
        }

        if (cancelled) return;

        const activeUserId = authUser.id;
        setCurrentUserId(activeUserId);

        const [connectionResult, requestResult] = await Promise.all([
          supabase
            .from("user_connections")
            .select("user_one_id, user_two_id")
            .or(`user_one_id.eq.${activeUserId},user_two_id.eq.${activeUserId}`),
          supabase
            .from("profile_requests")
            .select("requester_id, receiver_id, status")
            .eq("request_type", "connection")
            .eq("status", "pending")
            .or(`requester_id.eq.${activeUserId},receiver_id.eq.${activeUserId}`),
        ]);

        if (connectionResult.error) {
          logDev("FETCH CONNECTIONS ERROR:", connectionResult.error);
        }

        if (requestResult.error) {
          logDev("FETCH PROFILE REQUESTS ERROR:", requestResult.error);
        }

        const statusMap: Record<string, ConnectionStatus> = {};

        ((connectionResult.data || []) as ConnectionRow[]).forEach((connection) => {
          const otherId =
            connection.user_one_id === activeUserId
              ? connection.user_two_id
              : connection.user_one_id;
          statusMap[otherId] = "connected";
        });

        ((requestResult.data || []) as RequestRow[]).forEach((request) => {
          if (request.requester_id === activeUserId) {
            statusMap[request.receiver_id] = "requested";
          }

          if (request.receiver_id === activeUserId) {
            statusMap[request.requester_id] = "received";
          }
        });

        if (!cancelled) setConnectionStatusMap(statusMap);
      } catch (error) {
        logDev(isAuthLockError(error) ? "RESEARCHERS AUTH LOCK ERROR:" : "RESEARCHERS LOAD ERROR:", error);
        if (cancelled) return;
        // Without this the page would show its loading screen forever.
        setLoading(false);
        notify("Could not load the researcher directory. Reload the page to try again.", "error");
      }
    };

    loadMe();

    return () => {
      cancelled = true;
    };
  }, [router]);

  // Search waits until typing pauses.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setAppliedQuery(searchQuery.trim());
    }, 300);

    return () => window.clearTimeout(timer);
  }, [searchQuery]);

  // One page of the directory: people matching the search, by name, with one
  // extra row to know whether more exist.
  const fetchPage = (query: string, skip: number) =>
    supabase.rpc("browse_researchers", {
      search_text: query,
      max_results: PAGE_SIZE + 1,
      skip_results: skip,
    });

  // The first page, whenever the search changes. Only the newest request may
  // update the list.
  useEffect(() => {
    if (!currentUserId) return;

    const requestId = ++requestCounterRef.current;

    const loadFirstPage = async () => {
      const { data, error } = await fetchPage(appliedQuery, 0);

      if (requestId !== requestCounterRef.current) return;

      if (error) {
        logDev("FETCH RESEARCHERS ERROR:", error);
        notify(friendlyError(error, "Could not load researchers."), "error");
      } else {
        const rows = (data || []) as ResearcherProfile[];
        setProfiles(rows.slice(0, PAGE_SIZE));
        setHasMore(rows.length > PAGE_SIZE);
        setListQuery(appliedQuery);
      }

      setLoading(false);
    };

    loadFirstPage();
  }, [currentUserId, appliedQuery]);

  // The next 30 after the ones on screen, added to the end.
  const handleLoadMore = async () => {
    if (!currentUserId || loadingMoreRef.current || listQuery !== appliedQuery) return;

    const requestId = requestCounterRef.current;
    const query = listQuery;
    const skip = profiles.length;

    loadingMoreRef.current = true;
    setLoadingMore(true);

    try {
      const { data, error } = await fetchPage(query, skip);

      // A new search replaced the list meanwhile.
      if (requestId !== requestCounterRef.current) return;

      if (error) {
        logDev("FETCH MORE RESEARCHERS ERROR:", error);
        notify(friendlyError(error, "Could not load more researchers."), "error");
        return;
      }

      const rows = (data || []) as ResearcherProfile[];
      setProfiles((current) => {
        const shown = new Set(current.map((profile) => profile.id));
        return [...current, ...rows.slice(0, PAGE_SIZE).filter((profile) => !shown.has(profile.id))];
      });
      setHasMore(rows.length > PAGE_SIZE);
    } finally {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    }
  };

  const handleSendConnectionRequest = async (receiverId: string) => {
    if (!currentUserId) {
      notify("Log in to connect with researchers.", "error");
      return;
    }

    if (receiverId === currentUserId) {
      notify("You cannot connect with yourself.", "info");
      return;
    }

    setConnectingId(receiverId);

    const { error } = await supabase.from("profile_requests").insert({
      requester_id: currentUserId,
      receiver_id: receiverId,
      request_type: "connection",
      message: "I would like to connect with you on ResearchGram.",
      status: "pending",
    });

    if (error) {
      logDev("SEND CONNECTION REQUEST ERROR:", error);
      notify(
        error.code === "23505"
          ? "You already sent a connection request."
          : friendlyError(error, "Could not send the connection request."),
        "error",
      );
      setConnectingId(null);
      return;
    }

    setConnectionStatusMap((prev) => ({
      ...prev,
      [receiverId]: "requested",
    }));

    setConnectingId(null);
    notify("Connection request sent.", "success");
  };

  return (
    <ResearchersUI
      loading={loading}
      currentUserId={currentUserId}
      searchQuery={searchQuery}
      filteredProfiles={profiles}
      connectionStatusMap={connectionStatusMap}
      connectingId={connectingId}
      hasMore={hasMore && listQuery === appliedQuery}
      loadingMore={loadingMore}
      handleLoadMore={handleLoadMore}
      setSearchQuery={setSearchQuery}
      handleSendConnectionRequest={handleSendConnectionRequest}
      handleGoToProfile={() => router.push("/profile")}
      handleGoToResearcher={(profileId) =>
        router.push(`/researchers/${profileId}`)
      }
    />
  );
}
