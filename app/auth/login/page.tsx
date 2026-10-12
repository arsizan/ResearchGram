"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { friendlyAuthError } from "@/lib/feedback";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  // A real form: Enter submits, browsers and password managers can fill it,
  // and the error is shown next to it instead of in an alert (RG-27, RG-32).
  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (loading) return;

    setErrorMessage("");

    if (!email.trim() || !password) {
      setErrorMessage("Enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (error) {
        setErrorMessage(friendlyAuthError(error, "Could not log in. Please try again."));
        return;
      }

      router.push("/profile");
    } catch (error) {
      setErrorMessage(friendlyAuthError(error, "Could not log in. Please try again."));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <form
        onSubmit={handleLogin}
        noValidate
        className="w-full max-w-md rounded-2xl bg-white p-8 shadow-lg"
      >
        <h1 className="text-3xl font-bold text-gray-900">Login</h1>

        <div className="mt-6 space-y-4">
          <div>
            <label htmlFor="login-email" className="mb-1.5 block text-sm font-medium text-gray-700">
              Email
            </label>
            <input
              id="login-email"
              type="email"
              autoComplete="email"
              inputMode="email"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="you@university.edu"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={Boolean(errorMessage) || undefined}
              aria-describedby={errorMessage ? "login-error" : undefined}
            />
          </div>

          <div>
            <label htmlFor="login-password" className="mb-1.5 block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              id="login-password"
              type="password"
              autoComplete="current-password"
              className="w-full rounded-xl border p-3 outline-none focus:border-black"
              placeholder="Password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={Boolean(errorMessage) || undefined}
              aria-describedby={errorMessage ? "login-error" : undefined}
            />
          </div>

          <div className="text-right">
            <Link
              href="/auth/forgot-password"
              className="text-sm font-medium text-blue-600 hover:underline"
            >
              Forgot password?
            </Link>
          </div>

          {errorMessage && (
            <p
              id="login-error"
              role="alert"
              className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {errorMessage}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-xl bg-black py-3 text-white hover:bg-gray-800 disabled:opacity-60"
          >
            {loading ? "Logging in..." : "Login"}
          </button>
        </div>

        <p className="mt-6 text-sm text-gray-600">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="font-medium text-blue-600 hover:underline"
          >
            Sign up
          </Link>
        </p>
      </form>
    </main>
  );
}
