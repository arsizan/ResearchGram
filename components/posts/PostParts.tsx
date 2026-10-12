"use client";

import {
  BarChart2,
  BookOpen,
  Code,
  Database,
  Download,
  FileText,
  Image as ImageIcon,
  Lock,
  Presentation,
} from "lucide-react";
import type { ViewerFile } from "@/components/FileViewerModal";
import type { Attachment, ContentAuthor } from "@/lib/posts/types";

// Small pieces of a post card shared by the Feed and Topic pages (audit RG-24).

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

export function formatPostTime(dateString: string | null) {
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

export function formatFileSize(bytes: number | null) {
  if (!bytes || bytes <= 0) return "Unknown size";
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export function formatLabel(value: string | null | undefined) {
  return (value || "general_post").replaceAll("_", " ");
}

export function getAuthorName(author: ContentAuthor) {
  return (
    author.profile?.full_name ||
    author.profile?.email?.split("@")[0] ||
    author.manual_name ||
    "Unnamed author"
  );
}

export function attachmentToViewerFile(att: Attachment): ViewerFile {
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

function colorFromString(s: string) {
  const palette = ["#4f46e5", "#7c3aed", "#0e7490", "#047857", "#dc2626", "#b45309"];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash * 31 + s.charCodeAt(i)) | 0;
  return palette[Math.abs(hash) % palette.length];
}

function getInitials(name: string | null | undefined) {
  if (!name) return "U";
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase() || "U";
}

export function Avatar({
  name,
  picUrl,
  size = "md",
}: {
  name: string;
  picUrl?: string | null;
  size?: "xs" | "sm" | "md" | "lg";
}) {
  const s = {
    xs: "w-6 h-6 text-[10px]",
    sm: "w-8 h-8 text-xs",
    md: "w-10 h-10 text-sm",
    lg: "w-14 h-14 text-base",
  }[size];
  const color = colorFromString(name || "U");
  const initials = getInitials(name);
  return (
    <div
      className={`${s} rounded-full flex items-center justify-center font-bold text-white flex-shrink-0 overflow-hidden`}
      style={{ backgroundColor: color }}
    >
      {picUrl ? (
        // User photos come from Supabase Storage at any size; next/image would
        // send every one through Vercel's optimiser, so a plain lazy img is used.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={picUrl} alt={name} loading="lazy" decoding="async" className="w-full h-full object-cover" />
      ) : (
        <span aria-hidden="true">{initials}</span>
      )}
    </div>
  );
}

export function TypeBadge({ postType }: { postType: string | null }) {
  const key = postType || "research_note";
  return (
    <span
      className={`inline-flex items-center text-[11px] font-semibold px-2.5 py-0.5 rounded-full border ${
        POST_TYPE_STYLE[key] ?? POST_TYPE_STYLE.research_note
      }`}
    >
      {POST_TYPE_LABEL[key] ?? formatLabel(key)}
    </span>
  );
}

function AttachmentTypeIcon({ type, className }: { type: string; className: string }) {
  switch (type) {
    case "presentation":
      return <Presentation className={className} aria-hidden="true" />;
    case "spreadsheet":
      return <BarChart2 className={className} aria-hidden="true" />;
    case "image":
      return <ImageIcon className={className} aria-hidden="true" />;
    case "code":
      return <Code className={className} aria-hidden="true" />;
    case "archive":
      return <Database className={className} aria-hidden="true" />;
    default:
      return <FileText className={className} aria-hidden="true" />;
  }
}

export function AttachmentPreview({ att, onOpen }: { att: Attachment; onOpen: () => void }) {
  const publicUrl = att.file_url;
  const isRestricted = att.access_level === "restricted";
  const isFullPaper = Boolean(att.is_full_paper);
  const isImage = att.attachment_type === "image" || att.mime_type?.startsWith("image/");
  const isPdf =
    att.attachment_type === "pdf" || att.mime_type === "application/pdf" || att.file_ext === "pdf";

  if (isRestricted && !publicUrl) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-3 flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center flex-shrink-0">
          <Lock className="w-5 h-5 text-amber-600" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-amber-900 truncate">
            {att.original_name || "Restricted full paper"}
          </p>
          <p className="text-xs text-amber-700 mt-0.5">
            Full paper restricted. Request access to view or download.
          </p>
        </div>
      </div>
    );
  }

  if (isImage && publicUrl) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="block w-full overflow-hidden rounded-xl border border-border bg-card text-left hover:shadow-md transition-shadow"
      >
        {/* Uploaded images come from Supabase Storage; see Avatar. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={publicUrl}
          alt={att.original_name || "Research attachment"}
          loading="lazy"
          decoding="async"
          className="w-full max-h-[420px] object-cover bg-slate-100"
        />
        <div className="px-3 py-2 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2 min-w-0">
            <ImageIcon className="w-4 h-4 text-blue-500 flex-shrink-0" aria-hidden="true" />
            <span className="text-xs text-foreground font-medium truncate">
              {att.original_name || "Image"}
            </span>
          </div>
          <span className="text-xs text-primary font-semibold whitespace-nowrap">Open</span>
        </div>
      </button>
    );
  }

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
        {isFullPaper ? (
          <BookOpen className="w-5 h-5" aria-hidden="true" />
        ) : (
          <AttachmentTypeIcon type={att.attachment_type} className="w-5 h-5" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground truncate">
          {att.original_name || "Research attachment"}
        </p>
        <p className="text-xs text-muted-foreground">
          {isFullPaper ? "Full paper · " : ""}
          {formatLabel(att.attachment_type)} · {formatFileSize(att.file_size)}
        </p>
      </div>
      <Download
        className="w-4 h-4 text-muted-foreground group-hover:text-primary transition-colors flex-shrink-0"
        aria-hidden="true"
      />
    </button>
  );
}
