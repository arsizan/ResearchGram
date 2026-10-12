"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  BookOpen,
  Bookmark,
  ChevronDown,
  Clock,
  EyeOff,
  Flag,
  GitBranch,
  Hash,
  Link2,
  Lock,
  MessageCircle,
  MoreHorizontal,
  Send,
  Sparkles,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import FileViewerModal, { type ViewerFile } from "@/components/FileViewerModal";
import ProfileHoverCard from "@/components/ProfileHoverCard";
import type { PostActions } from "@/lib/posts/usePostActions";
import type { Attachment, Post } from "@/lib/posts/types";
import {
  AttachmentPreview,
  Avatar,
  TypeBadge,
  attachmentToViewerFile,
  formatPostTime,
  getAuthorName,
} from "./PostParts";

type PostListProps = {
  posts: Post[];
  userId: string;
  fullName: string;
  profilePicUrl: string;
  actions: PostActions;
  /** Post opened from a link (?post=), highlighted. */
  linkedPostId?: string | null;
  /** Tag of the topic page, highlighted among a post's tags. */
  activeTag?: string;
  onGoToResearcher: (profileId: string) => void;
  onGoToRecommendations: (postId: string) => void;
};

/**
 * Post cards with their menus, comments, request forms, file viewer and the
 * report form. Shared by the Feed and Topic pages (audit RG-24).
 */
export default function PostList({
  posts,
  userId,
  fullName,
  profilePicUrl,
  actions,
  linkedPostId = null,
  activeTag = "",
  onGoToResearcher,
  onGoToRecommendations,
}: PostListProps) {
  const {
    commentDrafts,
    setCommentDrafts,
    commentingPostId,
    savingPostId,
    openRequestPostId,
    setOpenRequestPostId,
    requestDrafts,
    setRequestDrafts,
    requestingPostId,
    paperAccessRequestDrafts,
    setPaperAccessRequestDrafts,
    openPaperAccessPostId,
    setOpenPaperAccessPostId,
    paperAccessRequestingPostId,
    handleCreateComment,
    handleToggleSave,
    handleSendCollaborationRequest,
    handleRequestFullPaperAccess,
    handleCopyPostLink,
    handleHidePost,
    handleReportPost,
  } = actions;

  const [viewerFiles, setViewerFiles] = useState<ViewerFile[]>([]);
  const [viewerIndex, setViewerIndex] = useState(0);
  const [openPostMenuId, setOpenPostMenuId] = useState<string | null>(null);
  const [expandedComments, setExpandedComments] = useState<Record<string, boolean>>({});

  const [reportingPost, setReportingPost] = useState<Post | null>(null);
  const [reportReason, setReportReason] = useState("spam");
  const [reportDetails, setReportDetails] = useState("");

  const openFileViewer = (attachments: Attachment[], attachmentId: string) => {
    const files = attachments.filter((att) => Boolean(att.file_url)).map(attachmentToViewerFile);
    const index = files.findIndex((file) => file.id === attachmentId);
    if (files.length === 0 || index < 0) return;
    setViewerFiles(files);
    setViewerIndex(index);
  };

  // Opened with the keyboard: move focus into the menu once it is shown.
  const focusFirstMenuItemRef = useRef(false);
  // The "Post options" button of the open menu. Focus goes back to it after
  // a menu action, so keyboard users do not land at the top of the page.
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);

  const focusMenuButton = () => {
    const trigger = menuTriggerRef.current;
    if (trigger?.isConnected) trigger.focus();
  };

  const closeReportForm = () => {
    setReportingPost(null);
    focusMenuButton();
  };

  // Arrow keys, Home and End move between the menu items; Escape closes the
  // menu and puts focus back on its button (RG-32).
  const handleMenuKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      const trigger = event.currentTarget.parentElement?.querySelector<HTMLButtonElement>(
        'button[aria-haspopup="menu"]',
      );
      setOpenPostMenuId(null);
      trigger?.focus();
      return;
    }

    const items = Array.from(
      event.currentTarget.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    );
    if (items.length === 0) return;

    const current = items.indexOf(document.activeElement as HTMLElement);
    let next = -1;
    if (event.key === "ArrowDown") next = current < 0 ? 0 : (current + 1) % items.length;
    else if (event.key === "ArrowUp") next = current <= 0 ? items.length - 1 : current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;

    if (next >= 0) {
      event.preventDefault();
      items[next].focus();
    }
  };

  // Close the post menu on any click elsewhere, or with Escape.
  useEffect(() => {
    if (!openPostMenuId) return;
    const close = () => setOpenPostMenuId(null);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("click", close);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [openPostMenuId]);

  // Escape closes the report form.
  useEffect(() => {
    if (!reportingPost) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setReportingPost(null);
      const trigger = menuTriggerRef.current;
      if (trigger?.isConnected) trigger.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [reportingPost]);

  const toggleComments = (postId: string) =>
    setExpandedComments((p) => ({ ...p, [postId]: !p[postId] }));

  const renderPost = (post: Post) => {
    const isLinked = linkedPostId === post.id;
    const isOwnPost = post.user_id === userId;
    const authorName = post.profiles?.full_name || post.profiles?.email?.split("@")[0] || "Researcher";
    const authorDept = post.profiles?.department || "";
    const isAbstractOnly = post.visibility_mode === "abstract_only" && !isOwnPost && !post.has_full_paper_access;
    const tags = (post.keywords || "").split(/[,;]/).map((k) => k.trim()).filter(Boolean);
    const commentsOpen = !!expandedComments[post.id];
    const menuOpen = openPostMenuId === post.id;
    const commentInputId = `comment-input-${post.id}`;

    return (
      <article
        key={post.id}
        id={`post-${post.id}`}
        aria-label={post.title || "Untitled post"}
        className={`bg-card rounded-2xl border shadow-sm hover:shadow-md transition-shadow overflow-hidden ${
          isLinked ? "border-primary/40 ring-2 ring-primary/15" : "border-border"
        }`}
      >
        {/* Header */}
        <div className="p-5 pb-0 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <button
              type="button"
              onClick={() => post.user_id && onGoToResearcher(post.user_id)}
              className="flex-shrink-0 rounded-full"
              aria-label={`Open ${authorName}'s profile`}
            >
              <Avatar name={authorName} picUrl={post.profiles?.profile_pic_url} />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <ProfileHoverCard
                  profileId={post.user_id || ""}
                  fullName={post.profiles?.full_name || null}
                  email={post.profiles?.email || null}
                  department={post.profiles?.department || null}
                  profilePicUrl={post.profiles?.profile_pic_url || null}
                  subtitle={
                    post.content_category === "research_paper"
                      ? "This researcher published a research paper. View profile for skills, interests, and recent academic activity."
                      : "View this researcher's academic profile, skills, interests, and recent posts."
                  }
                  onViewProfile={onGoToResearcher}
                >
                  <button
                    type="button"
                    onClick={() => post.user_id && onGoToResearcher(post.user_id)}
                    className="text-sm font-bold text-foreground hover:text-primary transition-colors"
                  >
                    {authorName}
                  </button>
                </ProfileHoverCard>
                <TypeBadge postType={post.post_type} />
                {post.content_category === "research_paper" && (
                  <span className="text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200 px-1.5 py-0.5 rounded-full uppercase tracking-wide">
                    Research Paper
                  </span>
                )}
              </div>
              {authorDept && <p className="text-xs text-muted-foreground mt-0.5 truncate">{authorDept}</p>}
              <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                <Clock className="w-3 h-3 text-muted-foreground" aria-hidden="true" />
                <span className="text-xs text-muted-foreground">{formatPostTime(post.created_at)}</span>
                {post.doi && (
                  <>
                    <span className="text-muted-foreground/50" aria-hidden="true">·</span>
                    <span className="text-xs font-mono text-muted-foreground">DOI: {post.doi}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Post menu */}
          <div className="relative flex-shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                // detail is 0 when Enter or Space "clicked" the button.
                focusFirstMenuItemRef.current = e.detail === 0 && !menuOpen;
                menuTriggerRef.current = e.currentTarget;
                setOpenPostMenuId((cur) => (cur === post.id ? null : post.id));
              }}
              className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Post options"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
            >
              <MoreHorizontal className="w-4 h-4" aria-hidden="true" />
            </button>
            {menuOpen && (
              <div
                role="menu"
                aria-label="Post options"
                tabIndex={-1}
                ref={(element) => {
                  if (element && focusFirstMenuItemRef.current) {
                    focusFirstMenuItemRef.current = false;
                    element.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
                  }
                }}
                onClick={(e) => e.stopPropagation()}
                onKeyDown={handleMenuKeyDown}
                className="absolute right-0 top-full mt-1 z-20 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden focus:outline-none"
              >
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { focusMenuButton(); setOpenPostMenuId(null); handleCopyPostLink(post); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Link2 className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Copy post link
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => { onGoToRecommendations(post.id); setOpenPostMenuId(null); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Similar research
                </button>
                {!isOwnPost && (
                  <>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => { focusMenuButton(); setOpenPostMenuId(null); handleHidePost(post); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <EyeOff className="w-4 h-4 text-muted-foreground" aria-hidden="true" /> Hide from feed
                    </button>
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setReportingPost(post);
                        setReportReason("spam");
                        setReportDetails("");
                        setOpenPostMenuId(null);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Flag className="w-4 h-4" aria-hidden="true" /> Report post
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Co-authors strip */}
        {post.authors.length > 0 && (
          <div className="px-5 pt-3 flex items-center gap-2 flex-wrap">
            <span className="text-[11px] font-bold text-muted-foreground uppercase tracking-widest">Co-authors:</span>
            {post.authors.map((author) => (
              <span
                key={author.id}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border"
              >
                <Avatar name={getAuthorName(author)} picUrl={author.profile?.profile_pic_url} size="xs" />
                {getAuthorName(author)}
              </span>
            ))}
          </div>
        )}

        {/* Title + content/abstract */}
        <div className="px-5 py-4">
          <h2 className="text-[15px] font-bold text-foreground mb-2.5 leading-snug">
            {post.title || "Untitled post"}
          </h2>

          {isAbstractOnly && post.abstract && (
            <div className="mb-3 p-3 rounded-xl bg-indigo-50/50 border border-indigo-100">
              <p className="text-[10px] font-bold text-indigo-700 uppercase tracking-widest mb-1">Abstract</p>
              <p className="text-sm text-indigo-900 leading-relaxed">{post.abstract}</p>
            </div>
          )}

          {!isAbstractOnly && post.abstract && (
            <div className="mb-3 p-3 rounded-xl bg-muted/40 border border-border">
              <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-widest mb-1">Abstract</p>
              <p className="text-sm text-foreground leading-relaxed">{post.abstract}</p>
            </div>
          )}

          {post.content && !isAbstractOnly && (
            <p className="text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap">{post.content}</p>
          )}

          {/* Tags open the topic page */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => {
                const isActive = Boolean(activeTag) && tag.toLowerCase() === activeTag.toLowerCase();
                return (
                  <a
                    key={tag}
                    href={`/topic?tag=${encodeURIComponent(tag)}`}
                    aria-current={isActive ? "page" : undefined}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                      isActive
                        ? "text-white bg-primary border-primary"
                        : "text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100"
                    }`}
                  >
                    <Hash className="w-2.5 h-2.5" aria-hidden="true" />
                    {tag}
                  </a>
                );
              })}
            </div>
          )}

          {/* Attachments */}
          {post.attachments.length > 0 && (
            <div className="mt-4 space-y-2.5">
              {post.attachments.map((att) => (
                <AttachmentPreview
                  key={att.id}
                  att={att}
                  onOpen={() => openFileViewer(post.attachments, att.id)}
                />
              ))}
            </div>
          )}
        </div>

        {/* Stats bar */}
        <div className="mx-5 py-2.5 border-t border-b border-border flex items-center justify-between text-xs text-muted-foreground">
          <div className="flex items-center gap-4 flex-wrap">
            <span className="flex items-center gap-1.5">
              <Bookmark className="w-3 h-3" aria-hidden="true" />
              {post.save_count} saves
            </span>
            <button
              type="button"
              onClick={() => toggleComments(post.id)}
              aria-expanded={commentsOpen}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <MessageCircle className="w-3 h-3" aria-hidden="true" />
              {post.comments.length} discussions
            </button>
            <span className="flex items-center gap-1.5">
              <Users className="w-3 h-3" aria-hidden="true" />
              {post.request_count} collaborators
            </span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-1.5 grid grid-cols-2 sm:grid-cols-4 gap-0.5">
          <button
            type="button"
            onClick={() => handleToggleSave(post)}
            disabled={savingPostId === post.id}
            aria-pressed={post.is_saved}
            className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              post.is_saved
                ? "text-primary bg-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } disabled:opacity-50`}
          >
            <Bookmark className={`w-4 h-4 ${post.is_saved ? "fill-current" : ""}`} aria-hidden="true" />
            {post.is_saved ? "Saved" : "Save"}
          </button>

          <button
            type="button"
            onClick={() => toggleComments(post.id)}
            aria-expanded={commentsOpen}
            className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              commentsOpen ? "text-primary bg-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <MessageCircle className="w-4 h-4" aria-hidden="true" /> Discuss
          </button>

          {!isOwnPost && (
            <button
              type="button"
              onClick={() => setOpenRequestPostId((cur) => (cur === post.id ? null : post.id))}
              disabled={post.has_requested}
              aria-expanded={openRequestPostId === post.id}
              className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                post.has_requested
                  ? "text-emerald-600 bg-emerald-50 cursor-not-allowed"
                  : openRequestPostId === post.id
                    ? "text-primary bg-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <GitBranch className="w-4 h-4" aria-hidden="true" />
              {post.has_requested ? "Requested" : "Collaborate"}
            </button>
          )}

          {!isOwnPost && post.content_category === "research_paper" && post.full_paper_access_mode === "request_required" && (
            <button
              type="button"
              onClick={() => setOpenPaperAccessPostId((cur) => (cur === post.id ? null : post.id))}
              disabled={Boolean(post.paper_access_request_status)}
              aria-expanded={openPaperAccessPostId === post.id}
              className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                post.paper_access_request_status === "approved"
                  ? "text-emerald-600 bg-emerald-50"
                  : post.paper_access_request_status === "pending"
                    ? "text-amber-600 bg-amber-50"
                    : post.paper_access_request_status === "rejected"
                      ? "text-red-600 bg-red-50"
                      : openPaperAccessPostId === post.id
                        ? "text-primary bg-accent"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <BookOpen className="w-4 h-4" aria-hidden="true" />
              {post.paper_access_request_status === "approved"
                ? "Granted"
                : post.paper_access_request_status === "pending"
                  ? "Pending"
                  : post.paper_access_request_status === "rejected"
                    ? "Rejected"
                    : "Request Paper"}
            </button>
          )}

          {!isOwnPost && !(post.content_category === "research_paper" && post.full_paper_access_mode === "request_required") && (
            <button
              type="button"
              onClick={() => post.user_id && onGoToResearcher(post.user_id)}
              className="flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              <UserPlus className="w-4 h-4" aria-hidden="true" /> Profile
            </button>
          )}
        </div>

        {/* Collaboration request drawer */}
        {openRequestPostId === post.id && (
          <div className="mx-4 mb-3 p-4 rounded-xl border border-primary/20 bg-accent/40 space-y-2">
            <label htmlFor={`collab-message-${post.id}`} className="block text-xs font-bold text-foreground">
              Send a collaboration message
            </label>
            <textarea
              id={`collab-message-${post.id}`}
              value={requestDrafts[post.id] || ""}
              onChange={(e) => setRequestDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
              placeholder="Briefly describe your interest, your background, and how you'd like to collaborate…"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-card rounded-xl border border-border focus:border-primary focus:outline-none transition-all resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenRequestPostId(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleSendCollaborationRequest(post)}
                disabled={requestingPostId === post.id}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" aria-hidden="true" />
                {requestingPostId === post.id ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        )}

        {/* Paper access drawer */}
        {openPaperAccessPostId === post.id && (
          <div className="mx-4 mb-3 p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
            <label
              htmlFor={`paper-access-reason-${post.id}`}
              className="text-xs font-bold text-amber-900 flex items-center gap-1.5"
            >
              <Lock className="w-3 h-3" aria-hidden="true" /> Request full paper access
            </label>
            <textarea
              id={`paper-access-reason-${post.id}`}
              value={paperAccessRequestDrafts[post.id] || ""}
              onChange={(e) => setPaperAccessRequestDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
              placeholder="Why do you need the full paper? (research purpose, citation, peer review, etc.)"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-card rounded-xl border border-amber-200 focus:border-amber-400 focus:outline-none transition-all resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setOpenPaperAccessPostId(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleRequestFullPaperAccess(post)}
                disabled={paperAccessRequestingPostId === post.id}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" aria-hidden="true" />
                {paperAccessRequestingPostId === post.id ? "Sending…" : "Request Access"}
              </button>
            </div>
          </div>
        )}

        {/* Comments */}
        {commentsOpen && (
          <div className="border-t border-border bg-muted/30">
            <div className="px-5 py-4 space-y-3">
              {post.comments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-2">No discussions yet. Be the first to comment.</p>
              ) : (
                post.comments.map((c) => {
                  const cname = c.profiles?.full_name || c.profiles?.email?.split("@")[0] || "Researcher";
                  return (
                    <div key={c.id} className="flex items-start gap-3">
                      <Avatar name={cname} picUrl={c.profiles?.profile_pic_url} size="sm" />
                      <div className="flex-1 bg-card rounded-2xl rounded-tl-sm px-4 py-3 border border-border">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="text-xs font-bold text-foreground">{cname}</span>
                          <span className="text-[10px] text-muted-foreground">{formatPostTime(c.created_at)}</span>
                        </div>
                        <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{c.comment_text}</p>
                      </div>
                    </div>
                  );
                })
              )}

              {/* Comment input */}
              <div className="flex items-center gap-3 pt-1">
                <Avatar name={fullName || "You"} picUrl={profilePicUrl} size="sm" />
                <div className="flex-1 flex items-center gap-2">
                  <label htmlFor={commentInputId} className="sr-only">
                    Add a discussion comment
                  </label>
                  <input
                    id={commentInputId}
                    type="text"
                    value={commentDrafts[post.id] || ""}
                    onChange={(e) => setCommentDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if ((commentDrafts[post.id] || "").trim()) handleCreateComment(post.id);
                      }
                    }}
                    placeholder="Add a discussion comment…"
                    className="flex-1 px-4 py-2.5 text-sm bg-card rounded-2xl border border-border focus:border-primary focus:outline-none transition-all"
                  />
                  <button
                    type="button"
                    disabled={commentingPostId === post.id || !(commentDrafts[post.id] || "").trim()}
                    onClick={() => handleCreateComment(post.id)}
                    className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
                    aria-label="Post comment"
                  >
                    <Send className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </article>
    );
  };

  return (
    <>
      {posts.map(renderPost)}

      <FileViewerModal
        open={viewerFiles.length > 0}
        files={viewerFiles}
        currentIndex={viewerIndex}
        onChangeIndex={setViewerIndex}
        onClose={() => {
          setViewerFiles([]);
          setViewerIndex(0);
        }}
      />

      {/* Report form */}
      {reportingPost && (
        <>
          <div
            className="fixed inset-0 m-0 bg-black/40 backdrop-blur-sm z-40"
            onClick={closeReportForm}
            aria-hidden="true"
          />
          <div className="fixed inset-0 m-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <div
              role="dialog"
              aria-modal="true"
              aria-labelledby="report-post-title"
              className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md pointer-events-auto"
            >
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-red-500" aria-hidden="true" />
                  <h3 id="report-post-title" className="text-base font-bold text-foreground">Report this post</h3>
                </div>
                <button
                  type="button"
                  onClick={closeReportForm}
                  className="p-2 rounded-xl hover:bg-muted transition-colors"
                  aria-label="Close report form"
                >
                  <X className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label htmlFor="report-reason" className="block text-sm font-semibold text-foreground mb-1.5">Reason</label>
                  <div className="relative">
                    <select
                      id="report-reason"
                      // Focus moves into the dialog when it opens.
                      autoFocus
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                      className="w-full appearance-none pl-4 pr-8 py-2.5 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none cursor-pointer"
                    >
                      <option value="spam">Spam or misleading</option>
                      <option value="plagiarism">Plagiarism / academic misconduct</option>
                      <option value="harassment">Harassment or abuse</option>
                      <option value="off_topic">Off-topic or low quality</option>
                      <option value="copyright">Copyright infringement</option>
                      <option value="other">Other</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" aria-hidden="true" />
                  </div>
                </div>
                <div>
                  <label htmlFor="report-details" className="block text-sm font-semibold text-foreground mb-1.5">Details (optional)</label>
                  <textarea
                    id="report-details"
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={4}
                    placeholder="Add any context that will help our team review this report…"
                    className="w-full px-4 py-3 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={closeReportForm}
                    className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={async () => {
                      const p = reportingPost;
                      await handleReportPost(p, reportReason, reportDetails);
                      closeReportForm();
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                  >
                    <Flag className="w-4 h-4" aria-hidden="true" /> Submit Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
