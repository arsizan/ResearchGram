"use client";

import { useCallback, useEffect, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import NotificationBell from "@/components/NotificationBell";
import {
  Search,
  Home,
  Users,
  UserPlus,
  MessageSquare,
  User,
  BookOpen,
  GitBranch,
} from "lucide-react";

type ActivePage =
  | "feed"
  | "researchers"
  | "network"
  | "requests"
  | "messages"
  | "profile"
  | "notifications"
  | "mentorship"
  | "workspace"
  | "search";

type AppNavProps = {
  activePage: ActivePage;
};

export default function AppNav({ activePage }: AppNavProps) {
  const router = useRouter();

  const [userId, setUserId] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState<string | null>(null);
  const [userInitials, setUserInitials] = useState("U");
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);
  const [searchText, setSearchText] = useState("");

  const loadCounts = useCallback(async (currentUserId: string) => {
    if (!currentUserId) {
      setPendingRequestCount(0);
      setUnreadMessageCount(0);
      return;
    }

    const [researchResult, profileResult, paperAccessResult] =
      await Promise.all([
        supabase
          .from("research_requests")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", currentUserId)
          .eq("status", "pending"),
        supabase
          .from("profile_requests")
          .select("id", { count: "exact", head: true })
          .eq("receiver_id", currentUserId)
          .eq("status", "pending"),
        supabase
          .from("paper_access_requests")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", currentUserId)
          .eq("status", "pending"),
      ]);

    if (researchResult.error)
      console.log("NAV RESEARCH REQUEST COUNT ERROR:", researchResult.error);
    if (profileResult.error)
      console.log("NAV PROFILE REQUEST COUNT ERROR:", profileResult.error);
    if (paperAccessResult.error)
      console.log(
        "NAV PAPER ACCESS REQUEST COUNT ERROR:",
        paperAccessResult.error,
      );

    setPendingRequestCount(
      (researchResult.count || 0) +
        (profileResult.count || 0) +
        (paperAccessResult.count || 0),
    );

    // Unread message count
    const { data: conversations, error: conversationError } = await supabase
      .from("conversations")
      .select("id")
      .or(
        `participant_one_id.eq.${currentUserId},participant_two_id.eq.${currentUserId}`,
      );

    if (conversationError) {
      console.log("NAV CONVERSATION COUNT ERROR:", conversationError);
      setUnreadMessageCount(0);
      return;
    }

    const conversationIds = (conversations || []).map((c) => c.id);
    if (conversationIds.length === 0) {
      setUnreadMessageCount(0);
      return;
    }

    const { count: unreadCount, error: unreadError } = await supabase
      .from("messages")
      .select("id", { count: "exact", head: true })
      .in("conversation_id", conversationIds)
      .neq("sender_id", currentUserId)
      .is("read_at", null)
      .eq("is_deleted", false);

    if (unreadError) {
      console.log("NAV UNREAD MESSAGE COUNT ERROR:", unreadError);
      setUnreadMessageCount(0);
      return;
    }

    setUnreadMessageCount(unreadCount || 0);
  }, []);

  // Load profile (name + pic) for avatar
  const loadProfile = useCallback(async (currentUserId: string) => {
    const { data: profile } = await supabase
      .from("profiles")
      .select("profile_pic_url, full_name")
      .eq("id", currentUserId)
      .maybeSingle();

    if (profile) {
      setProfilePicUrl(profile.profile_pic_url);
      if (profile.full_name) {
        const parts = String(profile.full_name).trim().split(/\s+/);
        const initials = (parts[0]?.[0] || "") + (parts[1]?.[0] || "");
        setUserInitials(initials.toUpperCase() || "U");
      }
    }
  }, []);

  // Initial load
 // Initial auth load + auth state listener
useEffect(() => {
  let mounted = true;
  let unsubscribe: (() => void) | undefined;

  const loadUserData = async (currentUserId: string) => {
    try {
      await Promise.all([
        loadCounts(currentUserId),
        loadProfile(currentUserId),
      ]);
    } catch (error) {
      console.log("APP NAV USER DATA ERROR:", error);
    }
  };

  const setupAuth = async () => {
    try {
      // IMPORTANT:
      // Finish the initial auth request BEFORE registering
      // onAuthStateChange.
      const user = await getCurrentUserSafe();

      if (!mounted) return;

      if (!user) {
        setUserId("");
        setPendingRequestCount(0);
        setUnreadMessageCount(0);
      } else {
        setUserId(user.id);

        await loadUserData(user.id);

        if (!mounted) return;
      }
    } catch (error) {
      if (!mounted) return;

      if (isAuthLockError(error)) {
        console.log("APP NAV AUTH LOCK ERROR:", error);
      } else {
        console.log("APP NAV AUTH ERROR:", error);
      }
    }

    if (!mounted) return;

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      const nextUserId = session?.user?.id || "";

      setUserId(nextUserId);

      if (!nextUserId) {
        setPendingRequestCount(0);
        setUnreadMessageCount(0);
        return;
      }

      // IMPORTANT:
      // Never perform Supabase DB calls directly inside
      // the auth callback. Let the callback finish first.
      window.setTimeout(() => {
        if (!mounted) return;

        void loadUserData(nextUserId);
      }, 0);
    });

    unsubscribe = () => subscription.unsubscribe();
  };

  void setupAuth();

  return () => {
    mounted = false;
    unsubscribe?.();
  };
}, [loadCounts, loadProfile]);

  // Realtime count refresh
  useEffect(() => {
    if (!userId) return;

    const refreshCounts = () => loadCounts(userId);

    window.addEventListener("focus", refreshCounts);
    window.addEventListener("researchgram:refresh-nav-counts", refreshCounts);

    const channel = supabase
      .channel(`app-nav-live-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "messages" },
        refreshCounts,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "research_requests",
          filter: `receiver_id=eq.${userId}`,
        },
        refreshCounts,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "profile_requests",
          filter: `receiver_id=eq.${userId}`,
        },
        refreshCounts,
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "paper_access_requests",
          filter: `owner_id=eq.${userId}`,
        },
        refreshCounts,
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "conversations" },
        refreshCounts,
      )
      .subscribe();

    return () => {
      window.removeEventListener("focus", refreshCounts);
      window.removeEventListener(
        "researchgram:refresh-nav-counts",
        refreshCounts,
      );
      supabase.removeChannel(channel);
    };
  }, [userId, loadCounts]);

  const handleGlobalSearch = (e?: React.FormEvent) => {
    e?.preventDefault();
    const value = searchText.trim();
    router.push(value ? `/search?q=${encodeURIComponent(value)}` : "/search");
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/auth/login");
  };

  const nav: {
    id: ActivePage;
    label: string;
    icon: typeof Home;
    badge?: number;
  }[] = [
    { id: "feed", label: "Feed", icon: Home },
    { id: "researchers", label: "Researchers", icon: Users },
    { id: "network", label: "Network", icon: GitBranch },
    {
      id: "requests",
      label: "Requests",
      icon: UserPlus,
      badge: pendingRequestCount,
    },
    {
      id: "messages",
      label: "Messages",
      icon: MessageSquare,
      badge: unreadMessageCount,
    },
    { id: "profile", label: "Profile", icon: User },
  ];

  const routeFor = (id: ActivePage) => (id === "feed" ? "/feed" : `/${id}`);

  return (
    <>
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur border-b border-border shadow-sm">
        <div
          className="max-w-[1440px] mx-auto px-4 lg:px-6 flex items-center gap-3 lg:gap-4"
          style={{ height: 60 }}
        >
        {/* Logo */}
<button
  onClick={() => router.push("/feed")}
  className="flex items-center gap-2.5 flex-shrink-0"
>
  <img
    src="/logos/researchgram-rg-logo.png"
    alt="ResearchGram logo"
    className="h-9 w-9 object-contain"
  />

  <span className="font-extrabold text-lg tracking-tight text-foreground hidden sm:block">
    Research<span className="text-primary">Gram</span>
  </span>
</button>

          {/* Search */}
          <form
            onSubmit={handleGlobalSearch}
            className="flex-1 max-w-sm relative"
          >
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search researchers, papers…"
              className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-xl border border-transparent focus:border-primary focus:bg-white focus:outline-none transition-all"
            />
          </form>

          {/* Nav links (desktop) */}
          <div className="hidden lg:flex items-center gap-0.5 ml-1">
            {nav.map(({ id, label, icon: Icon, badge }) => {
              const active = activePage === id;
              return (
                <button
                  key={id}
                  onClick={() => router.push(routeFor(id))}
                  className={`relative flex flex-col items-center gap-0.5 px-3 py-1.5 rounded-xl text-[11px] font-semibold tracking-wide transition-all ${
                    active
                      ? "text-primary bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  {label}
                  {badge && badge > 0 ? (
                    <span className="absolute top-0 right-0 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center ring-2 ring-white">
                      {badge > 99 ? "99+" : badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>

          {/* Right controls */}
          <div className="flex items-center gap-1.5 ml-auto flex-shrink-0">
            <NotificationBell />

            <button
              onClick={handleLogout}
              className="hidden sm:block px-3 py-2 text-xs font-semibold rounded-xl text-red-600 hover:bg-red-50 transition-colors"
            >
              Logout
            </button>

            <button
              onClick={() => router.push("/profile")}
              className="w-9 h-9 rounded-full overflow-hidden hover:ring-2 hover:ring-primary hover:ring-offset-1 transition-all flex-shrink-0 flex items-center justify-center text-white text-sm font-bold"
              style={{ backgroundColor: "#4f46e5" }}
            >
              {profilePicUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={profilePicUrl}
                  alt="Profile"
                  className="w-full h-full object-cover"
                />
              ) : (
                userInitials
              )}
            </button>
          </div>
        </div>
      </nav>

      {/* Mobile bottom nav */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur border-t border-border">
        <div
          className="flex items-center justify-around px-2 py-1"
          style={{ paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))" }}
        >
          {nav.map(({ id, label, icon: Icon, badge }) => (
            <button
              key={id}
              onClick={() => router.push(routeFor(id))}
              className={`relative flex flex-col items-center gap-0.5 px-3 py-2 rounded-xl transition-all ${
                activePage === id ? "text-primary" : "text-muted-foreground"
              }`}
            >
              <Icon className="w-5 h-5" />
              <span className="text-[10px] font-semibold">{label}</span>
              {badge && badge > 0 ? (
                <span className="absolute top-1 right-2 min-w-[16px] h-[16px] px-1 rounded-full bg-red-500 text-white text-[9px] font-bold flex items-center justify-center">
                  {badge > 99 ? "99+" : badge}
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </nav>
    </>
  );
}
