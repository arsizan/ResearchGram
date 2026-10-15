"use client";

import { useEffect, useRef, useState } from "react";
import { CAPTCHA_ENABLED, TURNSTILE_SCRIPT_URL, TURNSTILE_SITE_KEY } from "@/lib/captcha";

/*
 * Cloudflare Turnstile, the bot check on sign-up, login and "forgot password"
 * (Phase 5). Renders nothing when NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set.
 *
 * It hands the form a token (or "" while there is none). A token works once
 * and expires after 5 minutes: Turnstile renews an expired one by itself, and
 * the form changes `resetKey` after every attempt to get a fresh one.
 */

type TurnstileApi = {
  render: (container: HTMLElement, options: Record<string, unknown>) => string;
  reset: (widgetId: string) => void;
  remove: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptLoading: Promise<TurnstileApi> | null = null;

function loadTurnstile(): Promise<TurnstileApi> {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptLoading) return scriptLoading;

  const loading = new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = TURNSTILE_SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile did not start"));
    };
    script.onerror = () => {
      script.remove();
      reject(new Error("Turnstile could not load"));
    };
    document.head.appendChild(script);
  });

  // After a failure the next attempt loads the script again.
  scriptLoading = loading.catch((error) => {
    scriptLoading = null;
    throw error;
  });
  return scriptLoading;
}

type TurnstileWidgetProps = {
  /** Shown in Cloudflare's statistics for the widget. */
  action: "login" | "signup" | "recover";
  onToken: (token: string) => void;
  /** Change it after each sign-in attempt: tokens work once. */
  resetKey: number;
};

export default function TurnstileWidget({ action, onToken, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetRef = useRef<string | null>(null);
  const onTokenRef = useRef(onToken);
  const [problem, setProblem] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    onTokenRef.current = onToken;
  });

  useEffect(() => {
    if (!CAPTCHA_ENABLED) return;
    const container = containerRef.current;
    if (!container) return;
    let cancelled = false;

    loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !container.isConnected) return;
        widgetRef.current = turnstile.render(container, {
          sitekey: TURNSTILE_SITE_KEY,
          action,
          theme: "light",
          language: "en",
          // Narrow phones get the small version (150 px instead of 300 px).
          size: container.clientWidth < 300 ? "compact" : "flexible",
          "response-field": false,
          callback: (token: string) => {
            setProblem("");
            onTokenRef.current(token);
          },
          "expired-callback": () => onTokenRef.current(""),
          "timeout-callback": () => onTokenRef.current(""),
          "error-callback": () => {
            onTokenRef.current("");
            setProblem("The security check did not work. Try again, or reload the page.");
          },
        });
      })
      .catch(() => {
        if (!cancelled) {
          setProblem(
            "The security check could not load. Check your internet connection, allow challenges.cloudflare.com if a blocker is on, and try again.",
          );
        }
      });

    return () => {
      cancelled = true;
      const id = widgetRef.current;
      widgetRef.current = null;
      if (id && window.turnstile) {
        try {
          window.turnstile.remove(id);
        } catch {
          // Already gone.
        }
      }
    };
  }, [action, attempt]);

  // A token works once: after each attempt the form asks for a new one. The
  // old token is dropped first; the new one arrives through the callback.
  useEffect(() => {
    if (!resetKey) return;
    onTokenRef.current("");
    const id = widgetRef.current;
    if (id && window.turnstile) {
      try {
        window.turnstile.reset(id);
      } catch {
        // The next render makes a new widget anyway.
      }
    }
  }, [resetKey]);

  if (!CAPTCHA_ENABLED) return null;

  return (
    <div>
      <div ref={containerRef} className="min-h-[65px]" data-testid="security-check" />
      {problem && (
        <div role="alert" className="mt-2 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
          <p>{problem}</p>
          <button
            type="button"
            onClick={() => {
              setProblem("");
              setAttempt((n) => n + 1);
            }}
            className="mt-2 font-semibold underline underline-offset-2 hover:no-underline"
          >
            Try the security check again
          </button>
        </div>
      )}
    </div>
  );
}
