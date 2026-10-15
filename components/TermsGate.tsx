"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendlyError } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import { CONTACT_EMAIL, MINIMUM_AGE, TERMS_DATE_LABEL, TERMS_VERSION } from "@/lib/legal";

/*
 * Accounts made before the Terms and Privacy Policy existed (or before a new
 * version) accept them once (Phase 5). New accounts accept them on the sign-up
 * form. Shown by AppNav on every page behind the login, except the profile
 * page: someone who does not agree can still download their data or delete
 * their account there.
 *
 * It only asks once the database expects this app's version
 * (current_terms_version()), so the app and the database can be updated in
 * either order without locking anyone in.
 *
 * If the check itself fails (a network problem), nothing is shown: an error
 * must never lock people out. The next page load asks again.
 */

type Need = "none" | "first" | "updated";

export default function TermsGate({ userId }: { userId: string }) {
  const pathname = usePathname() || "";
  const [need, setNeed] = useState<Need>("none");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [accepted, setAccepted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  const firstFieldRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    Promise.all([
      supabase.from("user_consents").select("terms_version").eq("user_id", userId).maybeSingle(),
      supabase.rpc("current_terms_version"),
    ])
      .then(([consent, current]) => {
        if (cancelled) return;
        if (consent.error || current.error) {
          logDev("TERMS CHECK ERROR:", consent.error || current.error);
          return;
        }
        // The database is not on this version yet (or already on a newer
        // one): asking now could not be saved. Wait until both match.
        if (current.data !== TERMS_VERSION) return;
        if (!consent.data) setNeed("first");
        else if (consent.data.terms_version !== TERMS_VERSION) setNeed("updated");
      })
      .catch((error) => logDev("TERMS CHECK ERROR:", error));

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const open = need !== "none" && !pathname.startsWith("/profile");

  // A modal <dialog>: the page behind cannot be reached with the mouse, the
  // keyboard or a screen reader until the notice is answered.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;
    if (!dialog.open) dialog.showModal();
    firstFieldRef.current?.focus();
    return () => {
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open) return null;

  const handleAccept = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (saving) return;
    setProblem("");

    if (!ageConfirmed) {
      setProblem(`ResearchGram is for people aged ${MINIMUM_AGE} or older. Tick the box to confirm your age.`);
      firstFieldRef.current?.focus();
      return;
    }
    if (!accepted) {
      setProblem("Tick the box to accept the Terms of Service and the Privacy Policy.");
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase.rpc("accept_terms", { p_version: TERMS_VERSION, p_age_confirmed: true });
      if (error) {
        logDev("ACCEPT TERMS ERROR:", error);
        setProblem(friendlyError(error, "Could not save your answer. Please try again."));
        return;
      }
      setNeed("none");
    } catch (error) {
      logDev("ACCEPT TERMS ERROR:", error);
      setProblem(friendlyError(error, "Could not save your answer. Please try again."));
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    // Signing out everywhere needs the server; without it, sign out here.
    const { error } = await supabase.auth.signOut();
    if (error) await supabase.auth.signOut({ scope: "local" });
    window.location.replace("/");
  };

  const linkClass = "font-semibold text-primary underline underline-offset-2 hover:no-underline";
  const termsLinks = (
    <>
      <Link href="/terms" target="_blank" rel="noopener noreferrer" className={linkClass}>
        Terms of Service
      </Link>{" "}
      and{need === "first" ? " a" : " our"}{" "}
      <Link href="/privacy" target="_blank" rel="noopener noreferrer" className={linkClass}>
        Privacy Policy
      </Link>
    </>
  );

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="terms-gate-title"
      aria-describedby="terms-gate-text"
      // Escape does not dismiss it; if the browser closes it anyway, it opens again.
      onCancel={(event) => event.preventDefault()}
      onClose={() => {
        const dialog = dialogRef.current;
        if (dialog && dialog.isConnected && !dialog.open) dialog.showModal();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-lg overflow-y-auto rounded-2xl border border-border bg-card p-6 text-foreground shadow-2xl backdrop:bg-black/50 backdrop:backdrop-blur-sm"
    >
      <h2 id="terms-gate-title" className="text-lg font-bold text-foreground">
        Our Terms and Privacy Policy
      </h2>
      <p id="terms-gate-text" className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {need === "updated" ? (
          <>
            We updated our {termsLinks} on {TERMS_DATE_LABEL}. Please read them and confirm to continue.
          </>
        ) : (
          <>
            ResearchGram now has {termsLinks}. They explain what we store, who can see it and the rules for using
            ResearchGram. Please read them and confirm to continue.
          </>
        )}
      </p>

      <form onSubmit={handleAccept} noValidate className="mt-5 space-y-3">
        <label htmlFor="terms-gate-age" className="flex items-start gap-3 text-sm text-foreground">
          <input
            ref={firstFieldRef}
            id="terms-gate-age"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            checked={ageConfirmed}
            onChange={(e) => setAgeConfirmed(e.target.checked)}
          />
          <span>I am {MINIMUM_AGE} years old or older.</span>
        </label>

        <label htmlFor="terms-gate-accept" className="flex items-start gap-3 text-sm text-foreground">
          <input
            id="terms-gate-accept"
            type="checkbox"
            className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
            checked={accepted}
            onChange={(e) => setAccepted(e.target.checked)}
          />
          <span>I agree to the Terms of Service and the Privacy Policy.</span>
        </label>

        {problem && (
          <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
            {problem}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-border px-4 py-2 text-sm font-semibold text-foreground transition-colors hover:bg-muted"
          >
            Log out
          </button>
          <button
            type="submit"
            disabled={saving}
            className="rounded-xl bg-primary px-5 py-2 text-sm font-bold text-white transition-colors hover:bg-primary/90 disabled:opacity-60"
          >
            {saving ? "Saving…" : "Agree and continue"}
          </button>
        </div>

        <p className="text-xs leading-relaxed text-muted-foreground">
          Do not agree? Log out, or open{" "}
          <Link href="/profile" className={linkClass}>
            your profile
          </Link>{" "}
          to download your data or delete your account.
          {CONTACT_EMAIL ? (
            <>
              {" "}Questions:{" "}
              <a href={`mailto:${CONTACT_EMAIL}`} className={linkClass}>
                {CONTACT_EMAIL}
              </a>
              .
            </>
          ) : null}
        </p>
      </form>
    </dialog>
  );
}
