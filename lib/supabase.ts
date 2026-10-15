import { createBrowserClient } from '@supabase/ssr'
import { sameSitePath } from './safePath'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

/*
 * The browser's Supabase client (audit RG-01). The session is kept in cookies
 * instead of localStorage, so the server can tell who is signed in: proxy.ts
 * sends signed-out visitors to the login page before a private page loads.
 * In the browser this is one shared client for the whole tab.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey)

/*
 * Remembers whether this page load came from a password-reset email link
 * (audit RG-13). The listener must be attached right here, as the client is
 * created: the auth client reads the link while it starts up and announces
 * PASSWORD_RECOVERY only once, before any page code has run.
 */
let openedFromRecoveryLink = false

if (typeof window !== 'undefined') {
  supabase.auth.onAuthStateChange((event) => {
    if (event === 'PASSWORD_RECOVERY') openedFromRecoveryLink = true
    if (event === 'SIGNED_OUT') openedFromRecoveryLink = false
  })
}

export function isPasswordRecoverySession() {
  return openedFromRecoveryLink
}

/*
 * Until Phase 4 the session was stored in localStorage. Move it into the new
 * cookies once, so nobody is signed out by the update. Pages wait for this
 * (see getCurrentUserSafe) before they decide whether someone is signed in.
 */
function legacySessionKey() {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split('.')[0]}-auth-token`
  } catch {
    return ''
  }
}

async function moveLegacySession() {
  const key = legacySessionKey()
  if (!key) return

  let saved: string | null = null
  try {
    saved = window.localStorage.getItem(key)
  } catch {
    return
  }
  if (!saved) return

  // The old copy is removed only when it is no longer needed: moved into the
  // cookies, already replaced by a newer sign-in, or refused by Supabase. After
  // a network problem, a rate limit or a server error it stays, and the next
  // page load tries again; otherwise a short outage would sign people out.
  let finished = false
  try {
    const { data } = await supabase.auth.getSession()
    if (data.session) {
      finished = true
    } else {
      let old: { access_token?: unknown; refresh_token?: unknown } | null = null
      try {
        old = JSON.parse(saved)
      } catch {
        old = null
      }

      if (typeof old?.access_token !== 'string' || typeof old?.refresh_token !== 'string') {
        finished = true // unusable: the person signs in again
      } else {
        const { data: moved, error } = await supabase.auth.setSession({
          access_token: old.access_token,
          refresh_token: old.refresh_token,
        })
        const status = Number((error as { status?: number } | null)?.status ?? 0)
        // 400/401/403/404: the old session was ended or has expired for good.
        finished = Boolean(moved.session) || (status >= 400 && status < 500 && status !== 408 && status !== 429)
      }
    }
  } catch {
    // Something unexpected: keep the old copy and try again next time.
  }

  if (finished) {
    try {
      window.localStorage.removeItem(key)
      window.localStorage.removeItem(`${key}-code-verifier`)
    } catch {
      // Storage blocked: nothing to clean up.
    }
  }
}

export const sessionReady: Promise<void> =
  typeof window === 'undefined' ? Promise.resolve() : moveLegacySession()

/** A path inside this app to return to after logging in, or the fallback. */
export function safeNextPath(value: string | null | undefined, fallback = '/profile') {
  const path = sameSitePath(value)
  if (!path || /^\/auth([/?#]|$)/.test(path)) return fallback
  return path
}
