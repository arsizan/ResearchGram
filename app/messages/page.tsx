import { Suspense } from "react";
import MessagesClient from "./MessagesClient";
import { privatePage } from "@/lib/site";

export const metadata = privatePage("Messages");

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6 text-gray-700">
          Loading messages...
        </main>
      }
    >
      <MessagesClient />
    </Suspense>
  );
}