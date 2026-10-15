import { isAuthApiError, isAuthSessionMissingError, type User } from "@supabase/supabase-js";
import { sessionReady, supabase } from "@/lib/supabase";

let currentUserPromise: Promise<User | null> | null = null;

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function isAuthLockError(error: unknown) {
  if (!error || typeof error !== "object") return false;

  const maybeError = error as {
    name?: string;
    message?: string;
    details?: string;
    hint?: string;
  };

  const text = `${maybeError.name || ""} ${maybeError.message || ""} ${
    maybeError.details || ""
  } ${maybeError.hint || ""}`.toLowerCase();

  return (
    text.includes("lock") ||
    text.includes("aborterror") ||
    text.includes("lock broken") ||
    text.includes("navigatorlock") ||
    text.includes("steal")
  );
}

// Errors that mean "nobody is signed in" rather than "something went wrong".
const SIGNED_OUT_CODES = new Set(["session_not_found", "user_not_found", "bad_jwt", "session_expired"]);

function isSignedOutError(error: unknown) {
  if (isAuthSessionMissingError(error)) return true;
  return isAuthApiError(error) && SIGNED_OUT_CODES.has(String(error.code ?? ""));
}

async function readCurrentUserOnce() {
  const { data, error } = await supabase.auth.getUser();

  if (error) {
    // getUser() reports a missing session as an error. Treat it as "signed
    // out" so pages send the visitor to the login page instead of showing an
    // empty page.
    if (isSignedOutError(error)) return null;
    throw error;
  }

  return data.user ?? null;
}

export async function getCurrentUserSafe() {
  if (currentUserPromise) {
    return currentUserPromise;
  }

  currentUserPromise = (async () => {
    // A session saved by the previous version is moved into cookies first.
    await sessionReady;

    try {
      return await readCurrentUserOnce();
    } catch (error) {
      if (!isAuthLockError(error)) {
        throw error;
      }

      await wait(600);

      try {
        return await readCurrentUserOnce();
      } catch (retryError) {
        if (!isAuthLockError(retryError)) {
          throw retryError;
        }

        await wait(1000);
        return await readCurrentUserOnce();
      }
    } finally {
      window.setTimeout(() => {
        currentUserPromise = null;
      }, 100);
    }
  })();

  return currentUserPromise;
}