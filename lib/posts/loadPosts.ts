import { supabase } from "@/lib/supabase";
import { fetchPostCounts } from "@/lib/postCounts";
import { logDev } from "@/lib/log";
import type {
  Attachment,
  Comment,
  ContentAuthor,
  PaperAccessRequestStatus,
  PlatformAuthor,
  Post,
  Profile,
} from "./types";

/*
 * Loading posts with everything a post card shows: files, comments, co-authors,
 * save and request counts, and the reader's own saves and requests. Shared by
 * the Feed and Topic pages (audit RG-24).
 */

export const PUBLIC_BUCKET_NAME = "content-files";
export const RESTRICTED_BUCKET_NAME = "restricted-papers";

/**
 * Columns of a post any signed-in reader may load. The full text is not one of
 * them: it comes from readable_post_texts(), which only returns it to readers
 * allowed to see it (audit RG-07).
 */
export const POST_COLUMNS =
  "id, title, abstract, content_category, visibility_mode, full_paper_access_mode, allow_full_paper_request, doi, keywords, publication_status, publisher_name, publication_date, post_type, created_at, user_id, profiles:profiles(full_name, email, department, profile_pic_url)";

/** A row selected with POST_COLUMNS. */
export type PostRow = {
  id: string;
  user_id: string | null;
  title: string | null;
  abstract: string | null;
  content_category: string | null;
  visibility_mode: string | null;
  full_paper_access_mode: string | null;
  allow_full_paper_request: boolean | null;
  doi: string | null;
  keywords: string | null;
  publication_status: string | null;
  publisher_name: string | null;
  publication_date: string | null;
  post_type: string | null;
  created_at: string | null;
  profiles: Profile | Profile[] | null;
};

type EmbeddedProfile<T> = T | T[] | null | undefined;

function firstOf<T>(value: EmbeddedProfile<T>): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type CommentRow = Omit<Comment, "profiles"> & { profiles?: EmbeddedProfile<Profile> };
type AuthorRow = Omit<ContentAuthor, "profile"> & { profiles?: EmbeddedProfile<PlatformAuthor> };
type PaperAccessRow = {
  id: string;
  content_id: string;
  requester_id: string;
  owner_id: string;
  status: PaperAccessRequestStatus;
};

/**
 * Full texts the signed-in user may read, by post id. null when they could not
 * be loaded, so callers can keep what is on screen instead of blanking it.
 */
export async function fetchReadableTexts(
  contentIds: string[],
): Promise<Record<string, string | null> | null> {
  const texts: Record<string, string | null> = {};

  if (contentIds.length === 0) return texts;

  const { data, error } = await supabase.rpc("readable_post_texts", {
    content_ids: contentIds,
  });

  if (error) {
    logDev("FETCH POST TEXTS ERROR:", error);
    return null;
  }

  for (const row of (data || []) as { content_id: string; content: string | null }[]) {
    texts[row.content_id] = row.content;
  }

  return texts;
}

/** Drops the posts this user chose to hide. */
export async function withoutHiddenPosts(rows: PostRow[], activeUserId?: string) {
  if (!activeUserId || rows.length === 0) return rows;

  const { data: hiddenRows, error: hiddenError } = await supabase
    .from("hidden_posts")
    .select("content_id")
    .eq("user_id", activeUserId)
    .in(
      "content_id",
      rows.map((item) => item.id),
    );

  if (hiddenError) {
    logDev("FETCH HIDDEN POSTS ERROR:", hiddenError);
  }

  const hiddenSet = new Set(
    ((hiddenRows || []) as { content_id: string }[]).map((row) => row.content_id),
  );

  return rows.filter((item) => !hiddenSet.has(item.id));
}

/**
 * Builds post cards for these rows. Returns null when the files could not be
 * loaded, so the page keeps what it is showing instead of posts without files.
 */
export async function hydratePosts(
  rows: PostRow[],
  activeUserId?: string,
): Promise<Post[] | null> {
  if (rows.length === 0) return [];

  const contentIds = rows.map((item) => item.id);

  const contentOwnerMap: Record<string, string | null> = {};
  rows.forEach((item) => {
    contentOwnerMap[item.id] = item.user_id;
  });

  const { data: attachments, error: attachmentError } = await supabase
    .from("content_attachments")
    .select("*")
    .in("content_id", contentIds)
    .order("created_at", { ascending: true });

  if (attachmentError) {
    logDev("FETCH ATTACHMENTS ERROR:", attachmentError);
    return null;
  }

  // Row level security returns only the viewer's own saves and requests, which
  // is all the "saved" / "requested" flags need. Totals come from fetchPostCounts.
  const [
    commentResult,
    savedResult,
    requestResult,
    counts,
    paperAccessResult,
    authorResult,
    texts,
  ] = await Promise.all([
    supabase
      .from("comments")
      .select(
        "id, content_id, user_id, comment_text, created_at, profiles:profiles(full_name, email, department, profile_pic_url)",
      )
      .in("content_id", contentIds)
      .order("created_at", { ascending: true }),
    supabase
      .from("saved_posts")
      .select("content_id, user_id")
      .in("content_id", contentIds),
    supabase
      .from("research_requests")
      .select("content_id, requester_id, request_type")
      .in("content_id", contentIds)
      .eq("request_type", "collaboration"),
    fetchPostCounts(contentIds),
    supabase
      .from("paper_access_requests")
      .select("id, content_id, requester_id, owner_id, status")
      .in("content_id", contentIds),
    supabase
      .from("content_authors")
      .select(
        "id, content_id, profile_id, manual_name, author_order, author_role, profiles:profiles(id, full_name, email, department, profile_pic_url)",
      )
      .in("content_id", contentIds)
      .order("author_order", { ascending: true }),
    fetchReadableTexts(contentIds),
  ]);

  // Texts could not be loaded: like a failed attachment load, the caller keeps
  // the posts already on screen rather than showing them without their text.
  if (!texts) return null;

  if (commentResult.error) logDev("FETCH COMMENTS ERROR:", commentResult.error);
  if (savedResult.error) logDev("FETCH SAVED POSTS ERROR:", savedResult.error);
  if (requestResult.error) logDev("FETCH REQUESTS ERROR:", requestResult.error);
  if (paperAccessResult.error) logDev("FETCH PAPER ACCESS REQUESTS ERROR:", paperAccessResult.error);
  if (authorResult.error) logDev("FETCH CONTENT AUTHORS ERROR:", authorResult.error);

  const paperAccessStatusMap: Record<string, PaperAccessRequestStatus> = {};
  const approvedAccessSet = new Set<string>();

  ((paperAccessResult.data || []) as PaperAccessRow[]).forEach((request) => {
    if (activeUserId && request.requester_id === activeUserId) {
      paperAccessStatusMap[request.content_id] = request.status;

      if (request.status === "approved") {
        approvedAccessSet.add(request.content_id);
      }
    }
  });

  // Restricted files get short-lived signed links, only for the owner and
  // approved readers (storage rules check the same), in one call per bucket.
  const safeAttachments = (attachments || []) as Attachment[];
  const signedPathsByBucket: Record<string, string[]> = {};

  for (const attachment of safeAttachments) {
    const accessLevel = attachment.access_level || "public";
    if (accessLevel !== "restricted") continue;

    const ownerId = contentOwnerMap[attachment.content_id];
    const isOwner = Boolean(activeUserId && ownerId === activeUserId);
    if (!isOwner && !approvedAccessSet.has(attachment.content_id)) continue;

    const bucketName = attachment.bucket_name || PUBLIC_BUCKET_NAME;
    (signedPathsByBucket[bucketName] ||= []).push(attachment.storage_path);
  }

  const signedUrlMap: Record<string, string> = {};

  await Promise.all(
    Object.entries(signedPathsByBucket).map(async ([bucketName, paths]) => {
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucketName)
        .createSignedUrls(paths, 60 * 60);

      if (signedError) {
        logDev("SIGNED URL ERROR:", signedError);
        return;
      }

      (signedData || []).forEach((item) => {
        if (item.path && item.signedUrl) {
          signedUrlMap[`${bucketName}/${item.path}`] = item.signedUrl;
        }
      });
    }),
  );

  const attachmentMap: Record<string, Attachment[]> = {};

  for (const attachment of safeAttachments) {
    const bucketName = attachment.bucket_name || PUBLIC_BUCKET_NAME;
    const accessLevel = attachment.access_level || "public";

    let fileUrl = attachment.file_url || "";

    if (accessLevel === "public") {
      fileUrl =
        supabase.storage.from(bucketName).getPublicUrl(attachment.storage_path).data
          ?.publicUrl || attachment.file_url;
    }

    if (accessLevel === "restricted") {
      fileUrl = signedUrlMap[`${bucketName}/${attachment.storage_path}`] || "";
    }

    (attachmentMap[attachment.content_id] ||= []).push({
      ...attachment,
      bucket_name: bucketName,
      access_level: accessLevel,
      file_url: fileUrl,
    });
  }

  const commentMap: Record<string, Comment[]> = {};

  ((commentResult.data || []) as CommentRow[]).forEach((comment) => {
    (commentMap[comment.content_id] ||= []).push({
      id: comment.id,
      content_id: comment.content_id,
      user_id: comment.user_id,
      comment_text: comment.comment_text,
      created_at: comment.created_at,
      profiles: firstOf(comment.profiles),
    });
  });

  const authorMap: Record<string, ContentAuthor[]> = {};

  ((authorResult.data || []) as AuthorRow[]).forEach((author) => {
    (authorMap[author.content_id] ||= []).push({
      id: author.id,
      content_id: author.content_id,
      profile_id: author.profile_id,
      manual_name: author.manual_name,
      author_order: author.author_order,
      author_role: author.author_role,
      profile: firstOf(author.profiles),
    });
  });

  const userSavedSet = new Set<string>();

  ((savedResult.data || []) as { content_id: string; user_id: string }[]).forEach((save) => {
    if (activeUserId && save.user_id === activeUserId) {
      userSavedSet.add(save.content_id);
    }
  });

  const userRequestedSet = new Set<string>();

  ((requestResult.data || []) as { content_id: string; requester_id: string }[]).forEach(
    (request) => {
      if (activeUserId && request.requester_id === activeUserId) {
        userRequestedSet.add(request.content_id);
      }
    },
  );

  return rows.map((item) => ({
    id: item.id,
    user_id: item.user_id,
    title: item.title,
    content: texts[item.id] ?? null,
    abstract: item.abstract,
    content_category: item.content_category || "general_post",
    visibility_mode: item.visibility_mode || "public",
    full_paper_access_mode: item.full_paper_access_mode || "public",
    allow_full_paper_request: Boolean(item.allow_full_paper_request),
    doi: item.doi,
    keywords: item.keywords,
    publication_status: item.publication_status,
    publisher_name: item.publisher_name,
    publication_date: item.publication_date,
    post_type: item.post_type,
    created_at: item.created_at,
    profiles: firstOf(item.profiles),
    attachments: attachmentMap[item.id] || [],
    authors: authorMap[item.id] || [],
    comments: commentMap[item.id] || [],
    save_count: counts.saves[item.id] || 0,
    is_saved: userSavedSet.has(item.id),
    request_count: counts.requests[item.id] || 0,
    has_requested: userRequestedSet.has(item.id),
    paper_access_request_status: paperAccessStatusMap[item.id] || null,
    has_full_paper_access: item.user_id === activeUserId || approvedAccessSet.has(item.id),
  }));
}
