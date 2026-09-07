"use client";

import { useEffect } from "react";

/**
 * Last-resort boundary: catches errors thrown by the root layout itself, where
 * app/error.tsx cannot run. It replaces the whole document, so it must render
 * its own <html> and <body> and cannot rely on globals.css tokens being applied.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // TODO(observability): forward to Sentry once it is wired up.
    console.error("Fatal application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "16px",
          background: "#eef1f8",
          color: "#0f172a",
          fontFamily:
            "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
        }}
      >
        <div
          style={{
            width: "100%",
            maxWidth: "28rem",
            background: "#ffffff",
            borderRadius: "24px",
            padding: "32px",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.1)",
          }}
        >
          <h1 style={{ margin: 0, fontSize: "1.5rem", fontWeight: 700 }}>
            ResearchGram could not start
          </h1>

          <p
            style={{
              marginTop: "12px",
              fontSize: "0.875rem",
              lineHeight: 1.6,
              color: "#64748b",
            }}
          >
            An error occurred before the app finished loading. It has been
            logged. Reloading usually resolves it.
          </p>

          {error.digest && (
            <p
              style={{
                marginTop: "16px",
                padding: "12px 16px",
                borderRadius: "12px",
                background: "#f1f5f9",
                fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
                fontSize: "0.75rem",
                color: "#64748b",
              }}
            >
              Reference: {error.digest}
            </p>
          )}

          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: "24px",
              padding: "10px 20px",
              borderRadius: "12px",
              border: "none",
              background: "#4f46e5",
              color: "#ffffff",
              fontSize: "0.875rem",
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            Reload
          </button>
        </div>
      </body>
    </html>
  );
}
