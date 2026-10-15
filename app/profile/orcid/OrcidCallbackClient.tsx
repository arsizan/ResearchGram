"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, AlertCircle } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { getCurrentUserSafe } from "@/lib/authSafe";
import { friendlyError, notify } from "@/lib/feedback";
import { logDev } from "@/lib/log";
import { orcidRedirectUri, takeOrcidState } from "../orcid";

/*
 * ORCID sends the browser back here with ?code=…&state=… after sign-in. The
 * code goes to the database (verify_orcid), which confirms it with ORCID and
 * saves the iD as verified.
 */
export default function OrcidCallbackClient() {
  const router = useRouter();
  const [problem, setProblem] = useState("");
  const startedRef = useRef(false);

  useEffect(() => {
    // The code works once; React's development double-run must not use it twice.
    if (startedRef.current) return;
    startedRef.current = true;

    const params = new URLSearchParams(window.location.search);
    const code = params.get("code") || "";
    const state = params.get("state") || "";
    const orcidError = params.get("error");
    const expectedState = takeOrcidState();

    // Take the one-time code out of the address bar.
    window.history.replaceState(window.history.state, "", window.location.pathname);

    const verify = async () => {
      if (orcidError) {
        setProblem(
          orcidError === "access_denied"
            ? "You cancelled the ORCID sign-in. Your iD was not verified."
            : "ORCID could not complete the sign-in. Try again from your profile.",
        );
        return;
      }

      if (!code || !state || state !== expectedState) {
        setProblem("This sign-in link is not valid here. Start again from your profile.");
        return;
      }

      const user = await getCurrentUserSafe();
      if (!user) {
        router.replace("/auth/login?next=/profile");
        return;
      }

      const { data, error } = await supabase.rpc("verify_orcid", {
        p_code: code,
        p_redirect_uri: orcidRedirectUri(),
      });

      if (error) {
        logDev("VERIFY ORCID ERROR:", error);
        setProblem(friendlyError(error, "Your ORCID iD could not be verified. Try again."));
        return;
      }

      // Once ORCID was asked, the database reports a failure as `problem`.
      const result = ((data || []) as { orcid_id: string | null; problem: string | null }[])[0];
      if (!result?.orcid_id) {
        setProblem(result?.problem || "Your ORCID iD could not be verified. Try again.");
        return;
      }

      notify(`ORCID iD ${result.orcid_id} verified.`, "success");
      router.replace("/profile");
    };

    void verify();
  }, [router]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
        {problem ? (
          <>
            <AlertCircle className="mx-auto h-10 w-10 text-red-600" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold text-foreground">ORCID iD not verified</h1>
            <p role="alert" className="mt-2 text-sm text-muted-foreground">{problem}</p>
            <Link
              href="/profile"
              className="mt-6 inline-block rounded-xl bg-primary px-4 py-2 text-sm font-bold text-white hover:bg-primary/90"
            >
              Back to your profile
            </Link>
          </>
        ) : (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
            <h1 className="mt-4 text-xl font-bold text-foreground">Verifying your ORCID iD…</h1>
            <p role="status" className="mt-2 text-sm text-muted-foreground">
              This takes a few seconds.
            </p>
          </>
        )}
      </div>
    </main>
  );
}
