'use client'

import { useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { logDev } from '@/lib/log'
import { friendlyAuthError } from '@/lib/feedback'
import { CAPTCHA_ENABLED, CAPTCHA_MISSING_MESSAGE, isCaptchaError } from '@/lib/captcha'
import TurnstileWidget from '@/components/TurnstileWidget'

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')
  // The bot check (Phase 5): a token works once, so each attempt asks for a new one.
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)

  const handlePasswordResetRequest = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    setMessage('')
    setErrorMessage('')

    if (!email.trim()) {
      setErrorMessage('Please enter your email address.')
      return
    }

    if (CAPTCHA_ENABLED && !captchaToken) {
      setErrorMessage(CAPTCHA_MISSING_MESSAGE)
      return
    }

    setLoading(true)

    try {
      const redirectTo = `${window.location.origin}/auth/reset-password`

      const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
        redirectTo,
        ...(CAPTCHA_ENABLED ? { captchaToken } : {}),
      })

      // A failed security check says nothing about the account; say so.
      if (error && isCaptchaError(error)) {
        setErrorMessage(friendlyAuthError(error))
        return
      }

      if (error) {
        logDev('PASSWORD RESET REQUEST ERROR:', error)

        /*
          Enterprise-safe message:
          Do not reveal whether an email exists in the system.
        */
        setMessage(
          'If an account exists for this email, a password reset link has been sent.'
        )
        return
      }

      setMessage(
        'If an account exists for this email, a password reset link has been sent.'
      )
      setEmail('')
    } catch (err) {
      logDev('Unexpected password reset error:', err)
      setErrorMessage('Something went wrong. Please try again.')
    } finally {
      setLoading(false)
      setCaptchaReset((n) => n + 1)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handlePasswordResetRequest}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-3xl font-bold text-gray-900">Reset password</h1>

        <p className="mt-2 text-sm text-gray-600">
          Enter your ResearchGram account email. We will send a secure password reset link.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="forgot-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="forgot-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              placeholder="you@university.edu"
              className="w-full rounded-xl border border-gray-200 p-3 text-gray-900 placeholder:text-gray-400 outline-none focus:border-black"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <TurnstileWidget action="recover" onToken={setCaptchaToken} resetKey={captchaReset} />

          {message && (
            <p role="status" className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </p>
          )}

          {errorMessage && (
            <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Sending reset link...' : 'Send reset link'}
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-600">
          Remember your password?{' '}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:underline">
            Back to login
          </Link>
        </p>
      </form>
    </main>
  )
}