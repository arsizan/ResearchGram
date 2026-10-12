"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { supabase } from "@/lib/supabase";
import type { SearchResult } from "@/lib/scholar/types";
import DiscoverUI from "./UI";
import { logDev } from "@/lib/log";

export default function DiscoverClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const urlQuery = searchParams.get("q") || "";

  const [checkingAuth, setCheckingAuth] = useState(true);
  const [query, setQuery] = useState(urlQuery);
  const [searching, setSearching] = useState(false);
  const [result, setResult] = useState<SearchResult | null>(null);
  const [errorMessage, setErrorMessage] = useState("");

  const isMountedRef = useRef(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const check = async () => {
      try {
        const authUser = await getCurrentUserSafe();
        if (!authUser) {
          router.push("/auth/login");
          return;
        }
      } catch (error) {
        if (isAuthLockError(error)) return;
        logDev("DISCOVER AUTH ERROR:", error);
      } finally {
        if (isMountedRef.current) setCheckingAuth(false);
      }
    };

    check();
  }, [router]);

  /**
   * The URL is the source of truth, so a shared link reproduces the same search.
   * React's documented way to sync state to a changing input is to adjust during
   * render rather than in an effect — no second render pass, and no setState
   * inside an effect body.
   */
  const [lastUrlQuery, setLastUrlQuery] = useState(urlQuery);
  if (urlQuery !== lastUrlQuery) {
    setLastUrlQuery(urlQuery);
    setQuery(urlQuery);
    if (!urlQuery) {
      setResult(null);
      setErrorMessage("");
    }
  }

  useEffect(() => {
    const trimmed = urlQuery.trim();
    if (!trimmed) return;

    let cancelled = false;

    const run = async () => {
      // Reading the session first means nothing is set synchronously in the
      // effect body, which is what keeps this off React's cascading-render path.
      const { data } = await supabase.auth.getSession();
      if (cancelled || !isMountedRef.current) return;

      const accessToken = data.session?.access_token;
      if (!accessToken) {
        setErrorMessage("Your session expired. Sign in again to keep searching.");
        return;
      }

      setSearching(true);
      setErrorMessage("");

      try {
        // The route validates this token server-side; it never leaves our origin.
        const response = await fetch(
          `/api/research?q=${encodeURIComponent(trimmed)}`,
          { headers: { Authorization: `Bearer ${accessToken}` } },
        );

        const payload = await response.json();
        if (cancelled || !isMountedRef.current) return;

        if (!response.ok) {
          setErrorMessage(payload?.error || "Search failed. Please try again.");
          setResult(null);
          return;
        }

        setResult(payload as SearchResult);
      } catch {
        if (!cancelled && isMountedRef.current) {
          setErrorMessage(
            "Could not reach the search service. Check your connection.",
          );
        }
      } finally {
        if (!cancelled && isMountedRef.current) setSearching(false);
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [urlQuery]);

  const handleSubmit = () => {
    const trimmed = query.trim();
    router.push(trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : "/discover");
  };

  return (
    <DiscoverUI
      checkingAuth={checkingAuth}
      query={query}
      searching={searching}
      result={result}
      errorMessage={errorMessage}
      setQuery={setQuery}
      handleSubmit={handleSubmit}
      handleExampleSearch={(term) =>
        router.push(`/discover?q=${encodeURIComponent(term)}`)
      }
    />
  );
}
