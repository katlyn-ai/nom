'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function SignupPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [success, setSuccess] = useState(false)
  const router = useRouter()
  const supabase = createClient()

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')

    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    })

    if (error) {
      setError(error.message)
      setLoading(false)
    } else {
      setSuccess(true)
      setLoading(false)
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8" style={{ background: 'var(--background)' }}>
        <div className="text-center max-w-sm">
          <div className="text-5xl mb-6">🎉</div>
          <h1 className="text-2xl font-semibold mb-2" style={{ color: 'var(--foreground)' }}>
            Check your email
          </h1>
          <p style={{ color: 'var(--muted)' }}>
            We sent a confirmation link to <strong>{email}</strong>. Click it to activate your account and start planning your meals.
          </p>
          <Link
            href="/auth/login"
            className="inline-block mt-6 text-sm font-medium hover:underline"
            style={{ color: 'var(--primary)' }}
          >
            Back to login
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{ background: 'var(--background)' }}>
      {/* Left panel */}
      <div
        className="hidden lg:flex lg:w-1/2 flex-col justify-between p-12"
        style={{ background: 'var(--primary)' }}
      >
        <div className="text-white text-3xl font-bold tracking-tight">NOM</div>
        <div>
          <h2 className="text-white text-3xl font-semibold leading-snug mb-4">
            Your household,<br />your meals,<br />your way.
          </h2>
          <p className="text-white/70 text-base leading-relaxed">
            NOM learns your family&apos;s preferences, builds meal plans you&apos;ll actually love, and handles the shopping automatically.
          </p>
        </div>
        <div className="text-white/50 text-sm">
          Free to get started · No credit card required
        </div>
      </div>

      {/* Right panel */}
      <div className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="mb-8">
            <div className="text-2xl font-bold mb-1" style={{ color: 'var(--primary)' }}>NOM</div>
            <h1 className="text-2xl font-semibold" style={{ color: 'var(--foreground)' }}>
              Create your account
            </h1>
            <p className="mt-1" style={{ color: 'var(--muted)' }}>
              Takes less than a minute
            </p>
          </div>

          <form onSubmit={handleSignup} className="space-y-4">
            <div>
              <label
                htmlFor="name"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--foreground)' }}
              >
                Your name
              </label>
              <input
                id="name"
                type="text"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                placeholder="Käts"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--foreground)' }}
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
                required
                placeholder="you@example.com"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium mb-1.5"
                style={{ color: 'var(--foreground)' }}
              >
                Password
              </label>
              <input
                id="password"
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                placeholder="At least 6 characters"
                className="w-full px-4 py-3 rounded-xl border text-sm outline-none"
                style={{
                  borderColor: 'var(--border)',
                  background: 'var(--card)',
                  color: 'var(--foreground)',
                }}
              />
            </div>

            {error && (
              <div
                className="px-4 py-3 rounded-xl text-sm"
                style={{ background: '#FEE2E2', color: '#DC2626' }}
              >
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl text-white font-medium text-sm transition-opacity hover:opacity-90 disabled:opacity-60"
              style={{ background: 'var(--primary)' }}
            >
              {loading ? 'Creating account…' : 'Create account'}
            </button>
          </form>

          <p className="mt-6 text-center text-sm" style={{ color: 'var(--muted)' }}>
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="font-medium hover:underline"
              style={{ color: 'var(--primary)' }}
            >
              Sign in
            </Link>
          </p>
        </div>
      </div>
    </div>
  )
}
