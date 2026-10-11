"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getCurrentUserSafe, isAuthLockError } from "@/lib/authSafe";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { fetchPostCounts } from "@/lib/postCounts";
import TopicUI from "./UI";
import type {
  Attachment,
  Comment,
  ContentAuthor,
  PaperAccessRequestStatus,
  Post,
} from "../feed/UI";

const PUBLIC_BUCKET_NAME = "content-files";
const RESTRICTED_BUCKET_NAME = "restricted-papers";
const TOPIC_FETCH_LIMIT = 100;

export default function TopicClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const topic = (searchParams.get("tag") || "").trim();

  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState("");
  const [fullName, setFullName] = useState("");
  const [profilePicUrl, setProfilePicUrl] = useState("");
  const [posts, setPosts] = useState<Post[]>([]);

  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  const [savingPostId, setSavingPostId] = useState<string | null>(null);

  const [openRequestPostId, setOpenRequestPostId] = useState<string | null>(null);
  const [requestDrafts, setRequestDrafts] = useState<Record<string, string>>({});
  const [requestingPostId, setRequestingPostId] = useState<string | null>(null);

  const [paperAccessRequestDrafts, setPaperAccessRequestDrafts] = useState<
    Record<string, string>
  >({});
  const [openPaperAccessPostId, setOpenPaperAccessPostId] = useState<string | null>(
    null,
  );
  const [paperAccessRequestingPostId, setPaperAccessRequestingPostId] =
    useState<string | null>(null);

  const fetchPosts = async (activeUserId?: string, activeTopic?: string) => {
    const tag = (activeTopic ?? topic).trim();

    if (!tag) {
      setPosts([]);
      return;
    }

    const { data: contents, error: contentError } = await supabase
      .from("contents")
      .select(
        "id, title, content, abstract, content_category, visibility_mode, full_paper_access_mode, allow_full_paper_request, doi, keywords, publication_status, publisher_name, publication_date, post_type, created_at, user_id, profiles:profiles(full_name, email, department, profile_pic_url)",
      )
      .ilike("keywords", `%${tag}%`)
      .order("created_at", { ascending: false })
      .limit(TOPIC_FETCH_LIMIT);

    if (contentError) {
      console.log("TOPIC FETCH CONTENTS ERROR:", contentError);
      return;
    }

    const rawContents = (contents || []) as any[];

    // Keep only posts that actually contain the exact keyword token.
    const normalizedTag = tag.toLowerCase();
    let visibleContents = rawContents.filter((item) =>
      (item.keywords || "")
        .split(/[,;]/)
        .map((k: string) => k.trim().toLowerCase())
        .includes(normalizedTag),
    );

    if (activeUserId && visibleContents.length > 0) {
      const rawContentIds = visibleContents.map((item) => item.id);

      const { data: hiddenRows, error: hiddenError } = await supabase
        .from("hidden_posts")
        .select("content_id")
        .eq("user_id", activeUserId)
        .in("content_id", rawContentIds);

      if (hiddenError) {
        console.log("TOPIC FETCH HIDDEN POSTS ERROR:", hiddenError);
      }

      const hiddenSet = new Set(
        (hiddenRows || []).map((row: any) => row.content_id),
      );

      visibleContents = visibleContents.filter((item) => !hiddenSet.has(item.id));
    }

    if (visibleContents.length === 0) {
      setPosts([]);
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
      console.log("TOPIC FETCH ATTACHMENTS ERROR:", attachmentError);
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
      console.log("TOPIC FETCH COMMENTS ERROR:", commentError);
    }

    const { data: savedRows, error: savedError } = await supabase
      .from("saved_posts")
      .select("content_id, user_id")
      .in("content_id", contentIds);

    if (savedError) {
      console.log("TOPIC FETCH SAVED POSTS ERROR:", savedError);
    }

    const { data: requestRows, error: requestError } = await supabase
      .from("research_requests")
      .select("content_id, requester_id, request_type")
      .in("content_id", contentIds)
      .eq("request_type", "collaboration");

    if (requestError) {
      console.log("TOPIC FETCH REQUESTS ERROR:", requestError);
    }

    // Own rows above drive the "saved" / "requested" flags; totals come from here.
    const { saves: saveCountMap, requests: requestCountMap } =
      await fetchPostCounts(contentIds);

    const { data: paperAccessRows, error: paperAccessError } = await supabase
      .from("paper_access_requests")
      .select("id, content_id, requester_id, owner_id, status")
      .in("content_id", contentIds);

    if (paperAccessError) {
      console.log("TOPIC FETCH PAPER ACCESS REQUESTS ERROR:", paperAccessError);
    }

    const { data: authorRows, error: authorError } = await supabase
      .from("content_authors")
      .select(
        "id, content_id, profile_id, manual_name, author_order, author_role, profiles:profiles(id, full_name, email, department, profile_pic_url)",
      )
      .in("content_id", contentIds)
      .order("author_order", { ascending: true });

    if (authorError) {
      console.log("TOPIC FETCH CONTENT AUTHORS ERROR:", authorError);
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
            console.log("TOPIC SIGNED URL ERROR:", signedError);
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

    setPosts(normalized);
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
          .select("full_name, profile_pic_url")
          .eq("id", currentUserId)
          .maybeSingle();

        if (profileError) {
          console.log("TOPIC PROFILE ERROR:", profileError);
        }

        setFullName(profileData?.full_name || "");
        setProfilePicUrl(profileData?.profile_pic_url || "");

        await fetchPosts(currentUserId, topic);
      } catch (error) {
        if (isAuthLockError(error)) {
          console.log("TOPIC AUTH LOCK ERROR:", error);
          return;
        }

        console.log("TOPIC LOAD ERROR:", error);
      } finally {
        setLoading(false);
      }
    };

    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, topic]);

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
      console.log("TOPIC COMMENT INSERT ERROR:", error);
      alert(error.message);
      setCommentingPostId(null);
      return;
    }

    setCommentDrafts((prev) => ({ ...prev, [contentId]: "" }));

    await fetchPosts(userId, topic);
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
        console.log("TOPIC UNSAVE POST ERROR:", error);
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
        console.log("TOPIC SAVE POST ERROR:", error);
        alert(error.message);
        setSavingPostId(null);
        return;
      }
    }

    await fetchPosts(userId, topic);
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

    setRequestingPostId(post.id);

    const { data: insertedRequest, error } = await supabase
      .from("research_requests")
      .insert({
        content_id: post.id,
        requester_id: userId,
        receiver_id: post.user_id,
        request_type: "collaboration",
        message:
          requestDrafts[post.id]?.trim() ||
          "I am interested in collaborating on this research work.",
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.log("TOPIC COLLABORATION REQUEST ERROR:", error);
      alert(error.message);
      setRequestingPostId(null);
      return;
    }

    setRequestDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setOpenRequestPostId(null);

    await fetchPosts(userId, topic);
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

    setPaperAccessRequestingPostId(post.id);

    const { data: insertedRequest, error } = await supabase
      .from("paper_access_requests")
      .insert({
        content_id: post.id,
        requester_id: userId,
        owner_id: post.user_id,
        reason:
          paperAccessRequestDrafts[post.id]?.trim() ||
          "I would like to read the full paper for academic/research purpose.",
        status: "pending",
      })
      .select("id")
      .single();

    if (error) {
      console.log("TOPIC PAPER ACCESS REQUEST ERROR:", error);
      alert(error.message);
      setPaperAccessRequestingPostId(null);
      return;
    }

    setPaperAccessRequestDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setOpenPaperAccessPostId(null);

    await fetchPosts(userId, topic);
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
        await fetchPosts(userId, topic);
        return;
      }

      console.log("TOPIC HIDE POST ERROR:", error);
      alert(error.message);
      return;
    }

    await fetchPosts(userId, topic);
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

      console.log("TOPIC REPORT POST ERROR:", error);
      alert(error.message);
      return;
    }

    alert("Report submitted. Thank you for helping keep ResearchGram safe.");
  };

  return (
    <TopicUI
      loading={loading}
      topic={topic}
      userId={userId}
      fullName={fullName}
      profilePicUrl={profilePicUrl}
      posts={posts}
      commentDrafts={commentDrafts}
      commentingPostId={commentingPostId}
      savingPostId={savingPostId}
      openRequestPostId={openRequestPostId}
      requestDrafts={requestDrafts}
      requestingPostId={requestingPostId}
      openPaperAccessPostId={openPaperAccessPostId}
      paperAccessRequestDrafts={paperAccessRequestDrafts}
      paperAccessRequestingPostId={paperAccessRequestingPostId}
      setCommentDrafts={setCommentDrafts}
      setOpenRequestPostId={setOpenRequestPostId}
      setRequestDrafts={setRequestDrafts}
      setOpenPaperAccessPostId={setOpenPaperAccessPostId}
      setPaperAccessRequestDrafts={setPaperAccessRequestDrafts}
      handleCreateComment={handleCreateComment}
      handleToggleSave={handleToggleSave}
      handleSendCollaborationRequest={handleSendCollaborationRequest}
      handleRequestFullPaperAccess={handleRequestFullPaperAccess}
      handleCopyPostLink={handleCopyPostLink}
      handleHidePost={handleHidePost}
      handleReportPost={handleReportPost}
      handleGoBack={() => router.push("/feed")}
      handleGoToResearcher={(profileId) =>
        router.push(`/researchers/${profileId}`)
      }
      handleGoToRecommendations={(postId) =>
        router.push(`/recommendations?postId=${postId}`)
      }
    />
  );
}