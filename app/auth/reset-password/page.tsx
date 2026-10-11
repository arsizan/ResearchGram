'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { isPasswordRecoverySession, supabase } from '@/lib/supabase'
import { passwordProblem } from '@/lib/passwordPolicy'

export default function ResetPasswordPage() {
  const router = useRouter()

  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [checkingSession, setCheckingSession] = useState(true)
  const [hasSession, setHasSession] = useState(false)
  const [message, setMessage] = useState('')
  const [errorMessage, setErrorMessage] = useState('')

  useEffect(() => {
    const prepareRecoverySession = async () => {
      setCheckingSession(true)
      setErrorMessage('')

      try {
        /*
          Only a session that came from the reset email may set a new password
          here (audit RG-13). Being logged in is not enough: otherwise anyone at
          an unlocked, logged-in browser could change the password without
          knowing the old one.

          getSession() waits until the auth client has read the link in the URL;
          it announces PASSWORD_RECOVERY on the next tick, hence the short wait.
        */
        const { data } = await supabase.auth.getSession()
        await new Promise((resolve) => setTimeout(resolve, 50))

        let fromRecoveryLink = isPasswordRecoverySession()

        // PKCE-style links carry ?code= instead; exchange it ourselves if the
        // client did not already.
        const code = new URL(window.location.href).searchParams.get('code')
        if (!fromRecoveryLink && code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code)
          if (error) {
            console.log('EXCHANGE CODE ERROR:', error)
          }
          // The exchange announces PASSWORD_RECOVERY itself when the code came
          // from a reset email, which sets the flag read here.
          fromRecoveryLink = !error && isPasswordRecoverySession()
        }

        if (fromRecoveryLink) {
          setHasSession(true)
        } else if (data.session) {
          setHasSession(false)
          setErrorMessage(
            'For your security, open the reset link from your email to set a new password. You are logged in, but that is not enough on its own.'
          )
        } else {
          setHasSession(false)
          setErrorMessage(
            'This reset link is invalid or expired. Please request a new password reset link.'
          )
        }
      } catch (err) {
        console.error('Recovery session error:', err)
        setErrorMessage('Could not verify the reset link. Please request a new one.')
      } finally {
        setCheckingSession(false)
      }
    }

    prepareRecoverySession()
  }, [])

  const getPasswordStrengthMessage = () => (password ? passwordProblem(password) : '')

  const handleUpdatePassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()

    setMessage('')
    setErrorMessage('')

    const strengthMessage = getPasswordStrengthMessage()

    if (strengthMessage) {
      setErrorMessage(strengthMessage)
      return
    }

    if (password !== confirmPassword) {
      setErrorMessage('Passwords do not match.')
      return
    }

    setLoading(true)

    try {
      const { error } = await supabase.auth.updateUser({
        password,
      })

      if (error) {
        console.log('UPDATE PASSWORD ERROR:', error)
        setErrorMessage(error.message)
        return
      }

      setMessage('Password updated successfully. Redirecting to login...')

      /*
        Sign out after reset so the user logs in cleanly with the new password.
      */
      await supabase.auth.signOut()

      setTimeout(() => {
        router.push('/auth/login')
      }, 1200)
    } catch (err) {
      console.error('Unexpected update password error:', err)
      setErrorMessage('Something went wrong while updating your password.')
    } finally {
      setLoading(false)
    }
  }

  const strengthMessage = getPasswordStrengthMessage()

  if (checkingSession) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
        <div className="rounded-2xl bg-white p-8 shadow-lg">
          <p className="text-gray-700">Verifying reset link...</p>
        </div>
      </main>
    )
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleUpdatePassword}
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-3xl font-bold text-gray-900">Create new password</h1>

        <p className="mt-2 text-sm text-gray-600">
          Choose a strong password for your ResearchGram account.
        </p>

        <div className="mt-6 space-y-4">
          <input
            type="password"
            placeholder="New password"
            className="w-full rounded-xl border border-gray-200 p-3 text-gray-900 placeholder:text-gray-400 outline-none focus:border-black"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={!hasSession || loading}
          />

          <input
            type="password"
            placeholder="Confirm new password"
            className="w-full rounded-xl border border-gray-200 p-3 text-gray-900 placeholder:text-gray-400 outline-none focus:border-black"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={!hasSession || loading}
          />

          {password && strengthMessage && (
            <p className="rounded-xl bg-yellow-50 px-4 py-3 text-sm text-yellow-700">
              {strengthMessage}
            </p>
          )}

          {message && (
            <p className="rounded-xl bg-green-50 px-4 py-3 text-sm text-green-700">
              {message}
            </p>
          )}

          {errorMessage && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={!hasSession || loading}
            className="w-full rounded-xl bg-black py-3 font-semibold text-white hover:bg-gray-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? 'Updating password...' : 'Update password'}
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-600">
          Need another link?{' '}
          <Link
            href="/auth/forgot-password"
            className="font-medium text-blue-600 hover:underline"
          >
            Request again
          </Link>
        </p>
      </form>
    </main>
  )
}