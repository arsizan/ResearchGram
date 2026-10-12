import { Suspense } from "react";
import SearchClient from "./SearchClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Search");

export default function SearchPage() {
  return (
    <Suspense
      fallback={
        <main className="flex min-h-screen items-center justify-center bg-gray-100">
          <p className="text-lg text-gray-600">Loading search...</p>
        </main>
      }
    >
      <SearchClient />
    </Suspense>
  );
}