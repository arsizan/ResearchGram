'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { PASSWORD_HINT, passwordProblem } from '@/lib/passwordPolicy'

export default function SignUpPage() {
  const router = useRouter()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [department, setDepartment] = useState('')
  const [skills, setSkills] = useState('')

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleSignUp = async () => {
    setMessage('')

    if (!fullName.trim()) {
      setMessage('Please enter your full name.')
      return
    }

    if (!email.trim()) {
      setMessage('Please enter your email.')
      return
    }

    if (!password.trim()) {
      setMessage('Please enter your password.')
      return
    }

    const problem = passwordProblem(password)
    if (problem) {
      setMessage(problem)
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
        setMessage(`Signup failed: ${error.message}`)
        return
      }

      if (!data.user) {
        setMessage('Signup did not return a user. Check Supabase Auth settings.')
        return
      }

      // With "Confirm email" on, Supabase returns no session until the link is clicked.
      if (!data.session) {
        setMessage('Account created. Check your email for the confirmation link, then log in.')
        return
      }

      setMessage('Signup successful. Redirecting to login...')

      setTimeout(() => {
        router.push('/auth/login')
      }, 800)
    } catch (err) {
      console.error('Unexpected signup error:', err)
      setMessage('Unexpected signup error. Check browser console.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg">
        <h1 className="text-3xl font-bold text-gray-900">Sign Up</h1>
        <p className="mt-2 text-sm text-gray-600">
          Create your ResearchGram academic profile.
        </p>

        <div className="mt-6 space-y-4">
          <input
            className="w-full rounded-xl border p-3 outline-none focus:border-black"
            placeholder="Full name"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
          />

          <input
            className="w-full rounded-xl border p-3 outline-none focus:border-black"
            placeholder="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />

          <input
            className="w-full rounded-xl border p-3 outline-none focus:border-black"
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <p className="text-xs text-gray-500">{PASSWORD_HINT}</p>

          <input
            className="w-full rounded-xl border p-3 outline-none focus:border-black"
            placeholder="Department, e.g. CSE"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
          />

          <input
            className="w-full rounded-xl border p-3 outline-none focus:border-black"
            placeholder="Skills, e.g. AI, Machine Learning, Java"
            value={skills}
            onChange={(e) => setSkills(e.target.value)}
          />

          {message && (
            <p className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
              {message}
            </p>
          )}

          <button
            onClick={handleSignUp}
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
      </div>
    </main>
  )
}