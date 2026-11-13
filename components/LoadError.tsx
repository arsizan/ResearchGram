"use client";

import type { ComponentProps } from "react";
import { RefreshCcw, WifiOff } from "lucide-react";
import AppNav from "@/components/AppNav";

/*
 * 13 Nov 2026: one clear message for a page whose data could not be loaded
 * (the database or the internet connection could not be reached).
 *
 * Before, such pages looked empty ("No notifications yet", no posts), and the
 * feed even sent people to the profile setup form, where saving could
 * overwrite the profile they already had (testing report, defect D-02).
 * Nothing is changed while this shows; "Try again" loads the page afresh.
 */
type LoadErrorProps = {
  /** The page, for the top bar. Left out on pages without one (profile setup). */
  activePage?: ComponentProps<typeof AppNav>["activePage"];
};

export default function LoadError({ activePage }: LoadErrorProps) {
  return (
    <main className="min-h-screen bg-background">
      {activePage && <AppNav activePage={activePage} />}

      <div className="flex justify-center px-4 py-20">
        <div
          role="alert"
          className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm"
        >
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50">
            <WifiOff className="h-6 w-6 text-amber-700" aria-hidden="true" />
          </div>
          <h1 className="text-lg font-bold text-foreground">
            This page could not be loaded
          </h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            AcademicOrbit could not reach its server. Check your internet
            connection and try again. Nothing was changed.
          </p>
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <RefreshCcw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
      </div>
    </main>
  );
}
