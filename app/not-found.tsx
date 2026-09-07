import Link from "next/link";

export default function NotFound() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-sm">
        <p className="font-mono text-xs font-semibold uppercase tracking-[0.2em] text-muted-foreground">
          404
        </p>

        <h1 className="mt-3 text-2xl font-bold text-foreground">
          This page does not exist
        </h1>

        <p className="mt-3 text-sm leading-6 text-muted-foreground">
          The link may be out of date, or the post, profile or workspace it
          pointed to may have been removed.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Link
            href="/feed"
            className="rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go to feed
          </Link>

          <Link
            href="/search"
            className="rounded-xl border border-border px-5 py-2.5 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Search ResearchGram
          </Link>
        </div>
      </div>
    </main>
  );
}
