import { Suspense } from "react";
import DiscoverClient from "./DiscoverClient";

export const metadata = {
  title: "Discover research · ResearchGram",
  description:
    "Search the published literature with citations, journal metrics and open-access links.",
};

export default function DiscoverPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-background">
          <p className="text-muted-foreground">Loading discover…</p>
        </main>
      }
    >
      <DiscoverClient />
    </Suspense>
  );
}
