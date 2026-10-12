'use client'

import { useState, type FormEvent } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { logDev } from '@/lib/log'
import { PASSWORD_HINT, passwordProblem } from '@/lib/passwordPolicy'
import { friendlyAuthError } from '@/lib/feedback'

export default function SignUpPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [skills, setSkills] = useState('')

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
          },
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

      showSuccess('Signup successful. Redirecting to login...')

      setTimeout(() => {
        router.push('/auth/login')
      }, 800)
    } catch (err) {
      logDev('Unexpected signup error:', err)
      showError(friendlyAuthError(err, 'Signup failed. Please try again.'))
    } finally {
      setLoading(false)
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

          {message && (
            <p
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