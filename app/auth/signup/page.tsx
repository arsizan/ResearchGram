'use client'

import { useRef, useState, type FormEvent } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'
import { logDev } from '@/lib/log'
import { PASSWORD_HINT, passwordProblem } from '@/lib/passwordPolicy'
import { friendlyAuthError } from '@/lib/feedback'
import { CAPTCHA_ENABLED, CAPTCHA_MISSING_MESSAGE } from '@/lib/captcha'
import { MINIMUM_AGE, TERMS_VERSION } from '@/lib/legal'
import TurnstileWidget from '@/components/TurnstileWidget'

export default function SignUpPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [skills, setSkills] = useState('')
  // Consent (Phase 5): both boxes are required. The version and the age
  // confirmation are stored with the account (public.user_consents).
  const [ageConfirmed, setAgeConfirmed] = useState(false)
  const [termsAccepted, setTermsAccepted] = useState(false)
  // Which box the message is about, so it is marked and announced with it.
  const [consentProblem, setConsentProblem] = useState<'' | 'age' | 'terms'>('')
  const ageRef = useRef<HTMLInputElement>(null)
  const termsRef = useRef<HTMLInputElement>(null)
  // The bot check: a token works once, so each attempt asks for a new one.
  const [captchaToken, setCaptchaToken] = useState('')
  const [captchaReset, setCaptchaReset] = useState(0)

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')
  // Success messages are shown in green, problems in red.
  const [messageIsError, setMessageIsError] = useState(true)

  const showError = (text: string) => {
    setMessageIsError(true)
    setMessage(text)
  }

  const showSuccess = (text: string) => {
    setMessageIsError(false)
    setMessage(text)
  }

  // A real form: Enter submits and password managers can save the new
  // password (RG-32).
  const handleSignUp = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (loading) return

    setMessage('')
    setConsentProblem('')

    if (!fullName.trim()) {
      showError('Please enter your full name.')
      return
    }

    if (!email.trim()) {
      showError('Please enter your email.')
      return
    }

    if (!password.trim()) {
      showError('Please enter your password.')
      return
    }

    const problem = passwordProblem(password)
    if (problem) {
      showError(problem)
      return
    }

    if (!ageConfirmed) {
      showError(`ResearchGram accounts are for people aged ${MINIMUM_AGE} or older. Tick the box to confirm your age.`)
      setConsentProblem('age')
      ageRef.current?.focus()
      return
    }

    if (!termsAccepted) {
      showError('Accept the Terms of Service and the Privacy Policy to create an account.')
      setConsentProblem('terms')
      termsRef.current?.focus()
      return
    }

    if (CAPTCHA_ENABLED && !captchaToken) {
      showError(CAPTCHA_MISSING_MESSAGE)
      return
    }

    setLoading(true)

    try {
      // The profile row is created in the database by the on_auth_user_created
      // trigger, from this metadata. Doing it here instead fails once email
      // confirmation is on, because there is no session yet (audit RG-12).
      const { data, error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            department: department.trim(),
            skills: skills.trim(),
            terms_version: TERMS_VERSION,
            age_confirmed: true,
          },
          ...(CAPTCHA_ENABLED ? { captchaToken } : {}),
        },
      })

      if (error) {
        showError(friendlyAuthError(error, 'Signup failed. Please try again.'))
        return
      }

      if (!data.user) {
        showError('Signup failed. Please try again.')
        return
      }

      // With "Confirm email" on, Supabase returns no session until the link is clicked.
      if (!data.session) {
        showSuccess('Account created. Check your email for the confirmation link, then log in.')
        return
      }

      // Signed in straight away (email confirmation is off).
      showSuccess('Signup successful. Opening your profile...')

      // A full page load (see the login page): the app's router may still
      // remember /profile as "redirects to login" from before.
      setTimeout(() => {
        window.location.replace('/profile')
      }, 800)
    } catch (err) {
      logDev('Unexpected signup error:', err)
      showError(friendlyAuthError(err, 'Signup failed. Please try again.'))
    } finally {
      setLoading(false)
      setCaptchaReset((n) => n + 1)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleSignUp}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-3xl font-bold text-gray-900">Sign Up</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create your ResearchGram academic profile.
        </p>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="signup-name" className="mb-1.5 block text-sm font-medium text-gray-700">
              Full name
            </label>
            <input
              id="signup-name"
              autoComplete="name"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="Your full name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="signup-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="signup-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="signup-password" className="mb-1.5 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="signup-password"
              type="password"
              autoComplete="new-password"
              aria-describedby="signup-password-hint"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
            <p id="signup-password-hint" className="mt-1.5 text-xs text-gray-500">{PASSWORD_HINT}</p>
          </div>

          <div>
            <label htmlFor="signup-department" className="mb-1.5 block text-sm font-medium text-gray-700">
              Department
            </label>
            <input
              id="signup-department"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="e.g. CSE"
              value={department}
              onChange={(e) => setDepartment(e.target.value)}
            />
          </div>

          <div>
            <label htmlFor="signup-skills" className="mb-1.5 block text-sm font-medium text-gray-700">
              Skills
            </label>
            <input
              id="signup-skills"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="e.g. AI, Machine Learning, Java"
              value={skills}
              onChange={(e) => setSkills(e.target.value)}
            />
          </div>

          <fieldset className="space-y-3 rounded-xl border border-gray-200 p-4">
            <legend className="px-1 text-sm font-medium text-gray-700">Before you join</legend>

            <label htmlFor="signup-age" className="flex items-start gap-3 text-sm text-gray-700">
              <input
                ref={ageRef}
                id="signup-age"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                checked={ageConfirmed}
                aria-invalid={consentProblem === 'age' || undefined}
                aria-describedby={consentProblem === 'age' ? 'signup-message' : undefined}
                onChange={(e) => {
                  setAgeConfirmed(e.target.checked)
                  if (consentProblem === 'age') setConsentProblem('')
                }}
              />
              <span>I am {MINIMUM_AGE} years old or older.</span>
            </label>

            <label htmlFor="signup-terms" className="flex items-start gap-3 text-sm text-gray-700">
              <input
                ref={termsRef}
                id="signup-terms"
                type="checkbox"
                className="mt-0.5 h-4 w-4 shrink-0 accent-black"
                checked={termsAccepted}
                aria-invalid={consentProblem === 'terms' || undefined}
                aria-describedby={consentProblem === 'terms' ? 'signup-message' : undefined}
                onChange={(e) => {
                  setTermsAccepted(e.target.checked)
                  if (consentProblem === 'terms') setConsentProblem('')
                }}
              />
              <span>
                I agree to the{' '}
                <Link href="/terms" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline hover:no-underline">
                  Terms of Service
                </Link>{' '}
                and the{' '}
                <Link href="/privacy" target="_blank" rel="noopener noreferrer" className="font-medium text-blue-600 underline hover:no-underline">
                  Privacy Policy
                </Link>
                .
              </span>
            </label>
          </fieldset>

          <TurnstileWidget action="signup" onToken={setCaptchaToken} resetKey={captchaReset} />

          {message && (
            <p
              id="signup-message"
              role={messageIsError ? 'alert' : 'status'}
              className={`rounded-xl px-4 py-3 text-sm ${
                messageIsError ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'
              }`}
            >
              {message}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/auth/login" className="font-medium text-blue-600 hover:underline">
            Login
          </Link>
        </p>
      </form>
    </main>
  )
}