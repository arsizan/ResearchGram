"use client";

import { useEffect } from "react";
import { reportError } from "@/lib/errorReport";

/*
 * Sends errors nothing else caught (a failed event handler, a promise nobody
 * waited for) to the error log (Phase 5). Mounted once in the root layout.
 * Errors while a page renders are reported by app/error.tsx instead.
 */
export default function ErrorReporter() {
  useEffect(() => {
    const onError = (event: ErrorEvent) => reportError(event.error ?? event.message);
    const onRejection = (event: PromiseRejectionEvent) => reportError(event.reason);

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);
    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
    };
  }, []);

  return null;
}
