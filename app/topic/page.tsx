import { Suspense } from "react";
import TopicClient from "./TopicClient";

export default function TopicPage() {
  return (
    <Suspense fallback={null}>
      <TopicClient />
    </Suspense>
  );
}