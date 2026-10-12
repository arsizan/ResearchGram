import { Suspense } from "react";
import TopicClient from "./TopicClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Topic");

export default function TopicPage() {
  return (
    <Suspense fallback={null}>
      <TopicClient />
    </Suspense>
  );
}