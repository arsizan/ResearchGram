import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseKey)

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