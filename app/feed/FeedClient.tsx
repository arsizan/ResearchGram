"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { logDev } from "@/lib/log";
import { asUploadBody, uploadProblem } from "@/lib/uploadRules";
import { safeFilterTerm } from "@/lib/searchTerm";
import {
  POST_COLUMNS,
  PUBLIC_BUCKET_NAME,
  RESTRICTED_BUCKET_NAME,
  hydratePosts,
  withoutHiddenPosts,
  type PostRow,
} from "@/lib/posts/loadPosts";
import { usePostActions } from "@/lib/posts/usePostActions";
import FeedUI, { type PlatformAuthor, type Post } from "./UI";
import { friendlyError, isUnclearFailure, notify } from "@/lib/feedback";
import { newId } from "@/lib/ids";

// The feed shows the newest 50 posts and grows by 50 with "Load more posts"
// (audit RG-17), up to 150. Each refresh asks for comments, files and authors
// by post id in the request URL, which must stay short.
const FEED_PAGE_SIZE = 50;
const FEED_MAX_POSTS = 150;

// A file uploaded for a new post, described for create_post().
type PendingAttachment = {
  storage_path: string;
  bucket_name: string;
  file_url: string;
  original_name: string;
  mime_type: string | null;
  file_ext: string;
  file_size: number;
  attachment_type: string;
  file_role: "full_paper" | "attachment";
};

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

// The extension goes into the storage path, so only letters and digits:
// "Lab notes" (no extension) or "data.tar gz" would otherwise put a space
// there and break the file's link.
function getFileExt(file: File) {
  const parts = file.name.split(".");
  const ext = parts.length > 1 ? (parts.pop() || "").toLowerCase() : "";
  return /^[a-z0-9]{1,10}$/.test(ext) ? ext : "bin";
}

// The same limits as the create_post database function.
const MAX_POST_FILES = 20;
const MAX_POST_AUTHORS = 50;

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
        logDev("AUTHOR SEARCH ERROR:", error);
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

    // One extra row tells us whether older posts exist. The full text is not
    // selected; hydratePosts asks for the texts this reader may see (RG-07).
    const { data: contents, error: contentError } = await supabase
      .from("contents")
      .select(POST_COLUMNS)
      .order("created_at", { ascending: false })
      .limit(limit + 1);

    if (contentError) {
      logDev("FETCH CONTENTS ERROR:", contentError);
      return;
    }

    // A newer refresh is already on screen; skip the rest of the work.
    if (isOutdated()) return;

    const rows = (contents || []) as PostRow[];
    const moreAvailable = rows.length > limit && limit < FEED_MAX_POSTS;

    const visibleRows = await withoutHiddenPosts(rows.slice(0, limit), activeUserId);

    if (visibleRows.length === 0) {
      showPosts([], moreAvailable);
      return;
    }

    const hydrated = await hydratePosts(visibleRows, activeUserId);

    // Files or texts could not be loaded: keep what is on screen.
    if (!hydrated) return;

    showPosts(hydrated, moreAvailable);
  };

  const postActions = usePostActions({
    userId,
    fullName,
    posts,
    refresh: () => fetchPosts(userId),
  });

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
      logDev("FEED PROFILE CHECK ERROR:", profileError);
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
      logDev("FEED AUTH LOCK ERROR:", error);
      return;
    }

    logDev("FEED LOAD ERROR:", error);
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

  // Uploads one file for a post that is about to be created. The database row
  // is written by create_post together with the post (audit RG-20).
  const uploadAttachment = async ({
    file,
    contentId,
    index,
    bucketName,
    accessLevel,
    fileRole,
  }: {
    file: File;
    contentId: string;
    index: number;
    bucketName: string;
    accessLevel: "public" | "restricted";
    fileRole: "full_paper" | "attachment";
  }): Promise<PendingAttachment> => {
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
      throw uploadError;
    }

    let fileUrl = "";

    if (accessLevel === "public") {
      const { data: publicData } = supabase.storage
        .from(bucketName)
        .getPublicUrl(storagePath);

      fileUrl = publicData.publicUrl;
    }

    return {
      storage_path: storagePath,
      bucket_name: bucketName,
      file_url: fileUrl,
      original_name: file.name,
      mime_type: file.type || null,
      file_ext: ext,
      file_size: file.size,
      attachment_type: attachmentType,
      file_role: fileRole,
    };
  };

  // Files of a post that could not be created are deleted again.
  const removeUploads = async (uploaded: PendingAttachment[]) => {
    const pathsByBucket = new Map<string, string[]>();
    uploaded.forEach((file) => {
      pathsByBucket.set(file.bucket_name, [
        ...(pathsByBucket.get(file.bucket_name) || []),
        file.storage_path,
      ]);
    });

    for (const [bucketName, paths] of pathsByBucket) {
      const { error } = await supabase.storage.from(bucketName).remove(paths);
      if (error) logDev("REMOVE UNUSED UPLOADS ERROR:", error);
    }
  };

  const handleCreatePost = async () => {
    if (!title.trim()) {
      notify("Add a title first.", "info");
      return;
    }

    if (!content.trim() && !abstract.trim()) {
      notify("Write the post text or an abstract first.", "info");
      return;
    }

    const isPaper = contentCategory === "research_paper";

    if (isPaper && !abstract.trim()) {
      notify("For research paper posts, abstract is required.", "info");
      return;
    }

    if (
      isPaper &&
      fullPaperAccessMode === "request_required" &&
      !fullPaperFile
    ) {
      notify("Upload the full paper file for request-based access.", "info");
      return;
    }

    // Check every file before anything is uploaded (audit RG-21).
    const fileProblem = [fullPaperFile, ...files]
      .filter((file): file is File => Boolean(file))
      .map((file) => uploadProblem(file))
      .find(Boolean);

    if (fileProblem) {
      notify(fileProblem, "error");
      return;
    }

    if ((fullPaperFile ? 1 : 0) + files.length > MAX_POST_FILES) {
      notify(`A post can have up to ${MAX_POST_FILES} files.`, "info");
      return;
    }

    if (selectedPlatformAuthors.length + manualAuthors.length > MAX_POST_AUTHORS) {
      notify(`A post can list up to ${MAX_POST_AUTHORS} co-authors.`, "info");
      return;
    }

    setUploading(true);

    // The post's id is chosen here so its files can be uploaded to its folder
    // first; then the post, its co-authors and its files are saved in one
    // database call. Either all of it is saved, or none of it (audit RG-20).
    let contentId = "";
    const uploaded: PendingAttachment[] = [];
    let askedDatabase = false;

    try {
      contentId = newId();

      if (fullPaperFile) {
        const restricted =
          isPaper &&
          (fullPaperAccessMode === "request_required" ||
            fullPaperAccessMode === "private");

        uploaded.push(
          await uploadAttachment({
            file: fullPaperFile,
            contentId,
            index: 0,
            bucketName: restricted ? RESTRICTED_BUCKET_NAME : PUBLIC_BUCKET_NAME,
            accessLevel: restricted ? "restricted" : "public",
            fileRole: "full_paper",
          }),
        );
      }

      for (let i = 0; i < files.length; i++) {
        uploaded.push(
          await uploadAttachment({
            file: files[i],
            contentId,
            index: i + 1,
            bucketName: PUBLIC_BUCKET_NAME,
            accessLevel: "public",
            fileRole: "attachment",
          }),
        );
      }

      const authors = [
        ...selectedPlatformAuthors.map((author) => ({ profile_id: author.id })),
        ...manualAuthors.map((authorName) => ({ manual_name: authorName })),
      ];

      askedDatabase = true;
      const { error: createError } = await supabase.rpc("create_post", {
        p_id: contentId,
        p_title: title.trim(),
        p_content: content.trim(),
        p_abstract: abstract.trim() || null,
        p_post_type: postType,
        p_content_category: contentCategory,
        p_visibility_mode: visibilityMode,
        p_full_paper_access_mode: fullPaperAccessMode,
        p_doi: doi.trim() || null,
        p_keywords: keywords.trim() || null,
        p_authors: authors,
        p_attachments: uploaded,
      });

      if (createError) throw createError;
    } catch (error) {
      // No answer from the server: the post may have been saved anyway, and
      // then its files must stay. They are only removed when it certainly
      // was not saved.
      let saved = false;
      let keepUploads = false;
      if (askedDatabase && isUnclearFailure(error)) {
        const { data, error: checkError } = await supabase
          .from("contents")
          .select("id")
          .eq("id", contentId)
          .maybeSingle();
        if (data) saved = true;
        else if (checkError) keepUploads = true;
      }

      if (!saved) {
        logDev("CREATE POST ERROR:", error);
        if (!keepUploads) await removeUploads(uploaded);
        notify(friendlyError(error, "Could not create the post."), "error");
        setUploading(false);
        return;
      }
    }

    resetPostForm();
    await fetchPosts(userId);
    setUploading(false);
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
      handleAddPlatformAuthor={handleAddPlatformAuthor}
      handleRemovePlatformAuthor={handleRemovePlatformAuthor}
      handleAddManualAuthor={handleAddManualAuthor}
      handleRemoveManualAuthor={handleRemoveManualAuthor}
      handleCreatePost={handleCreatePost}
      postActions={postActions}
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
