"use client";

import { useEffect, useState, type Dispatch, type SetStateAction } from "react";
import AppNav from "@/components/AppNav";
import FileViewerModal, { type ViewerFile } from "@/components/FileViewerModal";
import ProfileHoverCard from "@/components/ProfileHoverCard";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import {
  Download,
  Send,
  Lock,
  Bookmark,
  MessageCircle,
  FileText,
  Database,
  Code,
  BookOpen,
  Hash,
  BarChart2,
  Clock,
  GitBranch,
  Users,
  UserPlus,
  ArrowLeft,
  TrendingUp,
  MoreHorizontal,
  Image as ImageIcon,
  Link2,
  EyeOff,
  Flag,
  Presentation,
  FileQuestion,
  Sparkles,
  X,
  ChevronDown,
} from "lucide-react";
import type {
  Attachment,
  ContentAuthor,
  PlatformAuthor,
  Post,
} from "../feed/UI";

type TopicUIProps = {
  loading: boolean;
  topic: string;
  userId: string;
  fullName: string;
  profilePicUrl: string;
  posts: Post[];
  commentDrafts: Record<string, string>;
  commentingPostId: string | null;
  savingPostId: string | null;
  openRequestPostId: string | null;
  requestDrafts: Record<string, string>;
  requestingPostId: string | null;
  openPaperAccessPostId: string | null;
  paperAccessRequestDrafts: Record<string, string>;
  paperAccessRequestingPostId: string | null;
  setCommentDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setOpenRequestPostId: Dispatch<SetStateAction<string | null>>;
  setRequestDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  setOpenPaperAccessPostId: Dispatch<SetStateAction<string | null>>;
  setPaperAccessRequestDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  handleCreateComment: (contentId: string) => void;
  handleToggleSave: (post: Post) => void;
  handleSendCollaborationRequest: (post: Post) => void;
  handleRequestFullPaperAccess: (post: Post) => void;
  handleCopyPostLink: (post: Post) => void;
  handleHidePost: (post: Post) => void;
  handleReportPost: (post: Post, reason: string, details: string) => Promise<void> | void;
  handleGoBack: () => void;
  handleGoToResearcher: (profileId: string) => void;
  handleGoToRecommendations: (postId: string) => void;
};

// ─── Constants ───────────────────────────────────────────────────────────────

const POST_TYPE_STYLE: Record<string, string> = {
  research_note: "bg-blue-50 text-blue-700 border-blue-200",
  paper_draft: "bg-violet-50 text-violet-700 border-violet-200",
  published_paper: "bg-indigo-50 text-indigo-700 border-indigo-200",
  dataset: "bg-emerald-50 text-emerald-700 border-emerald-200",
  presentation: "bg-orange-50 text-orange-700 border-orange-200",
  code_project: "bg-slate-100 text-slate-700 border-slate-200",
  question: "bg-amber-50 text-amber-700 border-amber-200",
  announcement: "bg-red-50 text-red-700 border-red-200",
};

const POST_TYPE_LABEL: Record<string, string> = {
  research_note: "Research Note",
  paper_draft: "Paper Draft",
  published_paper: "Published Paper",
  dataset: "Dataset",
  presentation: "Presentation",
  code_project: "Code / Project",
  question: "Question",
  announcement: "Announcement",
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatPostTime(dateString: string | null) {
  if (!dateString) return "Unknown time";
  try {
    const date = new Date(dateString);
    const diffMs = Date.now() - date.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMinutes / 60);
    const diffDays = Math.floor(diffHours / 24);
    if (diffMinutes < 1) return "Just now";
    if (diffMinutes < 60) return `${diffMinutes}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return new Intl.DateTimeFormat(undefined, { month: "short", day: "numeric" }).format(date);
  } catch {
    return "Unknown time";
  }
}

function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "Unknown size";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatLabel(value: string | null | undefined) {
  return (value || "general_post").replaceAll("_", " ");
}

function getAuthorName(author: ContentAuthor) {
  return author.profile?.full_name || author.profile?.email?.split("@")[0] || author.manual_name || "Unnamed author";
}

function attachmentToViewerFile(att: Attachment): ViewerFile {
  return {
    id: att.id,
    url: att.file_url,
    name: att.original_name || "Research file",
    mime_type: att.mime_type,
    file_ext: att.file_ext,
    attachment_type: att.attachment_type,
    file_size: att.file_size,
  };
}

function attachmentIcon(type: string) {
  switch (type) {
    case "pdf": return FileText;
    case "document": return FileText;
    case "text": return FileText;
    case "presentation": return Presentation;
    case "spreadsheet": return BarChart2;
    case "image": return ImageIcon;
    case "code": return Code;
    case "archive": return Database;
    default: return FileText;
  }
}

function colorFromString(s: string) {
  const palette = ["#4f46e5", "#7c3aed", "#0891b2", "#059669", "#dc2626", "#d97706"];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

// ─── Sub-components ──────────────────────────────────────────────────────────

function Avatar({
  name, picUrl, size = "md",
}: { name: string; picUrl?: string | null; size?: "xs" | "sm" | "md" | "lg" }) {
  const s = { xs: "w-6 h-6 text-[10px]", sm: "w-8 h-8 text-xs", md: "w-10 h-10 text-sm", lg: "w-14 h-14 text-base" }[size];
  const color = colorFromString(name || "U");
  const initials = getInitials(name);
  return (
    <div className={`${s} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`} style={{ backgroundColor: color }}>
      {picUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picUrl} alt={name} className="w-full h-full object-cover" />
      ) : initials}
    </div>
  );
}

function TypeBadge({ postType }: { postType: string | null }) {
  const key = postType || "research_note";
  return (
    <span className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${POST_TYPE_STYLE[key] ?? POST_TYPE_STYLE.research_note}`}>
      {POST_TYPE_LABEL[key] ?? formatLabel(key)}
    </span>
  );
}

function AttachmentPreview({ att, onOpen }: { att: Attachment; onOpen: () => void }) {
  const publicUrl = att.file_url;
  const isRestricted = att.access_level === "restricted";
  const isFullPaper = Boolean(att.is_full_paper);
  const isImage = att.attachment_type === "image" || att.mime_type?.startsWith("image/");
  const isPdf = att.attachment_type === "pdf" || att.mime_type === "application/pdf" || att.file_ext === "pdf";

  if (isRestricted && !publicUrl) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-amber-600" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 truncate">{att.original_name || "Restricted full paper"}</p>
          <p className="text-xs text-amber-700 mt-0.5">Full paper restricted. Request access to view or download.</p>
        </div>
      </div>
    );
  }

  if (isImage && publicUrl) {
    return (
      <button type="button" onClick={onOpen} className="block w-full overflow-hidden rounded-xl border border-border bg-card text-left hover:shadow-md transition-shadow">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={publicUrl} alt={att.original_name || "Research attachment"} className="w-full max-h-[420px] object-cover bg-slate-100" />
        <div className="px-3 py-2 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" />
            <span className="text-xs text-foreground font-medium truncate">{att.original_name || "Image"}</span>
          </div>
          <span className="text-xs text-primary font-semibold whitespace-nowrap">Open</span>
        </div>
      </button>
    );
  }

  const Icon = attachmentIcon(att.attachment_type);
  const tint = isFullPaper
    ? "bg-indigo-50/60 border-indigo-200 hover:bg-indigo-50"
    : isPdf
      ? "bg-red-50/50 border-border hover:bg-red-50"
      : "bg-slate-50 border-border hover:bg-slate-100";
  const iconBg = isFullPaper
    ? "bg-indigo-100 text-indigo-600"
    : isPdf
      ? "bg-red-100 text-red-600"
      : "bg-slate-200 text-slate-600";

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex items-center gap-3 p-3 rounded-xl border w-full text-left transition-colors group ${tint}`}
    >
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0 ${iconBg}`}>
        {isFullPaper ? <BookOpen className="w-5 h-5" /> : <Icon className="w-5 h-5" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">{att.original_name || "Research attachment"}</p>
        <p className="text-xs text-muted-foreground">
          {isFullPaper ? "Full paper · " : ""}{formatLabel(att.attachment_type)} · {formatFileSize(att.file_size)}
        </p>
      </div>
      <Download className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0" />
    </button>
  );
}

// ─── Main UI ─────────────────────────────────────────────────────────────────

export default function TopicUI({
  loading, topic, userId, fullName, profilePicUrl, posts,
  commentDrafts, commentingPostId, savingPostId,
  openRequestPostId, requestDrafts, requestingPostId,
  openPaperAccessPostId, paperAccessRequestDrafts, paperAccessRequestingPostId,
  setCommentDrafts, setOpenRequestPostId, setRequestDrafts,
  setOpenPaperAccessPostId, setPaperAccessRequestDrafts,
  handleCreateComment, handleToggleSave,
  handleSendCollaborationRequest, handleRequestFullPaperAccess,
  handleCopyPostLink, handleHidePost, handleReportPost,
  handleGoBack, handleGoToResearcher, handleGoToRecommendations,
}: TopicUIProps) {
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

  useEffect(() => {
    if (!openPostMenuId) return;
    const close = () => setOpenPostMenuId(null);
    window.addEventListener("click", close);
    return () => window.removeEventListener("click", close);
  }, [openPostMenuId]);

  if (loading) {
    return <ResearchGramSkeleton activePage="feed" variant="feed" />;
  }

  const renderPost = (post: Post) => {
    const isOwnPost = post.user_id === userId;
    const authorName = post.profiles?.full_name || post.profiles?.email?.split("@")[0] || "Researcher";
    const authorDept = post.profiles?.department || "";
    const isAbstractOnly = post.visibility_mode === "abstract_only" && !isOwnPost && !post.has_full_paper_access;
    const tags = (post.keywords || "").split(/[,;]/).map((k) => k.trim()).filter(Boolean);
    const commentsOpen = !!expandedComments[post.id];

    return (
      <article
        key={post.id}
        id={`post-${post.id}`}
        className="bg-card rounded-2xl border border-border shadow-sm hover:shadow-md transition-shadow overflow-hidden"
      >
        {/* Header */}
        <div className="p-5 pb-0 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <button onClick={() => post.user_id && handleGoToResearcher(post.user_id)} className="flex-shrink-0">
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
                  onViewProfile={handleGoToResearcher}
                >
                  <button
                    type="button"
                    onClick={() => post.user_id && handleGoToResearcher(post.user_id)}
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
                <Clock className="w-3 h-3 text-muted-foreground" />
                <span className="text-xs text-muted-foreground">{formatPostTime(post.created_at)}</span>
                {post.doi && (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span className="text-xs font-mono text-muted-foreground">DOI: {post.doi}</span>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Post menu */}
          <div className="relative flex-shrink-0">
            <button
              onClick={(e) => { e.stopPropagation(); setOpenPostMenuId((cur) => (cur === post.id ? null : post.id)); }}
              className="p-2 hover:bg-muted rounded-xl transition-colors text-muted-foreground hover:text-foreground"
            >
              <MoreHorizontal className="w-4 h-4" />
            </button>
            {openPostMenuId === post.id && (
              <div onClick={(e) => e.stopPropagation()} className="absolute right-0 top-full mt-1 z-20 w-52 bg-card border border-border rounded-xl shadow-xl overflow-hidden">
                <button
                  onClick={() => { handleCopyPostLink(post); setOpenPostMenuId(null); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Link2 className="w-4 h-4 text-muted-foreground" /> Copy post link
                </button>
                <button
                  onClick={() => { handleGoToRecommendations(post.id); setOpenPostMenuId(null); }}
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                >
                  <Sparkles className="w-4 h-4 text-muted-foreground" /> Similar research
                </button>
                {!isOwnPost && (
                  <>
                    <button
                      onClick={() => { handleHidePost(post); setOpenPostMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-foreground hover:bg-muted transition-colors"
                    >
                      <EyeOff className="w-4 h-4 text-muted-foreground" /> Hide from feed
                    </button>
                    <button
                      onClick={() => { setReportingPost(post); setReportReason("spam"); setReportDetails(""); setOpenPostMenuId(null); }}
                      className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors"
                    >
                      <Flag className="w-4 h-4" /> Report post
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
              <span key={author.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-foreground bg-muted/60 px-2 py-0.5 rounded-full border border-border">
                <Avatar name={getAuthorName(author)} picUrl={author.profile?.profile_pic_url} size="xs" />
                {getAuthorName(author)}
              </span>
            ))}
          </div>
        )}

        {/* Title + content/abstract */}
        <div className="px-5 py-4">
          <h3 className="text-[15px] font-bold text-foreground mb-2.5 leading-snug hover:text-primary transition-colors cursor-pointer">
            {post.title || "Untitled post"}
          </h3>

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

          {/* Tags */}
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mt-3">
              {tags.map((tag) => {
                const isActive = tag.toLowerCase() === topic.toLowerCase();
                return (
                  <a
                    key={tag}
                    href={`/topic?tag=${encodeURIComponent(tag)}`}
                    className={`inline-flex items-center gap-1 text-[11px] font-semibold px-2.5 py-0.5 rounded-full border transition-colors ${
                      isActive
                        ? "text-white bg-primary border-primary"
                        : "text-indigo-600 bg-indigo-50 border-indigo-100 hover:bg-indigo-100"
                    }`}
                  >
                    <Hash className="w-2.5 h-2.5" />{tag}
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
            <span className="flex items-center gap-1.5"><Bookmark className="w-3 h-3" />{post.save_count} saves</span>
            <button
              onClick={() => setExpandedComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
              className="flex items-center gap-1.5 hover:text-primary transition-colors"
            >
              <MessageCircle className="w-3 h-3" />{post.comments.length} discussions
            </button>
            <span className="flex items-center gap-1.5"><Users className="w-3 h-3" />{post.request_count} collaborators</span>
          </div>
        </div>

        {/* Action buttons */}
        <div className="px-4 py-1.5 grid grid-cols-2 sm:grid-cols-4 gap-0.5">
          <button
            onClick={() => handleToggleSave(post)}
            disabled={savingPostId === post.id}
            className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              post.is_saved
                ? "text-primary bg-accent"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            } disabled:opacity-50`}
          >
            <Bookmark className={`w-4 h-4 ${post.is_saved ? "fill-current" : ""}`} />
            {post.is_saved ? "Saved" : "Save"}
          </button>

          <button
            onClick={() => setExpandedComments((p) => ({ ...p, [post.id]: !p[post.id] }))}
            className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              commentsOpen ? "text-primary bg-accent" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            }`}
          >
            <MessageCircle className="w-4 h-4" /> Discuss
          </button>

          {!isOwnPost && (
            <button
              onClick={() => setOpenRequestPostId((cur) => (cur === post.id ? null : post.id))}
              disabled={post.has_requested}
              className={`flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold transition-all ${
                post.has_requested
                  ? "text-emerald-600 bg-emerald-50 cursor-not-allowed"
                  : openRequestPostId === post.id
                    ? "text-primary bg-accent"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <GitBranch className="w-4 h-4" />
              {post.has_requested ? "Requested" : "Collaborate"}
            </button>
          )}

          {!isOwnPost && post.content_category === "research_paper" && post.full_paper_access_mode === "request_required" && (
            <button
              onClick={() => setOpenPaperAccessPostId((cur) => (cur === post.id ? null : post.id))}
              disabled={Boolean(post.paper_access_request_status)}
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
              <BookOpen className="w-4 h-4" />
              {post.paper_access_request_status === "approved" ? "Granted"
                : post.paper_access_request_status === "pending" ? "Pending"
                : post.paper_access_request_status === "rejected" ? "Rejected"
                : "Request Paper"}
            </button>
          )}

          {!isOwnPost && !(post.content_category === "research_paper" && post.full_paper_access_mode === "request_required") && (
            <button
              onClick={() => post.user_id && handleGoToResearcher(post.user_id)}
              className="flex items-center justify-center gap-2 px-2 py-2.5 rounded-xl text-xs font-semibold text-muted-foreground hover:bg-muted hover:text-foreground transition-all"
            >
              <UserPlus className="w-4 h-4" /> Profile
            </button>
          )}
        </div>

        {/* Collaboration request drawer */}
        {openRequestPostId === post.id && (
          <div className="mx-4 mb-3 p-4 rounded-xl border border-primary/20 bg-accent/40 space-y-2">
            <p className="text-xs font-bold text-foreground">Send a collaboration message</p>
            <textarea
              value={requestDrafts[post.id] || ""}
              onChange={(e) => setRequestDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
              placeholder="Briefly describe your interest, your background, and how you'd like to collaborate…"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-card rounded-xl border border-border focus:border-primary focus:outline-none transition-all resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpenRequestPostId(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleSendCollaborationRequest(post)}
                disabled={requestingPostId === post.id}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-primary text-white hover:bg-primary/90 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" />
                {requestingPostId === post.id ? "Sending…" : "Send Request"}
              </button>
            </div>
          </div>
        )}

        {/* Paper access drawer */}
        {openPaperAccessPostId === post.id && (
          <div className="mx-4 mb-3 p-4 rounded-xl border border-amber-200 bg-amber-50/60 space-y-2">
            <p className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
              <Lock className="w-3 h-3" /> Request full paper access
            </p>
            <textarea
              value={paperAccessRequestDrafts[post.id] || ""}
              onChange={(e) => setPaperAccessRequestDrafts((p) => ({ ...p, [post.id]: e.target.value }))}
              placeholder="Why do you need the full paper? (research purpose, citation, peer review, etc.)"
              rows={3}
              className="w-full px-3 py-2 text-sm bg-card rounded-xl border border-amber-200 focus:border-amber-400 focus:outline-none transition-all resize-none"
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setOpenPaperAccessPostId(null)}
                className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-border hover:bg-muted transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => handleRequestFullPaperAccess(post)}
                disabled={paperAccessRequestingPostId === post.id}
                className="px-4 py-1.5 text-xs font-bold rounded-lg bg-amber-500 text-white hover:bg-amber-600 transition-colors disabled:opacity-40 flex items-center gap-1.5"
              >
                <Send className="w-3 h-3" />
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
                  <input
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
                    disabled={commentingPostId === post.id || !(commentDrafts[post.id] || "").trim()}
                    onClick={() => handleCreateComment(post.id)}
                    className="w-10 h-10 rounded-xl bg-primary text-white flex items-center justify-center hover:bg-primary/90 transition-colors disabled:opacity-40"
                  >
                    <Send className="w-4 h-4" />
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
    <main className="min-h-screen bg-background">
      <AppNav activePage="feed" />

      <div className="max-w-3xl mx-auto px-4 lg:px-6 py-6 pb-24 lg:pb-6 space-y-4">
        {/* Back */}
        <button
          onClick={handleGoBack}
          className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to feed
        </button>

        {/* Topic header */}
        <div className="bg-card rounded-2xl border border-border shadow-sm p-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 via-violet-500 to-blue-600 flex items-center justify-center flex-shrink-0">
              <Hash className="w-6 h-6 text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-primary" />
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
            <FileQuestion className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">No topic selected</p>
            <p className="text-xs text-muted-foreground mt-1">Pick a trending topic from the feed to explore its posts.</p>
          </div>
        ) : posts.length === 0 ? (
          <div className="bg-card rounded-2xl border border-border shadow-sm p-12 text-center">
            <FileQuestion className="w-12 h-12 mx-auto mb-3 text-muted-foreground/30" />
            <p className="text-sm font-semibold text-foreground">No posts for this topic yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              There are no visible posts tagged with “{topic}” right now.
            </p>
          </div>
        ) : (
          posts.map(renderPost)
        )}
      </div>

      {/* File Viewer */}
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

      {/* Report Modal */}
      {reportingPost && (
        <>
          <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40" onClick={() => setReportingPost(null)} />
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="bg-card rounded-2xl border border-border shadow-2xl w-full max-w-md">
              <div className="flex items-center justify-between p-5 border-b border-border">
                <div className="flex items-center gap-2">
                  <Flag className="w-4 h-4 text-red-500" />
                  <h3 className="text-base font-bold text-foreground">Report this post</h3>
                </div>
                <button onClick={() => setReportingPost(null)} className="p-2 rounded-xl hover:bg-muted transition-colors">
                  <X className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
              <div className="p-5 space-y-4">
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Reason</label>
                  <div className="relative">
                    <select
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
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-semibold text-foreground mb-1.5">Details (optional)</label>
                  <textarea
                    value={reportDetails}
                    onChange={(e) => setReportDetails(e.target.value)}
                    rows={4}
                    placeholder="Add any context that will help our team review this report…"
                    className="w-full px-4 py-3 text-sm bg-muted rounded-xl border border-border focus:border-primary focus:bg-white focus:outline-none resize-none transition-all"
                  />
                </div>
                <div className="flex gap-3 pt-1">
                  <button onClick={() => setReportingPost(null)} className="flex-1 py-2.5 rounded-xl border border-border text-sm font-semibold hover:bg-muted transition-colors">
                    Cancel
                  </button>
                  <button
                    onClick={async () => {
                      const p = reportingPost;
                      await handleReportPost(p, reportReason, reportDetails);
                      setReportingPost(null);
                    }}
                    className="flex-1 py-2.5 rounded-xl bg-red-500 text-white text-sm font-bold hover:bg-red-600 transition-colors flex items-center justify-center gap-2"
                  >
                    <Flag className="w-4 h-4" /> Submit Report
                  </button>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </main>
  );
}