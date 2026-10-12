import { supabase } from "@/lib/supabase";
import { logDev } from "@/lib/log";

type PostCountRow = {
  content_id: string;
  save_count: number | string;
  request_count: number | string;
};

/**
 * Save and collaboration-request totals for the given posts.
 *
 * Row level security lets a user read only their own saved_posts and
 * research_requests rows, so the totals can no longer be counted in the
 * browser. The post_engagement_counts database function counts them without
 * revealing who saved or who asked, and skips posts the viewer cannot see.
 */
export async function fetchPostCounts(contentIds: string[]) {
  const saves: Record<string, number> = {};
  const requests: Record<string, number> = {};

  if (contentIds.length === 0) return { saves, requests };

  const { data, error } = await supabase.rpc("post_engagement_counts", {
    content_ids: contentIds,
  });

  if (error) {
    logDev("FETCH POST COUNTS ERROR:", error);
    return { saves, requests };
  }

  for (const row of (data || []) as PostCountRow[]) {
    saves[row.content_id] = Number(row.save_count) || 0;
    requests[row.content_id] = Number(row.request_count) || 0;
  }

  return { saves, requests };
}
