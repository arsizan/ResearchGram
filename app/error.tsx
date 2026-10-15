"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";
import Link from "next/link";

/**
 * Route-level error boundary. Catches render and data errors in any page below
 * app/ and replaces the crash with something a user can act on.
 *
 * The raw error is deliberately not shown: messages thrown by Postgres carry
 * table, column and constraint names. Users get the digest, which is enough to
 * match against server logs.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Into the error log admins see in /admin (Phase 5).
    reportError(error, { digest: error.digest });
    console.error("Unhandled application error:", error);
  }, [error]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <h1 className="text-2xl font-bold text-foreground">
          Something went wrong
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          This page failed to load. The problem has been logged. Trying again
          often works — if it does not, head back to your feed.
        </p>

        {error.digest && (
          <p className="mt-4 rounded-xl bg-muted px-4 py-3 font-mono text-xs text-muted-foreground">
            Reference: {error.digest}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={reset}
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>

          <Link
            href="/feed"
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Back to feed
          </Link>
        </div>
      </div>
    </main>
  );
}
