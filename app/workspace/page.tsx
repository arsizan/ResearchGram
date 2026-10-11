import { Suspense } from "react";
import WorkspaceClient from "./WorkspaceClient";

export default function WorkspacePage() {
  return (
    <Suspense
      fallback={
        <main className="min-h-screen bg-gray-50 p-6 text-gray-700">
          Loading workspace...
        </main>
      }
    >
      <WorkspaceClient />
    </Suspense>
  );
}
