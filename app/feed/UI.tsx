
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import AppNav from "@/components/AppNav";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import PostList from "@/components/posts/PostList";
import { Avatar, formatFileSize, formatLabel } from "@/components/posts/PostParts";
import type { PostActions } from "@/lib/posts/usePostActions";
import type { PlatformAuthor, Post } from "@/lib/posts/types";
import {
  Search, Upload, Plus, ChevronDown, ChevronRight, X, MessageCircle, FileText, BookOpen, Star, TrendingUp, BarChart2, Award, GitBranch, Users, UserPlus, Globe, FileQuestion,
} from "lucide-react";

// Post types live in lib/posts/types.ts (shared with the Topic page, audit
// RG-24); re-exported so existing imports keep working.
export type {
  Attachment,
  Comment,
  ContentAuthor,
  PaperAccessRequestStatus,
  PlatformAuthor,
  Post,
  Profile,
} from "@/lib/posts/types";

type FeedUIProps = {
  loading: boolean;
  uploading: boolean;
  userId: string;
  fullName: string;
  profilePicUrl: string;
  title: string;
  content: string;
  abstract: string;
  postType: string;
  contentCategory: string;
  visibilityMode: string;
  fullPaperAccessMode: string;
  doi: string;
  keywords: string;
  fullPaperFile: File | null;
  posts: Post[];
  selectedFileNames: string[];
  coAuthorSearch: string;
  authorSuggestions: PlatformAuthor[];
  selectedPlatformAuthors: PlatformAuthor[];
  manualAuthorName: string;
  manualAuthors: string[];
  setTitle: (v: string) => void;
  setContent: (v: string) => void;
  setAbstract: (v: string) => void;
  setPostType: (v: string) => void;
  setContentCategory: (v: string) => void;
  setVisibilityMode: (v: string) => void;
  setFullPaperAccessMode: (v: string) => void;
  setDoi: (v: string) => void;
  setKeywords: (v: string) => void;
  setFiles: (files: File[]) => void;
  setFullPaperFile: (file: File | null) => void;
  setCoAuthorSearch: (v: string) => void;
  setManualAuthorName: (v: string) => void;
  handleAddPlatformAuthor: (profile: PlatformAuthor) => void;
  handleRemovePlatformAuthor: (profileId: string) => void;
  handleAddManualAuthor: () => void;
  handleRemoveManualAuthor: (name: string) => void;
  handleCreatePost: () => void;
  /** Comment, save, request, copy link, hide and report (lib/posts/usePostActions). */
  postActions: PostActions;
  handleGoToWorkspace: () => void;
  handleGoToMentorship: () => void;
  handleGoToResearcher: (profileId: string) => void;
  handleGoToRecommendations: (postId: string) => void;

  // "Load more posts" (audit RG-17).
  hasMorePosts?: boolean;
  loadingMorePosts?: boolean;
  handleLoadMorePosts?: () => void;
};

// ─── Constants (preserved + extended) ───────────────────────────────────────

const POST_TYPE_OPTIONS = [
  { label: "Research Note", value: "research_note" },
  { label: "Paper Draft", value: "paper_draft" },
  { label: "Published Paper", value: "published_paper" },
  { label: "Dataset", value: "dataset" },
  { label: "Presentation", value: "presentation" },
  { label: "Code / Project", value: "code_project" },
  { label: "Question", value: "question" },
  { label: "Announcement", value: "announcement" },
];

const CONTENT_CATEGORY_OPTIONS = [
  { label: "General Post", value: "general_post" },
  { label: "Research Paper", value: "research_paper" },
  { label: "Article", value: "article" },
  { label: "Dataset", value: "dataset" },
  { label: "Presentation", value: "presentation" },
  { label: "Code Project", value: "code_project" },
  { label: "Question", value: "question" },
  { label: "Announcement", value: "announcement" },
];

const VISIBILITY_OPTIONS = [
  { label: "Public — everyone can view the full post", value: "public" },
  { label: "Abstract only — public sees abstract first", value: "abstract_only" },
  { label: "Private — limited visibility", value: "private" },
];

const PAPER_ACCESS_OPTIONS = [
  { label: "Public full paper", value: "public" },
  { label: "Request required for full paper", value: "request_required" },
  { label: "Private full paper", value: "private" },
];

function getPlatformAuthorName(author: PlatformAuthor) {
  return author.full_name || author.email?.split("@")[0] || "ResearchGram User";
}

// ─── Main UI ─────────────────────────────────────────────────────────────────

export default function FeedUI({
  loading, uploading, userId, fullName, profilePicUrl,
  title, content, abstract, postType, contentCategory, visibilityMode, fullPaperAccessMode, doi, keywords, fullPaperFile,
  posts, selectedFileNames,
  coAuthorSearch, authorSuggestions, selectedPlatformAuthors, manualAuthorName, manualAuthors,
  setTitle, setContent, setAbstract, setPostType, setContentCategory, setVisibilityMode,
  setFullPaperAccessMode, setDoi, setKeywords, setFiles, setFullPaperFile,
  setCoAuthorSearch, setManualAuthorName,
  handleAddPlatformAuthor, handleRemovePlatformAuthor, handleAddManualAuthor, handleRemoveManualAuthor,
  handleCreatePost, postActions,
  handleGoToWorkspace, handleGoToMentorship, handleGoToResearcher, handleGoToRecommendations,
  hasMorePosts = false, loadingMorePosts = false, handleLoadMorePosts,
}: FeedUIProps) {
  const isPaperPost = contentCategory === "research_paper";

  const [composerOpen, setComposerOpen] = useState(false);
  // Post opened from a shared link (?post=...), highlighted in the list.
  const linkedPostId = useSearchParams().get("post");

  // Trending keywords from current posts
  const trendingKeywords = useMemo(() => {
    const counts: Record<string, number> = {};
    posts.forEach((p) => {
      (p.keywords || "").split(/[,;]/).forEach((k) => {
        const tag = k.trim();
        if (tag) counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 7).map(([tag, count]) => ({ tag, count }));
  }, [posts]);

  // URL-linked scroll. Only once per linked post: later changes to the list
  // ("Load more posts", new posts arriving) must not pull the page back to it.
  const linkedPostScrolledRef = useRef("");
  useEffect(() => {
    const postId = linkedPostId;
    if (!postId || linkedPostScrolledRef.current === postId) return;
    const t = window.setTimeout(() => {
      const el = document.getElementById(`post-${postId}`);
      if (el) {
        linkedPostScrolledRef.current = postId;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 400);
    return () => window.clearTimeout(t);
  }, [linkedPostId, posts.length]);

  // ── Loading state ─────────────────────────────────────────────────────────
if (loading) {
  return <ResearchGramSkeleton activePage="feed" variant="feed" />;
}

  // ── Composer collapsed strip ──────────────────────────────────────────────
  const ComposerStrip = (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-4 flex items-center gap-3">
      <Avatar name={fullName || "You"} picUrl={profilePicUrl} size="md" />
      <button
        onClick={() => setComposerOpen(true)}
        className="flex-1 text-left px-4 py-3 bg-muted rounded-xl text-sm text-muted-foreground hover:bg-slate-100 transition-colors"
      >
        Share a research update, paper, dataset, or question…
      </button>
      <button
        onClick={() => setComposerOpen(true)}
        className="flex-shrink-0 w-9 h-9 rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors flex items-center justify-center"
        aria-label="Create new post"
      >
        <Plus className="w-4 h-4" />
      </button>
    </div>
  );

  // ── Composer expanded ─────────────────────────────────────────────────────
  const ComposerExpanded = (
    <div className="bg-card rounded-2xl border border-border shadow-sm p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Avatar name={fullName || "You"} picUrl={profilePicUrl} size="md" />
          <div>
            <p className="text-sm font-bold text-foreground">{fullName || "Researcher"}</p>
            <p className="text-xs text-muted-foreground">Publishing as you</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setComposerOpen(false)}
          aria-label="Close the post editor"
          className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Category + Type */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="composer-category" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Content Category</label>
          <div className="relative">
            <select
              id="composer-category"
              value={contentCategory}
              onChange={(e) => {
                const value = e.target.value;
                setContentCategory(value);
                if (value === "research_paper") {
                  setPostType("paper_draft");
                  setVisibilityMode("abstract_only");
                  setFullPaperAccessMode("request_required");
                } else {
                  setVisibilityMode("public");
                  setFullPaperAccessMode("public");
                  setFullPaperFile(null);
                }
              }}
              className="w-full appearance-none pl-4 pr-8 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none font-semibold text-foreground cursor-pointer"
            >
              {CONTENT_CATEGORY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>

        <div>
          <label htmlFor="composer-post-type" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Post Type</label>
          <div className="relative">
            <select
              id="composer-post-type"
              value={postType}
              onChange={(e) => setPostType(e.target.value)}
              className="w-full appearance-none pl-4 pr-8 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none font-semibold text-foreground cursor-pointer"
            >
              {POST_TYPE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Title */}
      <input
        type="text"
        aria-label="Title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Research title or topic headline…"
        className="w-full px-4 py-3 text-sm font-semibold bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all placeholder:font-normal"
      />

      {/* Abstract (for research paper) */}
      {isPaperPost && (
        <textarea
          aria-label="Abstract"
          value={abstract}
          onChange={(e) => setAbstract(e.target.value)}
          placeholder="Abstract (required for research papers)…"
          rows={4}
          className="w-full px-4 py-3 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all resize-none leading-relaxed"
        />
      )}

      {/* Body */}
      <textarea
        aria-label={isPaperPost ? "Body or introduction" : "Post text"}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={isPaperPost ? "Body / introduction (optional)…" : "Share your update, findings, or question. Markdown supported…"}
        rows={5}
        className="w-full px-4 py-3 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all resize-none leading-relaxed"
      />

      {/* DOI + Keywords (for paper) */}
      {isPaperPost && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label htmlFor="composer-doi" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">DOI (optional)</label>
            <input
              id="composer-doi"
              type="text"
              value={doi}
              onChange={(e) => setDoi(e.target.value)}
              placeholder="10.1234/abcd5678"
              className="w-full px-4 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
            />
          </div>
          <div>
            <label htmlFor="composer-keywords" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Keywords</label>
            <input
              id="composer-keywords"
              type="text"
              value={keywords}
              onChange={(e) => setKeywords(e.target.value)}
              placeholder="NLP, Bangla, BERT, …"
              className="w-full px-4 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
            />
          </div>
        </div>
      )}

      {/* Visibility + Paper access */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div>
          <label htmlFor="composer-visibility" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Visibility</label>
          <div className="relative">
            <select
              id="composer-visibility"
              value={visibilityMode}
              onChange={(e) => setVisibilityMode(e.target.value)}
              className="w-full appearance-none pl-4 pr-8 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none cursor-pointer"
            >
              {VISIBILITY_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          </div>
        </div>
        {isPaperPost && (
          <div>
            <label htmlFor="composer-paper-access" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1.5 block">Full Paper Access</label>
            <div className="relative">
              <select
                id="composer-paper-access"
                value={fullPaperAccessMode}
                onChange={(e) => setFullPaperAccessMode(e.target.value)}
                className="w-full appearance-none pl-4 pr-8 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none cursor-pointer"
              >
                {PAPER_ACCESS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
        )}
      </div>

      {/* Co-authors */}
      <div className="space-y-2">
        <p id="composer-coauthors" className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest block">Co-authors</p>

        {/* Selected platform authors */}
        {selectedPlatformAuthors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {selectedPlatformAuthors.map((author) => (
              <span key={author.id} className="flex items-center gap-1.5 px-3 py-1.5 bg-accent text-primary text-xs font-medium rounded-lg border border-primary/20">
                <Avatar name={getPlatformAuthorName(author)} picUrl={author.profile_pic_url} size="xs" />
                {getPlatformAuthorName(author)}
                <button
                  type="button"
                  onClick={() => handleRemovePlatformAuthor(author.id)}
                  aria-label={`Remove ${getPlatformAuthorName(author)} from co-authors`}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Manual authors */}
        {manualAuthors.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {manualAuthors.map((name) => (
              <span key={name} className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground text-xs font-medium rounded-lg border border-border">
                {name}
                <button
                  type="button"
                  onClick={() => handleRemoveManualAuthor(name)}
                  aria-label={`Remove ${name} from co-authors`}
                  className="ml-0.5 hover:text-red-500 transition-colors"
                >
                  <X className="w-3 h-3" />
                </button>
              </span>
            ))}
          </div>
        )}

        {/* Search ResearchGram users */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input
            type="text"
            aria-label="Find co-authors on ResearchGram"
            aria-describedby="composer-coauthors"
            value={coAuthorSearch}
            onChange={(e) => setCoAuthorSearch(e.target.value)}
            placeholder="Search ResearchGram users by name, email, or department…"
            className="w-full pl-9 pr-4 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
          />
          {authorSuggestions.length > 0 && (
            <div className="absolute z-10 left-0 right-0 top-full mt-1 bg-card border border-border rounded-2xl shadow-lg overflow-hidden">
              {authorSuggestions.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleAddPlatformAuthor(s)}
                  className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-muted transition-colors"
                >
                  <Avatar name={getPlatformAuthorName(s)} picUrl={s.profile_pic_url} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-foreground truncate">{getPlatformAuthorName(s)}</p>
                    <p className="text-xs text-muted-foreground truncate">{s.department || s.email}</p>
                  </div>
                  <Plus className="w-4 h-4 text-primary flex-shrink-0" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Manual author input */}
        <div className="flex gap-2">
          <input
            type="text"
            aria-label="Name of a co-author who is not on ResearchGram"
            value={manualAuthorName}
            onChange={(e) => setManualAuthorName(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); handleAddManualAuthor(); } }}
            placeholder="Add external co-author by name (not on ResearchGram)…"
            className="flex-1 px-4 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none transition-all"
          />
          <button
            type="button"
            onClick={handleAddManualAuthor}
            className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-border hover:bg-muted transition-colors"
          >
            Add
          </button>
        </div>
      </div>

      {/* Attachments drop zone */}
      <div className="border-2 border-dashed border-border hover:border-primary/40 hover:bg-muted/50 rounded-2xl p-5 text-center transition-all cursor-pointer relative">
        <Upload className="w-6 h-6 mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-semibold text-foreground">Drop files here or click to upload</p>
        <p className="text-xs text-muted-foreground mt-1">PDF · Images · Datasets · Code · Presentations</p>
        <input
          type="file"
          multiple
          aria-label="Attach files"
          onChange={(e) => setFiles(Array.from(e.target.files || []))}
          className="absolute inset-0 opacity-0 cursor-pointer"
        />
      </div>

      {selectedFileNames.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedFileNames.map((f, i) => (
            <span key={`${f}-${i}`} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-accent text-primary text-xs font-medium rounded-lg border border-primary/20">
              <FileText className="w-3 h-3" />
              <span className="max-w-[180px] truncate">{f}</span>
            </span>
          ))}
        </div>
      )}

      {/* Full paper file (paper category, restricted) */}
      {isPaperPost && fullPaperAccessMode !== "public" && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50/50 p-4">
          <div className="flex items-center gap-2 mb-2">
            <BookOpen className="w-4 h-4 text-indigo-600" />
            <p className="text-xs font-bold text-indigo-900 uppercase tracking-wide">Full Paper File</p>
          </div>
          <p className="text-xs text-indigo-700 mb-3 leading-relaxed">
            Upload the restricted full paper. Other users will need to request access to view this file.
          </p>
          <div className="relative">
            <input
              type="file"
              aria-label="Choose the full paper file"
              onChange={(e) => setFullPaperFile(e.target.files?.[0] || null)}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
            <div className="flex items-center gap-3 p-3 bg-white rounded-xl border border-indigo-200">
              <div className="w-10 h-10 rounded-xl bg-indigo-100 flex items-center justify-center flex-shrink-0">
                <BookOpen className="w-5 h-5 text-indigo-600" />
              </div>
              <div className="min-w-0 flex-1">
                {fullPaperFile ? (
                  <>
                    <p className="text-sm font-semibold text-foreground truncate">{fullPaperFile.name}</p>
                    <p className="text-xs text-muted-foreground">{formatFileSize(fullPaperFile.size)}</p>
                  </>
                ) : (
                  <p className="text-sm text-muted-foreground">Click to select the full paper file</p>
                )}
              </div>
              <Upload className="w-4 h-4 text-indigo-500 flex-shrink-0" />
            </div>
          </div>
        </div>
      )}

      {/* Footer */}
      <div className="flex items-center justify-between pt-1 border-t border-border">
        <span className="text-[11px] text-muted-foreground flex items-center gap-1">
          <Globe className="w-3 h-3" /> {formatLabel(visibilityMode)}
        </span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setComposerOpen(false)} className="px-4 py-2 text-sm font-semibold rounded-xl border border-border hover:bg-muted transition-colors">
            Cancel
          </button>
          <button
            disabled={uploading || !title.trim()}
            onClick={handleCreatePost}
            className="px-6 py-2 text-sm font-semibold rounded-xl bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {uploading && <div className="w-3 h-3 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
            {uploading ? "Publishing…" : "Publish Post"}
          </button>
        </div>
      </div>
    </div>
  );

  // ── Left sidebar ──────────────────────────────────────────────────────────
 const LeftSidebar = (
  <section aria-label="Your profile and shortcuts" className="space-y-4">
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <div className="h-14 bg-gradient-to-r from-indigo-500 via-violet-500 to-blue-600" />

      <div className="-mt-7 px-4 pb-4">
        <Avatar name={fullName || "You"} picUrl={profilePicUrl} size="lg" />

        <div className="mt-3">
          <p className="text-sm font-bold text-foreground">
            {fullName || "Researcher"}
          </p>
          <p className="text-xs text-muted-foreground">
            Active ResearchGram profile
          </p>
        </div>

        <div className="mt-4 space-y-2 border-t border-border pt-4">
          <button
            onClick={handleGoToWorkspace}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-primary text-primary-foreground text-sm font-semibold hover:bg-primary/90 transition-colors"
          >
            <GitBranch className="w-4 h-4" />
            Project Workspace
          </button>

          <button
            onClick={handleGoToMentorship}
            className="w-full flex items-center gap-3 px-4 py-2.5 rounded-xl bg-accent text-primary text-sm font-semibold border border-primary/20 hover:bg-indigo-100 transition-colors"
          >
            <Star className="w-4 h-4" />
            Find Mentors
          </button>
        </div>

        <div className="mt-4 border-t border-border pt-4">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-widest text-muted-foreground">
            Shortcuts
          </p>

          <div className="grid grid-cols-2 gap-2">
            {[
              {
                label: "Researchers",
                href: "/researchers",
                icon: Search,
              },
              {
                label: "Network",
                href: "/network",
                icon: Users,
              },
              {
                label: "Requests",
                href: "/requests",
                icon: UserPlus,
              },
              {
                label: "Messages",
                href: "/messages",
                icon: MessageCircle,
              },
            ].map((item) => (
              <a
                key={item.href}
                href={item.href}
                className="flex flex-col items-center justify-center gap-1.5 rounded-xl border border-border bg-muted/40 px-2 py-3 text-center text-[11px] font-semibold text-muted-foreground transition-colors hover:border-primary/30 hover:bg-accent hover:text-primary"
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </a>
            ))}
          </div>
        </div>
      </div>
    </div>

    <div className="bg-gradient-to-br from-indigo-50 via-blue-50 to-indigo-50 rounded-2xl border border-indigo-100 p-4">
      <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-3">
        Platform Features
      </p>

      <ul className="space-y-2">
        {[
          "📄  Publish & share research notes",
          "🔒  Controlled full-paper access",
          "🤝  Request & offer collaboration",
          "🎓  Connect with research mentors",
          "📂  Manage project workspaces",
        ].map((f) => (
          <li key={f} className="text-xs text-indigo-700 leading-relaxed">
            {f}
          </li>
        ))}
      </ul>
    </div>
  </section>
);

  // ── Right sidebar ─────────────────────────────────────────────────────────
  const RightSidebar = (
    <section aria-label="Trending topics and suggestions" className="space-y-4">
      <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-primary" /> Trending Topics
        </h2>
        {trendingKeywords.length === 0 ? (
          <p className="text-xs text-muted-foreground">No trending topics yet. Add keywords to your posts to seed trends.</p>
        ) : (
           <div className="space-y-1">
            {trendingKeywords.map((t, i) => (
              <a
                key={t.tag}
                href={`/topic?tag=${encodeURIComponent(t.tag)}`}
                className="flex items-center gap-3 px-2.5 py-2 rounded-xl hover:bg-muted transition-colors group"
              >
                <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-foreground truncate group-hover:text-primary transition-colors">{t.tag}</p>
                  <p className="text-[11px] text-muted-foreground">{t.count} post{t.count > 1 ? "s" : ""}</p>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground/50 group-hover:text-primary transition-colors flex-shrink-0" />
              </a>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl overflow-hidden" style={{ background: "linear-gradient(135deg, #4338ca 0%, #3b82f6 100%)" }}>
        <div className="p-4 text-white">
          <h2 className="text-sm font-bold mb-3 flex items-center gap-2">
            <BarChart2 className="w-4 h-4" /> Quick Stats
          </h2>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { label: "Posts in feed", value: posts.length },
              { label: "Your posts", value: posts.filter((p) => p.user_id === userId).length },
              { label: "Saved", value: posts.filter((p) => p.is_saved).length },
              { label: "Authored with", value: posts.filter((p) => p.authors.some((a) => a.profile_id === userId)).length },
            ].map(({ label, value }) => (
              <div key={label} className="bg-white/10 rounded-xl p-3 backdrop-blur-sm">
                <p className="text-lg font-extrabold">{value}</p>
                <p className="text-[10px] text-blue-200">{label}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="bg-card rounded-2xl border border-border shadow-sm p-4">
        <h2 className="text-sm font-bold text-foreground mb-3 flex items-center gap-2">
          <Award className="w-4 h-4 text-primary" /> Quick Actions
        </h2>
        <div className="space-y-1">
          <button onClick={handleGoToMentorship} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-sm text-foreground transition-colors">
            <Star className="w-4 h-4 text-muted-foreground" /> <span className="font-medium">Find Mentors</span>
          </button>
          <button onClick={handleGoToWorkspace} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-muted text-sm text-foreground transition-colors">
            <GitBranch className="w-4 h-4 text-muted-foreground" /> <span className="font-medium">My Workspaces</span>
          </button>
        </div>
      </div>
    </section>
  );

  // ── Main return ───────────────────────────────────────────────────────────
  return (
    <main className="min-h-screen bg-background">
      <AppNav activePage="feed" />
      {/* Page title for screen readers; the design has no visible one (RG-32). */}
      <h1 className="sr-only">Feed</h1>

      <div className="max-w-[1440px] mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-[272px_1fr_308px] gap-5">
          {/* Left */}
          <div className="hidden lg:block">
            <div className="sticky top-[68px] max-h-[calc(100vh-80px)] overflow-y-auto [&::-webkit-scrollbar]:hidden">
              {LeftSidebar}
            </div>
          </div>

          {/* Center */}
          <section className="space-y-4 min-w-0">
            {composerOpen ? ComposerExpanded : ComposerStrip}

            {posts.length === 0 ? (
              <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
                <FileQuestion className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
                <p className="text-sm font-semibold text-foreground">No posts in your feed yet</p>
                <p className="text-xs text-muted-foreground mt-1">Be the first to share research with your community.</p>
              </div>
            ) : (
              <PostList
                posts={posts}
                userId={userId}
                fullName={fullName}
                profilePicUrl={profilePicUrl}
                actions={postActions}
                linkedPostId={linkedPostId}
                onGoToResearcher={handleGoToResearcher}
                onGoToRecommendations={handleGoToRecommendations}
              />
            )}

            {hasMorePosts && handleLoadMorePosts && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={handleLoadMorePosts}
                  disabled={loadingMorePosts}
                  className="px-5 py-2.5 rounded-xl border border-border bg-card text-sm font-semibold text-foreground shadow-sm hover:bg-muted transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loadingMorePosts ? "Loading…" : "Load more posts"}
                </button>
              </div>
            )}
          </section>

          {/* Right */}
          <div className="hidden lg:block">
            <div className="sticky top-[68px] max-h-[calc(100vh-80px)] overflow-y-auto [&::-webkit-scrollbar]:hidden">
              {RightSidebar}
            </div>
          </div>
        </div>
      </div>

    </main>
  );
}