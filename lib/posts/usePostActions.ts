"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { createNotification } from "@/lib/notifications";
import { confirmAction, friendlyError, notify, showCopyDialog } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import type { Post } from "./types";

/*
 * What a reader can do with a post card (comment, save, ask to collaborate,
 * ask for the full paper, copy the link, hide, report), shared by the Feed and
 * Topic pages (audit RG-24). `refresh` reloads that page's posts.
 */
export function usePostActions({
  userId,
  fullName,
  posts,
  refresh,
}: {
  userId: string;
  fullName: string;
  posts: Post[];
  refresh: () => Promise<void>;
}) {
  const [commentDrafts, setCommentDrafts] = useState<Record<string, string>>({});
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  const [savingPostId, setSavingPostId] = useState<string | null>(null);

  const [openRequestPostId, setOpenRequestPostId] = useState<string | null>(null);
  const [requestDrafts, setRequestDrafts] = useState<Record<string, string>>({});
  const [requestingPostId, setRequestingPostId] = useState<string | null>(null);

  const [paperAccessRequestDrafts, setPaperAccessRequestDrafts] = useState<
    Record<string, string>
  >({});
  const [openPaperAccessPostId, setOpenPaperAccessPostId] = useState<string | null>(null);
  const [paperAccessRequestingPostId, setPaperAccessRequestingPostId] = useState<
    string | null
  >(null);

  const handleCreateComment = async (contentId: string) => {
    const commentText = commentDrafts[contentId]?.trim();

    if (!commentText) {
      notify("Write a comment first.", "info");
      return;
    }

    if (!userId) {
      notify("Log in to comment.", "error");
      return;
    }

    setCommentingPostId(contentId);

    const { error } = await supabase.from("comments").insert({
      content_id: contentId,
      user_id: userId,
      comment_text: commentText,
    });

    if (error) {
      logDev("COMMENT INSERT ERROR:", error);
      notify(friendlyError(error, "Could not post your comment."), "error");
      setCommentingPostId(null);
      return;
    }

    setCommentDrafts((prev) => ({ ...prev, [contentId]: "" }));

    await refresh();
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
      notify("Log in to save posts.", "error");
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
        logDev("UNSAVE POST ERROR:", error);
        notify(friendlyError(error, "Could not remove the post from your saved list."), "error");
        setSavingPostId(null);
        return;
      }
    } else {
      const { error } = await supabase.from("saved_posts").insert({
        user_id: userId,
        content_id: post.id,
      });

      if (error) {
        logDev("SAVE POST ERROR:", error);
        notify(friendlyError(error, "Could not save the post."), "error");
        setSavingPostId(null);
        return;
      }
    }

    await refresh();
    setSavingPostId(null);
  };

  const handleSendCollaborationRequest = async (post: Post) => {
    if (!userId) {
      notify("Log in to request collaboration.", "error");
      return;
    }

    if (!post.user_id) {
      notify("This post does not have a valid author.", "error");
      return;
    }

    if (post.user_id === userId) {
      notify("You cannot request collaboration on your own post.", "info");
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
      logDev("COLLABORATION REQUEST ERROR:", error);
      notify(
        error.code === "23505"
          ? "You already sent a collaboration request for this post."
          : friendlyError(error, "Could not send the collaboration request."),
        "error",
      );
      setRequestingPostId(null);
      return;
    }

    setRequestDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setOpenRequestPostId(null);

    await refresh();
    setRequestingPostId(null);
    notify("Collaboration request sent.", "success");

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
      notify("Log in to request paper access.", "error");
      return;
    }

    if (!post.user_id) {
      notify("This paper does not have a valid owner.", "error");
      return;
    }

    if (post.user_id === userId) {
      notify("This is your own paper.", "info");
      return;
    }

    if (post.paper_access_request_status) {
      notify(`Access request already ${post.paper_access_request_status}.`, "info");
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
      logDev("PAPER ACCESS REQUEST ERROR:", error);
      notify(
        error.code === "23505"
          ? "You already asked for access to this paper."
          : friendlyError(error, "Could not send the access request."),
        "error",
      );
      setPaperAccessRequestingPostId(null);
      return;
    }

    setPaperAccessRequestDrafts((prev) => ({ ...prev, [post.id]: "" }));
    setOpenPaperAccessPostId(null);

    await refresh();
    setPaperAccessRequestingPostId(null);
    notify("Full paper access request sent.", "success");

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
      notify("Post link copied.", "success");
    } catch {
      await showCopyDialog("Copy this post link", link);
    }
  };

  const handleHidePost = async (post: Post) => {
    if (!userId) {
      notify("Log in to hide posts.", "error");
      return;
    }

    const confirmed = await confirmAction({
      title: "Hide this post?",
      message:
        "It will no longer appear in your feed. You can still open it from a direct link.",
      confirmLabel: "Hide post",
    });

    if (!confirmed) return;

    const { error } = await supabase.from("hidden_posts").insert({
      content_id: post.id,
      user_id: userId,
    });

    if (error) {
      if (error.code === "23505") {
        await refresh();
        return;
      }

      logDev("HIDE POST ERROR:", error);
      notify(friendlyError(error, "Could not hide the post."), "error");
      return;
    }

    await refresh();
    notify("Post hidden from your feed.", "success");
  };

  const handleReportPost = async (post: Post, reason: string, details: string) => {
    if (!userId) {
      notify("Log in to report posts.", "error");
      return;
    }

    if (post.user_id === userId) {
      notify("You cannot report your own post.", "info");
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
        notify("You have already reported this post.", "info");
        return;
      }

      logDev("REPORT POST ERROR:", error);
      notify(friendlyError(error, "Could not send the report."), "error");
      return;
    }

    notify("Report submitted. Thank you for helping keep ResearchGram safe.", "success");
  };

  return {
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
  };
}

export type PostActions = ReturnType<typeof usePostActions>;
