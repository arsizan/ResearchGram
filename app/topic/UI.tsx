"use client";

import AppNav from "@/components/AppNav";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import PostList from "@/components/posts/PostList";
import type { PostActions } from "@/lib/posts/usePostActions";
import type { Post } from "@/lib/posts/types";
import { ArrowLeft, FileQuestion, Hash, TrendingUp } from "lucide-react";

type TopicUIProps = {
  loading: boolean;
  topic: string;
  userId: string;
  fullName: string;
  profilePicUrl: string;
  posts: Post[];
  /** Comment, save, request, copy link, hide and report (lib/posts/usePostActions). */
  postActions: PostActions;
  handleGoBack: () => void;
  handleGoToResearcher: (profileId: string) => void;
  handleGoToRecommendations: (postId: string) => void;
};

// The post cards are the Feed's (components/posts/PostList.tsx, audit RG-24).
export default function TopicUI({
  loading,
  topic,
  userId,
  fullName,
  profilePicUrl,
  posts,
  postActions,
  handleGoBack,
  handleGoToResearcher,
  handleGoToRecommendations,
}: TopicUIProps) {
  if (loading) {
    return <ResearchGramSkeleton activePage="feed" variant="feed" />;
  }

  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="feed" />

      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6 space-y-4">
        {/* Back */}
        <button
          type="button"
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" aria-hidden="true" /> Back to feed
        </button>

        {/* Topic header */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Hash className="w-6 h-6 text-white" aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" aria-hidden="true" />
                <p className="text-[11px] font-bold text-primary uppercase tracking-widest">Trending Topic</p>
              </div>
              <h1 className="text-2xl font-extrabold text-foreground truncate">
                {topic || "Untitled topic"}
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {posts.length} post{posts.length === 1 ? "" : "s"} tagged with this topic
              </p>
            </div>
          </div>
        </div>

        {/* Posts */}
        {!topic ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <FileQuestion className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">No topic selected</p>
            <p className="text-xs text-muted-foreground mt-1">Pick a trending topic from the feed to explore its posts.</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <FileQuestion className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" aria-hidden="true" />
            <p className="text-sm font-semibold text-foreground">No posts for this topic yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              There are no visible posts tagged with “{topic}” right now.
            </p>
          </div>
        ) : (
          <PostList
            posts={posts}
            userId={userId}
            fullName={fullName}
            profilePicUrl={profilePicUrl}
            actions={postActions}
            activeTag={topic}
            onGoToResearcher={handleGoToResearcher}
            onGoToRecommendations={handleGoToRecommendations}
          />
        )}
      </div>
    </main>
  );
}
