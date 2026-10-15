/*
 * Bot check on sign-up, login and "forgot password" (Phase 5): Cloudflare
 * Turnstile, checked by Supabase Auth.
 *
 * NEXT_PUBLIC_TURNSTILE_SITE_KEY is the widget's public site key. Without it
 * the forms work as before. The secret key goes only into Supabase
 * (Authentication -> Attack Protection), never into the app, git or Vercel.
 *
 * Order matters: deploy the app with the site key first, then turn CAPTCHA on
 * in Supabase. Once it is on, Supabase refuses sign-up, login and password
 * reset requests that come without a fresh token.
 */
export const TURNSTILE_SITE_KEY = (process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY || "").trim();

export const CAPTCHA_ENABLED = Boolean(TURNSTILE_SITE_KEY);

/** The script, loaded only on the pages that show the check. */
export const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

export const CAPTCHA_MISSING_MESSAGE = "Complete the security check first.";

/** True when Supabase refused a request because the bot check failed or was missing. */
export function isCaptchaError(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  return code === "captcha_failed" || String(message || "").toLowerCase().includes("captcha");
}
