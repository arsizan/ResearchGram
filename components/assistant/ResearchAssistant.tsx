"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { AssistantAnswer, AssistantTurn } from "@/lib/ai/types";
import AssistantAnswerBlock from "./AssistantAnswerBlock";
import { Sparkles, X, ArrowUp, AlertCircle, Loader2, RotateCcw} from "lucide-react";

const SUGGESTIONS = [
  "What are the main approaches to federated learning in healthcare?",
  "How is CNN used for rice leaf disease detection?",
  "Recent work on low-cost IoT air quality monitoring",
  "What datasets exist for Bangla sentiment analysis?",
];
/**
 * Where the panel keeps its conversation between full page loads.
 *
 * sessionStorage, not localStorage: a research thread belongs to the sitting the
 * user is in, and should not still be there tomorrow morning.
 *
 * Navigation is handled by mounting this component in the root layout, which
 * survives route changes — this is only for a refresh or a restored tab. Only
 * the turns are stored, never whether the panel was open: the server renders
 * this component too and has no sessionStorage, so a panel that opened itself on
 * the client would not match the server's HTML.
 *
 * The version suffix means a future change to AssistantAnswer can bump the key
 * instead of migrating whatever is already in people's browsers.
 */
const STORAGE_KEY = "researchgram.assistant.v1";
const MAX_STORED_TURNS = 15;

function readStoredTurns(): AssistantTurn[] {
  if (typeof window === "undefined") return [];

  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];

    return parsed
      .filter(
        (turn): turn is AssistantTurn =>
          Boolean(turn) &&
          typeof turn === "object" &&
          typeof (turn as AssistantTurn).id === "string" &&
          typeof (turn as AssistantTurn).question === "string" &&
          // A turn saved mid-flight would spin forever: the request it was
          // waiting on died with the old page.
          (turn as AssistantTurn).status !== "pending",
      )
      .slice(-MAX_STORED_TURNS);
  } catch {
    // Private mode, storage disabled, or something else wrote to this key. An
    // empty panel is a fine outcome; an exception is not.
    return [];
  }
}

function writeStoredTurns(turns: AssistantTurn[]) {
  try {
    window.sessionStorage.setItem(
      STORAGE_KEY,
      JSON.stringify(
        turns.filter((turn) => turn.status !== "pending").slice(-MAX_STORED_TURNS),
      ),
    );
  } catch {
    // Quota, or storage is off. Losing the history is not worth breaking the UI.
  }
}
/**
 * The floating research assistant.
 *
 * Familiar shape — a launcher in the corner, a panel, a welcome message — but
 * the replies are not chat. Each one comes back as an organised set of blocks:
 * the answer, the papers behind it, and the people on this platform working on
 * the same thing.
 */
export default function ResearchAssistant() {
  const [open, setOpen] = useState(false);
  const [question, setQuestion] = useState("");
  const [turns, setTurns] = useState<AssistantTurn[]>(readStoredTurns);
  const [busy, setBusy] = useState(false);
  // null until the session has been checked, so nothing flashes on auth pages.
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);
    // Mounted in the root layout, so this runs on every page including the auth
  // ones. The panel only exists for a signed-in member.
  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data }) => {
      if (active) setSignedIn(Boolean(data.session));
    });

    const { data: listener } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        if (active) setSignedIn(Boolean(session));
      },
    );

    return () => {
      active = false;
      listener.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    writeStoredTurns(turns);
  }, [turns]);

  // Escape closes the panel, as it does everywhere else on the web.
  useEffect(() => {
    if (!open) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Keep the newest turn in view as answers arrive.
  useEffect(() => {
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const ask = useCallback(
    async (rawQuestion: string) => {
      const trimmed = rawQuestion.trim();
      if (!trimmed || busy) return;

      const turnId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      setQuestion("");
      setBusy(true);
      setTurns((previous) => [
        ...previous,
        { id: turnId, question: trimmed, status: "pending", answer: null, errorMessage: null },
      ]);

      const settle = (patch: Partial<AssistantTurn>) => {
        if (!isMountedRef.current) return;
        setTurns((previous) =>
          previous.map((turn) => (turn.id === turnId ? { ...turn, ...patch } : turn)),
        );
      };

      try {
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;

        if (!accessToken) {
          settle({
            status: "error",
            errorMessage: "Your session expired. Sign in again to keep asking.",
          });
          return;
        }

        const response = await fetch("/api/assistant", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({ question: trimmed }),
        });

        const payload = await response.json();

        if (!response.ok) {
          settle({
            status: "error",
            errorMessage: payload?.error || "That did not work. Please try again.",
          });
          return;
        }

        settle({ status: "done", answer: payload as AssistantAnswer });
      } catch {
        settle({
          status: "error",
          errorMessage: "Could not reach the assistant. Check your connection.",
        });
      } finally {
        if (isMountedRef.current) setBusy(false);
      }
    },
    [busy],
  );
  if (!signedIn) return null;

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open the research assistant"
        className="fixed bottom-6 right-6 z-[90] flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary motion-reduce:transition-none motion-reduce:hover:scale-100"
      >
        <Sparkles className="h-6 w-6" aria-hidden="true" />
      </button>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label="Research assistant"
      className="fixed inset-x-0 bottom-0 z-[90] flex h-[85vh] flex-col rounded-t-2xl border border-border bg-background shadow-2xl sm:inset-x-auto sm:bottom-6 sm:right-6 sm:h-[min(640px,80vh)] sm:w-[420px] sm:rounded-2xl"
    >
      <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <span className="flex items-center gap-1">
          {turns.length > 0 && (
            <button
              type="button"
              onClick={() => setTurns([])}
              aria-label="Start a new conversation"
              title="Start a new conversation"
              className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-4 w-4" aria-hidden="true" />
            </button>
          )}

          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close the research assistant"
            className="rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </span>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4">
        {turns.length === 0 ? (
          <div>
            <p className="text-[15px] font-semibold text-foreground">
              How can I help with your research?
            </p>
            <p className="mt-1.5 text-sm leading-6 text-muted-foreground">
              Ask about any topic. You will get a short answer, the papers behind
              it with their citation counts and journal metrics, and the people on
              ResearchGram working on the same thing.
            </p>

            <p className="mt-5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              Try one of these
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {SUGGESTIONS.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="rounded-xl border border-border bg-card px-3 py-2.5 text-left text-[13px] text-foreground transition-colors hover:border-primary hover:text-primary"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {turns.map((turn) => (
              <div key={turn.id} className="flex flex-col gap-3">
                <p className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary px-3.5 py-2 text-[13.5px] text-primary-foreground">
                  {turn.question}
                </p>

                {turn.status === "pending" && (
                  <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
                    <Loader2
                      className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none"
                      aria-hidden="true"
                    />
                    Reading the literature…
                  </p>
                )}

                {turn.status === "error" && (
                  <p className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-[13px] text-destructive">
                    <AlertCircle
                      className="mt-0.5 h-3.5 w-3.5 shrink-0"
                      aria-hidden="true"
                    />
                    {turn.errorMessage}
                  </p>
                )}

                {turn.status === "done" && turn.answer && (
                  <AssistantAnswerBlock answer={turn.answer} onFollowUp={ask} />
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <form
        className="border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          ask(question);
        }}
      >
        <div className="flex items-end gap-2 rounded-xl border border-border bg-card px-3 py-2 focus-within:border-primary">
          <label htmlFor="assistant-question" className="sr-only">
            Ask the research assistant
          </label>
          <textarea
            id="assistant-question"
            ref={inputRef}
            rows={1}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              // Enter sends, Shift+Enter makes a new line.
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                ask(question);
              }
            }}
            placeholder="Ask about a research topic…"
            className="max-h-28 flex-1 resize-none bg-transparent text-[13.5px] text-foreground outline-none placeholder:text-muted-foreground"
          />

          <button
            type="submit"
            disabled={busy || !question.trim()}
            aria-label="Send question"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ArrowUp className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      </form>
    </div>
  );
}
