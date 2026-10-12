"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { fetchPostCounts } from "@/lib/postCounts";
import { asUploadBody, uploadProblem } from "@/lib/uploadRules";
import { safeFilterTerm } from "@/lib/searchTerm";
import FeedUI, {
  type Attachment,
  type Comment,
  type ContentAuthor,
  type PaperAccessRequestStatus,
  type PlatformAuthor,
  type Post,
} from "./UI";

const PUBLIC_BUCKET_NAME = "content-files";
const RESTRICTED_BUCKET_NAME = "restricted-papers";
// The feed shows the newest 50 posts and grows by 50 with "Load more posts"
// (audit RG-17), up to 150. Each refresh asks for comments, files and authors
// by post id in the request URL, which must stay short.
const FEED_PAGE_SIZE = 50;
const FEED_MAX_POSTS = 150;

function detectAttachmentType(file: File) {
  const name = file.name.toLowerCase();
  const mime = file.type.toLowerCase();

  if (mime.includes("pdf") || name.endsWith(".pdf")) return "pdf";
  if (
    name.endsWith(".doc") ||
    name.endsWith(".docx") ||
    mime.includes("word")
  ) {
    return "document";
  }
  if (
    name.endsWith(".txt") ||
    name.endsWith(".md") ||
    mime.startsWith("text/")
  ) {
    return "text";
  }
  if (
    name.endsWith(".ppt") ||
    name.endsWith(".pptx") ||
    mime.includes("presentation")
  ) {
    return "presentation";
  }
  if (
    name.endsWith(".xls") ||
    name.endsWith(".xlsx") ||
    name.endsWith(".csv") ||
    mime.includes("spreadsheet")
  ) {
    return "spreadsheet";
  }
  if (mime.startsWith("image/")) return "image";
  if (
    name.endsWith(".py") ||
    name.endsWith(".js") ||
    name.endsWith(".ts") ||
    name.endsWith(".java") ||
    name.endsWith(".cpp") ||
    name.endsWith(".c") ||
    name.endsWith(".cs") ||
    name.endsWith(".php") ||
    name.endsWith(".rb") ||
    name.endsWith(".go") ||
    name.endsWith(".rs")
  ) {
    return "code";
  }
  if (name.endsWith(".zip") || name.endsWith(".rar") || name.endsWith(".7z")) {
    return "archive";
  }

  return "other";
}

function getFileExt(file: File) {
  return file.name.split(".").pop()?.toLowerCase() || "bin";
}

export default function FeedClient() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [userId, setUserId] = useState("");
const [fullName, setFullName] = useState("");
const [profilePicUrl, setProfilePicUrl] = useState("");

  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [abstract, setAbstract] = useState("");
  const [postType, setPostType] = useState("research_note");
  const [contentCategory, setContentCategory] = useState("general_post");
  const [visibilityMode, setVisibilityMode] = useState("public");
  const [fullPaperAccessMode, setFullPaperAccessMode] = useState("public");
  const [doi, setDoi] = useState("");
  const [keywords, setKeywords] = useState("");

  const [files, setFiles] = useState<File[]>([]);
  const [fullPaperFile, setFullPaperFile] = useState<File | null>(null);

  const [coAuthorSearch, setCoAuthorSearch] = useState("");
  const [authorSuggestions, setAuthorSuggestions] = useState<PlatformAuthor[]>(
    [],
  );
  const [selectedPlatformAuthors, setSelectedPlatformAuthors] = useState<
    PlatformAuthor[]
  >([]);
  const [manualAuthorName, setManualAuthorName] = useState("");
  const [manualAuthors, setManualAuthors] = useState<string[]>([]);

  const [posts, setPosts] = useState<Post[]>([]);
  const [hasMorePosts, setHasMorePosts] = useState(false);
  const [loadingMorePosts, setLoadingMorePosts] = useState(false);
  // How many of the newest posts every refresh fetches, so posts loaded with
  // "Load more posts" stay on screen when the feed refreshes.
  const feedLimitRef = useRef(FEED_PAGE_SIZE);
  const loadingMorePostsRef = useRef(false);
  // Refreshes can finish out of order. A result is shown only if no newer
  // refresh has been shown already.
  const feedRequestCounterRef = useRef(0);
  const shownFeedRequestRef = useRef(0);
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>(
    {},
  );
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  const [savingPostId, setSavingPostId] = useState<string | null>(null);
  const [openRequestPostId, setOpenRequestPostId] = useState<string | null>(
    null,
  );
  const [requestDrafts, setRequestDrafts] = useState<Record<string, string>>(
    {},
  );
  const [requestingPostId, setRequestingPostId] = useState<string | null>(null);

  const [paperAccessRequestDrafts, setPaperAccessRequestDrafts] = useState<
    Record<string, string>
  >({});
  const [openPaperAccessPostId, setOpenPaperAccessPostId] = useState<
    string | null
  >(null);
  const [paperAccessRequestingPostId, setPaperAccessRequestingPostId] =
    useState<string | null>(null);

  const selectedFileNames = useMemo(
    () => files.map((file) => file.name),
    [files],
  );

  useEffect(() => {
    const searchAuthors = async () => {
      // Typed text goes inside a PostgREST or() filter; strip the characters that
      // could end the filter early and add conditions of their own (audit RG-16).
      const query = safeFilterTerm(coAuthorSearch);

      if (query.length < 2) {
        setAuthorSuggestions([]);
        return;
      }

      const { data, error } = await supabase
        .from("profiles")
        .select("id, full_name, email, department, profile_pic_url")
        .or(
          `full_name.ilike.%${query}%,email.ilike.%${query}%,department.ilike.%${query}%`,
        )
        .limit(8);

      if (error) {
        console.log("AUTHOR SEARCH ERROR:", error);
        setAuthorSuggestions([]);
        return;
      }

      const safeData = ((data || []) as PlatformAuthor[]).filter(
        (profile) =>
          profile.id !== userId &&
          !selectedPlatformAuthors.some((author) => author.id === profile.id),
      );

      setAuthorSuggestions(safeData);
    };

    searchAuthors();
  }, [coAuthorSearch, selectedPlatformAuthors, userId]);

  const fetchPosts = async (activeUserId?: string) => {
    const requestId = ++feedRequestCounterRef.current;
    const isOutdated = () => requestId <= shownFeedRequestRef.current;
    const showPosts = (nextPosts: Post[], moreAvailable: boolean) => {
      if (isOutdated()) return;
      shownFeedRequestRef.current = requestId;
      setPosts(nextPosts);
      setHasMorePosts(moreAvailable);
    };

    const limit = feedLimitRef.current;

    // One extra row tells us whether older posts exist.
    const { data: contents, error: contentError } = await supabase
      .from("contents")
      .select(
        "id, title, content, abstract, content_category, visibility_mode, full_paper_access_mode, allow_full_paper_request, doi, keywords, publication_status, publisher_name, publication_date, post_type, created_at, user_id, profiles:profiles(full_name, email, department, profile_pic_url)",
      )
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (contentError) {
      console.log("FETCH CONTENTS ERROR:", contentError);
      return;
    }

    // A newer refresh is already on screen; skip the rest of the work.
    if (isOutdated()) return;

    const moreAvailable =
      (contents || []).length > limit && limit < FEED_MAX_POSTS;

    if (!contents || contents.length === 0) {
      showPosts([], false);
      return;
    }

    const rawContents = contents.slice(0, limit) as any[];
    let visibleContents = rawContents;

    if (activeUserId && rawContents.length > 0) {
      const rawContentIds = rawContents.map((item) => item.id);

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("hidden_posts")
        .select("content_id")
        .eq("user_id", activeUserId)
        .in("content_id", rawContentIds);

      if (hiddenError) {
        console.log("FETCH HIDDEN POSTS ERROR:", hiddenError);
      }

      const hiddenSet = new Set(
        (hiddenRows || []).map((row: any) => row.content_id),
      );

      visibleContents = rawContents.filter((item) => !hiddenSet.has(item.id));
    }

    if (visibleContents.length === 0) {
      showPosts([], moreAvailable);
      return;
    }

    const contentIds = visibleContents.map((item) => item.id);

    const contentOwnerMap: Record<string, string | null> = {};
    visibleContents.forEach((item) => {
      contentOwnerMap[item.id] = item.user_id;
    });

    const { data: attachments, error: attachmentError } = await supabase
      .from("content_attachments")
      .select("*")
      .in("content_id", contentIds)
      .order("created_at", { ascending: true });

    if (attachmentError) {
      console.log("FETCH ATTACHMENTS ERROR:", attachmentError);
      return;
    }

    const { data: comments, error: commentError } = await supabase
      .from("comments")
      .select(
        "id, content_id, user_id, comment_text, created_at, profiles:profiles(full_name, email, department, profile_pic_url)",
      )
      .in("content_id", contentIds)
      .order("created_at", { ascending: true });

    if (commentError) {
      console.log("FETCH COMMENTS ERROR:", commentError);
    }

    // Row level security returns only the viewer's own saves and requests, which
    // is all the "saved" / "requested" flags need. Totals come from fetchPostCounts.
    const { data: savedRows, error: savedError } = await supabase
      .from("saved_posts")
      .select("content_id, user_id")
      .in("content_id", contentIds);

    if (savedError) {
      console.log("FETCH SAVED POSTS ERROR:", savedError);
    }

    const { data: requestRows, error: requestError } = await supabase
      .from("research_requests")
      .select("content_id, requester_id, request_type")
      .in("content_id", contentIds)
      .eq("request_type", "collaboration");

    if (requestError) {
      console.log("FETCH REQUESTS ERROR:", requestError);
    }

    const { saves: saveCountMap, requests: requestCountMap } =
      await fetchPostCounts(contentIds);

    const { data: paperAccessRows, error: paperAccessError } = await supabase
      .from("paper_access_requests")
      .select("id, content_id, requester_id, owner_id, status")
      .in("content_id", contentIds);

    if (paperAccessError) {
      console.log("FETCH PAPER ACCESS REQUESTS ERROR:", paperAccessError);
    }

    const { data: authorRows, error: authorError } = await supabase
      .from("content_authors")
      .select(
        "id, content_id, profile_id, manual_name, author_order, author_role, profiles:profiles(id, full_name, email, department, profile_pic_url)",
      )
      .in("content_id", contentIds)
      .order("author_order", { ascending: true });

    if (authorError) {
      console.log("FETCH CONTENT AUTHORS ERROR:", authorError);
    }

    const paperAccessStatusMap: Record<string, PaperAccessRequestStatus> = {};
    const approvedAccessSet = new Set<string>();

    (paperAccessRows || []).forEach((request: any) => {
      if (activeUserId && request.requester_id === activeUserId) {
        paperAccessStatusMap[request.content_id] = request.status;
      }

      if (
        activeUserId &&
        request.requester_id === activeUserId &&
        request.status === "approved"
      ) {
        approvedAccessSet.add(request.content_id);
      }
    });

    const attachmentMap: Record<string, Attachment[]> = {};

    for (const attachmentItem of attachments || []) {
      const attachment = attachmentItem as Attachment;
      const bucketName = attachment.bucket_name || PUBLIC_BUCKET_NAME;
      const accessLevel = attachment.access_level || "public";
      const ownerId = contentOwnerMap[attachment.content_id];
      const isOwner = activeUserId && ownerId === activeUserId;
      const hasApprovedAccess = approvedAccessSet.has(attachment.content_id);

      let fileUrl = attachment.file_url || "";

      if (accessLevel === "public") {
        fileUrl =
          supabase.storage
            .from(bucketName)
            .getPublicUrl(attachment.storage_path).data?.publicUrl ||
          attachment.file_url;
      }

      if (accessLevel === "restricted") {
        if (isOwner || hasApprovedAccess) {
          const { data: signedData, error: signedError } =
            await supabase.storage
              .from(bucketName)
              .createSignedUrl(attachment.storage_path, 60 * 60);

          if (signedError) {
            console.log("SIGNED URL ERROR:", signedError);
          }

          fileUrl = signedData?.signedUrl || "";
        } else {
          fileUrl = "";
        }
      }

      if (!attachmentMap[attachment.content_id]) {
        attachmentMap[attachment.content_id] = [];
      }

      attachmentMap[attachment.content_id].push({
        ...attachment,
        bucket_name: bucketName,
        access_level: accessLevel,
        file_url: fileUrl,
      });
    }

    const commentMap: Record<string, Comment[]> = {};

    (comments || []).forEach((comment: any) => {
      if (!commentMap[comment.content_id]) {
        commentMap[comment.content_id] = [];
      }

      commentMap[comment.content_id].push({
        id: comment.id,
        content_id: comment.content_id,
        user_id: comment.user_id,
        comment_text: comment.comment_text,
        created_at: comment.created_at,
        profiles: Array.isArray(comment.profiles)
          ? (comment.profiles[0] ?? null)
          : (comment.profiles ?? null),
      });
    });

    const authorMap: Record<string, ContentAuthor[]> = {};

    (authorRows || []).forEach((author: any) => {
      if (!authorMap[author.content_id]) {
        authorMap[author.content_id] = [];
      }

      authorMap[author.content_id].push({
        id: author.id,
        content_id: author.content_id,
        profile_id: author.profile_id,
        manual_name: author.manual_name,
        author_order: author.author_order,
        author_role: author.author_role,
        profile: Array.isArray(author.profiles)
          ? (author.profiles[0] ?? null)
          : (author.profiles ?? null),
      });
    });

    const userSavedSet = new Set<string>();

    (savedRows || []).forEach((save: any) => {
      if (activeUserId && save.user_id === activeUserId) {
        userSavedSet.add(save.content_id);
      }
    });

    const userRequestedSet = new Set<string>();

    (requestRows || []).forEach((request: any) => {
      if (activeUserId && request.requester_id === activeUserId) {
        userRequestedSet.add(request.content_id);
      }
    });

    const normalized = visibleContents.map((item) => ({
      id: item.id,
      user_id: item.user_id,
      title: item.title,
      content: item.content,
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
      profiles: Array.isArray(item.profiles)
        ? (item.profiles[0] ?? null)
        : (item.profiles ?? null),
      attachments: attachmentMap[item.id] || [],
      authors: authorMap[item.id] || [],
      comments: commentMap[item.id] || [],
      save_count: saveCountMap[item.id] || 0,
      is_saved: userSavedSet.has(item.id),
      request_count: requestCountMap[item.id] || 0,
      has_requested: userRequestedSet.has(item.id),
      paper_access_request_status: paperAccessStatusMap[item.id] || null,
      has_full_paper_access:
        item.user_id === activeUserId || approvedAccessSet.has(item.id),
    })) as Post[];

    showPosts(normalized, moreAvailable);
  };

  const handleLoadMorePosts = async () => {
    if (!userId || loadingMorePostsRef.current) return;

    loadingMorePostsRef.current = true;
    setLoadingMorePosts(true);
    feedLimitRef.current = Math.min(
      FEED_MAX_POSTS,
      feedLimitRef.current + FEED_PAGE_SIZE,
    );

    try {
      await fetchPosts(userId);
    } finally {
      loadingMorePostsRef.current = false;
      setLoadingMorePosts(false);
    }
  };

  useEffect(() => {
   const load = async () => {
  setLoading(true);

  try {
    const authUser = await getCurrentUserSafe();

    if (!authUser) {
      router.push("/auth/login");
      return;
    }

    const currentUserId = authUser.id;

    setUserId(currentUserId);

    const { data: profileData, error: profileError } = await supabase
      .from("profiles")
     .select(
  "full_name, department, skills, interests, user_role, academic_level, onboarding_completed, profile_pic_url",
)
      .eq("id", currentUserId)
      .maybeSingle();

    if (profileError) {
      console.log("FEED PROFILE CHECK ERROR:", profileError);
    }

    const needsOnboarding =
      !profileData ||
      !profileData.onboarding_completed ||
      !profileData.full_name ||
      !profileData.department ||
      !profileData.skills ||
      !profileData.interests ||
      !profileData.user_role ||
      !profileData.academic_level;

    if (needsOnboarding) {
      router.push("/onboarding?next=/feed");
      return;
    }

    setFullName(profileData.full_name || "");
    setProfilePicUrl(profileData.profile_pic_url || "");

    await fetchPosts(currentUserId);
  } catch (error) {
    if (isAuthLockError(error)) {
      console.log("FEED AUTH LOCK ERROR:", error);
      return;
    }

    console.log("FEED LOAD ERROR:", error);
  } finally {
    setLoading(false);
  }
};

    load();
  }, [router]);
  useEffect(() => {
  if (!userId) return;

  let refreshTimer: ReturnType<typeof setTimeout> | null = null;

  const scheduleFeedRefresh = () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    refreshTimer = setTimeout(() => {
      fetchPosts(userId);
    }, 800);
  };

  const channel = supabase
    .channel(`feed-realtime-${userId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "contents",
      },
      scheduleFeedRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "comments",
      },
      scheduleFeedRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "content_attachments",
      },
      scheduleFeedRefresh,
    )
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "content_authors",
      },
      scheduleFeedRefresh,
    )
    .subscribe();

  return () => {
    if (refreshTimer) {
      clearTimeout(refreshTimer);
    }

    supabase.removeChannel(channel);
  };
}, [userId]);

  const resetPostForm = () => {
    setTitle("");
    setContent("");
    setAbstract("");
    setPostType("research_note");
    setContentCategory("general_post");
    setVisibilityMode("public");
    setFullPaperAccessMode("public");
    setDoi("");
    setKeywords("");
    setFiles([]);
    setFullPaperFile(null);
    setCoAuthorSearch("");
    setAuthorSuggestions([]);
    setSelectedPlatformAuthors([]);
    setManualAuthorName("");
    setManualAuthors([]);
  };

  const handleAddPlatformAuthor = (profile: PlatformAuthor) => {
    if (selectedPlatformAuthors.some((author) => author.id === profile.id)) {
      return;
    }

    setSelectedPlatformAuthors((prev) => [...prev, profile]);
    setCoAuthorSearch("");
    setAuthorSuggestions([]);
  };

  const handleRemovePlatformAuthor = (profileId: string) => {
    setSelectedPlatformAuthors((prev) =>
      prev.filter((author) => author.id !== profileId),
    );
  };

  const handleAddManualAuthor = () => {
    const cleanName = manualAuthorName.trim();

    if (!cleanName) return;

    if (manualAuthors.includes(cleanName)) {
      setManualAuthorName("");
      return;
    }

    setManualAuthors((prev) => [...prev, cleanName]);
    setManualAuthorName("");
  };

  const handleRemoveManualAuthor = (name: string) => {
    setManualAuthors((prev) =>
      prev.filter((authorName) => authorName !== name),
    );
  };

  const uploadAttachment = async ({
    file,
    contentId,
    index,
    bucketName,
    accessLevel,
    fileRole,
    isFullPaper,
    isPreviewFile,
  }: {
    file: File;
    contentId: string;
    index: number;
    bucketName: string;
    accessLevel: "public" | "restricted";
    fileRole: string;
    isFullPaper: boolean;
    isPreviewFile: boolean;
  }) => {
    const ext = getFileExt(file);
    const attachmentType = detectAttachmentType(file);
    const storagePath = `uploads/${userId}/${contentId}/${Date.now()}-${index}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from(bucketName)
      .upload(storagePath, asUploadBody(file), {
        cacheControl: "3600",
        upsert: false,
      });

    if (uploadError) {
      throw new Error(uploadError.message);
    }

    let fileUrl = "";

    if (accessLevel === "public") {
      const { data: publicData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      fileUrl = publicData.publicUrl;
    }

    const { error: attachmentInsertError } = await supabase
      .from("content_attachments")
      .insert({
        content_id: contentId,
        file_url: fileUrl,
        storage_path: storagePath,
        original_name: file.name,
        mime_type: file.type || null,
        file_ext: ext,
        file_size: file.size,
        attachment_type: attachmentType,
        bucket_name: bucketName,
        access_level: accessLevel,
        file_role: fileRole,
        is_full_paper: isFullPaper,
        is_preview_file: isPreviewFile,
      });

    if (attachmentInsertError) {
      throw new Error(attachmentInsertError.message);
    }
  };

  const handleCreatePost = async () => {
    if (!title.trim()) {
      alert("Add a title first");
      return;
    }

    if (!content.trim() && !abstract.trim()) {
      alert("Write content or abstract first");
      return;
    }

    const isPaper = contentCategory === "research_paper";

    if (isPaper && !abstract.trim()) {
      alert("For research paper posts, abstract is required.");
      return;
    }

    if (
      isPaper &&
      fullPaperAccessMode === "request_required" &&
      !fullPaperFile
    ) {
      alert("Upload the full paper file for request-based access.");
      return;
    }

    // Check every file before the post exists, so a rejected file cannot leave
    // a half-made post behind (audit RG-21).
    const fileProblem = [fullPaperFile, ...files]
      .filter((file): file is File => Boolean(file))
      .map((file) => uploadProblem(file))
      .find(Boolean);

    if (fileProblem) {
      alert(fileProblem);
      return;
    }

    setUploading(true);

    const shouldAllowFullPaperRequest =
      isPaper && fullPaperAccessMode === "request_required";

    const { data: insertedContent, error: insertError } = await supabase
      .from("contents")
      .insert({
        user_id: userId,
        title: title.trim(),
        content: content.trim(),
        abstract: abstract.trim() || null,
        post_type: postType,
        content_category: contentCategory,
        visibility_mode: visibilityMode,
        full_paper_access_mode: fullPaperAccessMode,
        allow_full_paper_request: shouldAllowFullPaperRequest,
        doi: doi.trim() || null,
        keywords: keywords.trim() || null,
        publication_status: "published",
      })
      .select("id")
      .single();

    if (insertError || !insertedContent) {
      console.log("INSERT CONTENT ERROR:", insertError);
      alert(insertError?.message || "Could not create post");
      setUploading(false);
      return;
    }

    const contentId = insertedContent.id;

    try {
      if (fullPaperFile) {
        const restricted =
          isPaper &&
          (fullPaperAccessMode === "request_required" ||
            fullPaperAccessMode === "private");

        await uploadAttachment({
          file: fullPaperFile,
          contentId,
          index: 0,
          bucketName: restricted ? RESTRICTED_BUCKET_NAME : PUBLIC_BUCKET_NAME,
          accessLevel: restricted ? "restricted" : "public",
          fileRole: "full_paper",
          isFullPaper: true,
          isPreviewFile: false,
        });
      }

      if (files.length > 0) {
        for (let i = 0; i < files.length; i++) {
          await uploadAttachment({
            file: files[i],
            contentId,
            index: i + 1,
            bucketName: PUBLIC_BUCKET_NAME,
            accessLevel: "public",
            fileRole: "attachment",
            isFullPaper: false,
            isPreviewFile: true,
          });
        }
      }

      const authorRows = [
        ...selectedPlatformAuthors.map((author, index) => ({
          content_id: contentId,
          profile_id: author.id,
          manual_name: null,
          author_order: index + 1,
          author_role: "co_author",
        })),
        ...manualAuthors.map((authorName, index) => ({
          content_id: contentId,
          profile_id: null,
          manual_name: authorName,
          author_order: selectedPlatformAuthors.length + index + 1,
          author_role: "co_author",
        })),
      ];

      if (authorRows.length > 0) {
        const { error: authorError } = await supabase
          .from("content_authors")
          .insert(authorRows);

        if (authorError) {
          throw new Error(authorError.message);
        }
      }
    } catch (error) {
      console.log("POST UPLOAD/AUTHOR ERROR:", error);
      alert(error instanceof Error ? error.message : "Could not finish post.");
      setUploading(false);
      return;
    }

    resetPostForm();
    await fetchPosts(userId);
    setUploading(false);
  };

  const handleCreateComment = async (contentId: string) => {
    const commentText = commentDrafts[contentId]?.trim();

    if (!commentText) {
      alert("Write a comment first.");
      return;
    }

    if (!userId) {
      alert("You must be logged in to comment.");
      return;
    }

    setCommentingPostId(contentId);

    const { error } = await supabase.from("comments").insert({
      content_id: contentId,
      user_id: userId,
      comment_text: commentText,
    });

    if (error) {
      console.log("COMMENT INSERT ERROR:", error);
      alert(error.message);
      setCommentingPostId(null);
      return;
    }

    setCommentDrafts((prev) => ({
      ...prev,
      [contentId]: "",
    }));

    await fetchPosts(userId);
    setCommentingPostId(null);
    const targetPost = posts.find((item) => item.id === contentId);

    if (targetPost?.user_id && targetPost.user_id !== userId) {
      await createNotification({
        recipientId: targetPost.user_id,
        actorId: userId,
        notificationType: "comment",
        title: "New comment on your post",
        body: `${fullName || "A researcher"} commented on your post: ${
          targetPost.title || "Untitled post"
        }`,
        linkUrl: `/feed?post=${targetPost.id}`,
        contentId: targetPost.id,
      });
    }
  };

  const handleToggleSave = async (post: Post) => {
    if (!userId) {
      alert("You must be logged in to save posts.");
      return;
    }

    setSavingPostId(post.id);

    if (post.is_saved) {
      const { error } = await supabase
        .from("saved_posts")
        .delete()
        .eq("user_id", userId)
        .eq("content_id", post.id);

      if (error) {
        console.log("UNSAVE POST ERROR:", error);
        alert(error.message);
        setSavingPostId(null);
        return;
      }
    } else {
      const { error } = await supabase.from("saved_posts").insert({
        user_id: userId,
        content_id: post.id,
      });

      if (error) {
        console.log("SAVE POST ERROR:", error);
        alert(error.message);
        setSavingPostId(null);
        return;
      }
    }

    await fetchPosts(userId);
    setSavingPostId(null);
  };

  const handleSendCollaborationRequest = async (post: Post) => {
    if (!userId) {
      alert("You must be logged in to request collaboration.");
      return;
    }

    if (!post.user_id) {
      alert("This post does not have a valid author.");
      return;
    }

    if (post.user_id === userId) {
      alert("You cannot request collaboration on your own post.");
      return;
    }

    const message =
      requestDrafts[post.id]?.trim() ||
      "I am interested in collaborating on this research work.";

    setRequestingPostId(post.id);

    const { data: insertedRequest, error } = await supabase
      .from("research_requests")
      .insert({
        content_id: post.id,
        requester_id: userId,
        receiver_id: post.user_id,
        request_type: "collaboration",
        message,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.log("COLLABORATION REQUEST ERROR:", error);
      alert(error.message);
      setRequestingPostId(null);
      return;
    }

    setRequestDrafts((prev) => ({
      ...prev,
      [post.id]: "",
    }));

    setOpenRequestPostId(null);

    await fetchPosts(userId);
    setRequestingPostId(null);
    await createNotification({
      recipientId: post.user_id,
      actorId: userId,
      notificationType: "collaboration_request",
      title: "New collaboration request",
      body: `${fullName || "A researcher"} requested to collaborate on: ${
        post.title || "Untitled post"
      }`,
      linkUrl: "/requests",
      contentId: post.id,
      requestId: insertedRequest?.id,
      requestKind: "research",
    });
  };

  const handleRequestFullPaperAccess = async (post: Post) => {
    if (!userId) {
      alert("You must be logged in to request paper access.");
      return;
    }

    if (!post.user_id) {
      alert("This paper does not have a valid owner.");
      return;
    }

    if (post.user_id === userId) {
      alert("This is your own paper.");
      return;
    }

    if (post.paper_access_request_status) {
      alert(`Access request already ${post.paper_access_request_status}.`);
      return;
    }

    const reason =
      paperAccessRequestDrafts[post.id]?.trim() ||
      "I would like to read the full paper for academic/research purpose.";

    setPaperAccessRequestingPostId(post.id);

    const { data: insertedRequest, error } = await supabase
      .from("paper_access_requests")
      .insert({
        content_id: post.id,
        requester_id: userId,
        owner_id: post.user_id,
        reason,
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.log("PAPER ACCESS REQUEST ERROR:", error);
      alert(error.message);
      setPaperAccessRequestingPostId(null);
      return;
    }

    setPaperAccessRequestDrafts((prev) => ({
      ...prev,
      [post.id]: "",
    }));

    setOpenPaperAccessPostId(null);
    await fetchPosts(userId);
    setPaperAccessRequestingPostId(null);
    alert("Full paper access request sent.");
    await createNotification({
      recipientId: post.user_id,
      actorId: userId,
      notificationType: "paper_access_request",
      title: "New full paper access request",
      body: `${fullName || "A researcher"} requested access to your paper: ${
        post.title || "Untitled paper"
      }`,
      linkUrl: "/requests",
      contentId: post.id,
      requestId: insertedRequest?.id,
      requestKind: "paper_access",
    });
  };
  const handleCopyPostLink = async (post: Post) => {
    const link = `${window.location.origin}/feed?post=${post.id}`;

    try {
      await navigator.clipboard.writeText(link);
      alert("Post link copied.");
    } catch {
      window.prompt("Copy this post link:", link);
    }
  };

  const handleHidePost = async (post: Post) => {
    if (!userId) {
      alert("You must be logged in to hide posts.");
      return;
    }

    const confirmed = window.confirm(
      "Hide this post from your feed? You can still find it later through direct links or search if available.",
    );

    if (!confirmed) return;

    const { error } = await supabase.from("hidden_posts").insert({
      content_id: post.id,
      user_id: userId,
    });

    if (error) {
      if (error.code === "23505") {
        await fetchPosts(userId);
        return;
      }

      console.log("HIDE POST ERROR:", error);
      alert(error.message);
      return;
    }

    await fetchPosts(userId);
  };

  const handleReportPost = async (
    post: Post,
    reason: string,
    details: string,
  ) => {
    if (!userId) {
      alert("You must be logged in to report posts.");
      return;
    }

    if (post.user_id === userId) {
      alert("You cannot report your own post.");
      return;
    }

    const { error } = await supabase.from("post_reports").insert({
      content_id: post.id,
      reporter_id: userId,
      reason,
      details: details.trim() || null,
      status: "pending",
    });

    if (error) {
      if (error.code === "23505") {
        alert("You have already reported this post.");
        return;
      }

      console.log("REPORT POST ERROR:", error);
      alert(error.message);
      return;
    }

    alert("Report submitted. Thank you for helping keep ResearchGram safe.");
  };

  return (
    <FeedUI
  loading={loading}
  uploading={uploading}
  userId={userId}
  fullName={fullName}
  profilePicUrl={profilePicUrl}
      title={title}
      content={content}
      abstract={abstract}
      postType={postType}
      contentCategory={contentCategory}
      visibilityMode={visibilityMode}
      fullPaperAccessMode={fullPaperAccessMode}
      doi={doi}
      keywords={keywords}
      fullPaperFile={fullPaperFile}
      posts={posts}
      selectedFileNames={selectedFileNames}
      coAuthorSearch={coAuthorSearch}
      authorSuggestions={authorSuggestions}
      selectedPlatformAuthors={selectedPlatformAuthors}
      manualAuthorName={manualAuthorName}
      manualAuthors={manualAuthors}
      commentDrafts={commentDrafts}
      commentingPostId={commentingPostId}
      savingPostId={savingPostId}
      openRequestPostId={openRequestPostId}
      requestDrafts={requestDrafts}
      requestingPostId={requestingPostId}
      openPaperAccessPostId={openPaperAccessPostId}
      paperAccessRequestDrafts={paperAccessRequestDrafts}
      paperAccessRequestingPostId={paperAccessRequestingPostId}
      setTitle={setTitle}
      setContent={setContent}
      setAbstract={setAbstract}
      setPostType={setPostType}
      setContentCategory={setContentCategory}
      setVisibilityMode={setVisibilityMode}
      setFullPaperAccessMode={setFullPaperAccessMode}
      setDoi={setDoi}
      setKeywords={setKeywords}
      setFiles={setFiles}
      setFullPaperFile={setFullPaperFile}
      setCoAuthorSearch={setCoAuthorSearch}
      setManualAuthorName={setManualAuthorName}
      setCommentDrafts={setCommentDrafts}
      setOpenRequestPostId={setOpenRequestPostId}
      setRequestDrafts={setRequestDrafts}
      setOpenPaperAccessPostId={setOpenPaperAccessPostId}
      setPaperAccessRequestDrafts={setPaperAccessRequestDrafts}
      handleAddPlatformAuthor={handleAddPlatformAuthor}
      handleRemovePlatformAuthor={handleRemovePlatformAuthor}
      handleAddManualAuthor={handleAddManualAuthor}
      handleRemoveManualAuthor={handleRemoveManualAuthor}
      handleCreatePost={handleCreatePost}
      handleCreateComment={handleCreateComment}
      handleToggleSave={handleToggleSave}
      handleSendCollaborationRequest={handleSendCollaborationRequest}
      handleRequestFullPaperAccess={handleRequestFullPaperAccess}
      handleCopyPostLink={handleCopyPostLink}
      handleHidePost={handleHidePost}
      handleReportPost={handleReportPost}
      handleGoToWorkspace={() => router.push("/workspace")}
      handleGoToMentorship={() => router.push("/mentorship")}
      handleGoToResearcher={(profileId) =>
        router.push(`/researchers/${profileId}`)
      }
      handleGoToRecommendations={(postId) =>
        router.push(`/recommendations?postId=${postId}`)
      }
      hasMorePosts={hasMorePosts}
      loadingMorePosts={loadingMorePosts}
      handleLoadMorePosts={handleLoadMorePosts}
    />
  );
}
