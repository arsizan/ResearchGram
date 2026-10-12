import { Suspense } from "react";
import ResearchGramSkeleton from "@/components/ResearchGramSkeleton";
import FeedClient from "./FeedClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Feed");

// Suspense: the feed reads ?post= from the address to highlight a shared post.
export default function FeedPage() {
  return (
    <Suspense fallback={<ResearchGramSkeleton activePage="feed" variant="feed" />}>
      <FeedClient />
    </Suspense>
  );
}
