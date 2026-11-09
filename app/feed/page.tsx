import { Suspense } from "react";
// 9 Nov 2026: AcademicOrbit rename
import AppSkeleton from "@/components/AppSkeleton";
import FeedClient from "./FeedClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Feed");

// Suspense: the feed reads ?post= from the address to highlight a shared post.
export default function FeedPage() {
  return (
    // 9 Nov 2026: AcademicOrbit rename
    <Suspense fallback={<AppSkeleton activePage="feed" variant="feed" />}>
      <FeedClient />
    </Suspense>
  );
}
