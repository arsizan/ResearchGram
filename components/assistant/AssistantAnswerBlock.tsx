"use client";

import { useCallback, useRef } from "react";
import Link from "next/link";
import {
  BookOpen,
  ExternalLink,
  FileText,
  GraduationCap,
  Quote,
  Sparkles,
  Unlock,
  Users,
} from "lucide-react";
import type { AssistantAnswer } from "@/lib/ai/types";

/**
 * One answer, rendered as separate blocks rather than a paragraph of chat.
 *
 * The citation markers in the text are real controls: clicking [2] scrolls to
 * that paper and flashes it. That link between claim and evidence is the point
 * of the whole feature — it is what makes this different from a list of results
 * sitting underneath an unrelated summary.
 */
export default function AssistantAnswerBlock({
  answer,
  onFollowUp,
}: {
  answer: AssistantAnswer;
  onFollowUp: (query: string) => void;
}) {
  const paperRefs = useRef<Record<string, HTMLLIElement | null>>({});

  const jumpToPaper = useCallback((paperId: string) => {
    const node = paperRefs.current[paperId];
    if (!node) return;

    node.scrollIntoView({ behavior: "smooth", block: "center" });
    node.animate(
      [
        { backgroundColor: "rgba(79,70,229,0.14)" },
        { backgroundColor: "transparent" },
      ],
      { duration: 1200, easing: "ease-out" },
    );
  }, []);

  /** Split the answer on [n] markers and turn each one into a real button. */
  const renderAnswerText = (text: string) => {
    const pieces = text.split(/(\[\d+\])/g);

    return pieces.map((piece, index) => {
      const marker = piece.match(/^\[(\d+)\]$/);
      if (!marker) return <span key={index}>{piece}</span>;

      const position = Number(marker[1]);
      const paper = answer.papers[position - 1];
      if (!paper) return null;

      return (
        <button
          key={index}
          type="button"
          onClick={() => jumpToPaper(paper.id)}
          title={paper.title}
          className="mx-0.5 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded bg-primary/12 px-1 align-baseline text-[11px] font-bold text-primary transition-colors hover:bg-primary hover:text-primary-foreground"
        >
          {position}
        </button>
      );
    });
  };

  return (
    <div className="flex flex-col gap-5">
      {/* ── The written answer ─────────────────────────────────────────── */}
      {/* Empty while the papers are already on screen and the text has not
          started. A heading over nothing looks broken; nothing looks like
          waiting, which is what it is. */}
      {answer.answer.trim().length > 0 && (
        <div>
          {/* Small talk gets no label — a heading over "You're welcome!" reads
            like a form, not a reply. */}
          {answer.kind !== "chit_chat" && (
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" aria-hidden="true" />
              {answer.kind === "product_help"
                ? "About ResearchGram"
                : answer.kind === "general_knowledge"
                  ? "General knowledge · not from the papers"
                  : answer.kind === "unclear"
                    ? "Needs a bit more"
                    : "Answer"}
            </p>
          )}
          <p
            className={`text-[14.5px] leading-6 text-foreground ${
              answer.kind === "chit_chat" ? "" : "mt-2"
            }`}
          >
            {renderAnswerText(answer.answer)}
          </p>
        </div>
      )}

      {/* ── Papers the answer actually leans on ────────────────────────── */}
      {answer.papers.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {answer.papersPending ? "Papers found" : "Papers cited"}
          </p>

          <ol className="mt-2 flex flex-col gap-2">
            {answer.papers.map((paper, index) => (
              <li
                key={paper.id}
                ref={(node) => {
                  paperRefs.current[paper.id] = node;
                }}
                className="rounded-xl border border-border bg-card p-3"
              >
                <div className="flex gap-2.5">
                  <span className="mt-0.5 flex h-[18px] min-w-[18px] shrink-0 items-center justify-center rounded bg-muted text-[11px] font-bold text-muted-foreground">
                    {index + 1}
                  </span>

                  <div className="min-w-0 flex-1">
                    <p className="text-[13.5px] font-semibold leading-snug text-foreground">
                      {paper.landingPageUrl ? (
                        <a
                          href={paper.landingPageUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="hover:text-primary hover:underline"
                        >
                          {paper.title}
                        </a>
                      ) : (
                        paper.title
                      )}
                    </p>

                    <p className="mt-1 text-xs text-muted-foreground">
                      {paper.authors[0]?.name || "Unknown author"}
                      {paper.authors.length > 1 ? " et al." : ""}
                      {paper.year ? ` · ${paper.year}` : ""}
                      {paper.journal?.name ? ` · ${paper.journal.name}` : ""}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                      <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5">
                        <Quote className="h-3 w-3" aria-hidden="true" />
                        <span className="font-semibold text-foreground tabular-nums">
                          {paper.citationCount >= 1000
                            ? `${(paper.citationCount / 1000).toFixed(1)}k`
                            : paper.citationCount}
                        </span>
                        cited
                      </span>

                      {paper.journal?.twoYearMeanCitedness != null && (
                        <span
                          title="OpenAlex 2-year mean citedness — the open equivalent of Impact Factor, not the licensed Clarivate JIF."
                          className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5"
                        >
                          <BookOpen className="h-3 w-3" aria-hidden="true" />
                          <span className="font-semibold text-foreground tabular-nums">
                            {paper.journal.twoYearMeanCitedness.toFixed(1)}
                          </span>
                          impact
                        </span>
                      )}

                      {paper.isOpenAccess && (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-400">
                          <Unlock className="h-3 w-3" aria-hidden="true" />
                          Open
                        </span>
                      )}
                    </div>

                    {(paper.pdfUrl || paper.doi) && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {paper.pdfUrl && (
                          <a
                            href={paper.pdfUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1 text-[11px] font-semibold text-primary-foreground hover:bg-primary/90"
                          >
                            <FileText className="h-3 w-3" aria-hidden="true" />
                            PDF
                          </a>
                        )}
                        {paper.doi && (
                          <a
                            href={`https://doi.org/${paper.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground hover:bg-muted"
                          >
                            <ExternalLink
                              className="h-3 w-3"
                              aria-hidden="true"
                            />
                            DOI
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* ── The block no other research tool can show ──────────────────── */}
      {answer.members.length > 0 && (
        <div>
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            <Users className="h-3 w-3 text-primary" aria-hidden="true" />
            On ResearchGram
          </p>

          <ul className="mt-2 flex flex-col gap-2">
            {answer.members.map((member) => (
              <li key={member.id}>
                <Link
                  href={`/researchers/${member.id}`}
                  className="flex items-center gap-3 rounded-xl border border-border bg-card p-2.5 transition-colors hover:border-primary/50"
                >
                  {member.profilePicUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={member.profilePicUrl}
                      alt=""
                      className="h-9 w-9 shrink-0 rounded-full object-cover"
                    />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                      {member.fullName.slice(0, 2).toUpperCase()}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-[13.5px] font-semibold text-foreground">
                        {member.fullName}
                      </span>
                      {member.mentorshipAvailable && (
                        <GraduationCap
                          className="h-3.5 w-3.5 shrink-0 text-primary"
                          aria-label="Open to mentoring"
                        />
                      )}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {member.department || member.userRole || "Researcher"}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {member.reason}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Where to go next ───────────────────────────────────────────── */}
      {answer.relatedQueries.length > 0 && (
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            Explore next
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {answer.relatedQueries.map((query) => (
              <button
                key={query}
                type="button"
                onClick={() => onFollowUp(query)}
                className="rounded-lg border border-border px-2.5 py-1 text-xs text-foreground transition-colors hover:border-primary hover:text-primary"
              >
                {query}
              </button>
            ))}
          </div>
        </div>
      )}

      {answer.totalFound > answer.papers.length && (
        <Link
          href={`/discover?q=${encodeURIComponent(answer.searchedFor)}`}
          className="text-xs font-semibold text-primary hover:underline"
        >
          See all {answer.totalFound.toLocaleString()} matching works →
        </Link>
      )}
    </div>
  );
}
