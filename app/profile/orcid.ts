/*
 * "Verify with ORCID" (ORCID sign-in). It proves that an ORCID iD belongs to
 * the person, so nobody can show someone else's publications as their own.
 *
 * Shown only when NEXT_PUBLIC_ORCID_CLIENT_ID is set. The client secret is never
 * in the app: it is stored in Supabase Vault and only the database uses it
 * (verify_orcid). NEXT_PUBLIC_ORCID_BASE_URL is https://sandbox.orcid.org while
 * testing with an ORCID sandbox app, and must match orcid_base_url in Vault.
 */
import { newId } from "@/lib/ids";

export const ORCID_CLIENT_ID = process.env.NEXT_PUBLIC_ORCID_CLIENT_ID || "";

export const ORCID_BASE_URL = (
  process.env.NEXT_PUBLIC_ORCID_BASE_URL || "https://orcid.org"
).replace(/\/+$/, "");

export const ORCID_SIGN_IN_AVAILABLE = Boolean(ORCID_CLIENT_ID);

// Protects the return trip: ORCID sends back the value we sent, and only a
// sign-in this tab started is accepted.
const STATE_KEY = "researchgram-orcid-state";

export function orcidRedirectUri() {
  return `${window.location.origin}/profile/orcid`;
}

export function startOrcidSignIn() {
  const state = newId();

  try {
    window.sessionStorage.setItem(STATE_KEY, state);
  } catch {
    // Without storage the return trip is refused; the person sees why.
  }

  const url = new URL(`${ORCID_BASE_URL}/oauth/authorize`);
  url.searchParams.set("client_id", ORCID_CLIENT_ID);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", "/authenticate");
  url.searchParams.set("redirect_uri", orcidRedirectUri());
  url.searchParams.set("state", state);

  window.location.assign(url.toString());
}

/** The state this tab sent to ORCID (read once). */
export function takeOrcidState() {
  try {
    const state = window.sessionStorage.getItem(STATE_KEY) || "";
    window.sessionStorage.removeItem(STATE_KEY);
    return state;
  } catch {
    return "";
  }
}
